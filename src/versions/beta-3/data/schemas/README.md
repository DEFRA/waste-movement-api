# DB schemas

What `beta-3` stores in MongoDB, specified the way the API is in [../../schemas](../../schemas/README.md):
one JSON Schema per entity, so a change to the stored shape is visible in review. Why it's shaped
this way is in [decisions](../../../../../docs/decisions.md).

```
common/envelope.schema.json        the fields every document carries
movement/movement.schema.json      the stored shape of beta-3-g<N>-movements
movement/movement.indexes.json     its indexes
movement/movement.examples.json    stored documents, as relaxed Extended JSON ($oid, $date, $binary)
collection/ delivery/ receipt/     likewise
openapi.json                       all of the above in one document, with no endpoints, to browse
```

## What a document holds

- **The envelope**: `_id`, `orgId`, `clientId`, `clientName`, `requestId`, `revision`, `createdAt`,
  `updatedAt`, and `payload` with its `payloadHash`.
  - `_id` is a generated ObjectId, internal and never exposed. An entity's public ID (`movementId`,
    `deliveryId`) is a field of its own.
  - `orgId` is the organisation the request was for, and `clientId` the software provider that sent it
    (its Cognito token's `client_id`), both forwarded by the external API. An organisation can use more
    than one provider, or switch, so the two are recorded apart. `clientName` is the provider's name at
    the time, or null when the external API couldn't look it up.
  - `requestId` is the `x-request-id` the API returned to the request that created the document. It
    never changes, so it links the documents one request created, e.g. the Deliveries one
    `POST /deliveries` recorded.
  - `revision` is 0 for now. Documents are only inserted; a history collection will drive it once they
    can be updated.
- **`payload`**: the request body as UTF-8 JSON bytes (`binData`). It's never queried or edited.
  The business fields can be worked out from it again, and a future read endpoint can build its
  response from it.
  - It's the same data as sent, not necessarily the same bytes. Hapi parses the body before the
    route sees it, and `payload` is `JSON.stringify` of that parsed body (see
    [toPayload](../../../../common/data/payload.js)). Every key and value is kept, in their order,
    but whitespace isn't, numbers are rewritten (`1.0` as `1`), and an integer beyond 2⁵³ would
    lose precision. The body also reaches this service through waste-movement-external-api, so
    the bytes received may not be the client's anyway.
  - Keeping the bytes exactly would mean capturing the raw body as it's read (Hapi's request `peek`
    event). Nothing needs that yet, and `payloadHash` doesn't depend on it.
  - The empty Delivery `POST /receipts` creates for an undocumented Receipt keeps that request's
    body too, the same as its Receipt, so every document has a `payload`.
- **`payloadHash`**: SHA-256, as hex, of the request's JSON with every object's keys sorted, so it's
  the same however a resubmission orders or spaces its keys. A second Collection or Receipt for the
  same key is the request resubmitted (`201`, nothing more stored) when its organisation and hash
  match the stored one's, and a `409` otherwise.
- **Business fields**: only what lookups and rules need. Each data module in [..](..) picks them
  explicitly from the request when it builds the document; nothing is copied wholesale.

| Collection  | Business fields                            | Read by                                                                       |
| ----------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| movements   | `movementId` (unique), `isHazardous`       | `POST /deliveries`, to group them; `POST /movements/{id}/collection`, exists  |
| collections | `movementId` (unique)                      | its unique index: a Movement's Collection is recorded once, a second is a 409 |
| deliveries  | `deliveryId`, `movementIds[]`, `wasteType` | `POST /deliveries/{id}/receipt`, for its Movements                            |
| receipts    | `deliveryId` (unique)                      | its unique index: a Delivery's Receipt is recorded once, a second is a 409    |

A delivery's `wasteType` isn't read back yet, but it's worked out from the Movements rather than
sent, so it's the only record of how they were grouped. An undocumented Receipt's empty Delivery
gets one too, from the waste items of its own request: any declaring hazardous properties makes it
`HAZARDOUS`, the same rule as for a Movement. So every Delivery has all its fields.

## Format

- **MongoDB's `$jsonSchema` dialect**, as close to plain JSON Schema as it allows. The same
  schema is checked by ajv before every write, and is each collection's validator in MongoDB
  (`strict`, `error`), so a badly shaped write is rejected from any client.
- **A JSON type goes in `type`** (`string`, `boolean`, `number`, `object`, `array`, or a list of
  them such as `["string", "null"]`), which JSON Schema and OpenAPI tools understand. **Only what `type` can't say goes in `bsonType`**:
  `objectId` (`_id`), `date` (`createdAt`, `updatedAt`), `binData` (`payload`) and `int`
  (`revision`), which tools show as untyped. MongoDB rejects a field with both, and doesn't
  support `type: "integer"`, `format`, `nullable` or `example`.
- **Shape only**: `type`, `bsonType`, `properties`, `required`, `additionalProperties`, `items`,
  `enum`, `title`, `description` and `$ref`. No conditional rules, formats or patterns: the API schemas
  check the request.
- **`$ref`s are resolved when a schema is loaded**, as MongoDB can't follow them. Each entity
  refers to the envelope's fields one by one.
- **Closed objects**: nothing undocumented is stored, so every object has
  `"additionalProperties": false`, including the top level, which lists `_id`.
- **Every field has a `description`**, and **every entity has examples**, which ajv and MongoDB
  must both accept.
- **Indexes** are a JSON array beside the schema, `{ "name", "key", "unique"? }`, named as MongoDB
  names them (`deliveryId_1`).

`schemas.test.js` checks all of the above, and stores every API request example through its data
module, checking it reads back from `payload` unchanged.

## Changing a schema

At boot, [syncDataSchemas](../../../../common/data/sync-data-schemas.js) creates each missing
collection with its schema as its validator and with its indexes. An existing collection must match
them exactly (titles and descriptions aside), or the service refuses to start.

| Change                                  | What to do             |
| --------------------------------------- | ---------------------- |
| A `title` or `description`              | Nothing                |
| Anything else in a schema, or any index | Bump `DATA_GENERATION` |

Bumping [../generation.js](../generation.js) starts the version on new, empty collections; the old
generation's are left behind. Rolling back across a bump resumes the older generation, as its
collections still match its schemas (see [decisions](../../../../../docs/decisions.md)).
