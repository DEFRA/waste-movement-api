# Proposal: database layer for beta-3

**Status:** mostly implemented · **Service:** waste-movement-api · **Date:** 2026-11-17 · **Updated:** 2026-11-27

## Progress

Only what's on `main` counts as done. This started as a proof of concept on DWTC-317. Most of it then
reached `main` in DWTC-311 (#18), sometimes in a different shape. The POC's code was dropped when it was
rebased onto `main`, so what remains is listed in the backlog.

| Part                                        | On `main`                                                                                                                                                                                                        | Remaining                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Naming: `DATA_REVISION` → `DATA_GENERATION` | **Done** (#7).                                                                                                                                                                                                   |                                                                                                         |
| 1. One collection per entity                | **Done** (#8, #18): movements, collections, deliveries and receipts. **Changed:** every `_id` is a generated ObjectId, never exposed; public IDs are fields with their own indexes.                             |                                                                                                         |
| 1. History collections and updates          | Not done: documents are only inserted.                                                                                                                                                                           | [Backlog](../backlog/updates-and-history-collections.md): there are no update routes yet.               |
| 2. Document revision and ETag               | **Partly** (#18): every document carries `revision: 0`.                                                                                                                                                          | The HTTP side (`ETag`, `If-Match`, 412) is [in the backlog](../backlog/etag-if-match-http.md).          |
| 3. Payload plus business fields             | **Done** (#18): `payload` (`binData`) and `payloadHash`, plus business fields, in an envelope of `orgId`, `clientId`, `clientName`, `requestId`, `revision`, `createdAt` and `updatedAt`. **Changed:** `requestId` instead of `traceId`. |                                                                                                         |
| 4. Mappers                                  | **Not adopted** (#18): each data module picks its fields when it builds the document, and routes build their ID-only responses inline. A mapper is to be added when a read endpoint needs one (`docs/decisions.md`). |                                                                                                         |
| 5. DB schema files                          | **Done** (#8, #18): all four entities, sharing the envelope by `$ref`, resolved at load.                                                                                                                         |                                                                                                         |
| 5. Enforced in MongoDB                      | **Done** (#10): each collection is created with its schema as a `$jsonSchema` validator (`strict`, `error`), and with its indexes.                                                                               |                                                                                                         |
| 5. Checked by ajv before a write            | **Done** (#18), in `entityStore`.                                                                                                                                                                                |                                                                                                         |
| 5. Index sync at boot                       | **Changed** (#10): indexes are fixed for a generation. Missing ones are created only on an empty collection, and any other difference stops the boot.                                                           |                                                                                                         |
| 6. Changing a DB schema                     | **Done, with a stricter rule** (#10, #11): any change except a `title` or `description` needs a bump. Old generations are left behind, not dropped. Now at 2 (#18).                                             |                                                                                                         |
| 7. Breaking-change check in CI              | **Dropped** (#10): the boot check replaces it.                                                                                                                                                                   |                                                                                                         |
| 8. DB → outbox mapper, to send to GIO       | Not started, as planned.                                                                                                                                                                                         | Possible later, not required for this stage.                                                            |
| Open question 2: resubmissions              | **Settled** (#18): a Collection's `movementId` and a Receipt's `deliveryId` are unique. A second one is a 409, unless it's the same request resubmitted, which gets its 201 again (`insertOnce`).               |                                                                                                         |
| Open question 3: hazardous duplicates       | Not done: a resubmitted hazardous Movement still stores a second Delivery.                                                                                                                                       | [Backlog](../backlog/hazardous-resubmission-duplicate-delivery.md).                                     |

## Why

beta-3 needs to persist its data. When this was written, only part of the journey was stored: a movement's
waste items and the delivery groupings. Collection and receipt payloads were validated and then thrown away.
We need to:

- keep every **original request payload**, unchanged
- store the fields the **business logic** needs, shaped for that logic
- **specify the stored shape** as clearly as the API is specified with JSON Schema, so changes are visible in
  review
- **catch breaking changes** to the stored shape before they reach an environment

## Naming

There are two different "revisions", so this proposal gives them different names:

| Term                                                             | Meaning                                                                               | Where                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Data generation** (`DATA_GENERATION`, formerly `DATA_REVISION`) | The version of a whole API version's set of collections. Bumped on a breaking change. | Collection names: `beta-3-g2-movements`    |
| **Document revision** (`revision`)                               | The version of one document. +1 on every write.                                       | A field on each document; used as the ETag |

**Done (#7):** `DATA_REVISION` is now `DATA_GENERATION`, and collection names use `-g<N>-` instead of
`-r<N>-`.

## Proposal

### 1. One collection per entity, plus a history collection

> **Done on `main` (#18), except history:** there's one collection per entity, in the shape below. History
> collections wait for update routes: [backlog](../backlog/updates-and-history-collections.md).

Each entity (`movements`, `collections`, `deliveries`, `receipts`) has a state collection holding its
current version, and a `_history` collection holding earlier versions. This is the same pattern as Receipt of
Waste (`waste-inputs` / `waste-inputs-history`).

```js
// beta-3-g2-movements: current state, as on main
{
  _id: ObjectId,          // internal, never exposed
  movementId: '26A1B2C3', // the public ID, with its own unique index
  orgId: '…', clientId: '…', clientName: '…',
  requestId: '…',         // the x-request-id of the request that created it; never changes
  revision: 0,            // document revision: +1 on every write; the ETag
  createdAt, updatedAt,
  payload: Binary,        // the original request, the source for API → DB → API
  payloadHash: '…',       // tells a resubmission from a different request
  isHazardous: true       // business fields: only what the logic needs
}

// beta-3-g2-movements_history: previous versions (not built yet)
{ _id: ObjectId, entityId: ObjectId, revision: 2, archivedAt, snapshot: { /* the document at r2 */ } }
```

An update runs in one transaction: copy the current document into history, then overwrite it, but only if
`revision` hasn't changed in the meantime. If it has, the transaction aborts.

> One fix compared with ROW: today a failed update can still commit its history entry. Here, the
> transaction aborts instead.

### 2. ETag updates using the document revision

> **Partly, on `main` (#18):** every document carries `revision: 0`. The HTTP side (`ETag`, `If-Match`,
> 412) is possible later, not required for this stage: [backlog](../backlog/etag-if-match-http.md).

The document revision lets clients make **conditional updates**:

- A read returns `ETag: "3"`.
- An update sends `If-Match: "3"`, and the write is filtered on `{ _id, revision: 3 }`.
- If someone else wrote first, nothing matches and the client gets **412 Precondition Failed**.
- An update without `If-Match` still gets the same check against the revision it just read, and returns
  409 if there's a conflict.

### 3. The payload is the source; the other fields serve the logic

> **Done on `main` (#18)**, plus a `payloadHash` to recognise a resubmission. See `docs/decisions.md`.

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

> **Not adopted on `main` (#18).** Every response today holds only IDs, so each data module picks its
> business fields when it builds the document, and routes build responses inline. A mapper is to be added
> when a read endpoint needs a response built from `payload` (`docs/decisions.md`). The POC's
> `data/mappers/` was dropped.

For each entity, a small module of pure functions:

- `toDocument(apiPayload)` → `payload` + the business fields worked out from it (fields are picked
  explicitly, never copied wholesale)
- `toResponse(document)` → the API response, built from `payload`

Tests run every API example through them and check the result against the DB schema and the response
schema.

### 5. DB schemas specified like API schemas

> **Done on `main` (#8, #10, #18)**, with indexes fixed per generation instead of synced (see below).

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

> **Changed on `main` (#10):** indexes are fixed for a generation instead. A missing one is created only
> while the collection is empty, and any other difference stops the boot until `DATA_GENERATION` is bumped.

### 6. Changing a DB schema

One data generation covers **all** of an API version's collections, so they always change together and the
data stays consistent.

> **Done on `main` (#10), with a stricter rule than below:** validators are never updated in place, so any
> change to a schema other than a `title` or `description`, and any change to its indexes, needs a bump.
> Until then the service refuses to start. Old generations are left behind, not dropped. See
> `docs/decisions.md`.

| Change                                                        | What happens                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Add an optional field                                         | Nothing. The validator is updated at the next boot.                                     |
| Remove or rename a field, add a required field, change a type | **Breaking.** Bump `DATA_GENERATION`, and the service starts on new, empty collections. |

**Beta data can be thrown away**, so reset stays the default. A migration is optional: because every
document carries its original payload, a new generation can be filled by working the documents out again
from each stored payload.

### 7. Breaking-change detection in CI, against `main`

> **Dropped (#10).** Since any schema change needs a bump, the boot check covers it. It compares each
> collection's validator and indexes with its schema files, reading only metadata.

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

> **Possible later, not required for this stage**: a DB → outbox mapper, to send records to GIO.

We're not building the audit outbox to GIO now, but the design allows for it:

- Every write already happens through one place (`entityStore`) and can run in one transaction
  (`withTransaction`).
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

1. ~~Does our Mongo user on CDP have the `dbAdmin` role? It's needed to update a validator in place.~~
   **Settled (#10):** validators are never updated in place, so `readWrite` is enough.
2. ~~What identifies a collection and a receipt (`movementId`? `deliveryId`?), and is a second submission an
   update or a 409?~~ **Settled (#18):** a unique `movementId` / `deliveryId`, while `_id` stays internal. A
   different second submission is a 409, and the same request resubmitted gets its 201 again.
3. A resubmitted hazardous movement currently creates a duplicate delivery. Should it become an update or a
   409? [Backlog](../backlog/hazardous-resubmission-duplicate-delivery.md).
4. How should the future outbox survive a `DATA_GENERATION` reset without losing unsent audit messages?
5. Does this address the concerns raised about the ROW approach in the Equal Experts Slack thread?
