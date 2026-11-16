import Boom from '@hapi/boom'
import { withPayloadChecks } from './payload-checks.js'

const schemaDetail = {
  message: "'carrier' is required",
  path: ['carrier'],
  type: 'NotProvided'
}

const checkDetail = {
  message: 'must be a recognised EWC code',
  path: ['wasteItems', '0', 'classification', 'ewcCodes', '0'],
  type: 'InvalidValue'
}

const passing = () => undefined

const failingWith = (details) => () => {
  const error = Boom.badRequest('schema failed')
  error.details = details
  throw error
}

const adding = (detail) => (_payload, details) => [...details, detail]

const getError = (fn) => {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected it to throw')
}

describe('withPayloadChecks', () => {
  test('returns the payload when the schema and every check pass', () => {
    const payload = { carrier: {} }
    const validate = withPayloadChecks(passing, (_payload, details) => details)

    expect(validate(payload)).toBe(payload)
  })

  test('returns the payload with no checks when the schema passes', () => {
    const payload = { carrier: {} }

    expect(withPayloadChecks(passing)(payload)).toBe(payload)
  })

  test("reports the schema's errors when there are no checks", () => {
    const validate = withPayloadChecks(failingWith([schemaDetail]))

    expect(getError(() => validate({})).details).toEqual([schemaDetail])
  })

  test('throws a Boom badRequest whose message joins every error', () => {
    const validate = withPayloadChecks(
      failingWith([schemaDetail]),
      adding(checkDetail)
    )
    const error = getError(() => validate({}))

    expect(error.output.statusCode).toBe(400)
    expect(error.message).toBe(
      "'carrier' is required. must be a recognised EWC code"
    )
    expect(error.details).toEqual([schemaDetail, checkDetail])
  })

  test('runs the checks even when the schema passes', () => {
    const validate = withPayloadChecks(passing, adding(checkDetail))

    expect(getError(() => validate({})).details).toEqual([checkDetail])
  })

  test('gives each check the payload and the errors found before it, in order', () => {
    const payload = { carrier: {} }
    const first = vi.fn(adding(checkDetail))
    const second = vi.fn((_payload, details) => details)

    getError(() =>
      withPayloadChecks(failingWith([schemaDetail]), first, second)(payload)
    )

    expect(first).toHaveBeenCalledWith(payload, [schemaDetail])
    expect(second).toHaveBeenCalledWith(payload, [schemaDetail, checkDetail])
  })

  test("lets a check replace the schema's errors", () => {
    const validate = withPayloadChecks(failingWith([schemaDetail]), () => [
      checkDetail
    ])

    expect(getError(() => validate({})).details).toEqual([checkDetail])
  })

  test('returns the payload when a check clears every error', () => {
    const payload = {}
    const validate = withPayloadChecks(failingWith([schemaDetail]), () => [])

    expect(validate(payload)).toBe(payload)
  })

  test('rethrows an error that is not a validation error unchanged', () => {
    const unexpected = new Error('boom')
    const check = vi.fn()
    const validate = withPayloadChecks(() => {
      throw unexpected
    }, check)

    expect(getError(() => validate({}))).toBe(unexpected)
    expect(check).not.toHaveBeenCalled()
  })
})
