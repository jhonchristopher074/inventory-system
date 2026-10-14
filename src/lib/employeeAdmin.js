// Calls the password-protected admin-action Edge Function.
//
//   await adminAction(supabase, 'set_role',       { user_id, role, admin_password })
//   await adminAction(supabase, 'toggle_active',  { user_id, admin_password })
//   await adminAction(supabase, 'reset_password', { user_id, admin_password })
//     -> { email, temp_password, expires_at }

export async function adminAction(supabase, action, payload) {
  const { data, error } = await supabase.functions.invoke('admin-action', {
    body: { action, ...payload },
  })
  if (error) {
    let message = 'Something went wrong. Please try again.'
    try { message = (await error.context.json()).error || message } catch { /* ignore */ }
    throw new Error(message)
  }
  return data
}