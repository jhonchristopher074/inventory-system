// POST /functions/v1/email-2fa
// Body: { action: "send" | "verify", purpose: "login" | "enable" | "disable", code?: string }
//
// Two-step verification by email (supabase/migrations/20261117000001):
//   send    emails a 6-digit code to the account's own email (10 minutes,
//           one a minute, five an hour)
//   verify  checks it (five tries), then:
//             login    this login is verified (until it ends)
//             enable   the Owner turns the email code on
//             disable  the Owner turns it off
// The codes are stored hashed and tied to this login's session.
//
// Email: Resend, the RESEND_API_KEY secret (as notify-owner-email).
// NOTIFY_FROM optional; default "10 FIVE 7 Hardware <onboarding@resend.dev>".
// On Resend's free plan without your own domain, Resend only delivers to
// the email the Resend account was made with: make it the Owner's.
import { adminClient, corsHeaders, getCaller, json, logActivity, mfaOk, ROLE_TABLE } from "../_shared/auth.ts";

const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const WAIT_SECONDS = 60;
const PER_HOUR = 5;
const PURPOSES = ["login", "enable", "disable"];

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigits(): string {
  // no bias: retry the few values above the largest multiple of 1,000,000
  const buffer = new Uint32Array(1);
  let n = 0;
  do {
    crypto.getRandomValues(buffer);
    n = buffer[0];
  } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, "0");
}

// "admin1057h@gmail.com" → "ad••••7h@gmail.com"
function masked(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const keep = name.length <= 4 ? 1 : 2;
  return `${name.slice(0, keep)}${"•".repeat(Math.max(name.length - keep * 2, 2))}${name.slice(-keep)}@${domain}`;
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SUBJECTS: Record<string, string> = {
  login: "Your 10 FIVE 7 login code",
  enable: "Turn on two-step verification",
  disable: "Turn off two-step verification",
};

async function sendEmail(to: string, code: string, purpose: string): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return "Email isn't set up yet (the RESEND_API_KEY secret is missing).";

  const what = purpose === "login" ? "log in" : purpose === "enable" ? "turn on two-step verification" : "turn off two-step verification";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM") ?? "10 FIVE 7 Hardware <onboarding@resend.dev>",
      to: [to],
      subject: `${SUBJECTS[purpose]}: ${code}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px">
          <h2 style="color:#e01b32;margin:0 0 12px">10 FIVE 7 Hardware</h2>
          <p style="margin:0 0 12px">Use this code to ${what}:</p>
          <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
          <p style="margin:0 0 6px;color:#555">It works for ${CODE_MINUTES} minutes.</p>
          <p style="margin:0;color:#555">Didn't try to log in? Someone may know your password: change it now.</p>
        </div>`,
    }),
  });

  if (!response.ok) {
    console.error("Resend refused the email:", response.status, await response.text());
    return "The email service refused to send the code. Check the Resend setup.";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller?.email) return json({ error: "Not authenticated" }, 401);
  if (!/^[0-9a-f-]{36}$/i.test(caller.sessionId)) return json({ error: "Log in again." }, 401);

  let body: { action?: string; purpose?: string; code?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  const action = body.action ?? "";
  const purpose = body.purpose ?? "login";
  if (!["send", "verify"].includes(action) || !PURPOSES.includes(purpose)) {
    return json({ error: "Unknown action" }, 400);
  }

  const admin = adminClient();

  const { data: profile } = await admin.from(ROLE_TABLE).select("role, is_active, full_name").eq("id", caller.id).maybeSingle();
  if (!profile || profile.is_active === false) return json({ error: "This account is disabled." }, 403);

  const { data: emailOn } = await admin.from("two_step_email").select("user_id").eq("user_id", caller.id).maybeSingle();

  // who may ask for what
  if (purpose === "login" && !emailOn) return json({ error: "The email code isn't turned on." }, 400);
  if (purpose === "enable") {
    if (profile.role !== "admin") return json({ error: "Only the owner can turn this on." }, 403);
    if (emailOn) return json({ error: "The email code is already on." }, 400);
  }
  if (purpose === "disable" && !emailOn) return json({ error: "The email code is already off." }, 400);
  // turning it on or off: only from a login that is fully verified
  if (purpose !== "login" && !(await mfaOk(caller))) {
    return json({ error: "Enter your current two-step code first." }, 403);
  }

  /* ---------------- send ---------------- */
  if (action === "send") {
    const { data: recent } = await admin
      .from("two_step_email_codes")
      .select("created_at")
      .eq("user_id", caller.id)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
      .order("created_at", { ascending: false });

    const last = recent?.[0] ? new Date(recent[0].created_at).getTime() : 0;
    const wait = Math.ceil((last + WAIT_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) return json({ error: `Wait ${wait} seconds before asking for a new code.`, wait }, 429);
    if ((recent?.length ?? 0) >= PER_HOUR) {
      // free again one hour after the oldest of these codes
      const oldest = new Date(recent![PER_HOUR - 1].created_at).getTime();
      const free = Math.max(1, Math.ceil((oldest + 3600_000 - Date.now()) / 1000));
      return json({
        error: `${PER_HOUR} codes were sent in the last hour. Try again in ${Math.ceil(free / 60)} min, or use a recovery code.`,
        wait: free,
      }, 429);
    }

    // an older code of this login stops working
    await admin
      .from("two_step_email_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", caller.id)
      .eq("session_id", caller.sessionId)
      .is("used_at", null);

    const code = sixDigits();
    const { data: row, error } = await admin
      .from("two_step_email_codes")
      .insert({
        user_id: caller.id,
        session_id: caller.sessionId,
        purpose,
        code_hash: await sha256Hex(`${caller.id}:${code}`),
        expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) return json({ error: "Could not make a code. Is the SQL (20261117000001) run?" }, 500);

    const failed = await sendEmail(caller.email, code, purpose);
    if (failed) {
      await admin.from("two_step_email_codes").delete().eq("id", row.id);
      return json({ error: failed }, 502);
    }
    return json({ sent: true, to: masked(caller.email), wait: WAIT_SECONDS });
  }

  /* ---------------- verify ---------------- */
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return json({ error: "Enter the 6-digit code from the email." }, 400);

  const { data: sent } = await admin
    .from("two_step_email_codes")
    .select("id, code_hash, attempts, expires_at")
    .eq("user_id", caller.id)
    .eq("session_id", caller.sessionId)
    .eq("purpose", purpose)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sent || new Date(sent.expires_at).getTime() < Date.now()) {
    return json({ error: "That code expired. Send a new one." }, 400);
  }
  if (sent.attempts >= MAX_TRIES) return json({ error: "Too many wrong tries. Send a new code." }, 429);

  if (!sameText(await sha256Hex(`${caller.id}:${code}`), sent.code_hash)) {
    const tries = sent.attempts + 1;
    await admin.from("two_step_email_codes").update({ attempts: tries }).eq("id", sent.id);
    const left = MAX_TRIES - tries;
    return json({ error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code." }, 400);
  }

  // used up, at once (a second try with the same code fails)
  const { data: used } = await admin
    .from("two_step_email_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", sent.id)
    .is("used_at", null)
    .select("id");
  if (!used?.length) return json({ error: "That code was already used. Send a new one." }, 400);

  if (purpose === "login") {
    await admin.from("two_step_sessions").upsert({ session_id: caller.sessionId, user_id: caller.id });
    return json({ ok: true });
  }

  if (purpose === "enable") {
    await admin.from("two_step_email").upsert({ user_id: caller.id });
    // this login counts as verified (an authenticator app, if any, stays:
    // either one works at login)
    await admin.from("two_step_sessions").upsert({ session_id: caller.sessionId, user_id: caller.id });
    await logActivity(caller, {
      action: "updated", entity: "account", entity_id: caller.id, entity_name: profile.full_name || caller.email,
      details: { two_step: { from: "off", to: "on (email)" } },
    });
    return json({ ok: true });
  }

  // disable (the recovery codes stay while the authenticator app is on)
  await admin.from("two_step_email").delete().eq("user_id", caller.id);
  await admin.from("two_step_sessions").delete().eq("user_id", caller.id);
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: caller.id });
  const appOn = (factors?.factors ?? []).some((factor) => factor.status === "verified");
  if (!appOn) await admin.from("mfa_recovery_codes").delete().eq("user_id", caller.id);
  await logActivity(caller, {
    action: "updated", entity: "account", entity_id: caller.id, entity_name: profile.full_name || caller.email,
    details: { two_step: { from: "on (email)", to: "off" } },
  });
  return json({ ok: true });
});
