// POST /functions/v1/admin-action
// Body: { action: "set_role" | "toggle_active" | "reset_password" | "rename" | "change_email",
//         user_id: string, role?: string, full_name?: string, email?: string,
//         admin_password: string }
//
// "rename" and "change_email" are the only ways to change a name or email:
// users can't change their own. Both may also be used on the admin's own
// account. A new email is the new login right away (no confirmation mail).
//
// The ONE admin must re-type their own password for every action here.
// Checked on the server — the browser cannot skip it.
import {
  adminClient, anonClient, corsHeaders, generateTempPassword, getCaller, isAdmin,
  json, ROLE_TABLE, tempPasswordMetadata,
} from "../_shared/auth.ts";

// The admin role can never be handed out: there is only one admin.
const ASSIGNABLE_ROLES = ["cashier", "staff", "supplier"];
const ACTIONS = ["set_role", "toggle_active", "reset_password", "rename", "change_email"];
// the actions also allowed on the admin's own account
const SELF_ACTIONS = ["rename", "change_email"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Not authenticated" }, 401);
  if (!(await isAdmin(caller))) return json({ error: "Only the administrator can do this" }, 403);

  let body: {
    action?: string; user_id?: string; role?: string; full_name?: string; email?: string;
    admin_password?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  const action = body.action ?? "";
  const userId = body.user_id ?? "";
  const adminPassword = body.admin_password ?? "";
  const fullName = (body.full_name ?? "").trim().replace(/\s+/g, " ");
  const email = (body.email ?? "").trim().toLowerCase();

  if (!ACTIONS.includes(action)) return json({ error: "Unknown action" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Invalid user" }, 400);
  if (!adminPassword) return json({ error: "Enter your password to confirm" }, 400);
  if (userId === caller.id && !SELF_ACTIONS.includes(action)) {
    return json({ error: "You can't do this to your own account" }, 400);
  }
  if (action === "set_role" && !ASSIGNABLE_ROLES.includes(body.role ?? "")) {
    return json({ error: "Invalid role" }, 400);
  }
  if (action === "rename" && (!fullName || fullName.length > 80)) {
    return json({ error: "Enter a name (up to 80 characters)" }, 400);
  }
  if (action === "change_email" && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return json({ error: "Enter a valid email address" }, 400);
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

  if (action === "rename") {
    const { error } = await admin.from(ROLE_TABLE).update({ full_name: fullName }).eq("id", userId);
    if (error) return json({ error: "Could not rename the account" }, 500);

    // keep the login's own copy of the name in step
    const { data: existing } = await admin.auth.admin.getUserById(userId);
    if (existing?.user) {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...existing.user.user_metadata, full_name: fullName },
      });
    }

    return json({ ok: true, full_name: fullName });
  }

  if (action === "change_email") {
    const oldEmail = (target.email ?? "").toLowerCase();
    if (email === oldEmail) return json({ error: "That is already this account's email" }, 400);

    // the login first: it refuses an email another account already uses
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (authErr) {
      const taken = /already|registered|exists|unique/i.test(authErr.message);
      return json({ error: taken ? "Another account already uses that email" : "Could not change the email" }, 400);
    }

    // then the profile; if that fails, put the login back so the two still match
    const { error } = await admin.from(ROLE_TABLE).update({ email }).eq("id", userId);
    if (error) {
      if (oldEmail) await admin.auth.admin.updateUserById(userId, { email: oldEmail, email_confirm: true });
      return json({ error: "Could not change the email" }, 500);
    }

    return json({ ok: true, email });
  }

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