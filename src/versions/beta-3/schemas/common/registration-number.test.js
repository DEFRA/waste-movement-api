import { ALL_CARRIER_REGISTRATION_NUMBER_REGEXES } from '@defra/waste-movement-utils'
import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/registration-number.schema.json')

// Known good and bad values copied from waste-movement-utils'
// src/test/data/carrier-registration-numbers.js, so this pattern is checked
// against the same data as the Phase-1 carrierOrBrokerDealerRegistrationNumber
// it was translated from. Copied rather than imported: that file isn't part of
// utils' public API.
const validRegistrationNumbers = [
  ['England and NRW lower tier, shortest', 'CBDL999'],
  ['England and NRW lower tier', 'CBDL99999'],
  ['England and NRW lower tier, long', 'CBDL99999999999999999999'],
  ['England and NRW upper tier, shortest', 'CBDU999'],
  ['England and NRW upper tier', 'CBDU99999'],
  ['England and NRW upper tier, long', 'CBDU99999999999999999999'],
  ['SEPA EAS/R with six digits', 'EAS/R/999999'],
  ['SEPA EAS/R with seven digits', 'EAS/R/9999999'],
  ['SEPA EAS/R, a six-digit number from the ticket', 'EAS/R/527839'],
  ['SEPA EAS/R, a seven-digit number from the register', 'EAS/R/6102309'],
  ['SEPA WCR/R', 'WCR/R/9999999'],
  ['SEPA SCO', 'SCO/999999'],
  ['SEPA SEA', 'SEA/999999'],
  ['SEPA SNO', 'SNO/999999'],
  ['SEPA SWE', 'SWE/999999'],
  ['SEPA SCO with /B', 'SCO/999999/B'],
  ['SEPA SCO with /CB', 'SCO/999999/CB'],
  ['SEPA SEA with /CB', 'SEA/999999/CB'],
  ['SEPA SNO with /CB', 'SNO/999999/CB'],
  ['SEPA SWE with /CB', 'SWE/999999/CB'],
  ['SEPA WCR', 'WCR/999999'],
  ['SEPA WCR with letters', 'WCR/ZZZZZZ'],
  ['SEPA WCR with letters and digits, lower case', 'WCR/02bd5f'],
  ['SEPA PCT, shortest', 'PCT-A-999'],
  ['SEPA PCT, longest', 'PCT-E-9999999'],
  ['Northern Ireland upper tier, shortest', 'ROC UT 9'],
  ['Northern Ireland upper tier, longest', 'ROC UT 99999'],
  ['Northern Ireland lower tier, shortest', 'ROC LT 9'],
  ['Northern Ireland lower tier, longest', 'ROC LT 99999'],
  ['lower case', 'cbdu99999']
]

const invalidRegistrationNumbers = [
  ['no tier letter', 'CBD999'],
  ['unknown tier letter', 'CBDT999'],
  ['England lower tier with too few digits', 'CBDL99'],
  ['England upper tier with too few digits', 'CBDU99'],
  ['SEPA EAS/R with too few digits', 'EAS/R/99999'],
  ['SEPA EAS/R with too many digits', 'EAS/R/99999999'],
  ['SEPA EAS/P, a site permit', 'EAS/P/9999999'],
  ['SEPA WCR/R with too few digits', 'WCR/R/999999'],
  ['SEPA WCR/R with too many digits', 'WCR/R/99999999'],
  ['SEPA WCR with too few characters', 'WCR/02bd5'],
  ['SEPA WCR with too many characters', 'WCR/02bd5f1'],
  ['SEPA WCR with a hyphen', 'WCR/02b-5f'],
  ['SEPA SCO with too few digits', 'SCO/99999'],
  ['SEPA SCO with too many digits', 'SCO/9999999'],
  ['SEPA SCO with too few digits before /CB', 'SCO/99999/CB'],
  ['SEPA SCO with an unknown suffix', 'SCO/999999/X'],
  ['SEPA SCO with a doubled suffix', 'SCO/999999/CBB'],
  ['SEPA SEA with /B', 'SEA/999999/B'],
  ['two-letter SEPA prefix', 'SC/999999'],
  ['unknown SEPA prefix', 'SCD/999999'],
  ['Northern Ireland without tier T', 'ROC U 9'],
  ['Northern Ireland lower tier without T', 'ROC L 9'],
  ['Northern Ireland unknown tier', 'ROC DT 9'],
  ['Northern Ireland upper tier with too many digits', 'ROC UT 999999'],
  ['Northern Ireland lower tier with too many digits', 'ROC LT 999999'],
  ['whitespace only', '   '],
  ['PCT with a digit for the letter', 'PCT-2-9999999'],
  ['PCT with a trailing letter', 'PCT-E-999999A']
]

describe('registration-number schema', () => {
  test.each(validRegistrationNumbers)('accepts %s (%s)', (_label, value) => {
    expect(validateAjv(value).valid).toBe(true)
  })

  test.each(invalidRegistrationNumbers)('rejects %s (%s)', (_label, value) => {
    const { valid, errors } = validateAjv(value)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({ keyword: 'pattern' })
    )
  })

  // The schema can't import the shared regexes (see schemas/README.md),
  // so this holds it to them instead: every known value must get the same
  // verdict from the pattern as from Phase 1.
  describe('parity with the shared waste-movement-utils regexes', () => {
    const isValidInPhase1 = (value) =>
      ALL_CARRIER_REGISTRATION_NUMBER_REGEXES.some((regex) => regex.test(value))

    test.each([...validRegistrationNumbers, ...invalidRegistrationNumbers])(
      'agrees with utils for %s (%s)',
      (_label, value) => {
        expect(validateAjv(value).valid).toBe(isValidInPhase1(value))
      }
    )

    // The one deliberate difference: Phase 1 doesn't trim registration
    // numbers, so it rejects surrounding whitespace. The beta-3 pattern has
    // always accepted it (see broker-or-dealer.test.js).
    test('differs from utils only by accepting surrounding whitespace', () => {
      expect(isValidInPhase1(' CBDL999 ')).toBe(false)
      expect(validateAjv(' CBDL999 ').valid).toBe(true)
    })
  })

  test('rejects an empty string', () => {
    expect(validateAjv('').valid).toBe(false)
  })

  test('rejects a value embedded in other text', () => {
    expect(validateAjv('Registration CBDU99999').valid).toBe(false)
  })

  test.each([
    ['a number', 1],
    ['null', null]
  ])('rejects %s', (_label, value) => {
    const { valid, errors } = validateAjv(value)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(expect.objectContaining({ keyword: 'type' }))
  })
})
