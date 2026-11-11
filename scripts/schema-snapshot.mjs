// Writes supabase/schema.sql: the database structure (tables, functions,
// triggers, security rules, storage buckets), read from the live project.
// Read-only: no data, nothing changed.
//
//   node scripts/schema-snapshot.mjs              (needs the Supabase CLI logged in)
//   node scripts/schema-snapshot.mjs rows.json    (rows saved earlier from the same query)
//
// The repo is public, so outside web addresses in the database (the n8n
// webhook) are left out: they work like passwords.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_HOST = 'dvtnrfhsxabtcmpgojnn.supabase.co'

function fetchRows() {
  if (process.argv[2]) return readFileSync(process.argv[2], 'utf8')
  return execFileSync(
    'npx',
    ['supabase', 'db', 'query', '--remote', '--read-only', '-o', 'json', '-f', 'scripts/schema-snapshot.sql'],
    { cwd: root, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }
  )
}

const raw = fetchRows()
const { rows } = JSON.parse(raw.slice(raw.indexOf('{')))
if (!Array.isArray(rows) || rows.length === 0) throw new Error('The query returned nothing.')

// an outside address (not this project's own) is hidden
const hideOutside = (sql) =>
  sql.replace(/https?:\/\/[^\s'"]+/g, (url) => (url.includes(PROJECT_HOST) || url === 'https://.' ? url : '<hidden: see Database > Webhooks>'))

// runs again without stopping on what's already there
const once = (sql, errors) =>
  `DO $snap$ BEGIN\n  ${sql.replace(/\n/g, '\n  ')}\nEXCEPTION WHEN ${errors} THEN NULL;\nEND $snap$;`

const SECTIONS = {
  10: 'Extensions',
  20: 'Types',
  21: 'Types',
  30: 'Sequences',
  40: 'Tables (their defaults come after the functions they call)',
  50: 'Functions',
  55: 'Views',
  60: 'Column defaults',
  61: 'Sequences owned by columns',
  70: 'Keys and checks',
  75: 'Foreign keys',
  80: 'Indexes',
  85: 'Triggers',
  90: 'Row level security',
  91: 'Policies',
  95: 'Who may call each function',
  96: 'Who may use each table',
  97: 'Comments',
  98: 'Live updates (realtime)',
  99: 'Storage buckets',
}

const out = []
let section = ''
const counts = {}
for (const row of rows) {
  const title = SECTIONS[row.ord] || `Part ${row.ord}`
  if (title !== section) {
    section = title
    out.push('', `-- ${'='.repeat(70)}`, `-- ${title}`, `-- ${'='.repeat(70)}`, '')
  }
  counts[title] = (counts[title] || 0) + 1

  let sql = row.sql
  if (row.ord === 80) sql = sql.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')
  if (row.ord === 85) {
    sql = sql.replace(/^CREATE TRIGGER /, 'CREATE OR REPLACE TRIGGER ')
    // a database webhook to an outside address: made again in the dashboard
    if (/supabase_functions\.http_request/.test(sql) && hideOutside(sql) !== sql) {
      sql = `-- A database webhook (Database > Webhooks); its address is not kept here:\n-- ${hideOutside(sql)}`
    }
  }
  if (row.ord === 70 || row.ord === 75) sql = once(sql, 'duplicate_object OR duplicate_table OR invalid_table_definition')
  if (row.ord === 91 || row.ord === 98) sql = once(sql, 'duplicate_object')

  out.push(hideOutside(sql), '')
}

const today = new Date().toISOString().slice(0, 10)
const header = `-- =====================================================================
-- 10 FIVE 7 Hardware: the database structure (no data)
-- ---------------------------------------------------------------------
-- Read from the live project on ${today} by scripts/schema-snapshot.mjs.
-- Many of these were made by hand in the Supabase dashboard, so the
-- migrations folder alone can't rebuild the database. This file can.
--
-- To rebuild on a new, empty Supabase project (a test copy, or after the
-- project is lost): Supabase > SQL Editor > paste this file > Run.
-- Then put the data back from a nightly backup (docs/BACKUPS.md).
--
-- Not in here:
--   - the data (the nightly backup has it)
--   - Auth settings, Edge Functions and their secrets
--   - the n8n webhook's address (hidden: the repo is public). Make it again
--     in Database > Webhooks: purchase_orders, after insert, POST.
-- =====================================================================

SET check_function_bodies = false;
SET client_min_messages = warning;
`

writeFileSync(join(root, 'supabase', 'schema.sql'), header + out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n')
console.log(`supabase/schema.sql: ${rows.length} statements`)
for (const [title, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(4)}  ${title}`)
