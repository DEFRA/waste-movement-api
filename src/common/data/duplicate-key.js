// MongoDB's code for a write that breaks a unique index.
const DUPLICATE_KEY = 11000

/**
 * @param {unknown} error
 * @returns {boolean} whether the error is a write breaking a unique index
 */
export const isDuplicateKeyError = (error) => error?.code === DUPLICATE_KEY
