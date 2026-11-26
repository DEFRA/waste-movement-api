import { CLIENT_ID_HEADER, CLIENT_NAME_HEADER } from '#/common/client.js'
import { ORGANISATION_ID_HEADER } from '#/common/organisation.js'

// The organisation the external API forwards for a valid API code.
export const forwardedOrganisationId = 'd829f66d-857f-401d-b5e9-5061b7dbb29d'

export const organisationHeaders = {
  [ORGANISATION_ID_HEADER]: forwardedOrganisationId
}

// The software provider the external API forwards for the caller's token.
export const forwardedClient = {
  clientId: '4sfn2ij4qnnpqbe4ok3u0rgc5o',
  clientName: 'Acme Waste Systems Ltd'
}

export const clientHeaders = {
  [CLIENT_ID_HEADER]: forwardedClient.clientId,
  [CLIENT_NAME_HEADER]: encodeURIComponent(forwardedClient.clientName)
}

// Everything the external API forwards on a beta call
export const forwardedHeaders = { ...organisationHeaders, ...clientHeaders }
