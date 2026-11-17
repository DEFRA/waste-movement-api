import { Binary } from 'mongodb'
import { fromPayload, toPayload } from './payload.js'

describe('payload', () => {
  test('stores a request body as UTF-8 JSON bytes', () => {
    const payload = toPayload({ name: 'Café' })

    expect(payload).toBeInstanceOf(Binary)
    expect(payload.toString('utf8')).toBe('{"name":"Café"}')
  })

  test('gives back the request body exactly, whatever its keys', () => {
    const body = { $where: 1, 'a.b': [1.5, null, { nested: true }] }

    expect(fromPayload(toPayload(body))).toEqual(body)
  })
})
