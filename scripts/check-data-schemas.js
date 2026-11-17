// Fails when a pull request makes a breaking change to an API version's DB
// schemas (src/versions/*/data/schemas) without bumping its DATA_GENERATION.
// See src/common/data/schema-diff.js for what counts as breaking.
//
//   node scripts/check-data-schemas.js [base-ref]   (default: origin/main)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compareDataSchemas } from '#/common/data/schema-diff.js'

const baseRef = process.argv[2] ?? 'origin/main'
const headRoot = path.resolve('src/versions')
const baseDir = mkdtempSync(path.join(tmpdir(), 'data-schemas-'))

try {
  // The base's src/versions, as files, so its schemas' $refs resolve
  const archive = execFileSync('git', ['archive', baseRef, 'src/versions'])
  execFileSync('tar', ['-x', '-C', baseDir], { input: archive })

  const results = await compareDataSchemas(
    path.join(baseDir, 'src', 'versions'),
    headRoot
  )

  for (const { apiVersion, entity, changes, isGenerationBumped } of results) {
    const verdict = isGenerationBumped
      ? 'breaking change, DATA_GENERATION bumped'
      : 'breaking change — bump DATA_GENERATION'
    console.log(`${apiVersion} ${entity}: ${verdict}`)
    for (const line of changes) {
      console.log(`  ${line}`)
    }
  }

  const unbumped = results.filter((result) => !result.isGenerationBumped)
  if (unbumped.length > 0) {
    process.exitCode = 1
  } else {
    console.log(`No unbumped breaking DB schema changes against ${baseRef}`)
  }
} finally {
  rmSync(baseDir, { recursive: true, force: true })
}
