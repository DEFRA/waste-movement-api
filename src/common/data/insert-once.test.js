import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { AlreadyStoredError, insertOnce } from './insert-once.js'
import { hashPayload } from './payload.js'

const duplicateKeyError = () =>
  Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })

const request = { orgId: 'org', payload: { b: 1, a: 2 } }
const conflictMessage = 'Already recorded'

describe('insertOnce', () => {
  const logger = { info: vi.fn(), error: vi.fn() }

  const run = ({ insert, stored }) =>
    insertOnce(logger, {
      insert,
      findStored: vi.fn().mockResolvedValue(stored),
      request,
      conflictMessage
    })

  test('inserts when the key is free', async () => {
    const insert = vi.fn().mockResolvedValue()

    await run({ insert })

    expect(insert).toHaveBeenCalledTimes(1)
  })

  test('succeeds without storing again when the same request is stored, whatever its key order', async () => {
    const stored = { orgId: 'org', payloadHash: hashPayload({ a: 2, b: 1 }) }

    await expect(
      run({ insert: vi.fn().mockRejectedValue(duplicateKeyError()), stored })
    ).resolves.toBeUndefined()
  })

  test.for([
    ['a different payload', { orgId: 'org', payloadHash: hashPayload({}) }],
    [
      "another organisation's",
      { orgId: 'other', payloadHash: hashPayload(request.payload) }
    ]
  ])('is an AlreadyStoredError, a 409, for %s', async ([, stored]) => {
    const error = await run({
      insert: vi.fn().mockRejectedValue(duplicateKeyError()),
      stored
    }).catch((e) => e)

    expect(error).toBeInstanceOf(AlreadyStoredError)
    expect(error).toMatchObject({
      message: conflictMessage,
      statusCode: HTTP_STATUS.CONFLICT
    })
  })

  test('throws any other error as is', async () => {
    const failure = new Error('Database connection failed')

    await expect(
      run({ insert: vi.fn().mockRejectedValue(failure) })
    ).rejects.toBe(failure)
  })
})
