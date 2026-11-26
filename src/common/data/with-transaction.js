/**
 * Runs `work` in one transaction on a session of its own: every write it
 * makes with that session commits together, or none of them does.
 *
 * @template T
 * @param {import('mongodb').MongoClient} mongoClient
 * @param {(session: import('mongodb').ClientSession) => Promise<T>} work
 * @returns {Promise<T>} what `work` returned
 */
export const withTransaction = async (mongoClient, work) => {
  const session = mongoClient.startSession()
  try {
    return await session.withTransaction(() => work(session))
  } finally {
    await session.endSession()
  }
}
