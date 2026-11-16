import {
  ORGANISATION_ID_HEADER,
  ValidationError,
  getOrganisationId
} from './organisation.js'

describe('getOrganisationId', () => {
  const organisationId = 'd829f66d-857f-401d-b5e9-5061b7dbb29d'

  it('returns the organisation forwarded by the external API', () => {
    expect(
      getOrganisationId({
        headers: { [ORGANISATION_ID_HEADER]: organisationId }
      })
    ).toEqual(organisationId)
  })

  it.each([
    ['no request', undefined],
    ['no headers', {}],
    ['no organisation header', { headers: {} }],
    [
      'an empty organisation header',
      { headers: { [ORGANISATION_ID_HEADER]: '' } }
    ],
    [
      'a blank organisation header',
      { headers: { [ORGANISATION_ID_HEADER]: '  ' } }
    ]
  ])('rejects %s as an invalid API code', (_description, request) => {
    let error
    try {
      getOrganisationId(request)
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(ValidationError)
    expect(error).toMatchObject({
      key: 'apiCode',
      message: 'the API Code supplied is invalid',
      errorType: 'InvalidValue',
      statusCode: 400
    })
  })
})

describe('ValidationError', () => {
  it('defaults to an UnexpectedError', () => {
    expect(new ValidationError('key', 'message')).toMatchObject({
      name: 'ValidationError',
      errorType: 'UnexpectedError'
    })
  })
})
