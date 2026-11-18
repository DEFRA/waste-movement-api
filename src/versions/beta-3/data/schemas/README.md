# DB schemas

What `beta-3` stores in MongoDB, specified the way the API is in [../../schemas](../../schemas/README.md):
one JSON Schema per entity, so a change to the stored shape is visible in review. The design is in
[docs/plans/20261117-database-layer.md](../../../../../docs/plans/20261117-database-layer.md).

```
common/envelope.schema.json        the fields every document carries
movement/movement.schema.json      the stored shape of beta-3-g<N>-movements
movement/movement.indexes.json     its indexes
movement/movement.examples.json    stored documents, as relaxed Extended JSON
collection/ delivery/ receipt/     likewise
openapi.json                       all of the above in one document, with no endpoints, to browse
```

## What a document holds

- **The envelope**: `orgId`, `revision`, `createdAt`, `updatedAt`, `traceId`. `revision` is 1 when a
  document is created and +1 on every write, so it can serve as its ETag. (For now documents are
  only inserted.)
- **`payload`**: the original request body as UTF-8 JSON bytes (`binData`), as sent. It's never
  queried or edited. A response is built from it plus the envelope, and the other fields can be
  worked out from it again.
- **Business fields**: only what lookups and rules need, e.g. a movement's `isHazardous` or a
  delivery's `movementIds`. Each entity's mapper in [../mappers](../mappers) picks them explicitly
  from the payload in `toDocument`; `toResponse` builds the API response.

## Format

- **MongoDB's `$jsonSchema` dialect**: types are `bsonType` (`string`, `int`, `date`, `binData`,
  `objectId`, `bool`, `array`, `object`, `null`). The same schema is checked by ajv before every
  write, and is each collection's validator in MongoDB, so a badly shaped write is rejected from any
  client.
- **Shape only**: `bsonType`, `properties`, `required`, `additionalProperties`, `items`, `enum`,
  `title`, `description` and `$ref`. No conditional rules, formats or patterns: the API schemas
  check the request.
- **`$ref`s are resolved when a schema is loaded**, as MongoDB can't follow them. Each entity
  refers to the envelope's fields one by one.
- **Closed objects**: every object has `"additionalProperties": false`, including the top level,
  which lists `_id`.
- **Every field has a `description`**, and **every entity has examples**, which ajv and MongoDB
  must both accept.
- **Indexes** are a JSON array beside the schema, `{ "name", "key", "unique"? }`, named as MongoDB
  names them (`deliveryId_1`) and synced by name at boot: missing ones created, undeclared ones
  dropped, changed ones recreated.

`schemas.test.js` checks all of the above, and runs every API request example through its mapper
and back, against this schema and the response schema.

## Changing a schema

One `DATA_GENERATION` (in [../generation.js](../generation.js)) covers all of this version's
collections, so they always change together.

| Change                                                                              | What happens                                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Add an optional field, add an enum value, add or drop an index                      | Nothing. The validator and indexes are updated at the next boot.                        |
| Remove or rename a field, change a type, remove an enum value, add a required field | **Breaking.** Bump `DATA_GENERATION`, and the service starts on new, empty collections. |

`npm run check:data-schemas [base-ref]` compares these files with `origin/main`'s (CI: the pull
request's base) and fails a breaking change without a bump:

```
beta-3 movement: breaking change — bump DATA_GENERATION
  - removed  isHazardous
  + required wasteCategory
```

As a safety net, the service refuses to start if documents already stored don't match the schema,
or if it can't update a validator: that needs the `dbAdmin` role, so without it every schema change
needs a bump.
