// Disabled products (supabase/migrations/20261101000004_pos_disable_products.sql).
//
// The cashier (or the owner) disables a product at the POS with a reason:
// it can't be sold until the owner enables it again, and the owner is told
// (a notification in the app, made by the database, and an email through
// the notify-owner-email Edge Function when that is set up).
// Not the same as archiving: a disabled product stays in Inventory and the
// POS, marked "Disabled".
import { ref } from 'vue'
import { supabase } from './supabase'

// the reasons offered as one tap; anything else can be typed
export const DISABLE_REASONS = ['Damaged or defective', 'Expired', 'Wrong price on the tag', 'Not on the shelf']

const NOT_SET_UP =
  "Disabling isn't set up yet: run supabase/migrations/20261101000004_pos_disable_products.sql in Supabase first."

function explain(error) {
  const text = String(error?.message || '')
  if (error?.code === 'PGRST202' || /could not find the function/i.test(text)) return NOT_SET_UP
  return text || 'Something went wrong. Try again.'
}

export function useDisabledProducts() {
  // product id -> { reason, disabled_at, disabled_by_name }
  const disabled = ref(new Map())

  async function load() {
    const { data, error } = await supabase.rpc('list_disabled_products')
    // SQL not run yet: nothing is disabled
    disabled.value = error ? new Map() : new Map((data || []).map((row) => [String(row.id), row]))
  }

  function infoFor(product) {
    return disabled.value.get(String(product?.id)) || null
  }

  async function disable(product, reason) {
    const { error } = await supabase.rpc('disable_product', {
      p_product_id: product.id,
      p_reason: reason,
    })
    if (error) throw new Error(explain(error))

    // the email to the owner, if it's set up; a failure here changes
    // nothing (the notification in the app is already there)
    supabase.functions
      .invoke('notify-owner-email', { body: { product_id: product.id } })
      .catch(() => {})

    await load()
  }

  async function enable(product) {
    const { error } = await supabase.rpc('enable_product', { p_product_id: product.id })
    if (error) throw new Error(explain(error))
    await load()
  }

  return { disabled, load, infoFor, disable, enable }
}
