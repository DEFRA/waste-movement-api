/**
 * Names one API version's collections for one data generation:
 * `versionedCollections('beta-3', 1)('movements')` is `beta-3-g1-movements`.
 * Bumping the generation starts that version on new, empty collections; the
 * old generation's are left behind.
 *
 * @param {string} apiVersion - e.g. 'beta-3'
 * @param {number} generation - the version's DATA_GENERATION
 * @returns {(name: string) => string}
 */
export const versionedCollections = (apiVersion, generation) => (name) =>
  `${apiVersion}-g${generation}-${name}`
