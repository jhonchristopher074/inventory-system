import { supabase } from './supabase'

// Product categories, kept by the owner (Inventory > Categories) in the
// table public.categories. The receipt scanner (n8n) reads the same list.
// Products keep the category's name; this one means "none".
export const NO_CATEGORY = 'Uncategorized'

/**
 * The owner's categories: [{ id, name, description, product_count }], by name.
 * null when they can't be read, e.g. the SQL file
 * (supabase/migrations/20261030000001_product_categories.sql) wasn't run
 * yet: pages then work as before, with categories typed by hand.
 */
export async function fetchCategories() {
  const { data, error } = await supabase.rpc('list_categories')

  if (error) {
    console.error('Categories:', error.message)
    return null
  }

  return data || []
}
