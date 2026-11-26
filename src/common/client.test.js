import {
  CLIENT_ID_HEADER,
  CLIENT_NAME_HEADER,
  MissingClientError,
  getClient
} from './client.js'

describe('getClient', () => {
  const clientId = '4sfn2ij4qnnpqbe4ok3u0rgc5o'

  it('returns the client ID and decoded name the external API forwarded', () => {
    expect(
      getClient({
        headers: {
          [CLIENT_ID_HEADER]: clientId,
          [CLIENT_NAME_HEADER]: encodeURIComponent('Acme Waste Systems Ltd')
        }
      })
    ).toEqual({ clientId, clientName: 'Acme Waste Systems Ltd' })
  })

  it.each([
    ['no name header', {}],
    ['a blank name header', { [CLIENT_NAME_HEADER]: ' ' }]
  ])('returns a null name for %s', (_description, headers) => {
    expect(
      getClient({ headers: { [CLIENT_ID_HEADER]: clientId, ...headers } })
    ).toEqual({ clientId, clientName: null })
  })

  it('keeps a name that is not valid URI encoding as sent', () => {
    expect(
      getClient({
        headers: { [CLIENT_ID_HEADER]: clientId, [CLIENT_NAME_HEADER]: '100%' }
      })
    ).toEqual({ clientId, clientName: '100%' })
  })

  it.each([
    ['no request', undefined],
    ['no client ID header', { headers: {} }],
    ['a blank client ID header', { headers: { [CLIENT_ID_HEADER]: ' ' } }]
  ])('rejects %s as a server error', (_description, request) => {
    expect(() => getClient(request)).toThrow(MissingClientError)
    expect(() => getClient(request)).toThrow(
      expect.objectContaining({ statusCode: 500 })
    )
  })
})
