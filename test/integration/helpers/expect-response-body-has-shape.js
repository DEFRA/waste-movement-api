export function expectResponseBodyHasCorrectShape({
  body = {},
  shape = 'SUCCESS'
}) {
  switch (shape) {
    case 'SUCCESS':
      expect(body).toHaveProperty('data')
      expect(body).toMatchObject({
        validation: expect.any(Object)
      })
      break

    case 'ERROR':
      expect(body).toMatchObject({
        title: expect.any(String),
        type: expect.any(String),
        instance: expect.any(String),
        detail: expect.any(String),
        requestId: expect.any(String)
      })
      break

    case 'VALIDATION-ERROR':
      expect(body).toMatchObject({
        title: expect.any(String),
        type: expect.any(String),
        instance: expect.any(String),
        detail: expect.any(String),
        requestId: expect.any(String),
        errors: expect.any(Array)
      })
      break

    default:
      throw new Error(`Unknown response shape: ${shape}`)
  }
}
