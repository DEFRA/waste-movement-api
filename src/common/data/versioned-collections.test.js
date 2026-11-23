import { versionedCollections } from './versioned-collections.js'

describe('versionedCollections', () => {
  test('names a collection for an API version and data generation', () => {
    expect(versionedCollections('beta-3', 1)('movements')).toBe(
      'beta-3-g1-movements'
    )
  })
})
