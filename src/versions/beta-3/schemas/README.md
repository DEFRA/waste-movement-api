# Schemas

Every `beta-3` request and 201 response body is defined once, as a JSON Schema file. That file is
the source of truth: the service validates against it, and the OpenAPI spec and documentation
refer to it rather than restating it.

These are the patterns a schema here follows, checked by `conventions.test.js`. Each is a rule you
can check a schema against, with the reason in a line. They started as `beta-2`'s in
waste-movement-backend; a later version copied from this folder keeps them unless it says
otherwise.

## Format

- **JSON Schema 2020-12, not Joi.** The rules are an open standard that can be shared with other
  repos, regulators and code generators, not tied to one library.
- **Published as OpenAPI 3.1.** 3.1 uses 2020-12 natively, so the spec references these exact
  files. 3.0 can't express `const`, `propertyNames` or the conditional rules below.
- **No `$id`.** A schema's path is its identity, and `$ref`s are relative paths.
- **Self-contained.** Every rule is inline (`pattern`, `enum`, `const`, `required`). Only standard
  formats (`email`, `date-time`, `uuid`); no custom formats, no imports from other packages. A
  pattern owned here may differ from older validators elsewhere, and that's accepted.
- **One small file per resource**, and per variant of a resource, joined by `$ref`. Shared
  resources are reused, not copied.
- **A whole body is named after its route**: `<route>-request` / `<route>-response`. Path
  parameters are `-params`. Everything else is named after the resource.

## Shape

- **Closed objects.** Every object has `"additionalProperties": false`. A schema combined with
  `allOf` lists its fields in `propertyNames.enum` instead; an overlay (a `$ref` plus one extra
  rule) stays open, because what it refers to is closed.
- **No boolean subschemas**, except `"additionalProperties": false`. Forbid a field with
  `{ "not": {}, "description": "Not allowed when …" }`. Some OpenAPI tools reject a bare `false`.
- **Optional means left out.** An optional field has one type; `null` or `""` doesn't mean "not
  provided".
- **Free text has a `maxLength`**: 255 for short text (names, labels, references), 5000 for long
  text (descriptions, reasons, addresses), 254 for email. Limits can be raised later without
  breaking callers; they can't be added. A `pattern` or `format` already bounds a field.

## Conditional rules

- **Use `if`/`then`/`else`, not `oneOf` or `anyOf`**, for a rule that depends on another field.
  An `if` reports one error about what the caller sent; `oneOf`/`anyOf` report every branch.
- **`oneOf` only for a real choice between variants** (e.g. producer types), which generators turn
  into a union. Never `anyOf`.
- **The description of a `then`, `else` or `not` is the error message.** Write it as the
  condition — "Required when 'x' is 'Y'", "Not allowed when 'x' is provided" — with field names
  and values in single quotes and no closing full stop.

## Recurring patterns

- **"Is there one?"** — an object with a boolean `isPresent`; its other fields are required when
  `true` and not allowed when `false`.
- **"A value, or why there isn't one"** — `<identifier>` beside `reasonForNo<Identifier>`, exactly
  one required. If "exactly one" depends on other data, the schema enforces "not both" and a
  payload check does the rest.
- **"None of the above"** — an enum that can't list everything ends with `OTHER`, and an
  `other<Field>` beside it is required when the enum is `OTHER` and not allowed otherwise.

## Naming

- **Field names are camelCase**, and a concept has one name everywhere (`organisationName`,
  `address`). Rename to match; don't alias.
- **Siblings that qualify a noun start with it**: `containerType`, `containerCount`.
- **Event times are `<event>DateTime`**; the description says whether it's planned or actual.
- **Booleans start with `is`.**
- **Arrays are plural; objects and single values are singular.**
- **Enum and `const` values are `SCREAMING_SNAKE`** (`ROAD`, `INLAND_WATERWAY`). Field-name enums
  and error types are exempt.

## Descriptions and examples

- **Every schema and property has a `description`.** Generated docs are built from it. Name an
  endpoint as `` `POST /movements` ``, without the version prefix. Capitalise Movement,
  Collection, Delivery and Receipt when they mean the record the API keeps.
- **Every body has named examples** in a `.examples.json` beside its schema; a response uses the
  same example names as its request. Other schemas use the `examples` keyword. Every example must
  be valid.

## Beyond the schema

- **Payload checks** cover rules a schema can't say: reference data too long to inline, or rules
  spanning resources. They run after the schema and add to the same 400.
- **Rules needing stored data** stay in service code.
- **Responses are validated too.** A 201 that doesn't match its schema is a 500, so a new response
  field is added to the schema in the same change.
- **Every schema has a test** beside it, one named case per business rule. Changing a rule means
  changing its test.
- **The OpenAPI spec lives with the schemas** and `$ref`s them and their examples, so a schema
  change and its spec change land together.
