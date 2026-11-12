import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('delivery/delivery-item.schema.json')

const deliveryItem = {
  deliveryId: '25KMT4Z9',
  movementIds: ['25HRA0B2', '25HRA0B3'],
  wasteType: 'NON_HAZARDOUS'
}

describe('Feature: Schema - a Delivery recorded by POST /deliveries', () => {
  describe('Scenario: A non-hazardous Delivery covers several Movements', () => {
    test('validation passes', () => {
      expect(validateAjv(deliveryItem).valid).toBe(true)
    })
  })

  describe("Scenario: A hazardous Delivery reuses its Movement's ID", () => {
    test('validation passes with one Movement ID equal to the Delivery ID', () => {
      const payload = {
        deliveryId: '25HRA0B2',
        movementIds: ['25HRA0B2'],
        wasteType: 'HAZARDOUS'
      }

      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  describe('Scenario: A Delivery is missing one of its parts', () => {
    test.each(['deliveryId', 'movementIds', 'wasteType'])(
      'validation fails without %s',
      (field) => {
        const { [field]: excluded, ...payload } = deliveryItem
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  describe('Scenario: A Delivery covers no Movements', () => {
    test('validation fails with an empty movementIds list', () => {
      expect(validateAjv({ ...deliveryItem, movementIds: [] }).valid).toBe(
        false
      )
    })
  })

  describe('Scenario: A Delivery has a malformed ID', () => {
    test('validation fails with a malformed Delivery ID', () => {
      expect(validateAjv({ ...deliveryItem, deliveryId: 'nope' }).valid).toBe(
        false
      )
    })

    test('validation fails with a malformed Movement ID', () => {
      expect(
        validateAjv({ ...deliveryItem, movementIds: ['nope'] }).valid
      ).toBe(false)
    })
  })

  describe('Scenario: A Delivery carries an unknown field', () => {
    test('validation fails', () => {
      expect(validateAjv({ ...deliveryItem, carrier: {} }).valid).toBe(false)
    })
  })
})
