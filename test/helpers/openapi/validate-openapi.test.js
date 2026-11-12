import { validateOpenApi } from './validate-openapi.js'

const minimal = {
  openapi: '3.1.0',
  info: { title: 'Fixture', version: '1' },
  paths: {
    '/things': {
      get: {
        responses: {
          200: {
            description: 'OK',
            headers: { 'x-request-id': { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'object' } } }
          }
        }
      }
    }
  }
}

describe('validateOpenApi', () => {
  test('accepts a valid OpenAPI 3.1 document', () => {
    expect(validateOpenApi(minimal)).toBeNull()
  })

  test('rejects a document missing a required field', () => {
    const { info, ...withoutInfo } = minimal

    expect(validateOpenApi(withoutInfo)).toContainEqual(
      expect.objectContaining({
        keyword: 'required',
        params: { missingProperty: 'info' }
      })
    )
  })

  test('rejects a document for another OpenAPI version', () => {
    expect(validateOpenApi({ ...minimal, openapi: '3.0.3' })).not.toBeNull()
  })
})
