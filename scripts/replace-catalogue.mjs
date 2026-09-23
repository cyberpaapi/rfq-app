// Explicit maintenance command; source data and backups must remain outside Git.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { resolve, basename, join } from 'node:path'
import { readCatalogue, replaceCatalogue } from '../server/lib/catalogue.js'
import { createPostgresDatabase } from '../server/lib/cloud-store.js'
const args = process.argv.slice(2)
const option = (key) => args[args.indexOf(key) + 1]
if (!args.includes('--source') || !args.includes('--backup-dir')) throw new Error('Usage: --source workbook.xlsx --backup-dir directory [--cloud] [--apply]')
const source = resolve(option('--source')), backupDir = resolve(option('--backup-dir'))
const cloud = args.includes('--cloud'), apply = args.includes('--apply')
if (cloud && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for --cloud.')
const dbPath = resolve(process.env.RFQ_DATA_DIR || 'server/data', 'db.json')
const database = cloud ? createPostgresDatabase(() => { throw new Error('Refusing to initialize an empty production database.') }) : null
const state = cloud ? await database.load() : { data: JSON.parse(await readFile(dbPath, 'utf8')) }
const parsed = readCatalogue(await readFile(source), { strict: true })
const result = replaceCatalogue(state.data, parsed.items, basename(source))
const summary = { target: cloud ? 'cloud' : 'local', before: state.data.items.length, after: result.data.items.length, matched: result.matched, bytes: Buffer.byteLength(JSON.stringify(result.data)), applied: false }
if (apply) {
  await mkdir(backupDir, { recursive: true })
  const backup = join(backupDir, `catalogue-${cloud ? 'cloud' : 'local'}-${Date.now()}.json`)
  await writeFile(backup, JSON.stringify(state.data), { flag: 'wx' })
  if (cloud) await database.commit({ ...state, data: result.data })
  else { await writeFile(dbPath + '.catalogue-tmp', JSON.stringify(result.data)); await rename(dbPath + '.catalogue-tmp', dbPath) }
  summary.applied = true
  summary.backup = backup
}
console.log(JSON.stringify(summary))
