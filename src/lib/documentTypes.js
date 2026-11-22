// The kinds of Documentation records, and the colour of each one's tag:
// the same on the Owner's Documentation page and on the Staff's (where every
// tag used to be red, so an inspection result looked like a product report).
//
//   Order Receipt         blue    a supplier's receipt
//   Inspection Document   green   an inspection the owner decided
//   Product Report        red     a problem with a product
//   Staff Documentation   amber   a staff member's own record
//   Inspection Note       violet  a staff member's note on an inspection
//   Refunded              orange  a refund made at the POS
export const DOCUMENT_TYPES = [
  'Order Receipt',
  'Inspection Document',
  'Product Report',
  'Staff Documentation',
  'Inspection Note',
  'Refunded',
]

const TYPE_CLASSES = {
  'Order Receipt': 'bg-blue-600/20 text-blue-400',
  'Inspection Document': 'bg-emerald-600/20 text-emerald-400',
  'Product Report': 'bg-red-600/20 text-red-400',
  'Staff Documentation': 'bg-amber-500/20 text-amber-300',
  'Inspection Note': 'bg-violet-500/20 text-violet-300',
  Refunded: 'bg-orange-500/20 text-orange-300',
}

// any other (an old record's own type): grey
export function documentTypeClass(type) {
  return TYPE_CLASSES[type] || 'bg-zinc-700 text-zinc-300'
}
