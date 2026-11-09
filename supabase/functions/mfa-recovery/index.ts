// POST /functions/v1/mfa-recovery
// Body: { code: string }   (one of the 8 recovery codes, e.g. "A1B2C-3D4E5")
//
// Lost phone / no access to the email: the password was already right (the login is at aal1), and a
// recovery code proves the rest. The code is used up, two-step verification
// is turned off for the account (every authenticator removed, the other
// codes deleted), and the app then asks to set it up again.
// Codes are stored hashed (supabase/migrations/20261117000001).
import { adminClient, corsHeaders, getCaller, json, logActivity } from "../_shared/auth.ts";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Not authenticated" }, 401);

  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  // "a1b2c-3d4e5" / "A1B2C 3D4E5" → "A1B2C3D4E5"
  const code = String(body.code ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
  if (code.length !== 10) return json({ error: "A recovery code has 10 letters and numbers, like A1B2C-3D4E5" }, 400);

  const admin = adminClient();
  const hash = await sha256Hex(code);

  const { data: row } = await admin
    .from("mfa_recovery_codes")
    .select("id")
    .eq("user_id", caller.id)
    .eq("code_hash", hash)
    .is("used_at", null)
    .maybeSingle();
  if (!row) return json({ error: "That recovery code isn't right, or was already used" }, 400);

  // used up, at once (a second try with the same code fails)
  const { data: used } = await admin
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  if (!used?.length) return json({ error: "That recovery code was already used" }, 400);

  // two-step verification off: every authenticator of this account
  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: caller.id });
  if (listError) return json({ error: "Could not turn off two-step verification" }, 500);
  for (const factor of factors?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: caller.id });
    if (error) return json({ error: "Could not turn off two-step verification" }, 500);
  }
  await admin.from("mfa_recovery_codes").delete().eq("user_id", caller.id);
  // the email code too (supabase/migrations/20261117000001)
  await admin.from("two_step_email").delete().eq("user_id", caller.id);
  await admin.from("two_step_sessions").delete().eq("user_id", caller.id);

  await logActivity(caller, {
    action: "updated",
    entity: "account",
    entity_id: caller.id,
    entity_name: caller.email ?? "",
    details: { two_step: { from: "on", to: "off (recovery code)" } },
  });

  return json({ ok: true });
});
