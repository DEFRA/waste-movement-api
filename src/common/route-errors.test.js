import Boom from '@hapi/boom'
import { ValidationError } from './organisation.js'
import { handleBetaRouteError } from './route-errors.js'

describe('handleBetaRouteError', () => {
  it('keeps a Boom error as it is', () => {
    const error = Boom.notFound('movementId not found')

    expect(handleBetaRouteError(error)).toBe(error)
    expect(error.output.statusCode).toBe(404)
  })

  it('gives an error with a statusCode that status, keeping its message', () => {
    const boom = handleBetaRouteError(
      new ValidationError('apiCode', 'the API Code supplied is invalid')
    )

    expect(boom.isBoom).toBe(true)
    expect(boom.output.statusCode).toBe(400)
    expect(boom.message).toBe('the API Code supplied is invalid')
  })

  it('makes any other error a 500', () => {
    const boom = handleBetaRouteError(new Error('Database connection failed'))

    expect(boom.output.statusCode).toBe(500)
  })
})
