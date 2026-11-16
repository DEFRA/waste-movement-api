import { Db, MongoClient } from 'mongodb'

describe('#mongoDb', () => {
  let server

  describe('Set up', () => {
    beforeAll(async () => {
      // Dynamic import needed due to config being updated by vitest-mongodb
      const { createServer } = await import('#/server.js')

      server = await createServer()
      await server.initialize()
    })

    test('Server should have expected MongoDb decorators', () => {
      expect(server.db).toBeInstanceOf(Db)
      expect(server.mongoClient).toBeInstanceOf(MongoClient)
    })

    test('Requests should have the db and client', async () => {
      server.route({
        method: 'GET',
        path: '/decorations',
        options: { auth: false },
        handler: (request) => ({
          db: request.db === server.db,
          mongoClient: request.mongoClient === server.mongoClient
        })
      })

      const { result } = await server.inject('/decorations')

      expect(result).toEqual({ db: true, mongoClient: true })
    })

    test('MongoDb should have expected database name', () => {
      expect(server.db.databaseName).toBe('waste-movement-api')
    })

    test('MongoDb should have expected namespace', () => {
      expect(server.db.namespace).toBe('waste-movement-api')
    })
  })

  describe('Shut down', () => {
    beforeAll(async () => {
      // Dynamic import needed due to config being updated by vitest-mongodb
      const { createServer } = await import('#/server.js')

      server = await createServer()
      await server.initialize()
    })

    test('Should close Mongo client on server stop', async () => {
      const closeSpy = vi.spyOn(server.mongoClient, 'close')
      await server.stop({ timeout: 1000 })

      expect(closeSpy).toHaveBeenCalledWith(true)
    })
  })
})
