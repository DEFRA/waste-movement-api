# Proposal: database layer for beta-3

**Status:** partly implemented · **Service:** waste-movement-api · **Date:** 2026-11-17

## Progress

| Part                                        | State                                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naming: `DATA_REVISION` → `DATA_GENERATION` | **Done** on `main` (#7).                                                                                                                                                                                                                       |
| 1. One collection per entity                | **Done** (DWTC-317): movements, collections, deliveries, receipts. Only a movement's `_id` is its natural ID; the others have a generated `_id` and an index on their linking ID, to keep today's resubmission behaviour (open questions 2–3). |
| 1. History collections and updates          | **Deferred**: there are no update routes yet. [Backlog](../backlog/updates-and-history-collections.md).                                                                                                                                        |
| 2. ETag                                     | **Partly**: every document carries `revision: 1`. The HTTP side (`ETag`, `If-Match`, 412) is [in the backlog](../backlog/etag-if-match-http.md).                                                                                               |
| 3. Payload + business fields                | **Done** (DWTC-317). Responses hold only IDs today; `POST /deliveries`' is built from the stored groupings, as it's derived, not sent.                                                                                                         |
| 4. Mappers                                  | **Done** (DWTC-317): `data/mappers/`, with every API example run through API → DB → API in `schemas.test.js`.                                                                                                                                  |
| 5. DB schema files                          | **Done** on `main` (#8), then moved to the envelope shape (DWTC-317, `DATA_GENERATION` 2), with `openapi.json` to browse them.                                                                                                                 |
| 5. ajv, `$jsonSchema` validator, index sync | **Done** (DWTC-317): `entityStore`, `syncCollection`.                                                                                                                                                                                          |
| 6. Changing a DB schema                     | **Done** (DWTC-317). Removing an enum value also counts as breaking.                                                                                                                                                                           |
| 7. CI check and refusing to start           | **Done** (DWTC-317): `npm run check:data-schemas`, in `check-pull-request.yml`; boot fails on mismatched documents or a validator it can't update.                                                                                             |
| 8. Outbox                                   | Not started, as planned.                                                                                                                                                                                                                       |

## Why

beta-3 needs to persist its data. Today only part of the journey is stored: a movement's waste items and
the delivery groupings. Collection and receipt payloads are validated and then thrown away. We need to:

- keep every **original request payload**, unchanged
- store the fields the **business logic** needs, shaped for that logic
- **specify the stored shape** as clearly as the API is specified with JSON Schema, so changes are visible in
  review
- **catch breaking changes** to the stored shape in CI, before they reach an environment

## Naming

There are two different "revisions", so this proposal gives them different names:

| Term                                                             | Meaning                                                                               | Where                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Data generation** (`DATA_GENERATION`, today's `DATA_REVISION`) | The version of a whole API version's set of collections. Bumped on a breaking change. | Collection names: `beta-3-g2-movements`    |
| **Document revision** (`revision`)                               | The version of one document. +1 on every write.                                       | A field on each document; used as the ETag |

We propose renaming `DATA_REVISION` → `DATA_GENERATION` (and `-r<N>-` → `-g<N>-` in collection names) so
the two can't be confused.

## Proposal

### 1. One collection per entity, plus a history collection

Each entity (`movements`, `collections`, `deliveries`, `receipts`) has a state collection holding its
current version, and a `_history` collection holding earlier versions. This is the same pattern as Receipt of
Waste (`waste-inputs` / `waste-inputs-history`).

```js
// beta-3-g1-movements: current state
{
  _id: '26A1B2C3',        // the natural ID (movementId)
  orgId: '…',
  revision: 3,            // document revision: +1 on every write; the ETag
  createdAt, updatedAt, traceId,
  payload: Binary,        // the original request, the source for API → DB → API
  isHazardous: true       // business fields: only what the logic needs
}

// beta-3-g1-movements_history: previous versions
{ _id: ObjectId, entityId: '26A1B2C3', revision: 2, archivedAt, snapshot: { /* the document at r2 */ } }
```

An update runs in one transaction: copy the current document into history, then overwrite it, but only if
`revision` hasn't changed in the meantime. If it has, the transaction aborts.

> One fix compared with ROW: today a failed update can still commit its history entry. Here, the
> transaction aborts instead.

### 2. ETag updates using the document revision

The document revision lets clients make **conditional updates**:

- A read returns `ETag: "3"`.
- An update sends `If-Match: "3"`, and the write is filtered on `{ _id, revision: 3 }`.
- If someone else wrote first, nothing matches and the client gets **412 Precondition Failed**.
- An update without `If-Match` still gets the same check against the revision it just read, and returns
  409 if there's a conflict.

### 3. The payload is the source; the other fields serve the logic

Each document holds two kinds of data:

- **`payload: Binary`**: the original request, stored as-is. It's never queried or edited. It's the
  source for mapping **API → DB → API**: a response is built from the payload (plus envelope fields like the
  ID), not from the business fields.
- **Business fields**, e.g. `isHazardous`, links to other entities, status: only what lookups and rules
  need. They're worked out from the payload when the document is written.

What this gives us:

- A response always reflects exactly what the client sent.
- The business fields can stay small and change freely.
- If they ever need rebuilding, they can be worked out again from the payload.

### 4. Mappers

For each entity, a small module of pure functions:

- `toDocument(apiPayload)` → `payload` + the business fields worked out from it (fields are picked
  explicitly, never copied wholesale)
- `toResponse(document)` → the API response, built from `payload`

Tests run every API example through them and check the result against the DB schema and the response
schema.

### 5. DB schemas specified like API schemas

Each version gets its own DB schemas, separate from the API ones:

```
src/versions/beta-3/data/schemas/movement/
  movement.schema.json     the stored shape (envelope + business fields)
  movement.indexes.json    the indexes
  movement.examples.json
```

- They're written in the same JSON Schema style as the API schemas, but limited to **shape only**: fields,
  types (`bsonType`: string, date, binary…), and required fields. No conditional rules.
- They're used **in our code** (ajv validates a document before it's written) and **in MongoDB** (each
  collection gets the schema as a `$jsonSchema` validator). Mongo then rejects a badly shaped write from any
  client, not only from this service.
- **Indexes** are declared as JSON next to each schema and kept in sync at boot (missing ones created,
  removed ones dropped).

### 6. Changing a DB schema

One data generation covers **all** of an API version's collections, so they always change together and the
data stays consistent.

| Change                                                        | What happens                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Add an optional field                                         | Nothing. The validator is updated at the next boot.                                     |
| Remove or rename a field, add a required field, change a type | **Breaking.** Bump `DATA_GENERATION`, and the service starts on new, empty collections. |

**Beta data can be thrown away**, so reset stays the default. A migration is optional: because every
document carries its original payload, a new generation can be filled by re-running `toDocument` on each
stored payload.

### 7. Breaking-change detection in CI, against `main`

The database in CI and locally is always fresh, so it can't show what changed. CI compares the **schema
files** instead:

1. Take `data/schemas/**` from `main` and from the PR.
2. Flatten each into a list of fields: `path → type, required`.
3. Compare. A removed or renamed field, a new required field, or a changed type counts as **breaking**.
4. A breaking change without a `DATA_GENERATION` bump **fails the build**:

```
beta-3 movement: breaking change — bump DATA_GENERATION
  - removed  isHazardous
  + required wasteCategory
```

As a safety net in long-lived environments, the service also **refuses to start** if stored documents don't
match the new schema.

### 8. Ready for an outbox later

We're not building the audit outbox to GIO now, but the design allows for it:

- Every write already happens through one place (the store) and can run in one transaction.
- Adding the outbox means inserting an audit record, built by a new `toAuditModel` mapper, **in the same
  transaction** as the state change, plus a worker that sends and retries.
- Nothing else in the design has to change.

## Alternatives considered

- **Event log + projections.** More flexible, but more machinery than we need now.
- **Mongo validators only (no JSON Schema files).** They use a different dialect, can't use `$ref`, and are
  harder to review.
- **Mapping responses from the business fields.** That would tie the business model to the API shape, and
  every API change would become a DB change.

## Open questions

1. Does our Mongo user on CDP have the `dbAdmin` role? It's needed to update a validator in place. Without
   it, every schema change needs a `DATA_GENERATION` bump. _Open: [backlog](../backlog/cdp-mongo-dbadmin-role.md)._
2. What identifies a collection and a receipt (`movementId`? `deliveryId`?), and is a second submission an
   update or a 409? _Open: [backlog](../backlog/collection-receipt-identity.md)._
3. A resubmitted hazardous movement currently creates a duplicate delivery. Should it become an update or a
   409? _Open: [backlog](../backlog/hazardous-resubmission-duplicate-delivery.md)._
4. How should the future outbox survive a `DATA_GENERATION` reset without losing unsent audit messages?
5. Does this address the concerns raised about the ROW approach in the Equal Experts Slack thread?
