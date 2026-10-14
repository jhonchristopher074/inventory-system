// POST /functions/v1/admin-action
// Body: { action: "set_role" | "toggle_active" | "reset_password",
//         user_id: string, role?: string, admin_password: string }
//
// The ONE admin must re-type their own password for every action here.
// Checked on the server — the browser cannot skip it.
import {
  adminClient, anonClient, corsHeaders, generateTempPassword, getCaller, isAdmin,
  json, ROLE_TABLE, tempPasswordMetadata,
} from "../_shared/auth.ts";

// The admin role can never be handed out: there is only one admin.
const ASSIGNABLE_ROLES = ["cashier", "staff", "supplier"];
const ACTIONS = ["set_role", "toggle_active", "reset_password"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Not authenticated" }, 401);
  if (!(await isAdmin(caller))) return json({ error: "Only the administrator can do this" }, 403);

  let body: { action?: string; user_id?: string; role?: string; admin_password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  const action = body.action ?? "";
  const userId = body.user_id ?? "";
  const adminPassword = body.admin_password ?? "";

  if (!ACTIONS.includes(action)) return json({ error: "Unknown action" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Invalid user" }, 400);
  if (!adminPassword) return json({ error: "Enter your password to confirm" }, 400);
  if (userId === caller.id) return json({ error: "You can't do this to your own account" }, 400);
  if (action === "set_role" && !ASSIGNABLE_ROLES.includes(body.role ?? "")) {
    return json({ error: "Invalid role" }, 400);
  }

  // Re-check the admin's password (goes through Supabase Auth, so its
  // built-in sign-in rate limiting applies to wrong guesses).
  const { error: pwError } = await anonClient().auth.signInWithPassword({
    email: caller.email!,
    password: adminPassword,
  });
  if (pwError) return json({ error: "Incorrect password" }, 403);

  const admin = adminClient();
  const { data: target } = await admin
    .from(ROLE_TABLE)
    .select("id, role, is_active, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return json({ error: "User not found" }, 404);
  if (target.role === "admin") return json({ error: "The admin account can't be changed" }, 403);

  if (action === "set_role") {
    const { error } = await admin.from(ROLE_TABLE).update({ role: body.role }).eq("id", userId);
    if (error) return json({ error: "Could not change the role" }, 500);
    return json({ ok: true });
  }

  if (action === "toggle_active") {
    const { error } = await admin
      .from(ROLE_TABLE)
      .update({ is_active: !(target.is_active ?? true) })
      .eq("id", userId);
    if (error) return json({ error: "Could not update the account" }, 500);
    return json({ ok: true });
  }

  // reset_password: new one-time temporary password, shown once to the admin.
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !existing.user) return json({ error: "User not found" }, 404);

  const tempPassword = generateTempPassword();
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
    app_metadata: { ...existing.user.app_metadata, ...tempPasswordMetadata() },
  });
  if (error || !data.user) return json({ error: "Could not reset the password" }, 500);

  return json({
    ok: true,
    email: data.user.email,
    temp_password: tempPassword, // shown to the admin once, then discarded
    expires_at: data.user.app_metadata.temp_password_expires_at,
  });
});