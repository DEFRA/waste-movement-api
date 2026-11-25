import { createHash } from 'node:crypto'
import { Binary } from 'mongodb'
import {
  fromPayload,
  hashPayload,
  storedPayload,
  toPayload
} from './payload.js'

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

describe('hashPayload', () => {
  test('is the same however the keys are ordered, at any depth', () => {
    const body = { a: 1, b: { c: [{ d: 1, e: 2 }], f: null } }
    const reordered = { b: { f: null, c: [{ e: 2, d: 1 }] }, a: 1 }

    expect(hashPayload(reordered)).toBe(hashPayload(body))
  })

  test.for([
    ['a value', { a: 1 }, { a: 2 }],
    ["an array's order", { a: [1, 2] }, { a: [2, 1] }],
    ['a missing key', { a: 1, b: 2 }, { a: 1 }]
  ])('differs on %s', ([, body, other]) => {
    expect(hashPayload(other)).not.toBe(hashPayload(body))
  })

  test('sorts keys by code unit, whatever the locale: capitals first', () => {
    const sorted = '{"B":2,"a":3,"b":1,"é":4}'

    expect(hashPayload({ é: 4, b: 1, B: 2, a: 3 })).toBe(
      createHash('sha256').update(sorted).digest('hex')
    )
  })

  test('is SHA-256 as hex', () => {
    expect(hashPayload({})).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('storedPayload', () => {
  test('keeps the body as sent, with its hash', () => {
    const body = { b: 1, a: 2 }

    const { payload, payloadHash } = storedPayload(body)

    expect(payload.toString('utf8')).toBe('{"b":1,"a":2}')
    expect(payloadHash).toBe(hashPayload(body))
  })
})
