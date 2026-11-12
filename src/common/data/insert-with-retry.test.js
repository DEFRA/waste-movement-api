import { insertWithRetry } from './insert-with-retry.js'

// The real options, so the retry callback runs, with fewer, faster attempts
vi.mock('@defra/waste-movement-utils', async () => {
  const originalModule = await vi.importActual('@defra/waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: (logger) => ({
      ...originalModule.backoffOptions(logger, 3),
      startingDelay: 1
    })
  }
})

const duplicateKeyError = () =>
  Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })

describe('insertWithRetry', () => {
  let logger

  beforeEach(() => {
    logger = { info: vi.fn(), error: vi.fn() }
  })

  test('inserts once when the first attempt succeeds', async () => {
    const insert = vi.fn().mockResolvedValue(undefined)

    await insertWithRetry(logger, insert)

    expect(insert).toHaveBeenCalledTimes(1)
  })

  test('retries a failed write', async () => {
    const insert = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(undefined)

    await insertWithRetry(logger, insert)

    expect(insert).toHaveBeenCalledTimes(2)
  })

  test('throws the last error once every attempt has failed', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('connection reset'))

    await expect(insertWithRetry(logger, insert)).rejects.toThrow(
      'connection reset'
    )
    expect(insert).toHaveBeenCalledTimes(3)
  })

  test('counts a duplicate key on a retry as the earlier attempt having succeeded', async () => {
    const insert = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(duplicateKeyError())

    await insertWithRetry(logger, insert, { movementId: '26DUP001' })

    expect(insert).toHaveBeenCalledTimes(2)
    expect(logger.info).toHaveBeenCalledWith(
      { movementId: '26DUP001' },
      'Record already stored by an earlier attempt'
    )
  })

  test('throws a duplicate key on the first attempt, without retrying', async () => {
    const error = duplicateKeyError()
    const insert = vi.fn().mockRejectedValue(error)

    await expect(insertWithRetry(logger, insert)).rejects.toBe(error)
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
