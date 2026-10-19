// POST /functions/v1/finish-password-reset
// Body: none.
// Called by the "Set a new password" page right after a "Forgot password?"
// reset, for an account still marked as having a temporary password.
//
// Without this, an employee who never replaced their first temporary
// password was stuck after resetting it by email: logging in still said
// "Your temporary password has expired" (or sent them to Change password,
// asking for a temporary password they no longer had).
//
// Only works with a session that came from the email (the code or the link)
// in the last hour, so an open session on a shared computer can't be used
// to skip the "change your temporary password" step.
import { adminClient, corsHeaders, getCaller, json } from "../_shared/auth.ts";

// sign-in methods that prove the person can read the account's email
const EMAIL_METHODS = ["recovery", "otp", "magiclink"];
const WINDOW_SECONDS = 60 * 60;

type AmrEntry = { method?: string; timestamp?: number };

// The claims of the caller's access token. Safe to read here: getCaller()
// has already checked the token with Supabase Auth.
function tokenClaims(req: Request): { amr?: AmrEntry[] } {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const part = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
  } catch {
    return {};
  }
}

function signedInFromEmail(req: Request): boolean {
  const amr = tokenClaims(req).amr;
  const now = Math.floor(Date.now() / 1000);

  return Array.isArray(amr) && amr.some((entry) =>
    EMAIL_METHODS.includes(entry?.method ?? "") &&
    now - Number(entry?.timestamp ?? 0) <= WINDOW_SECONDS
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Not authenticated" }, 401);

  if (!signedInFromEmail(req)) {
    return json({ error: "Only allowed right after a password reset from the email." }, 403);
  }

  const meta = caller.app_metadata ?? {};
  if (!meta.must_change_password) return json({ ok: true }); // nothing to clear

  const { error } = await adminClient().auth.admin.updateUserById(caller.id, {
    app_metadata: {
      ...meta,
      must_change_password: false,
      temp_password_expires_at: null,
      password_changed_at: new Date().toISOString(),
    },
  });

  if (error) return json({ error: "Could not finish the reset" }, 500);

  return json({ ok: true });
});
