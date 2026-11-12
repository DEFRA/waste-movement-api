export function expectStandardHeaders(
  headers,
  { contentType = 'application/json; charset=utf-8' } = {}
) {
  expect(headers.get('strict-transport-security')).toEqual(
    'max-age=31536000; includeSubDomains'
  )
  expect(headers.get('x-frame-options')).toEqual('DENY')
  expect(headers.get('x-xss-protection')).toEqual('1; mode=block')
  expect(headers.get('x-content-type-options')).toEqual('nosniff')
  expect(headers.get('x-download-options')).toEqual('noopen')
  expect(headers.get('content-type')).toEqual(contentType)
}
