import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

// MongoDB's code for dropping a collection that no longer exists, e.g. when
// another instance's sweep got there first.
const NAMESPACE_NOT_FOUND = 26

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Names one API version's collections for one data generation:
 * `versionedCollections('beta-3', 1)('movements')` is `beta-3-g1-movements`.
 * Bumping the generation starts that version on new, empty collections.
 *
 * @param {string} apiVersion - e.g. 'beta-3'
 * @param {number} generation - the version's DATA_GENERATION
 * @returns {(name: string) => string}
 */
export const versionedCollections = (apiVersion, generation) => (name) =>
  `${apiVersion}-g${generation}-${name}`

/**
 * Drops `apiVersion`'s collections for every data generation but
 * `generation`, logging each drop. Other versions' collections are left
 * alone. Collections named before generations were (`beta-3-r<N>-*`, a "data
 * revision") are stale too.
 *
 * @param {import('mongodb').Db} db
 * @param {string} apiVersion - e.g. 'beta-3'
 * @param {number} generation - the generation to keep
 * @returns {Promise<string[]>} the names of the collections dropped
 */
export const sweepStaleGenerations = async (db, apiVersion, generation) => {
  const pattern = new RegExp(`^${escapeRegExp(apiVersion)}-([gr])(\\d+)-`)
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  const stale = collections
    .map(({ name }) => ({ name, match: pattern.exec(name) }))
    .filter(
      ({ match }) =>
        match && (match[1] === 'r' || Number(match[2]) !== generation)
    )
    .map(({ name }) => name)

  for (const name of stale) {
    try {
      await db.collection(name).drop()
      logger.info(
        { apiVersion, generation, collection: name },
        `Dropped ${name}, a stale ${apiVersion} data generation`
      )
    } catch (error) {
      if (error.code !== NAMESPACE_NOT_FOUND) {
        throw error
      }
    }
  }

  return stale
}
