// Checks that openapi.json is valid together with everything it `$ref`s: the
// JSON Schemas beside it, the refs between those schemas, and the named
// `.examples.json` files. bundle resolves the refs first, so a missing file
// or pointer, or a ref that loops back on itself, fails here, as does
// anything invalid it pulls in.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bundle } from '#/common/openapi/bundle.js'
import { validateOpenApi } from '#test/helpers/openapi/validate-openapi.js'

const schemaRoot = import.meta.dirname
const specPath = path.join(schemaRoot, 'openapi.json')

test('openapi.json is a valid OpenAPI 3.1 document with all its $refs resolved', () => {
  expect(validateOpenApi(bundle(specPath))).toBeNull()
})

test('openapi.json describes this version', () => {
  const spec = JSON.parse(readFileSync(specPath, 'utf-8'))
  const version = path.basename(path.dirname(schemaRoot))

  expect(spec.info.version).toBe(version)
  expect(spec.servers.map(({ url }) => url.split('/').at(-1))).toEqual(
    spec.servers.map(() => version)
  )
})
