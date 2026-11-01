// Emails the owner that a product was disabled at the POS.
// POST { product_id }   (called by the POS right after disable_product)
//
// One file, no shared imports, so it can be pasted into
// Supabase > Edge Functions > Deploy a new function > Via editor.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY       from resend.com (free plan: 100 emails a day)
//   OWNER_NOTIFY_EMAIL   where the email goes. On Resend's free plan, without
//                        your own domain, this must be the email you signed
//                        up to Resend with.
//   NOTIFY_FROM          optional; default "10 FIVE 7 Hardware <onboarding@resend.dev>"
// Without RESEND_API_KEY / OWNER_NOTIFY_EMAIL it answers { sent: false } and
// the owner still gets the notification in the app.
//
// Safe to call from the browser: it only emails about a product the
// database says was disabled in the last 10 minutes and not emailed yet,
// to the fixed owner address, so it can't be used to send other emails.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // who is calling: a logged-in cashier or the owner
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: "Not logged in" }, 401);

  const { data: caller } = await admin.from("profiles").select("role, is_active").eq("id", auth.user.id).maybeSingle();
  if (!caller || caller.is_active === false || !["cashier", "admin"].includes(caller.role)) {
    return json({ error: "Not allowed" }, 403);
  }

  let productId: number;
  try {
    productId = Number((await req.json())?.product_id);
  } catch {
    return json({ error: "Send { product_id }" }, 400);
  }
  if (!Number.isFinite(productId)) return json({ error: "Send { product_id }" }, 400);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("OWNER_NOTIFY_EMAIL");
  if (!apiKey || !to) return json({ sent: false, reason: "Email is not set up" });

  // only a fresh disable, and only once: the email is claimed first (one
  // update), so two calls at the same moment can't both send it
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: product } = await admin
    .from("products")
    .update({ disabled_emailed_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("is_disabled", true)
    .is("disabled_emailed_at", null)
    .gte("disabled_at", since)
    .select("id, name, disabled_reason, disabled_by_name, disabled_at")
    .maybeSingle();

  if (!product) return json({ sent: false, reason: "Nothing new to email" });

  const when = new Date(product.disabled_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const name = escapeHtml(product.name ?? "A product");
  const by = escapeHtml(product.disabled_by_name ?? "A cashier");
  const reason = escapeHtml(product.disabled_reason ?? "");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM") ?? "10 FIVE 7 Hardware <onboarding@resend.dev>",
      to: [to],
      subject: `Product disabled at the POS: ${product.name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px">
          <h2 style="color:#e01b32;margin:0 0 12px">Product disabled at the POS</h2>
          <p style="margin:0 0 6px"><b>${name}</b> can't be sold until you enable it again.</p>
          <p style="margin:0 0 6px">Reason: ${reason}</p>
          <p style="margin:0 0 16px;color:#555">Disabled by ${by} on ${escapeHtml(when)}.</p>
          <p style="margin:0;color:#555">Open Inventory in the 10 FIVE 7 system to check it and press Enable.</p>
        </div>`,
    }),
  });

  if (!response.ok) {
    console.error("Resend refused the email:", response.status, await response.text());
    // not sent: let the next try send it
    await admin.from("products").update({ disabled_emailed_at: null }).eq("id", productId);
    return json({ sent: false, reason: "The email service refused it" }, 502);
  }

  return json({ sent: true });
});
