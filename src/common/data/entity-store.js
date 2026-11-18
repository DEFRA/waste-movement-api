import { ObjectId } from 'mongodb'
import { syncCollection } from './sync-collection.js'

/**
 * A document that doesn't match its DB schema: our bug, never the caller's,
 * so it's a 500. Thrown before the write, so nothing is stored.
 */
export class DocumentValidationError extends Error {
  constructor(collectionName, errors) {
    super(`Document does not match the schema of ${collectionName}`)
    this.name = 'DocumentValidationError'
    // Only what locates the mismatch, never the document's values
    this.errors = errors.map(
      ({ instancePath, schemaPath, keyword, params }) => ({
        instancePath,
        schemaPath,
        keyword,
        params
      })
    )
  }
}

/**
 * The one place an entity's documents are written: each is stamped with the
 * envelope every document carries, checked against the entity's DB schema,
 * then inserted.
 *
 * Every document starts at `revision` 1. The revision is +1 on every write,
 * so it can serve as an ETag once updates exist (with the previous version
 * kept in a `_history` collection); for now documents are only inserted.
 *
 * @param {string} collectionName - e.g. `beta-3-g1-movements`
 * @param {import('./data-schemas.js').DataSchema} dataSchema
 * @param {object} logger
 */
export const entityStore = (collectionName, dataSchema, logger) => {
  const assertValid = (document) => {
    if (!dataSchema.validate(document)) {
      const error = new DocumentValidationError(
        collectionName,
        dataSchema.validate.errors
      )
      logger.error(
        { collection: collectionName, errors: error.errors },
        error.message
      )
      throw error
    }
  }

  return {
    collectionName,

    /** At boot: see syncCollection. */
    sync: (db) => syncCollection(db, collectionName, dataSchema, logger),

    /**
     * A new document: the envelope plus the entity's own fields, from its
     * mapper's toDocument.
     *
     * @param {{ _id?: unknown, orgId: string, traceId: string }} envelope -
     * `_id` is the entity's natural ID, or a new ObjectId when it has none
     * @param {object} fields
     */
    newDocument: ({ _id = new ObjectId(), orgId, traceId }, fields) => {
      const now = new Date()
      return {
        _id,
        orgId,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        traceId,
        ...fields
      }
    },

    /**
     * @param {import('mongodb').Db} db
     * @param {object} document - from newDocument
     * @param {import('mongodb').InsertOneOptions} [options] - e.g. a session
     */
    insertOne: async (db, document, options) => {
      assertValid(document)
      await db.collection(collectionName).insertOne(document, options)
    },

    /**
     * @param {import('mongodb').Db} db
     * @param {object[]} documents - from newDocument
     * @param {import('mongodb').BulkWriteOptions} [options]
     */
    insertMany: async (db, documents, options) => {
      documents.forEach(assertValid)
      await db.collection(collectionName).insertMany(documents, options)
    }
  }
}
