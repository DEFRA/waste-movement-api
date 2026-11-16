import { ORGANISATION_ID_HEADER } from '#/common/organisation.js'

// The organisation the external API forwards for a valid API code.
export const forwardedOrganisationId = 'd829f66d-857f-401d-b5e9-5061b7dbb29d'

export const organisationHeaders = {
  [ORGANISATION_ID_HEADER]: forwardedOrganisationId
}
