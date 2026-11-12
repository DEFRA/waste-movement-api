import {
  ERROR_TYPE,
  isValidEwcCode,
  isValidPopCode
} from '@defra/waste-movement-utils'

// The JSON Schema only checks an EWC code's format (six digits): the list of
// recognised codes is too long to inline there. These check each well-formed
// code against the reference data in waste-movement-utils — the list
// GET /reference-data/ewc-codes serves. Codes in the wrong format are left to
// the schema, which has already reported them.
//
// Whether a movement is hazardous comes from its waste items' hazardous
// properties declarations, not their EWC codes. The consignment note rule
// spans the waste items and the note, so it lives here rather than in a schema.
const wellFormedEwcCode = /^\d{6}$/

const asArray = (value) => (Array.isArray(value) ? value : [])

const wellFormedEwcCodes = (payload) =>
  asArray(payload?.wasteItems).flatMap((wasteItem, itemIndex) =>
    asArray(wasteItem?.classification?.ewcCodes)
      .map((code, codeIndex) => ({ code, itemIndex, codeIndex }))
      .filter(
        ({ code }) => typeof code === 'string' && wellFormedEwcCode.test(code)
      )
  )

// A movement is hazardous when any of its waste items declares hazardous
// properties. One with no waste items is non-hazardous.
export const isHazardous = (payloadOrMovement) =>
  asArray(payloadOrMovement?.wasteItems).some(
    (item) => item?.classification?.hazardous?.isPresent === true
  )

export const findUnrecognisedEwcCodes = (payload) =>
  wellFormedEwcCodes(payload)
    .filter(({ code }) => !isValidEwcCode(code))
    .map(({ itemIndex, codeIndex }) => ({
      message: 'must be a recognised EWC code',
      path: [
        'wasteItems',
        String(itemIndex),
        'classification',
        'ewcCodes',
        String(codeIndex)
      ],
      type: ERROR_TYPE.INVALID_VALUE
    }))

// The schema only checks that a POP code is given; this checks it against the
// list GET /reference-data/pop-names serves, as for EWC codes. Components on
// waste declared as not containing POPs aren't allowed at all, which the
// schema reports, so their codes aren't checked.
export const findUnrecognisedPopCodes = (payload) =>
  asArray(payload?.wasteItems).flatMap((wasteItem, itemIndex) => {
    const pops = wasteItem?.classification?.pops
    return pops?.isPresent === true
      ? asArray(pops.components)
          .map((component, componentIndex) => ({
            code: component?.code,
            componentIndex
          }))
          .filter(
            ({ code }) =>
              typeof code === 'string' && code !== '' && !isValidPopCode(code)
          )
          .map(({ componentIndex }) => ({
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
            type: ERROR_TYPE.INVALID_VALUE
          }))
      : []
  })

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Hazardous waste needs a consignment note with a code or, failing that, a
// reason for having none. A field that is there counts as given, whatever its
// value: the schema reports a code in the wrong format, an empty reason or a
// null. A consignmentNote that isn't an object is also left to the schema.
export const findMissingConsignmentNote = (payload) => {
  const note = payload?.consignmentNote

  if (!isHazardous(payload)) {
    return []
  }
  if (note === undefined) {
    return [
      {
        message:
          "Required when a waste item declares hazardous properties, with a 'code' or a 'reasonForNoCode'",
        path: ['consignmentNote'],
        type: ERROR_TYPE.NOT_PROVIDED
      }
    ]
  }
  if (
    !isObject(note) ||
    note.code !== undefined ||
    note.reasonForNoCode !== undefined
  ) {
    return []
  }
  return [
    {
      message:
        "Required when a waste item declares hazardous properties and 'code' is not provided",
      path: ['consignmentNote', 'reasonForNoCode'],
      type: ERROR_TYPE.NOT_PROVIDED
    }
  ]
}

// The payload check (see common/validation/payload-checks.js) for every
// payload with waste items and a consignmentNote: creating a movement, and
// recording a receipt without a delivery.
export const wasteReferenceDataChecks = (payload, details) => [
  ...details,
  ...findUnrecognisedEwcCodes(payload),
  ...findUnrecognisedPopCodes(payload),
  ...findMissingConsignmentNote(payload)
]
