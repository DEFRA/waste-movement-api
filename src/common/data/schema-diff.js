// Finds breaking changes between two copies of the DB schemas, e.g. `main`'s
// and a pull request's. A database in CI is always fresh, so it can't show
// what changed; the schema files can. A change is breaking when documents
// already stored could stop matching: a field removed or renamed, its type
// changed, an enum value removed, or a new required field.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { entityNames, loadDataSchema } from './data-schemas.js'

/**
 * @typedef {{ type: string, required: boolean, enum?: string[] }} Field
 */

/**
 * Every field in a self-contained schema, by path: `isHazardous`,
 * `owner.name`, `movementIds[]` for an array's items.
 *
 * @param {object} schema - with its `$ref`s resolved
 * @returns {Map<string, Field>}
 */
export const flattenSchema = (schema) => {
  const fields = new Map()

  const visit = (node, at, required) => {
    if (at) {
      fields.set(at, {
        type: [node.bsonType ?? 'any'].flat().sort().join('|'),
        required,
        ...(node.enum && { enum: node.enum })
      })
    }
    for (const [name, child] of Object.entries(node.properties ?? {})) {
      visit(
        child,
        at ? `${at}.${name}` : name,
        (node.required ?? []).includes(name)
      )
    }
    if (node.items) {
      visit(node.items, `${at}[]`, true)
    }
  }

  visit(schema, '', true)
  return fields
}

// `a.b` is in `a`, `a[]` is in `a`, and `a` is at the top
const parentOf = (at) => at.replace(/(\.[^.[\]]+|\[\])$/, '')

/**
 * @param {Map<string, Field>} base - e.g. `main`'s
 * @param {Map<string, Field>} head - e.g. the pull request's
 * @returns {string[]} one line per breaking change, empty when there are none
 */
export const breakingChanges = (base, head) => {
  const lines = []

  for (const [at, before] of base) {
    const after = head.get(at)
    if (!after) {
      lines.push(`- removed  ${at}`)
    } else if (after.type !== before.type) {
      lines.push(`~ type     ${at}: ${before.type} → ${after.type}`)
    } else {
      if (after.required && !before.required) {
        lines.push(`+ required ${at}`)
      }
      const removed = (before.enum ?? []).filter(
        (value) => after.enum && !after.enum.includes(value)
      )
      if (removed.length > 0 || (!before.enum && after.enum)) {
        lines.push(
          `~ enum     ${at}: ${removed.length > 0 ? `no longer ${removed.join(', ')}` : 'restricted'}`
        )
      }
    }
  }

  // A new required field breaks stored documents, unless what it's in is
  // new too: no stored document has that either.
  for (const [at, after] of head) {
    const parent = parentOf(at)
    if (
      !base.has(at) &&
      after.required &&
      (parent === at || parent === '' || base.has(parent))
    ) {
      lines.push(`+ required ${at}`)
    }
  }

  return lines
}

const readGeneration = async (versionDir) => {
  const file = path.join(versionDir, 'data', 'generation.js')
  return existsSync(file)
    ? (await import(pathToFileURL(file).href)).DATA_GENERATION
    : undefined
}

/**
 * Compares every API version's DB schemas in `headRoot` with the same
 * version's in `baseRoot`. A version or entity new in head has nothing to
 * break.
 *
 * @param {string} baseRoot - a copy of `src/versions`, e.g. `main`'s
 * @param {string} headRoot - `src/versions` as changed
 * @returns {Promise<{ apiVersion: string, entity: string, changes: string[], isGenerationBumped: boolean }[]>}
 * the entities with breaking changes, each saying whether its version's
 * DATA_GENERATION was bumped
 */
export const compareDataSchemas = async (baseRoot, headRoot) => {
  const results = []

  for (const apiVersion of readdirSync(headRoot).sort()) {
    const headSchemas = path.join(headRoot, apiVersion, 'data', 'schemas')
    const baseSchemas = path.join(baseRoot, apiVersion, 'data', 'schemas')
    if (!existsSync(headSchemas) || !existsSync(baseSchemas)) {
      continue
    }

    const headGeneration = await readGeneration(path.join(headRoot, apiVersion))
    const baseGeneration = await readGeneration(path.join(baseRoot, apiVersion))
    const isGenerationBumped =
      baseGeneration !== undefined && headGeneration > baseGeneration
    const headEntities = entityNames(headSchemas)

    for (const entity of entityNames(baseSchemas)) {
      const changes = headEntities.includes(entity)
        ? breakingChanges(
            flattenSchema(loadDataSchema(baseSchemas, entity)),
            flattenSchema(loadDataSchema(headSchemas, entity))
          )
        : ['- removed  (the whole entity)']

      if (changes.length > 0) {
        results.push({ apiVersion, entity, changes, isGenerationBumped })
      }
    }
  }

  return results
}
