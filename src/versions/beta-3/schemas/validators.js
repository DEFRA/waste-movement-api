import { createValidators } from '#/common/validation/create-validators.js'

// Every *.schema.json under this folder, keyed by its path from here, e.g.
// validators.request('creation/create-movement-request').
export const validators = createValidators(import.meta.dirname)
