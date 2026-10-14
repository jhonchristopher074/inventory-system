// POST /functions/v1/complete-password-change
// Body: { current_password: string, new_password: string }
// Called by the logged-in employee from the Change Password page.
// Verifies the temporary password, checks expiry and rules, sets the new
// password and clears the must_change_password flag — all server-side.
import {
  adminClient, anonClient, corsHeaders, getCaller, json, validateNewPassword,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Not authenticated" }, 401);

  const meta = caller.app_metadata ?? {};
  if (!meta.must_change_password) return json({ error: "No password change is pending" }, 400);

  const expiresAt = meta.temp_password_expires_at ? Date.parse(meta.temp_password_expires_at) : 0;
  if (!expiresAt || Date.now() > expiresAt) {
    return json({ error: "Your temporary password has expired. Ask an administrator for a new one.", code: "TEMP_EXPIRED" }, 403);
  }

  let body: { current_password?: string; new_password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
  const current = body.current_password ?? "";
  const next = body.new_password ?? "";

  const ruleError = validateNewPassword(next);
  if (ruleError) return json({ error: ruleError }, 400);
  if (next === current) return json({ error: "New password must be different from the temporary password" }, 400);

  // Confirm the caller really knows the temporary password.
  // (Goes through Supabase Auth, so its built-in rate limiting applies.)
  const { error: verifyErr } = await anonClient().auth.signInWithPassword({
    email: caller.email!,
    password: current,
  });
  if (verifyErr) return json({ error: "Temporary password is incorrect" }, 400);

  const { error: updErr } = await adminClient().auth.admin.updateUserById(caller.id, {
    password: next,
    app_metadata: {
      ...meta,
      must_change_password: false,
      temp_password_expires_at: null,
      password_changed_at: new Date().toISOString(),
    },
  });
  if (updErr) {
    const weak = /weak|pwned|leaked/i.test(updErr.message);
    return json({ error: weak ? "That password is too common. Choose another one." : "Could not update password" }, weak ? 400 : 500);
  }

  return json({ ok: true });
});