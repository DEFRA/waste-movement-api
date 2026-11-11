import { globalIgnores } from 'eslint/config'
import neostandard from 'neostandard'

export default [
  // ESLint 10 no longer treats neostandard's `ignores` as global, so generated
  // files such as coverage/ would be linted
  globalIgnores(neostandard.resolveIgnoresFromGitignore()),
  ...neostandard({
    env: ['node', 'vitest'],
    noJsx: true,
    noStyle: true
  })
]
