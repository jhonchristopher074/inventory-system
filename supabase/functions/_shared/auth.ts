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

// Returns the logged-in user who called the function, or null.
export async function getCaller(req: Request): Promise<User | null> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
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
  // Always read the CURRENT role from the profiles table, so demoting or
  // disabling an admin takes effect immediately.
  const { data } = await adminClient()
    .from(ROLE_TABLE)
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return data?.role === ADMIN_ROLE && data?.is_active !== false;
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
  if (pw.length > 72) return "Password must be at most 72 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain a symbol.";
  return null;
}