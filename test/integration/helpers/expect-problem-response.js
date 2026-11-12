import { PROBLEM_TYPE_BASE } from './problem-types.js'
import { expectResponseBodyHasCorrectShape } from './expect-response-body-has-shape.js'

// 'bad-request' -> 'Bad Request'
const titleFromType = (type) =>
  type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/**
 * Asserts a response is an RFC9457 problem response.
 * @param {{ status: number, body: object, headers: Headers }} response - result of httpRequest
 * @param {object} expected
 * @param {number} expected.status - expected HTTP status
 * @param {string} expected.type - problem type slug, e.g. 'bad-request'
 * @param {string} expected.instance - expected request path, e.g. '/beta-1/movements'
 * @param {'ERROR' | 'VALIDATION-ERROR'} [expected.shape] - expected body shape
 */
export function expectProblemResponse(
  response,
  { status, type, instance, shape = 'ERROR' }
) {
  const { body, headers } = response

  expect(response.status).toEqual(status)
  expect(headers.get('content-type')).toContain('application/problem+json')
  expect(headers.get('x-request-id')).toEqual(expect.any(String))
  expectResponseBodyHasCorrectShape({ body, shape })
  expect(body).toMatchObject({
    title: titleFromType(type),
    type: `${PROBLEM_TYPE_BASE}/${type}`,
    instance
  })
}
