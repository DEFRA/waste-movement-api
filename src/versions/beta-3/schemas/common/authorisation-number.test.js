import { ALL_SITE_AUTHORISATION_NUMBER_REGEXES } from '@defra/waste-movement-utils'
import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('common/authorisation-number.schema.json')

// Known good and bad values copied from waste-movement-utils'
// TEST_DATA.AUTHORISATION_NUMBERS (src/schemas/test-constants.js), so this
// pattern is checked against the same acceptance criteria as the Phase-1
// isValidAuthorisationNumber it was translated from. Copied rather than
// imported: that file isn't part of utils' public API.
const validAuthorisationNumbers = [
  ['England XX9999XX', 'HP3456XX'],
  ['England lower case', 'hp3456xx'],
  ['England EPR with 4 digit deployment', 'EPR/AB1234CD/D6789'],
  ['England 4 digit deployment without EPR', 'AB1234CD/D6789'],
  ['England EPR with 5 digit deployment', 'EPR/AB1234CD/D67890'],
  ['England 5 digit deployment without EPR', 'AB1234CD/D67890'],
  ['England EAWML with 6 digits', 'EAWML123456'],
  ['England EAWML with 5 digits', 'EAWML12345'],
  ['England WML with 6 digits', 'WML987654'],
  ['England WML with 5 digits', 'WML98765'],
  ['Scotland PPC/A', 'PPC/A/1234567'],
  ['Scotland WML/L', 'WML/L/7654321'],
  ['Scotland WML/L with suffix', 'WML/L/7654321/12'],
  ['Scotland WML/W with suffix', 'WML/W/7654321/34'],
  ['Scotland WML/N with suffix', 'WML/N/7654321/56'],
  ['Scotland WML/E with suffix', 'WML/E/7654321/78'],
  ['Scotland SEPA', 'PPC/A/SEPA1234-5678'],
  ['Scotland EAS', 'EAS/P/123456'],
  ['Scotland EAS with 7 digits', 'EAS/P/9999999'],
  ['Scotland EAS ticket example', 'EAS/P/1172829'],
  ['Wales XX9999XX', 'NW1234CD'],
  ['Wales EPR', 'EPR/NW1234CD'],
  ['Northern Ireland P format', 'P1234/56A'],
  ['Northern Ireland WPPC', 'WPPC 12/34'],
  ['Northern Ireland P format with version', 'P1234/56A/V1'],
  ['Northern Ireland WPPC with version', 'WPPC 12/34/V2'],
  ['Northern Ireland combined WML and LN', 'WML 07/61 LN/13/02/M/V2'],
  ['Northern Ireland combined WML and LN without suffix', 'WML 07/61 LN/13/02'],
  ['Northern Ireland combined WML and PAC', 'WML 04/38 PAC/2014/WCL001']
]

const invalidAuthorisationNumbers = [
  ['EAWML with a dash', 'EAWML-10001'],
  ['GMB format', 'GMB383838X'],
  ['WEF format', 'WEF1234567'],
  ['plain text', 'INVALID-AUTH'],
  ['numeric only', '1234567890'],
  ['Scotland EAS with 5 digits', 'EAS/P/12345'],
  ['Scotland EAS with 8 digits', 'EAS/P/12345678'],
  ['Scotland EAS with 7 digits in lower case', 'eas/p/1172829'],
  ['Scotland EAS with a suffix', 'EAS/P/1172829/99'],
  ['Scotland EAS with the carrier prefix', 'EAS/R/1172829'],
  ['Northern Ireland WML on its own', 'WML 07/61'],
  ['Northern Ireland WML transfer on its own', 'WML 19/36/T'],
  ['Northern Ireland LN on its own', 'LN/13/02'],
  ['Northern Ireland LN with suffixes on its own', 'LN/13/02/M/V2'],
  ['Northern Ireland PAC on its own', 'PAC/2014/WCL001']
]

describe('authorisation-number schema', () => {
  test.each(validAuthorisationNumbers)('accepts %s (%s)', (_label, value) => {
    expect(validateAjv(value).valid).toBe(true)
  })

  test.each(invalidAuthorisationNumbers)('rejects %s (%s)', (_label, value) => {
    const { valid, errors } = validateAjv(value)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({ keyword: 'pattern' })
    )
  })

  // The schema can't import the shared regexes (see schemas/README.md),
  // so this holds it to them instead: every known value must get the same
  // verdict from the pattern as from Phase 1's isValidAuthorisationNumber.
  describe('parity with the shared waste-movement-utils regexes', () => {
    const isValidInPhase1 = (value) =>
      ALL_SITE_AUTHORISATION_NUMBER_REGEXES.some((regex) =>
        regex.test(value.trim())
      )

    test.each([
      ...validAuthorisationNumbers,
      ...invalidAuthorisationNumbers,
      ['surrounding whitespace', '  HP3456XX  '],
      ['whitespace only', '   '],
      ['a value embedded in other text', 'Permit HP3456XX']
    ])('agrees with utils for %s (%s)', (_label, value) => {
      expect(validateAjv(value).valid).toBe(isValidInPhase1(value))
    })
  })

  // Phase 1 trims before matching; the pattern allows the surrounding
  // whitespace instead.
  test('accepts a valid value with surrounding whitespace', () => {
    expect(validateAjv('  HP3456XX  ').valid).toBe(true)
  })

  test('rejects an empty string', () => {
    expect(validateAjv('').valid).toBe(false)
  })

  test('rejects whitespace only', () => {
    expect(validateAjv('   ').valid).toBe(false)
  })

  test('rejects a value embedded in other text', () => {
    expect(validateAjv('Permit HP3456XX').valid).toBe(false)
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
