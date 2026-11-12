import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/receipt-date-time.schema.json')

// Whether it's in the future depends on when the request arrives, so that's
// checked by receipt-date-time-checks.js, not the schema.
describe('receipt-date-time schema', () => {
  test.each([
    ['2026-10-14T09:30:00Z'],
    ['2026-10-14T09:30:00.123Z'],
    ['2026-10-14T09:30:00+01:00']
  ])('accepts the ISO 8601 date-time %j', (value) => {
    expect(validateAjv(value).valid).toBe(true)
  })

  test.each([
    ['14/10/2026'],
    ['2026-13-01T10:00:00Z'],
    ['Yesterday'],
    ['2026-10-14'],
    ['2026-10-14T09:30:00'],
    ['']
  ])(
    'rejects %j, which is not an ISO 8601 date-time with a timezone',
    (value) => {
      const { valid, errors } = validateAjv(value)

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'format' })
      )
    }
  )

  test('rejects a value that is not a string', () => {
    const { valid, errors } = validateAjv(1792056600000)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(expect.objectContaining({ keyword: 'type' }))
  })
})
