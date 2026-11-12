import { validPopNames } from '@defra/waste-movement-utils'
import {
  findMissingConsignmentNote,
  findUnrecognisedEwcCodes,
  findUnrecognisedPopCodes,
  isHazardous,
  wasteReferenceDataChecks
} from './waste-reference-data-checks.js'

const withCodes = (...ewcCodesPerItem) => ({
  wasteItems: ewcCodesPerItem.map((ewcCodes) => ({
    classification: { wasteDescription: 'Waste', ewcCodes }
  }))
})

const withHazardous = (...hazardousPerItem) => ({
  wasteItems: hazardousPerItem.map((hazardous) => ({
    classification: {
      wasteDescription: 'Waste',
      ewcCodes: ['200301'],
      hazardous
    }
  }))
})

const hazardousProperties = { isPresent: true, codes: ['HP_4'] }
const noHazardousProperties = { isPresent: false }

const unrecognised = (itemIndex, codeIndex) => ({
  message: 'must be a recognised EWC code',
  path: [
    'wasteItems',
    String(itemIndex),
    'classification',
    'ewcCodes',
    String(codeIndex)
  ],
  type: 'InvalidValue'
})

describe('findUnrecognisedEwcCodes', () => {
  test('finds nothing when every code is recognised', () => {
    expect(findUnrecognisedEwcCodes(withCodes(['200101', '200121']))).toEqual(
      []
    )
  })

  test('reports each unrecognised code against its waste item and position', () => {
    expect(
      findUnrecognisedEwcCodes(
        withCodes(['200101'], ['200301', '999999', '999998'])
      )
    ).toEqual([unrecognised(1, 1), unrecognised(1, 2)])
  })

  // The schema has already reported these as format errors.
  test.each(['2001', '20 01 01', '200101*', '', 999999, null])(
    'leaves a code of %p that is not six digits to the schema',
    (code) => {
      expect(findUnrecognisedEwcCodes(withCodes([code]))).toEqual([])
    }
  )

  // The payload hasn't necessarily passed the schema yet.
  test.each([
    ['no payload', undefined],
    ['no waste items', {}],
    ['waste items that are not a list', { wasteItems: 'none' }],
    ['a waste item with no classification', { wasteItems: [{}] }],
    ['a null waste item', { wasteItems: [null] }],
    [
      'EWC codes that are not a list',
      { wasteItems: [{ classification: { ewcCodes: '999999' } }] }
    ]
  ])('finds nothing in a payload with %s', (_, payload) => {
    expect(findUnrecognisedEwcCodes(payload)).toEqual([])
  })
})

describe('findUnrecognisedPopCodes', () => {
  const withPops = (...popsPerItem) => ({
    wasteItems: popsPerItem.map((pops) => ({ classification: { pops } }))
  })
  const present = (...codes) => ({
    isPresent: true,
    components: codes.map((code) => ({ code, unit: 'MG_PER_KG', amount: 1 }))
  })
  const unrecognisedPop = (itemIndex, componentIndex) => ({
    message: 'must be a recognised POP code',
    path: [
      'wasteItems',
      String(itemIndex),
      'classification',
      'pops',
      'components',
      String(componentIndex),
      'code'
    ],
    type: 'InvalidValue'
  })

  test('finds nothing when every code is recognised', () => {
    expect(findUnrecognisedPopCodes(withPops(present('PFOA', 'HBCD')))).toEqual(
      []
    )
  })

  test('treats every code in the reference data as recognised', () => {
    const codes = validPopNames.map(({ code }) => code)

    expect(findUnrecognisedPopCodes(withPops(present(...codes)))).toEqual([])
  })

  test('reports each unrecognised code against its waste item and position', () => {
    expect(
      findUnrecognisedPopCodes(
        withPops(present('PFOA'), present('PFOS', 'Mercury', 'pfoa'))
      )
    ).toEqual([unrecognisedPop(1, 1), unrecognisedPop(1, 2)])
  })

  // The schema reports these: a missing or empty code, or components on
  // waste declared as not containing POPs.
  test.each([
    ['a missing code', present(undefined)],
    ['an empty code', present('')],
    ['a code that is not a string', present(42)],
    [
      'components on waste not containing POPs',
      { isPresent: false, components: [{ code: 'Mercury' }] }
    ]
  ])('leaves %s to the schema', (_, pops) => {
    expect(findUnrecognisedPopCodes(withPops(pops))).toEqual([])
  })

  test.each([
    ['no payload', undefined],
    ['a waste item with no classification', { wasteItems: [{}] }],
    ['no pops', { wasteItems: [{ classification: {} }] }],
    [
      'components that are not a list',
      withPops({ isPresent: true, components: 'PFOA' })
    ],
    ['a null component', withPops({ isPresent: true, components: [null] })]
  ])('finds nothing in a payload with %s', (_, payload) => {
    expect(findUnrecognisedPopCodes(payload)).toEqual([])
  })
})

describe('isHazardous', () => {
  test('is true when a waste item declares hazardous properties', () => {
    expect(isHazardous(withHazardous(hazardousProperties))).toBe(true)
  })

  test('is false when no waste item declares hazardous properties', () => {
    expect(
      isHazardous(withHazardous(noHazardousProperties, noHazardousProperties))
    ).toBe(false)
  })

  test('is true when any one of several waste items declares hazardous properties', () => {
    expect(
      isHazardous(withHazardous(noHazardousProperties, hazardousProperties))
    ).toBe(true)
  })

  // The declaration decides, not the EWC codes.
  test('is false for a hazardous EWC code declared as having no hazardous properties', () => {
    const payload = withCodes(['200121'])
    payload.wasteItems[0].classification.hazardous = noHazardousProperties

    expect(isHazardous(payload)).toBe(false)
  })

  test.each([
    ['no payload', undefined],
    ['no waste items', {}],
    ['waste items that are not a list', { wasteItems: 'Waste' }],
    ['a null waste item', { wasteItems: [null] }],
    ['a waste item with no classification', { wasteItems: [{}] }],
    ['no hazardous properties declaration', withCodes(['200121'])],
    ['a missing isPresent', withHazardous({ codes: ['HP_4'] })],
    ['an isPresent that is not a boolean', withHazardous({ isPresent: 'true' })]
  ])('is false for %s', (_, payload) => {
    expect(isHazardous(payload)).toBe(false)
  })
})

describe('findMissingConsignmentNote', () => {
  const hazardous = withHazardous(hazardousProperties)
  const noteRequired = {
    message:
      "Required when a waste item declares hazardous properties, with a 'code' or a 'reasonForNoCode'",
    path: ['consignmentNote'],
    type: 'NotProvided'
  }
  const reasonRequired = {
    message:
      "Required when a waste item declares hazardous properties and 'code' is not provided",
    path: ['consignmentNote', 'reasonForNoCode'],
    type: 'NotProvided'
  }

  // Business scenarios are in routes/create-movement.test.js; these
  // cover the edges.
  test('needs nothing for non-hazardous waste', () => {
    expect(
      findMissingConsignmentNote(withHazardous(noHazardousProperties))
    ).toEqual([])
  })

  test('needs nothing for a hazardous EWC code declared as having no hazardous properties', () => {
    const payload = withCodes(['200121'])
    payload.wasteItems[0].classification.hazardous = noHazardousProperties

    expect(findMissingConsignmentNote(payload)).toEqual([])
  })

  test('requires a consignment note when any waste item declares hazardous properties', () => {
    expect(
      findMissingConsignmentNote(
        withHazardous(noHazardousProperties, hazardousProperties)
      )
    ).toEqual([noteRequired])
  })

  test.each([
    ['a null consignment note', null],
    ['a consignment note that is a string', 'CJTILE/A0001'],
    ['a consignment note that is a list', []]
  ])('leaves %s to the schema', (_, consignmentNote) => {
    expect(
      findMissingConsignmentNote({ ...hazardous, consignmentNote })
    ).toEqual([])
  })

  test('requires a reason when the note has neither field', () => {
    expect(
      findMissingConsignmentNote({ ...hazardous, consignmentNote: {} })
    ).toEqual([reasonRequired])
  })

  test.each([
    ['a code', { code: 'CJTILE/A0001' }],
    ['a code in the wrong format, which the schema reports', { code: 'X' }],
    ['a reason', { reasonForNoCode: 'No note given' }],
    ['both empty, which the schema reports', { code: '', reasonForNoCode: '' }],
    [
      'both null, which the schema reports',
      { code: null, reasonForNoCode: null }
    ]
  ])('is satisfied by %s', (_, consignmentNote) => {
    expect(
      findMissingConsignmentNote({ ...hazardous, consignmentNote })
    ).toEqual([])
  })
})

describe('wasteReferenceDataChecks', () => {
  const missingDescription = {
    message: "'wasteDescription' is required",
    path: ['wasteItems', '0', 'classification', 'wasteDescription'],
    type: 'NotProvided'
  }

  test('reports nothing when every code is recognised', () => {
    expect(wasteReferenceDataChecks(withCodes(['200101']), [])).toEqual([])
  })

  test('keeps the earlier errors when it finds nothing', () => {
    expect(
      wasteReferenceDataChecks(withCodes(['200101']), [missingDescription])
    ).toEqual([missingDescription])
  })

  test('reports unrecognised codes after the earlier errors', () => {
    expect(
      wasteReferenceDataChecks(withCodes(['999999']), [missingDescription])
    ).toEqual([missingDescription, unrecognised(0, 0)])
  })

  test('reports a missing consignment note for hazardous waste', () => {
    expect(
      wasteReferenceDataChecks(withHazardous(hazardousProperties), [])
    ).toEqual([
      expect.objectContaining({
        path: ['consignmentNote'],
        type: 'NotProvided'
      })
    ])
  })
})
