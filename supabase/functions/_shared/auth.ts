// Shared helpers for the temporary-password Edge Functions.
// Runs on the server (Supabase Edge Functions), never in the browser.
import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js@2";

export const TEMP_PASSWORD_TTL_HOURS = Number(Deno.env.get("TEMP_PASSWORD_TTL_HOURS") ?? "24");

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Admin client: full privileges. The service_role key is provided
// automatically to Edge Functions and never reaches the browser.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Fresh anon client used only to verify a password, without keeping a session.
export function anonClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// What the login's token says: its assurance level ('aal2' after an
// authenticator code) and its session id (the email code is kept per
// session). The token was already checked by auth.getUser, so reading it
// is safe.
function tokenClaims(token: string): { aal: string; sessionId: string } {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
    return { aal: payload.aal ?? "aal1", sessionId: payload.session_id ?? "" };
  } catch {
    return { aal: "aal1", sessionId: "" };
  }
}

export type Caller = User & { aal: string; sessionId: string };

// Returns the logged-in user who called the function, or null.
export async function getCaller(req: Request): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { ...data.user, ...tokenClaims(token) };
}

// Two-step verification (supabase/migrations/20261117000001) is off, or
// this login passed it: the authenticator code (aal2) or the email code
// (its session in two_step_sessions).
export async function mfaOk(user: User & { aal?: string; sessionId?: string }): Promise<boolean> {
  const app = (user.factors ?? []).some((factor) => factor.status === "verified");
  if (app && user.aal === "aal2") return true;

  const admin = adminClient();
  const { data: email, error } = await admin.from("two_step_email").select("user_id").eq("user_id", user.id).maybeSingle();
  // before the SQL is run there's no table: only the app counts
  if (error) return !app;
  if (!app && !email) return true;
  if (!email || !user.sessionId) return false;

  const { data: session } = await admin
    .from("two_step_sessions")
    .select("session_id")
    .eq("session_id", user.sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(session);
}

// ---------------------------------------------------------------------
// ADAPT THIS to how your system stores roles.
// Default assumption: a `profiles` table with columns `id` (= auth user id)
// and `role` ('admin' | 'staff' | ...).
// If your roles live elsewhere (e.g. an `employees` table, or
// app_metadata.role), change this one function.
// ---------------------------------------------------------------------
export const ROLE_TABLE = Deno.env.get("ROLE_TABLE") ?? "profiles";
export const ADMIN_ROLE = Deno.env.get("ADMIN_ROLE") ?? "admin";

export async function isAdmin(user: User): Promise<boolean> {
  if (user.app_metadata?.must_change_password) return false; // admins must also finish setup
  if (!(await mfaOk(user))) return false; // the 6-digit code wasn't entered
  // Always read the CURRENT role from the profiles table, so demoting or
  // disabling an admin takes effect immediately.
  const { data } = await adminClient()
    .from(ROLE_TABLE)
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return data?.role === ADMIN_ROLE && data?.is_active !== false;
}

// One row in the Owner's Activity log (supabase/migrations/20261116000001).
// Never fails the action: before that SQL is run, the row is just skipped.
export async function logActivity(
  actor: User,
  entry: { action: string; entity: string; entity_id?: string; entity_name?: string; details?: Record<string, unknown> },
): Promise<void> {
  try {
    const admin = adminClient();
    const { data: who } = await admin.from(ROLE_TABLE).select("full_name, role").eq("id", actor.id).maybeSingle();
    await admin.from("activity_log").insert({
      actor_id: actor.id,
      actor_name: who?.full_name ?? actor.email ?? null,
      actor_role: who?.role ?? null,
      details: {},
      ...entry,
    });
  } catch {
    // the log is a record, not a gate
  }
}

// The caller's role if the account is active ('admin', 'manager', ...), else null.
export async function activeRole(user: User): Promise<string | null> {
  if (user.app_metadata?.must_change_password) return null;
  if (!(await mfaOk(user))) return null; // the 6-digit code wasn't entered
  const { data } = await adminClient()
    .from(ROLE_TABLE)
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return data && data.is_active !== false ? data.role : null;
}

// Cryptographically secure temporary password: 8 chars, letters + numbers only;
// always contains an uppercase letter, a lowercase letter and a digit. Ambiguous characters (0/O, 1/l/I) removed
// so it's easier to read aloud or type.
export function generateTempPassword(length = 8): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  const pick = (set: string) => {
    const buf = new Uint32Array(1);
    // rejection sampling to avoid modulo bias
    const limit = Math.floor(0x100000000 / set.length) * set.length;
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return set[buf[0] % set.length];
  };

  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));

  // Fisher–Yates shuffle with secure randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function tempPasswordMetadata() {
  const expires = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 60 * 60 * 1000);
  return {
    must_change_password: true,
    temp_password_expires_at: expires.toISOString(),
  };
}

// Same rules are shown on the Change Password page.
export function validateNewPassword(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 24) return "Password must be at most 24 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain a symbol.";
  return null;
}