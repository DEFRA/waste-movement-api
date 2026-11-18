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

**Not used by the code yet.** These describe what [../movements.js](../movements.js) and
[../deliveries.js](../deliveries.js) write today; nothing loads or enforces them. Keep them in step
by hand until they're wired in.

## Format

- **MongoDB's `$jsonSchema` dialect**: types are `bsonType` (`string`, `int`, `date`, `binData`,
  `objectId`, `bool`, `array`, `object`, `null`), so the same file can later serve as a collection's
  validator and, with a `bsonType` keyword, be checked by ajv before a write.
- **Shape only**: `bsonType`, `properties`, `required`, `additionalProperties`, `items`, `enum`,
  `title`, `description` and `$ref`. No conditional rules, formats or patterns: the API schemas
  check the request.
- **Closed objects**: every object whose fields are listed has `"additionalProperties": false`,
  including the top level, which lists `_id`. A movement's waste items are stored as the request
  sent them and are left open, as the API's request schema already describes them.
- **Every field has a `description`**, and every entity has examples.
- **Indexes** are a JSON array beside the schema, `{ "name", "key", "unique"? }`, named as MongoDB
  names them today.
