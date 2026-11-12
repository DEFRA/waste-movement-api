import { emptyIsNotProvided, notInFuture } from './date-time-checks.js'

const now = () => Date.parse('2026-10-14T09:30:00Z')
const path = ['receiptDateTime']

const required = {
  message: "'receiptDateTime' is required",
  path,
  type: 'NotProvided'
}

const inTheFuture = {
  message: 'must not be in the future',
  path,
  type: 'OutOfRange'
}

const formatError = {
  message: "must match format 'date-time'",
  path,
  type: 'InvalidFormat'
}

const otherError = {
  message: "'carrier' is required",
  path: ['carrier'],
  type: 'NotProvided'
}

describe('emptyIsNotProvided', () => {
  const check = emptyIsNotProvided(path)

  test('reports "" as required in place of the format error', () => {
    expect(check({ receiptDateTime: '' }, [otherError, formatError])).toEqual([
      otherError,
      required
    ])
  })

  test.each([[undefined], ['Yesterday'], ['2026-10-14T09:30:00Z']])(
    'leaves the errors alone when the value is %j',
    (receiptDateTime) => {
      expect(check({ receiptDateTime }, [formatError])).toEqual([formatError])
    }
  )

  test('leaves an error at a field nested below it alone', () => {
    const nested = { ...formatError, path: ['receiptDateTime', 'inner'] }

    expect(check({ receiptDateTime: '' }, [nested])).toEqual([nested, required])
  })

  test('names the last part of a nested path', () => {
    const nestedPath = ['wasteItems', '0', 'collectedAt']

    expect(
      emptyIsNotProvided(nestedPath)({ wasteItems: [{ collectedAt: '' }] }, [
        { ...formatError, path: nestedPath }
      ])
    ).toEqual([
      {
        message: "'collectedAt' is required",
        path: nestedPath,
        type: 'NotProvided'
      }
    ])
  })
})

describe('notInFuture', () => {
  const check = notInFuture(path, { now })

  test.each([
    ['2026-10-14T09:29:59Z'],
    ['2026-10-14T09:30:00Z'],
    // The same instant as now, given in BST.
    ['2026-10-14T10:30:00+01:00']
  ])('accepts %j, which is not later than now', (receiptDateTime) => {
    expect(check({ receiptDateTime }, [])).toEqual([])
  })

  test.each([
    ['2026-10-14T09:30:01Z'],
    ['2026-10-14T09:30:00-01:00'],
    ['2099-01-01T09:00:00Z']
  ])('rejects %j, which is later than now', (receiptDateTime) => {
    expect(check({ receiptDateTime }, [])).toEqual([inTheFuture])
  })

  test('reports a time in the future after the earlier errors', () => {
    expect(
      check({ receiptDateTime: '2099-01-01T09:00:00Z' }, [otherError])
    ).toEqual([otherError, inTheFuture])
  })

  test('defaults to the current time', () => {
    expect(
      notInFuture(path)({ receiptDateTime: '2099-01-01T09:00:00Z' }, [])
    ).toEqual([inTheFuture])
  })

  test('reads the current time on each check, not when it is created', () => {
    let time = Date.parse('2099-01-01T08:00:00Z')
    const later = notInFuture(path, { now: () => time })
    const payload = { receiptDateTime: '2099-01-01T09:00:00Z' }

    expect(later(payload, [])).toEqual([inTheFuture])
    time = Date.parse('2099-01-01T10:00:00Z')
    expect(later(payload, [])).toEqual([])
  })

  test('leaves a value already rejected to that error', () => {
    expect(
      check({ receiptDateTime: '2099-01-01T09:00:00' }, [formatError])
    ).toEqual([formatError])
  })

  test('checks a field at a nested path', () => {
    const nestedPath = ['wasteItems', '0', 'collectedAt']

    expect(
      notInFuture(nestedPath, { now })(
        { wasteItems: [{ collectedAt: '2099-01-01T09:00:00Z' }] },
        []
      )
    ).toEqual([{ ...inTheFuture, path: nestedPath }])
  })

  test.each([[undefined], [null], [{}], [{ receiptDateTime: 1792056600000 }]])(
    'leaves a payload of %j to the schema',
    (payload) => {
      expect(check(payload, [])).toEqual([])
    }
  )
})
