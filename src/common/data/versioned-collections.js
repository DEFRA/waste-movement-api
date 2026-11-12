import { createLogger } from '#/common/helpers/logging/logger.js'

const logger = createLogger()

// MongoDB's code for dropping a collection that no longer exists, e.g. when
// another instance's sweep got there first.
const NAMESPACE_NOT_FOUND = 26

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Names one API version's collections for one data revision:
 * `versionedCollections('beta-3', 1)('movements')` is `beta-3-r1-movements`.
 * Bumping the revision starts that version on new, empty collections.
 *
 * @param {string} apiVersion - e.g. 'beta-3'
 * @param {number} revision - the version's DATA_REVISION
 * @returns {(name: string) => string}
 */
export const versionedCollections = (apiVersion, revision) => (name) =>
  `${apiVersion}-r${revision}-${name}`

/**
 * Drops `apiVersion`'s collections for every data revision but `revision`,
 * logging each drop. Other versions' collections are left alone.
 *
 * @param {import('mongodb').Db} db
 * @param {string} apiVersion - e.g. 'beta-3'
 * @param {number} revision - the revision to keep
 * @returns {Promise<string[]>} the names of the collections dropped
 */
export const sweepStaleRevisions = async (db, apiVersion, revision) => {
  const pattern = new RegExp(`^${escapeRegExp(apiVersion)}-r(\\d+)-`)
  const collections = await db.listCollections({}, { nameOnly: true }).toArray()

  const stale = collections
    .map(({ name }) => ({ name, match: pattern.exec(name) }))
    .filter(({ match }) => match && Number(match[1]) !== revision)
    .map(({ name }) => name)

  for (const name of stale) {
    try {
      await db.collection(name).drop()
      logger.info(
        { apiVersion, revision, collection: name },
        `Dropped ${name}, a stale ${apiVersion} data revision`
      )
    } catch (error) {
      if (error.code !== NAMESPACE_NOT_FOUND) {
        throw error
      }
    }
  }

  return stale
}
