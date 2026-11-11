// The Activity log, in words: what each row (supabase activity_log) means.
//
//   describeActivity(row) -> { verb, tone, item, changes: ['Price ₱120.00 → ₱135.00', ...] }
//
// The database stores the changed columns as { column: { from, to } } (an
// update) or { column: value } (something added or removed).

import { peso } from './format'
import { roleLabel } from './roles'

export const ENTITY_LABELS = {
  product: 'Product',
  category: 'Category',
  refund: 'Refund',
  receipt: 'Receipt',
  inspection: 'Inspection',
  delivery: 'Delivery',
  documentation: 'Documentation',
  'store logo': 'Store logo',
  account: 'Account',
  backup: 'Backup',
}

// what "added" means for each kind of thing
const ADDED = {
  refund: 'Requested',
  receipt: 'Uploaded',
  inspection: 'Submitted',
  delivery: 'Scheduled',
  account: 'Created',
}

const TONES = {
  added: 'green',
  changed: 'amber',
  removed: 'red',
  neutral: 'zinc',
  info: 'blue',
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

function text(value) {
  if (value === null || value === undefined || value === '') return 'none'
  return String(value)
}

function day(value) {
  if (!value) return 'none'
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function title(value) {
  const s = text(value)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// a yes / no column turned on or off: the verb it reads as
const FLAGS = {
  is_deleted: [['Deleted', 'removed'], ['Undeleted', 'added']],
  is_archived: [['Archived', 'neutral'], ['Restored', 'added']],
  is_disabled: [['Disabled', 'removed'], ['Enabled', 'added']],
  is_active: [['Enabled', 'added'], ['Disabled', 'removed']],
}

// one changed column, as a line ("Price ₱120.00 → ₱135.00")
function changeLine(key, from, to) {
  switch (key) {
    case 'price':
      return `Price ${peso(from)} → ${peso(to)}`
    case 'last_cost':
      return `Cost ${peso(from)} → ${peso(to)}`
    case 'amount':
      return `Amount ${peso(from)} → ${peso(to)}`
    case 'name':
    case 'title':
    case 'full_name':
      return `Renamed from “${text(from)}” to “${text(to)}”`
    case 'category':
      return `Category ${from || 'Uncategorized'} → ${to || 'Uncategorized'}`
    case 'image_url':
      return to ? 'Changed the picture' : 'Removed the picture'
    case 'logo_path':
      return to ? 'Changed the store logo' : 'Removed the store logo'
    case 'inspection_date':
      return to ? `Inspection date → ${day(to)}` : 'Inspection date cleared'
    case 'status':
      return `Status ${title(from)} → ${title(to)}`
    case 'role':
      return `Role ${roleLabel(from) || 'none'} → ${roleLabel(to)}`
    case 'email':
      return `Email ${text(from)} → ${text(to)}`
    case 'two_step':
      return `Two-step verification ${text(from)} → ${text(to)}`
    default:
      return `${title(key.replace(/_/g, ' '))} ${text(from)} → ${text(to)}`
  }
}

// a value something was added (or removed) with ("Price ₱120.00")
function valueLine(key, value) {
  switch (key) {
    case 'price':
      return `Price ${peso(value)}`
    case 'last_cost':
      return `Cost ${peso(value)}`
    case 'amount':
      return `Amount ${peso(value)}`
    case 'category':
      return `Category ${text(value)}`
    case 'role':
      return `Role ${roleLabel(value)}`
    case 'email':
      return text(value)
    case 'inspection_date':
      return `Inspection ${day(value)}`
    case 'status':
      return `Status ${title(value)}`
    default:
      return ''
  }
}

export function entityLabel(entity) {
  return ENTITY_LABELS[entity] || title(entity)
}

export function describeActivity(row) {
  const details = isObj(row.details) ? row.details : {}
  const label = entityLabel(row.entity)
  const item = row.entity_name || (row.entity_id ? `${label} #${row.entity_id}` : label)

  if (row.action === 'downloaded') {
    const tables = Object.keys(details).length
    const rows = Object.values(details).reduce((sum, n) => sum + (Number(n) || 0), 0)
    return {
      verb: 'Downloaded',
      tone: TONES.info,
      item: 'Full backup',
      changes: tables ? [`${rows.toLocaleString()} rows from ${tables} tables`] : [],
    }
  }

  if (row.action === 'created' || row.action === 'deleted') {
    const added = row.action === 'created'
    return {
      verb: added ? ADDED[row.entity] || 'Added' : 'Deleted',
      tone: added ? TONES.added : TONES.removed,
      item,
      changes: Object.entries(details)
        .map(([key, value]) => valueLine(key, value))
        .filter(Boolean),
    }
  }

  // updated: a yes / no switch, a status or a password reset names the
  // verb; every other change is listed
  let verb = ''
  let tone = TONES.changed
  const changes = []

  for (const [key, change] of Object.entries(details)) {
    if (key === 'password_reset') {
      verb ||= 'Reset password'
      tone = TONES.info
      continue
    }
    // their own password (supabase/functions/set-password)
    if (key === 'password_changed') {
      verb ||= 'Changed password'
      tone = TONES.info
      changes.push(change === 'reset email' ? 'With a "Forgot password?" email' : 'In Profile')
      continue
    }
    const from = isObj(change) ? change.from : undefined
    const to = isObj(change) ? change.to : change

    if (FLAGS[key] && !verb) {
      const [onWord, offWord] = FLAGS[key]
      const [word, toneKey] = to ? onWord : offWord
      verb = word
      tone = TONES[toneKey]
      continue
    }
    if (key === 'status' && !verb && (to === 'approved' || to === 'rejected')) {
      verb = title(to)
      tone = to === 'approved' ? TONES.added : TONES.removed
      continue
    }
    changes.push(changeLine(key, from, to))
  }

  return { verb: verb || 'Changed', tone, item, changes }
}
