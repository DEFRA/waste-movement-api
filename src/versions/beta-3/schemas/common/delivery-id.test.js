import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/delivery-id.schema.json')

// A two-digit year prefix followed by a six- or seven-character sqid from
// A–Z and 0–9, 8 or 9 characters in all.
describe('delivery-id schema', () => {
  test('accepts a minted delivery ID', () => {
    expect(validateAjv('25KMT4Z9').valid).toBe(true)
  })

  test('rejects an empty string', () => {
    expect(validateAjv('').valid).toBe(false)
  })

  test('rejects a letter year prefix', () => {
    expect(validateAjv('YYHRA0B2').valid).toBe(false)
  })

  test('rejects lowercase characters', () => {
    expect(validateAjv('25hra0b2').valid).toBe(false)
  })

  test('rejects a suffix shorter than six characters', () => {
    expect(validateAjv('25HRA0B').valid).toBe(false)
  })

  // waste-tracking-id-backend's sqids (minLength 6) produce a seven-character
  // suffix from the 35,937th ID of a year (e.g. 26 + 7ZCU888).
  test('accepts a seven-character suffix', () => {
    expect(validateAjv('267ZCU888').valid).toBe(true)
  })

  // An eight-character suffix first appears at the 1,188,531st ID of a year
  // (e.g. 26 + 16B2KR70); the format doesn't cover IDs past that point.
  test('rejects a suffix longer than seven characters', () => {
    expect(validateAjv('2616B2KR70').valid).toBe(false)
  })

  test('rejects a non-string', () => {
    expect(validateAjv(12345678).valid).toBe(false)
  })
})
