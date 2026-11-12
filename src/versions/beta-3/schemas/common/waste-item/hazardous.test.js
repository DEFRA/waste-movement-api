import {
  hazardous,
  hazardousComponent,
  hazardousPresent,
  validatorFor
} from '../../test-helpers.js'

const validateAjv = validatorFor('common/waste-item/hazardous.schema.json')

// ajv also reports each failed 'if', which the validator drops.
const specificErrors = (errors) =>
  errors.filter(({ keyword }) => keyword !== 'if')

const withComponents = (components) => ({ ...hazardousPresent, components })

const expectRejected = (value, error) => {
  const { valid, errors } = validateAjv(value)

  expect(valid).toBe(false)
  expect(errors).toContainEqual(expect.objectContaining(error))
}

// The error envelope — messages and pointers — is covered in
// routes/create-movement.test.js and
// routes/record-receipt-undocumented.test.js.
describe('Feature: Schema - declaring hazardous properties', () => {
  describe('Scenario: The waste is declared as having no hazardous properties', () => {
    test('accepts it', () => {
      expect(validateAjv(hazardous).valid).toBe(true)
    })
  })

  describe('Scenario Outline: A hazardous component is declared with an amount', () => {
    test.each([0.001, 5, 120])('accepts an amount of %p', (amount) => {
      expect(
        validateAjv(withComponents([{ ...hazardousComponent, amount }])).valid
      ).toBe(true)
    })
  })

  describe('Scenario Outline: A hazardous component is declared against its threshold', () => {
    test.each(['EQUAL_TO', 'GREATER_THAN'])(
      'accepts a threshold of %p',
      (threshold) => {
        expect(
          validateAjv(withComponents([{ name: 'Mercury', threshold }])).valid
        ).toBe(true)
      }
    )
  })

  describe('Scenario Outline: The source of the hazardous component details is declared', () => {
    test.each(['GUIDANCE', 'PROVIDED_WITH_WASTE', 'OWN_TESTING'])(
      'accepts a source of %p',
      (componentsSource) => {
        expect(
          validateAjv({ ...hazardousPresent, componentsSource }).valid
        ).toBe(true)
      }
    )
  })

  describe('Scenario: No hazardous components need reporting', () => {
    test('accepts isComponentsNotApplicable true, with a source and no components', () => {
      const { components, ...withoutComponents } = hazardousPresent
      expect(
        validateAjv({ ...withoutComponents, isComponentsNotApplicable: true })
          .valid
      ).toBe(true)
    })
  })

  describe('Scenario: More than one hazardous component is declared', () => {
    test('accepts a name and an amount or threshold for each', () => {
      expect(
        validateAjv(
          withComponents([
            hazardousComponent,
            { name: 'Lead compounds', threshold: 'GREATER_THAN' },
            { name: 'Arsenic', unit: 'MG_PER_KG', amount: 0.001 }
          ])
        ).valid
      ).toBe(true)
    })
  })

  describe('Scenario Outline: Whether the waste has hazardous properties is missing or invalid', () => {
    test('rejects it not being provided, as required', () => {
      expectRejected(
        {},
        {
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'isPresent' }
        }
      )
    })

    test.each(['', 'Maybe', 'Unknown'])(
      'rejects %p as not true or false',
      (isPresent) => {
        expectRejected(
          { isPresent },
          { keyword: 'type', instancePath: '/isPresent' }
        )
      }
    )
  })

  describe('Scenario: Hazardous details are given for waste declared as having no hazardous properties', () => {
    test('rejects each detail as not permitted', () => {
      const { valid, errors } = validateAjv({
        ...hazardousPresent,
        isPresent: false
      })

      expect(valid).toBe(false)
      expect(specificErrors(errors)).toEqual([
        expect.objectContaining({ keyword: 'not', instancePath: '/codes' }),
        expect.objectContaining({
          keyword: 'not',
          instancePath: '/componentsSource'
        }),
        expect.objectContaining({
          keyword: 'not',
          instancePath: '/isComponentsNotApplicable'
        }),
        expect.objectContaining({
          keyword: 'not',
          instancePath: '/components'
        })
      ])
    })
  })

  describe("Scenario: The waste is hazardous but has no components and they're not declared not applicable", () => {
    test('rejects no components, saying they are required', () => {
      const { components, ...withoutComponents } = hazardousPresent
      const { valid, errors } = validateAjv(withoutComponents)

      expect(valid).toBe(false)
      expect(specificErrors(errors)).toEqual([
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'components' }
        })
      ])
    })

    test('rejects an empty list of components, saying at least one is required', () => {
      expectRejected(withComponents([]), {
        keyword: 'minItems',
        instancePath: '/components'
      })
    })
  })

  describe('Scenario: Components are given although declared not applicable', () => {
    // One error for the components, not one per detail inside them.
    test('rejects the components as not permitted', () => {
      const { valid, errors } = validateAjv({
        ...hazardousPresent,
        isComponentsNotApplicable: true
      })

      expect(valid).toBe(false)
      expect(specificErrors(errors)).toEqual([
        expect.objectContaining({ keyword: 'not', instancePath: '/components' })
      ])
    })
  })

  describe('Scenario Outline: Whether components are not applicable is missing or invalid', () => {
    test('rejects it not being provided, as required', () => {
      const { isComponentsNotApplicable, ...withoutNotApplicable } =
        hazardousPresent
      const { valid, errors } = validateAjv(withoutNotApplicable)

      expect(valid).toBe(false)
      expect(specificErrors(errors)).toEqual([
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'isComponentsNotApplicable' }
        })
      ])
    })

    // Only the type is reported: whether components are required depends on
    // a value that isn't true or false.
    test.each(['Maybe', 'Unknown'])(
      'rejects %p as not true or false',
      (isComponentsNotApplicable) => {
        const { valid, errors } = validateAjv({
          ...hazardousPresent,
          isComponentsNotApplicable
        })

        expect(valid).toBe(false)
        expect(specificErrors(errors)).toEqual([
          expect.objectContaining({
            keyword: 'type',
            instancePath: '/isComponentsNotApplicable'
          })
        ])
      }
    )
  })

  describe('Scenario Outline: The hazardous component name is missing or invalid', () => {
    test('rejects a name that is not provided, as required', () => {
      const { name, ...withoutName } = hazardousComponent
      expectRejected(withComponents([withoutName]), {
        keyword: 'required',
        instancePath: '/components/0',
        params: { missingProperty: 'name' }
      })
    })

    test('rejects a name of ""', () => {
      expectRejected(withComponents([{ ...hazardousComponent, name: '' }]), {
        keyword: 'minLength',
        instancePath: '/components/0/name'
      })
    })
  })

  describe('Scenario: A hazardous component has neither an amount nor a threshold', () => {
    test('rejects it, saying a threshold is required', () => {
      expectRejected(withComponents([{ name: 'Mercury' }]), {
        keyword: 'required',
        instancePath: '/components/0',
        params: { missingProperty: 'threshold' }
      })
    })
  })

  describe('Scenario: A hazardous component has both an amount and a threshold', () => {
    test('rejects the threshold as not permitted', () => {
      expectRejected(
        withComponents([{ ...hazardousComponent, threshold: 'EQUAL_TO' }]),
        { keyword: 'not', instancePath: '/components/0/threshold' }
      )
    })
  })

  describe('Scenario: A hazardous component has an amount but no unit', () => {
    test('rejects it, saying a unit is required', () => {
      expectRejected(withComponents([{ name: 'Mercury', amount: 5 }]), {
        keyword: 'required',
        instancePath: '/components/0',
        params: { missingProperty: 'unit' }
      })
    })
  })

  describe('Scenario Outline: The hazardous component amount is invalid', () => {
    // An amount that isn't known is left out, and a threshold given instead.
    test('rejects an amount of "" as not a number', () => {
      expectRejected(withComponents([{ ...hazardousComponent, amount: '' }]), {
        keyword: 'type',
        instancePath: '/components/0/amount'
      })
    })

    test.each([0, -1])(
      'rejects an amount of %p as not greater than 0',
      (amount) => {
        expectRejected(withComponents([{ ...hazardousComponent, amount }]), {
          keyword: 'exclusiveMinimum',
          instancePath: '/components/0/amount'
        })
      }
    )
  })

  describe('Scenario Outline: The hazardous component threshold is invalid', () => {
    test.each(['Less than', 'Greater than', 'Above'])(
      'rejects a threshold of %p as not recognised',
      (threshold) => {
        expectRejected(withComponents([{ name: 'Mercury', threshold }]), {
          keyword: 'enum',
          instancePath: '/components/0/threshold'
        })
      }
    )
  })

  describe('Scenario Outline: The source of the hazardous component details is missing or invalid', () => {
    test('rejects a source that is not provided, as required', () => {
      const { componentsSource, ...withoutSource } = hazardousPresent
      expectRejected(withoutSource, {
        keyword: 'required',
        params: { missingProperty: 'componentsSource' }
      })
    })

    // Required even when no components need reporting.
    test('rejects a source that is not provided when components are not applicable', () => {
      const { componentsSource, components, ...rest } = hazardousPresent
      expectRejected(
        { ...rest, isComponentsNotApplicable: true },
        {
          keyword: 'required',
          params: { missingProperty: 'componentsSource' }
        }
      )
    })

    test.each(['', 'Supplier', 'Unknown'])(
      'rejects a source of %p as not recognised',
      (componentsSource) => {
        expectRejected(
          { ...hazardousPresent, componentsSource },
          { keyword: 'enum', instancePath: '/componentsSource' }
        )
      }
    )
  })

  describe('Additional coverage', () => {
    // The codes listed in the ticket, rather than read back from the schema.
    test.each([
      'HP_1',
      'HP_2',
      'HP_3',
      'HP_4',
      'HP_5',
      'HP_6',
      'HP_7',
      'HP_8',
      'HP_9',
      'HP_10',
      'HP_11',
      'HP_12',
      'HP_13',
      'HP_14',
      'HP_15',
      'HP_POP'
    ])('accepts %s', (code) => {
      expect(validateAjv({ ...hazardousPresent, codes: [code] }).valid).toBe(
        true
      )
    })

    // Storing them without duplicates is a separate change.
    test('accepts duplicate codes', () => {
      expect(
        validateAjv({ ...hazardousPresent, codes: ['HP_4', 'HP_4'] }).valid
      ).toBe(true)
    })

    test('rejects an unknown field', () => {
      expectRejected(
        { ...hazardous, hpCodes: [] },
        { keyword: 'additionalProperties', instancePath: '' }
      )
    })

    test('reports each missing detail when only isPresent is given', () => {
      const { valid, errors } = validateAjv({ isPresent: true })

      expect(valid).toBe(false)
      expect(specificErrors(errors)).toEqual([
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'codes' }
        }),
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'componentsSource' }
        }),
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'isComponentsNotApplicable' }
        })
      ])
    })

    test('reports a missing isPresent, and the codes given without it', () => {
      const { valid, errors } = validateAjv({ codes: ['HP_4'] })

      expect(valid).toBe(false)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            instancePath: '',
            params: { missingProperty: 'isPresent' }
          }),
          expect.objectContaining({ keyword: 'not', instancePath: '/codes' })
        ])
      )
    })
  })
})
