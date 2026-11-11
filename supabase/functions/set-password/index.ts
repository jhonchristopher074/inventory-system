// POST /functions/v1/set-password
// Body: { new_password: string, current_password?: string }
// Saves a new password for the caller, on the server.
//
// Supabase refuses a password change from a login that hasn't entered the
// authenticator app's code ("AAL2 session is required ..."). So an Owner
// with two-step verification on couldn't:
//   - finish a "Forgot password?" reset (that login comes from the email,
//     before any code), or
//   - change it in Profile after logging in with the email code.
// The pages try Supabase first and come here only when it says that.
//
// Two ways in:
//   - right after the reset email (its code or link, in the last hour): no
//     current password, same as the reset page always worked. Logging in
//     afterwards still asks for the two-step code.
//   - logged in: the current password, and this login passed two-step
//     verification.
import {
  adminClient, anonClient, corsHeaders, getCaller, json, logActivity, mfaOk, validateNewPassword,
} from "../_shared/auth.ts";

// sign-in methods that prove the person can read the account's email
const EMAIL_METHODS = ["recovery", "otp", "magiclink"];
const WINDOW_SECONDS = 60 * 60;

type AmrEntry = { method?: string; timestamp?: number };

// The claims of the caller's access token. Safe to read here: getCaller()
// has already checked the token with Supabase Auth.
function amrOf(req: Request): AmrEntry[] {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const part = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return Array.isArray(claims.amr) ? claims.amr : [];
  } catch {
    return [];
  }
}

function signedInFromEmail(req: Request): boolean {
  const now = Math.floor(Date.now() / 1000);
  return amrOf(req).some((entry) =>
    EMAIL_METHODS.includes(entry?.method ?? "") &&
    now - Number(entry?.timestamp ?? 0) <= WINDOW_SECONDS
  );
}

// Is this the account's password? Checked through Supabase Auth (its rate
// limits apply); the short session it makes is ended right away.
async function passwordWorks(email: string, password: string): Promise<boolean> {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await adminClient().auth.admin.signOut(data.session.access_token, "local").catch(() => {});
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller || !caller.email) return json({ error: "Not authenticated" }, 401);

  let body: { new_password?: string; current_password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
  const next = body.new_password ?? "";
  const current = body.current_password ?? "";

  const ruleError = validateNewPassword(next);
  if (ruleError) return json({ error: ruleError }, 400);

  const fromEmail = signedInFromEmail(req);

  if (!fromEmail) {
    // the Profile window: this login passed two-step verification, and
    // knows the password it's replacing
    if (!(await mfaOk(caller))) {
      return json({ error: "Enter your two-step verification code first." }, 403);
    }
    if (!current) return json({ error: "Enter your current password." }, 400);
    if (next === current) return json({ error: "The new password must be different from the current one." }, 400);
    if (!(await passwordWorks(caller.email, current))) {
      return json({ error: "Incorrect password. Please try again." }, 400);
    }
  } else if (await passwordWorks(caller.email, next)) {
    // the reset page: same rule as Supabase's own
    return json({ error: "Choose a password that is different from your old one." }, 400);
  }

  const meta = caller.app_metadata ?? {};
  const { error } = await adminClient().auth.admin.updateUserById(caller.id, {
    password: next,
    app_metadata: {
      ...meta,
      // a reset from the email also ends a temporary password
      ...(fromEmail ? { must_change_password: false, temp_password_expires_at: null } : {}),
      password_changed_at: new Date().toISOString(),
    },
  });

  if (error) {
    const weak = /weak|pwned|leaked/i.test(error.message);
    return json(
      { error: weak ? "That password is too common. Choose another one." : "Could not save the password." },
      weak ? 400 : 500,
    );
  }

  await logActivity(caller, {
    action: "updated",
    entity: "account",
    entity_id: caller.id,
    entity_name: caller.email,
    details: { password_changed: fromEmail ? "reset email" : "profile" },
  });

  return json({ ok: true });
});
