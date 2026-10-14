// POST /functions/v1/create-employee
// Body: { email: string, full_name?: string, role: string }
// Admin only. Creates the account with a generated temporary password and
// returns that password ONCE. It is never stored anywhere in plain text.
import {
  adminClient, corsHeaders, generateTempPassword, getCaller, isAdmin, json,
  ROLE_TABLE, tempPasswordMetadata,
} from "../_shared/auth.ts";

// There is only one admin (the owner), so "admin" can never be assigned here.
const ALLOWED_ROLES = (Deno.env.get("ALLOWED_ROLES") ?? "staff,cashier,supplier").split(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Not authenticated" }, 401);
  if (!(await isAdmin(caller))) return json({ error: "Only administrators can create accounts" }, 403);

  let body: { email?: string; full_name?: string; role?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  // The admin may NOT choose the password.
  if ("password" in body) return json({ error: "Passwords are generated automatically" }, 400);

  const email = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "").trim();
  const fullName = (body.full_name ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
  if (!fullName) return json({ error: "Enter the employee's name" }, 400);
  if (!ALLOWED_ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

  const tempPassword = generateTempPassword();
  const admin = adminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { ...tempPasswordMetadata() },
  });

  if (error || !data.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    return json({ error: exists ? "An account with this email already exists" : "Could not create account" }, exists ? 409 : 500);
  }

  // Create the matching row in your profiles table.
  // Columns not listed here use their database defaults
  // (is_active = true, is_hidden = false, created_at = now()).
  const { data: profile, error: profileError } = await admin
    .from(ROLE_TABLE)
    .upsert({ id: data.user.id, email, full_name: fullName, role }, { onConflict: "id" })
    .select("account_no")
    .single();

  if (profileError) {
    // Roll back so we don't leave a half-created account.
    await admin.auth.admin.deleteUser(data.user.id);
    console.error("profile upsert failed:", profileError.message, profileError.code, profileError.details); // no password in logs
    return json({ error: `Could not save employee record: ${profileError.message}` }, 500);
  }

  // If a database trigger already assigned an account number, nothing to do.
  // Otherwise assign the next one (000000010, 000000011, ...), same format
  // as your existing accounts.
  if (!profile?.account_no) {
    const { data: last } = await admin
      .from(ROLE_TABLE)
      .select("account_no")
      .not("account_no", "is", null)
      .order("account_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = String((parseInt(last?.account_no ?? "0", 10) || 0) + 1).padStart(9, "0");
    await admin.from(ROLE_TABLE).update({ account_no: next }).eq("id", data.user.id);
  }

  return json({
    user_id: data.user.id,
    email,
    role,
    temp_password: tempPassword, // shown to the admin once, then discarded
    expires_at: data.user.app_metadata.temp_password_expires_at,
  }, 201);
});