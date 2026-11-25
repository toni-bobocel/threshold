// Blender reads the suites as JSON. Node 24 strips the types, so this runs as is:
//   node scripts/suites-json.ts
import { writeFileSync } from 'node:fs'
import { tokyo } from '../src/suites/tokyo.ts'

writeFileSync(new URL('../blender/suites.json', import.meta.url), `${JSON.stringify({ tokyo }, null, 1)}\n`)
