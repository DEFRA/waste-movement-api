import Hapi from '@hapi/hapi'
import Boom from '@hapi/boom'
import { journeyLogger } from './journey-logger.js'
import { createLogger } from '#/common/helpers/logging/logger.js'

const findDeliveryMovementIds = vi.fn()

// A route in the given journey step. Its handler fails with the Boom error in
// payload.fail, if given, else sets the journey entries in payload.journey.
const journeyRoute = (path, journeyStep, app = {}) => ({
  method: 'POST',
  path,
  options: { app: { journeyStep, ...app } },
  handler: (request, h) => {
    const { fail, journey } = request.payload ?? {}
    if (fail) {
      throw Boom[fail]('step failed')
    }
    if (journey) {
      request.app.journey = journey
    }
    return h.response({}).code(201)
  }
})

describe('journeyLogger', () => {
  let server
  let info
  let warn

  beforeAll(async () => {
    server = Hapi.server()
    await server.register(journeyLogger)
    await server.register(
      {
        plugin: {
          name: 'beta-3',
          register: (version) => {
            version.route([
              journeyRoute('/movements', 'movement-created'),
              journeyRoute(
                '/movements/{movementId}/collection',
                'collection-recorded'
              ),
              journeyRoute('/deliveries', 'delivery-recorded'),
              journeyRoute(
                '/deliveries/{deliveryId}/receipt',
                'receipt-recorded',
                {
                  findDeliveryMovementIds: (db, deliveryId) =>
                    findDeliveryMovementIds(db, deliveryId)
                }
              ),
              journeyRoute('/receipts', 'undocumented-receipt-recorded')
            ])
          }
        }
      },
      { routes: { prefix: '/beta-3' } }
    )
    server.route([
      {
        method: 'POST',
        path: '/other',
        handler: (request, h) => h.response({}).code(201)
      },
      journeyRoute('/unversioned/{deliveryId}/receipt', 'receipt-recorded')
    ])
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    findDeliveryMovementIds.mockReset()
    info = vi.spyOn(createLogger(), 'info').mockImplementation(() => {})
    warn = vi.spyOn(createLogger(), 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const send = (url, payload = {}) =>
    server.inject({ method: 'POST', url, payload })

  const loggedLines = () =>
    info.mock.calls.map(([fields, message]) => ({
      fields,
      message
    }))

  describe('B1A - single non-hazardous movement', () => {
    it('logs the created movement', async () => {
      await send('/beta-3/movements', { journey: [{ movementId: 'M1' }] })

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'movement-created', outcome: 'success' },
            'transaction.id': 'M1'
          },
          message: 'Beta-3 movement-created: success (movement M1)'
        }
      ])
    })

    it('logs the collection against its movement', async () => {
      await send('/beta-3/movements/M1/collection', {
        journey: [{ movementId: 'M1' }]
      })

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'collection-recorded', outcome: 'success' },
            'transaction.id': 'M1'
          },
          message: 'Beta-3 collection-recorded: success (movement M1)'
        }
      ])
    })

    it('logs the receipt against each movement in the delivery', async () => {
      await send('/beta-3/deliveries/D1/receipt', {
        journey: [{ movementId: 'M1', deliveryId: 'D1' }]
      })

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'receipt-recorded', outcome: 'success' },
            'transaction.id': 'M1',
            'span.id': 'D1'
          },
          message: 'Beta-3 receipt-recorded: success (movement M1, delivery D1)'
        }
      ])
      expect(findDeliveryMovementIds).not.toHaveBeenCalled()
    })
  })

  describe('B1B / B2B - several movements delivered together', () => {
    it('logs one line per movement, each with the delivery it went into', async () => {
      await send('/beta-3/deliveries', {
        journey: [
          { movementId: 'M1', deliveryId: 'D1' },
          { movementId: 'M2', deliveryId: 'D1' },
          { movementId: 'M3', deliveryId: 'M3' }
        ]
      })

      expect(loggedLines().map(({ fields }) => fields)).toEqual([
        {
          event: { action: 'delivery-recorded', outcome: 'success' },
          'transaction.id': 'M1',
          'span.id': 'D1'
        },
        {
          event: { action: 'delivery-recorded', outcome: 'success' },
          'transaction.id': 'M2',
          'span.id': 'D1'
        },
        {
          event: { action: 'delivery-recorded', outcome: 'success' },
          'transaction.id': 'M3',
          'span.id': 'M3'
        }
      ])
    })
  })

  describe('B1D - waste received without a Delivery ID', () => {
    it('logs the new delivery, with no movement', async () => {
      await send('/beta-3/receipts', { journey: [{ deliveryId: 'D9' }] })

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: {
              action: 'undocumented-receipt-recorded',
              outcome: 'success'
            },
            'span.id': 'D9'
          },
          message: 'Beta-3 undocumented-receipt-recorded: success (delivery D9)'
        }
      ])
    })
  })

  describe('failures', () => {
    it('logs a rejected movement creation with its status and reason', async () => {
      await send('/beta-3/movements', { fail: 'badRequest' })

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'movement-created', outcome: 'failure' },
            error: { code: '400', message: 'step failed' }
          },
          message: 'Beta-3 movement-created: failure'
        }
      ])
    })

    it('logs a rejected collection against the movement in its path', async () => {
      await send('/beta-3/movements/M1/collection', { fail: 'notFound' })

      expect(loggedLines()[0].fields).toEqual({
        event: { action: 'collection-recorded', outcome: 'failure' },
        'transaction.id': 'M1',
        error: { code: '404', message: 'step failed' }
      })
    })

    it('logs a rejected delivery against each submitted movement', async () => {
      await send('/beta-3/deliveries', {
        fail: 'badRequest',
        movementIds: ['M1', 'M2', 'M1', 42]
      })

      expect(
        loggedLines().map(({ fields }) => fields['transaction.id'])
      ).toEqual(['M1', 'M2'])
      expect(loggedLines()[0].fields.event.outcome).toEqual('failure')
    })

    it('logs a rejected receipt against each movement in the delivery', async () => {
      findDeliveryMovementIds.mockResolvedValue(['M1', 'M2'])

      await send('/beta-3/deliveries/D1/receipt', { fail: 'badRequest' })

      expect(findDeliveryMovementIds).toHaveBeenCalledWith(undefined, 'D1')
      expect(
        loggedLines().map(({ fields }) => [
          fields['transaction.id'],
          fields['span.id'],
          fields.event.outcome
        ])
      ).toEqual([
        ['M1', 'D1', 'failure'],
        ['M2', 'D1', 'failure']
      ])
    })

    it('logs a receipt for an unknown delivery with the delivery id only', async () => {
      findDeliveryMovementIds.mockResolvedValue(null)

      await send('/beta-3/deliveries/D404/receipt', { fail: 'notFound' })

      expect(loggedLines()[0].fields).toEqual({
        event: { action: 'receipt-recorded', outcome: 'failure' },
        'span.id': 'D404',
        error: { code: '404', message: 'step failed' }
      })
    })

    it('still responds when the journey line cannot be logged', async () => {
      findDeliveryMovementIds.mockRejectedValue(new Error('mongo down'))

      const { statusCode } = await send('/beta-3/deliveries/D1/receipt', {
        fail: 'badRequest'
      })

      expect(statusCode).toEqual(400)
      expect(info).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Failed to log beta-3 journey step'
      )
    })
  })

  it('trims IDs to the CDP field limit and ignores entries without one', async () => {
    const longId = 'M'.repeat(300)

    await send('/beta-3/movements', {
      journey: [{ movementId: longId }, { movementId: 42 }]
    })

    expect(loggedLines().map(({ fields }) => fields['transaction.id'])).toEqual(
      [longId.slice(0, 256)]
    )
  })

  it('logs nothing for routes without a journey step', async () => {
    await send('/other')

    expect(info).not.toHaveBeenCalled()
  })

  it('logs a rejected receipt against its delivery alone when the route has no lookup', async () => {
    await send('/unversioned/D1/receipt', { fail: 'badRequest' })

    expect(findDeliveryMovementIds).not.toHaveBeenCalled()
    expect(loggedLines()).toEqual([
      {
        fields: {
          event: { action: 'receipt-recorded', outcome: 'failure' },
          'span.id': 'D1',
          error: { code: '400', message: 'step failed' }
        },
        message: 'receipt-recorded: failure (delivery D1)'
      }
    ])
  })

  it('names no version for a route registered outside one', async () => {
    await send('/unversioned/D1/receipt', {
      journey: [{ movementId: 'M1', deliveryId: 'D1' }]
    })

    expect(loggedLines()[0].message).toEqual(
      'receipt-recorded: success (movement M1, delivery D1)'
    )
  })

  it('names no version when a route registered outside one cannot be logged', async () => {
    info.mockImplementationOnce(() => {
      throw new Error('log sink down')
    })

    const { statusCode } = await send('/unversioned/D1/receipt', {
      journey: [{ movementId: 'M1', deliveryId: 'D1' }]
    })

    expect(statusCode).toEqual(201)
    expect(warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to log journey step'
    )
  })
})
