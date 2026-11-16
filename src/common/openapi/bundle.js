// Resolves an OpenAPI document together with everything it `$ref`s: the JSON
// Schemas beside it, the refs between those schemas, and the named
// `.examples.json` files, into one self-contained document. A missing file
// or pointer, or a ref that loops back on itself, throws.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'))

/** The node at JSON pointer `pointer` ("" or "/a/b") in `doc`. */
function atPointer(doc, pointer, failure) {
  return pointer
    .split('/')
    .slice(1)
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, token) => {
      if (node?.[token] === undefined) {
        throw new Error(failure)
      }
      return node[token]
    }, doc)
}

/**
 * `node` with every `$ref` replaced by its target, recursively. Relative
 * refs resolve against the file they appear in; keywords beside a `$ref`
 * are kept on top of its target.
 */
function resolveRefs(node, file, root, trail = []) {
  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, file, root, trail))
  }
  if (!node || typeof node !== 'object') {
    return node
  }

  const { $ref, ...rest } = node
  const resolvedRest = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [
      key,
      resolveRefs(value, file, root, trail)
    ])
  )
  if (typeof $ref !== 'string') {
    return resolvedRest
  }

  const where = `$ref "${$ref}" in ${path.relative(root, file)}`
  const [target, pointer = ''] = $ref.split('#')
  const targetFile = target ? path.resolve(path.dirname(file), target) : file
  const at = `${targetFile}#${pointer}`
  if (trail.includes(at)) {
    throw new Error(`Circular ${where}`)
  }
  if (!existsSync(targetFile)) {
    throw new Error(`Cannot resolve ${where}`)
  }

  const targetNode = atPointer(
    readJson(targetFile),
    pointer,
    `Cannot resolve ${where}`
  )
  return {
    ...resolveRefs(targetNode, targetFile, root, [...trail, at]),
    ...resolvedRest
  }
}

/**
 * @param {string} specPath - absolute path of the OpenAPI document
 * @returns {object} the document with every `$ref` resolved in place
 */
export function bundle(specPath) {
  return resolveRefs(readJson(specPath), specPath, path.dirname(specPath))
}
