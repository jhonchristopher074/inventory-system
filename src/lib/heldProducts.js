// Products that exist by name only: new products the receipt scanner
// created for a receipt that isn't confirmed or received yet. They have
// 0 stock and ₱0 until then, so the POS, Inventory and the dashboards
// leave them out (they showed as "Out of stock ₱0.00" and set off
// out-of-stock alerts, for days while a delivery was awaited).
// Check prices still shows them: it's where they're priced.
//
// list_held_product_ids: supabase/migrations/20261102000004_receiving_auto_add.sql.
// Until it's run, nothing is left out.
import { supabase } from './supabase'

export async function heldProductIds() {
  const { data, error } = await supabase.rpc('list_held_product_ids')
  if (error) return new Set()
  return new Set((data || []).map((row) => String(row.product_id)))
}

export function withoutHeld(products, held) {
  const list = products || []
  return held && held.size > 0 ? list.filter((product) => !held.has(String(product.id))) : list
}
