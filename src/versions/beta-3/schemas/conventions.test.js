// Rules every *.schema.json (and *.examples.json) under this folder must
// follow, checked across all files at once rather than per schema. See
// README.md for the reasoning.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { validators } from './validators.js'

const { getErrors, validate } = validators
const schemaRoot = import.meta.dirname

function collectFiles(dir, suffix) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectFiles(fullPath, suffix)
    }
    return entry.endsWith(suffix) ? [fullPath] : []
  })
}

// Keywords whose value is a subschema, a map of them, or a list of them.
// `additionalProperties` is deliberately absent: `false` there is how a whole
// payload is closed, and every tool we know of handles it.
const subschemaKeywords = [
  'items',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else'
]
const subschemaMapKeywords = [
  'properties',
  'patternProperties',
  'dependentSchemas',
  '$defs'
]
const subschemaListKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems']

/** JSON pointers to every `true` / `false` used in place of a subschema. */
function findBooleanSubschemas(node, pointer = '') {
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => findBooleanSubschemas(v, `${pointer}/${i}`))
  }
  if (!node || typeof node !== 'object') {
    return []
  }

  const found = []
  const check = (value, at) => {
    if (typeof value === 'boolean') found.push(at)
  }
  for (const key of subschemaKeywords) {
    if (key in node) check(node[key], `${pointer}/${key}`)
  }
  for (const key of subschemaMapKeywords) {
    for (const [name, value] of Object.entries(node[key] ?? {})) {
      check(value, `${pointer}/${key}/${name}`)
    }
  }
  for (const key of subschemaListKeywords) {
    for (const [i, value] of (node[key] ?? []).entries()) {
      check(value, `${pointer}/${key}/${i}`)
    }
  }

  for (const [key, value] of Object.entries(node)) {
    found.push(...findBooleanSubschemas(value, `${pointer}/${key}`))
  }
  // A property *named* like a keyword (brokerOrDealer's `items`) is seen both
  // as a map entry and as a keyword when the map itself is walked.
  return [...new Set(found)]
}

/** JSON pointers to every then / else / not that can reject but has no description. */
function findUndescribedConditions(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  // A branch holding only `properties` raises nothing itself — its errors
  // come from the subschemas inside, which are checked in their own right.
  const raisesErrors = (branch) =>
    Object.keys(branch).some(
      (key) => !['properties', 'description'].includes(key)
    )
  const undescribed = ['then', 'else']
    .filter(
      (key) => node[key] && raisesErrors(node[key]) && !node[key].description
    )
    .map((key) => `${pointer}/${key}`)
  if ('not' in node && !node.description) {
    undescribed.push(pointer)
  }
  return [
    ...undescribed,
    ...Object.entries(node).flatMap(([key, value]) =>
      findUndescribedConditions(value, `${pointer}/${key}`)
    )
  ]
}

// The descriptions findUndescribedConditions requires, with their pointers.
function findConditionMessages(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  const messages = ['then', 'else']
    .filter((key) => node[key]?.description)
    .map((key) => [`${pointer}/${key}`, node[key].description])
  if ('not' in node && node.description) {
    messages.push([pointer, node.description])
  }
  return [
    ...messages,
    ...Object.entries(node).flatMap(([key, value]) =>
      findConditionMessages(value, `${pointer}/${key}`)
    )
  ]
}

/** JSON pointers to every `anyOf`. */
function findAnyOfs(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  return [
    ...('anyOf' in node ? [`${pointer}/anyOf`] : []),
    ...Object.entries(node).flatMap(([key, value]) =>
      findAnyOfs(value, `${pointer}/${key}`)
    )
  ]
}

/** [pointer, value] for every string `enum` / `const` value, field names aside. */
function findEnumValues(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  const values = [
    ...(Array.isArray(node.enum) ? node.enum : []),
    ...('const' in node ? [node.const] : [])
  ]
    .filter((value) => typeof value === 'string')
    .map((value) => [pointer, value])
  return [
    ...values,
    ...Object.entries(node)
      // A `propertyNames` enum lists field names, which are camelCase.
      .filter(([key]) => key !== 'propertyNames')
      .flatMap(([key, value]) => findEnumValues(value, `${pointer}/${key}`))
  ]
}

/** JSON pointers to every boolean property whose name doesn't start with `is`. */
function findMisnamedBooleans(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  const misnamed = Object.entries(node.properties ?? {})
    .filter(
      ([name, value]) => value?.type === 'boolean' && !/^is[A-Z]/.test(name)
    )
    .map(([name]) => `${pointer}/properties/${name}`)
  return [
    ...misnamed,
    ...Object.entries(node).flatMap(([key, value]) =>
      findMisnamedBooleans(value, `${pointer}/${key}`)
    )
  ]
}

/** [pointer, format, maxLength] for every string with no pattern, enum or const. */
function findFreeText(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  const isFreeText =
    node.type === 'string' &&
    !['pattern', 'enum', 'const'].some((key) => key in node)
  return [
    ...(isFreeText ? [[pointer, node.format, node.maxLength]] : []),
    ...Object.entries(node).flatMap(([key, value]) =>
      findFreeText(value, `${pointer}/${key}`)
    )
  ]
}

/**
 * JSON pointers to every enum property with an `OTHER` value that has no
 * `other<Field>` beside it, required when it's `OTHER` and forbidden otherwise.
 */
function findOtherWithoutFreeText(node, pointer = '') {
  if (!node || typeof node !== 'object') {
    return []
  }
  const conditions = [node, ...(node.allOf ?? [])].filter((s) => s.if)
  const hasOtherField = (field, otherField) =>
    otherField in (node.properties ?? {}) &&
    conditions.some(
      (s) =>
        s.if.properties?.[field]?.const === 'OTHER' &&
        s.then?.required?.includes(otherField) &&
        'not' in (s.else?.properties?.[otherField] ?? {})
    )
  const missing = Object.entries(node.properties ?? {})
    .filter(([, value]) => value?.enum?.includes('OTHER'))
    .filter(
      ([field]) =>
        !hasOtherField(field, `other${field[0].toUpperCase()}${field.slice(1)}`)
    )
    .map(([field]) => `${pointer}/properties/${field}`)
  return [
    ...missing,
    ...Object.entries(node).flatMap(([key, value]) =>
      findOtherWithoutFreeText(value, `${pointer}/${key}`)
    )
  ]
}

const screamingSnake = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/

// Short text and long text, and the email address limit: see "Free text has
// a maxLength" in README.md. Other formats (date-time) bound themselves.
const freeTextLimits = [255, 5000]
const emailAddressMaxLength = 254

// The service writes these, not the caller: issue.schema.json is only ever in
// a response.
const freeTextLimitExceptions = new Set([
  'common/issue.schema.json#/properties/pointer',
  'common/issue.schema.json#/properties/message'
])

// errorType's values (NotProvided, BusinessRuleViolation, …) are
// waste-movement-utils' validation error categories, which the legacy routes
// return too, so they keep their casing.
const enumCasingExceptions = new Set([
  'common/issue.schema.json#/properties/errorType'
])

const readAll = (suffix) =>
  collectFiles(schemaRoot, suffix).map((file) => [
    path.relative(schemaRoot, file),
    JSON.parse(readFileSync(file, 'utf8'))
  ])

const schemaFiles = readAll('.schema.json')
const examplesFiles = readAll('.examples.json')

// The validator's key for a file: its path from this folder, "/"-separated.
const schemaIdFor = (file) =>
  file
    .replace(/\.examples\.json$/, '.schema.json')
    .split(path.sep)
    .join('/')

describe('schema conventions', () => {
  test('finds schema files to check', () => {
    expect(schemaFiles.length).toBeGreaterThan(0)
  })

  // Boolean subschemas (`"field": false` to forbid a field) are valid JSON
  // Schema 2020-12 and OpenAPI 3.1, but tools built on OpenAPIKit — Apple's
  // swift-openapi-generator, OpenAPI Viewer for macOS — cannot decode them
  // and reject the whole published spec, which `$ref`s these files. Write
  // `{ "not": {}, "description": "Not allowed when …" }` instead: it
  // validates identically, and error-mapping maps its 'not' error to
  // NotAllowed exactly as it did for 'false schema'.
  test.each(schemaFiles)('%s uses no boolean subschemas', (_, schema) => {
    expect(findBooleanSubschemas(schema)).toEqual([])
  })

  // error-mapping uses a then / else / not subschema's description as the
  // message for an error it raises directly ("Required when …", "Not allowed
  // when …"), so each one that can raise an error needs a description.
  test.each(schemaFiles)(
    '%s describes every then, else and not that can reject',
    (_, schema) => {
      expect(findUndescribedConditions(schema)).toEqual([])
    }
  )

  // Those descriptions are worded like error-mapping's own messages
  // ("'receiver' is required"): field names and values in single quotes, no
  // full stop, since the validator joins messages with ". " itself.
  test.each(schemaFiles)(
    '%s words every condition message like the validator does',
    (_, schema) => {
      const malformed = findConditionMessages(schema).filter(
        ([, message]) => message.endsWith('.') || message.includes('"')
      )
      expect(malformed).toEqual([])
    }
  )

  // A failed anyOf reports every branch's errors: "at least one of
  // emailAddress / phoneNumber" as an anyOf of two requireds says both are
  // required. An if on the first field, with the second required in the
  // else, reports only the one the caller is missing.
  test.each(schemaFiles)('%s uses no anyOf', (_, schema) => {
    expect(findAnyOfs(schema)).toEqual([])
  })

  // One casing for every enum value, so callers never have to guess whether
  // it's 'Road', 'road' or 'ROAD'. Upper-case codes (DRU, HP_1, R13) fit too.
  test.each(schemaFiles)(
    '%s uses SCREAMING_SNAKE for every enum value',
    (file, schema) => {
      const id = schemaIdFor(file)
      const miscased = findEnumValues(schema).filter(
        ([pointer, value]) =>
          !screamingSnake.test(value) &&
          !enumCasingExceptions.has(`${id}#${pointer}`)
      )
      expect(miscased).toEqual([])
    }
  )

  // A true/false field reads as a question: isPresent, isEstimate.
  test.each(schemaFiles)(
    '%s starts every boolean field name with is',
    (_, schema) => {
      expect(findMisnamedBooleans(schema)).toEqual([])
    }
  )

  // Free text has one of two length limits, so a caller can size their own
  // fields once: short text (names, labels, identifiers) or long text
  // (descriptions, reasons, addresses).
  test.each(schemaFiles)(
    '%s limits every free-text field to a length tier',
    (file, schema) => {
      const id = schemaIdFor(file)
      const unlimited = findFreeText(schema).filter(
        ([pointer, format, maxLength]) => {
          if (freeTextLimitExceptions.has(`${id}#${pointer}`)) {
            return false
          }
          if (format === 'email') {
            return maxLength !== emailAddressMaxLength
          }
          return !format && !freeTextLimits.includes(maxLength)
        }
      )
      expect(unlimited).toEqual([])
    }
  )

  // An OTHER with nowhere to say what it is records nothing, so every enum
  // with one has an other<Field> beside it: required when the enum is OTHER,
  // not allowed otherwise.
  test.each(schemaFiles)(
    '%s has an other<Field> for every enum with an OTHER value',
    (_, schema) => {
      expect(findOtherWithoutFreeText(schema)).toEqual([])
    }
  )

  // ajv treats `examples` as an annotation and never checks it, so an example
  // that has drifted from its schema would be published in the spec unnoticed.
  const filesWithExamples = schemaFiles
    .filter(([, schema]) => schema.examples)
    .flatMap(([file, schema]) =>
      schema.examples.map((example, i) => [file, i, example])
    )

  test.each(filesWithExamples)(
    '%s example %i is valid against its own schema',
    (file, _, example) => {
      const id = schemaIdFor(file)
      validate(id, example)
      expect(getErrors(id)).toBeNull()
    }
  )

  // Whole request and response bodies keep their examples in a sibling
  // <name>.examples.json, a map of named OpenAPI Example Objects, so the spec
  // can offer them by name (a picker in Swagger UI, saved examples in API
  // clients). Path params have no body, so they keep a root `examples`.
  const bodies = schemaFiles.filter(([file]) =>
    /-(request|response)\.schema\.json$/.test(file)
  )
  const params = schemaFiles.filter(([file]) =>
    file.endsWith('-params.schema.json')
  )
  const examplesByFile = new Map(examplesFiles)

  test.each(bodies)('%s has named examples beside it', (file) => {
    const examples = examplesByFile.get(
      file.replace(/\.schema\.json$/, '.examples.json')
    )
    expect(Object.keys(examples ?? {}).length).toBeGreaterThan(0)
  })

  test.each(params)('%s has at least one example', (_, schema) => {
    expect(schema.examples?.length).toBeGreaterThan(0)
  })

  const namedExamples = examplesFiles.flatMap(([file, examples]) =>
    Object.entries(examples).map(([name, example]) => [file, name, example])
  )

  test.each(namedExamples)(
    '%s example "%s" has a summary and a value valid against its schema',
    (file, _, example) => {
      expect(Object.keys(example).sort()).toEqual(['summary', 'value'])
      expect(typeof example.summary).toBe('string')

      const id = schemaIdFor(file)
      validate(id, example.value)
      expect(getErrors(id)).toBeNull()
    }
  )

  // Clients such as Bruno and Postman pair a request example with the
  // response example of the same name; unmatched names produce every
  // request × response combination instead.
  const requestExamples = examplesFiles.filter(([file]) =>
    file.endsWith('-request.examples.json')
  )

  test.each(requestExamples)(
    '%s names match its response examples',
    (file, examples) => {
      const response = examplesByFile.get(
        file.replace(/-request\.examples\.json$/, '-response.examples.json')
      )
      expect(Object.keys(response ?? {})).toEqual(Object.keys(examples))
    }
  )
})
