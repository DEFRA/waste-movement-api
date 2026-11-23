# DB schemas

What `beta-3` stores in MongoDB, specified the way the API is in [../../schemas](../../schemas/README.md):
one JSON Schema per entity, so a change to the stored shape is visible in review.

```
movement/movement.schema.json      the stored shape of beta-3-g<N>-movements
movement/movement.indexes.json     its indexes
movement/movement.examples.json    stored documents, as relaxed Extended JSON ($oid, $date, …)
delivery/                          likewise, for beta-3-g<N>-deliveries
openapi.json                       all of the above in one document, with no endpoints, to browse
```

Each collection holds its schema as a `$jsonSchema` validator (`strict`, `error`), so MongoDB
rejects a badly shaped write from any client.

## Format

- **MongoDB's `$jsonSchema` dialect**: types are `bsonType` (`string`, `objectId`, `array`,
  `object`, …), so the file serves as the collection's validator as is.
- **Shape only**: `bsonType`, `properties`, `required`, `additionalProperties`, `items`, `enum`,
  `title` and `description`. No conditional rules, formats or patterns: the API schemas check the
  request. No `$ref`, as MongoDB can't follow one.
- **Closed objects**: nothing undocumented is stored, so every object has
  `"additionalProperties": false`, including the top level, which lists `_id`. The one exception,
  for now, is a movement's waste items: they're stored as the request sent them and left open. They
  change later to the request kept as an opaque `payload`.
- **Every field has a `description`**, and every entity has examples.
- **Indexes** are a JSON array beside the schema, `{ "name", "key", "unique"? }`, named as MongoDB
  names them today.

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
