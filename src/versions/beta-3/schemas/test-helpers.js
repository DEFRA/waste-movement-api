// Shared fixtures for the beta-3 schema tests
import { validators } from './validators.js'

const { getErrors, validate } = validators

export const validatorFor = (schemaId) => (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

export const apiCode = '25b14080-5e77-4f91-9957-2482a0cb8775'

// The free-text length tiers: see "Free text has a maxLength" in
// schemas/README.md.
export const shortText = 255
export const longText = 5000
export const emailAddressMaxLength = 254

export const address = {
  fullAddress: '10 Industrial Way, Test City',
  postcode: 'TE1 2PQ'
}

export const contactDetails = {
  emailAddress: 'producer@example.com',
  phoneNumber: '01234567890'
}

export const householdProducer = {
  wasteSource: 'HOUSEHOLD'
}

export const commercialProducer = {
  wasteSource: 'COMMERCIAL',
  organisationName: 'ACME Waste Producers Ltd',
  authorisationNumber: 'EAS/P/123456',
  address,
  contactDetails,
  sicCode: '38110'
}

export const municipalProducer = {
  wasteSource: 'MUNICIPAL',
  organisationName: 'Test Council',
  reasonForNoAuthorisationNumber: 'TBC',
  address: {
    fullAddress: 'Council Depot, Test City',
    postcode: 'TE1 5CD'
  },
  contactDetails: {
    emailAddress: 'waste.services@example.gov.uk',
    phoneNumber: '01234567890'
  }
}

export const brokerOrDealerEntry = {
  organisationName: 'Broker Demo Ltd',
  registrationNumber: 'CBDU654321',
  contactDetails: {
    emailAddress: 'broker@example.com',
    phoneNumber: '01112223333'
  },
  address: {
    fullAddress: '2 Broker Yard, Test City',
    postcode: 'TE1 1ST'
  }
}

export const receiver = {
  siteName: 'Receiver Site Ltd',
  authorisationNumber: 'EAS/P/123456',
  receiptAddress: {
    fullAddress: '3 Receiver Road, Test City',
    postcode: 'TE1 3RC'
  },
  contactDetails: {
    emailAddress: 'receiver@example.com',
    phoneNumber: '01234567890'
  }
}

export const carrier = {
  organisationName: 'Carrier Demo Ltd',
  registrationNumber: 'CBDU123456',
  meansOfTransport: 'ROAD',
  vehicleRegistration: 'AB12 CDE',
  contactDetails: {
    emailAddress: 'carrier@example.com',
    phoneNumber: '01234567890'
  },
  address: {
    fullAddress: '4 Carrier Lane, Test City',
    postcode: 'TE1 4CR'
  }
}

export const collectionDateTime = '2026-01-15T09:30:00Z'

export const receiptDateTime = '2026-01-15T14:45:00Z'

export const collectionSite = {
  address: {
    fullAddress: '10 Industrial Way, Test City',
    postcode: 'TE1 2PQ'
  },
  contactDetails: {
    emailAddress: 'site@example.com',
    phoneNumber: '01234567890'
  }
}

export const deliveryDateTime = '2026-01-15T12:12:28Z'

export const deliverySite = {
  organisationName: 'Hazardous Waste Delivery Site',
  address: {
    fullAddress: '3 Receiver Road, Test City',
    postcode: 'TE1 3RC'
  },
  rpsNumbers: [123]
}

export const supportingReference = {
  label: 'PO_NUMBER',
  reference: 'PO-123456'
}

export const weight = {
  amount: 250.5,
  unit: 'KILOGRAMS',
  isEstimate: false
}

export const physicalDetails = {
  form: 'SOLID',
  containerType: 'DRU',
  containerCount: 4,
  totalWeight: weight
}

export const pops = {
  isPresent: false
}

export const popComponent = {
  code: 'PFOA',
  unit: 'MG_PER_KG',
  amount: 0.5
}

export const popsPresent = {
  isPresent: true,
  componentsSource: 'OWN_TESTING',
  components: [popComponent]
}

export const hazardous = {
  isPresent: false
}

export const hazardousComponent = {
  name: 'Mercury',
  unit: 'MG_PER_KG',
  amount: 5
}

export const hazardousPresent = {
  isPresent: true,
  codes: ['HP_4'],
  componentsSource: 'OWN_TESTING',
  isComponentsNotApplicable: false,
  components: [hazardousComponent]
}

export const classification = {
  wasteDescription: 'Mixed municipal waste',
  ewcCodes: ['200301'],
  pops,
  hazardous
}

export const wasteItem = {
  classification,
  physicalDetails
}

// Declares hazardous properties, which is what makes it hazardous. 200121
// (fluorescent tubes) is also a hazardous code in the EWC reference data.
export const hazardousWasteItem = {
  classification: {
    wasteDescription: 'Fluorescent tubes',
    ewcCodes: ['200121'],
    pops,
    hazardous: hazardousPresent
  },
  physicalDetails
}

export const consignmentNote = {
  code: 'CJTILE/A0001'
}

export const treatment = {
  disposalOrRecoveryCode: 'R3',
  weight
}
