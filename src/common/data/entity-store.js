import { ObjectId } from 'mongodb'

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
 * Every document starts at `revision` 0. Documents are only inserted for now;
 * a `_history` collection will drive the revision once updates exist.
 *
 * @param {string} collectionName - e.g. `beta-3-g2-movements`
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

    dataSchema,

    /**
     * A new document: the envelope plus the entity's own fields (its payload
     * and business fields). Its `_id` is internal, never exposed: the entity's
     * public ID is one of its own fields.
     *
     * @param {{ orgId: string, requestId: string }} envelope - `requestId` is
     * the `x-request-id` of the request creating the document
     * @param {object} fields
     */
    newDocument: ({ orgId, requestId }, fields) => {
      const now = new Date()
      return {
        _id: new ObjectId(),
        orgId,
        requestId,
        revision: 0,
        createdAt: now,
        updatedAt: now,
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
