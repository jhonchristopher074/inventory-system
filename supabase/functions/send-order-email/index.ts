// Emails a supplier the order the Owner or Manager just sent (Inventory >
// Low stock > Reorder). POST { order_id }   (called by the app right after
// admin_create_purchase_order, and by "Send email again")
//
// One file, no shared imports, so it can be pasted into
// Supabase > Edge Functions > Deploy a new function > Via editor
// (name it send-order-email).
//
// Secrets (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY       from resend.com (already set for the two-step emails)
//   ORDER_FROM           who it's from, e.g. "10 FIVE 7 Hardware <orders@10five7hardware.com>".
//                        Needs 10five7hardware.com verified in Resend
//                        (Domains > Add domain, then the DNS records at
//                        Hostinger). Without a verified domain Resend only
//                        delivers to your own Resend address, and the app
//                        shows "Not emailed" with the reason.
//   OWNER_NOTIFY_EMAIL   optional: where the supplier's reply goes
//
// Safe to call from the browser: only a logged-in Owner or Manager, only
// an order the database says is waiting for its email (status 'to_send'),
// only to that order's supplier, and only once (it's claimed first).
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
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // who is calling: a logged-in Owner or Manager
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return json({ error: "Not logged in" }, 401);

  const { data: caller } = await admin.from("profiles").select("role, is_active").eq("id", auth.user.id).maybeSingle();
  if (!caller || caller.is_active === false || !["admin", "manager"].includes(caller.role)) {
    return json({ error: "Not allowed" }, 403);
  }

  let orderId: number;
  try {
    orderId = Number((await req.json())?.order_id);
  } catch {
    return json({ error: "Send { order_id }" }, 400);
  }
  if (!Number.isFinite(orderId)) return json({ error: "Send { order_id }" }, 400);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    await admin.from("purchase_orders").update({ status: "failed", error: "Email is not set up (no RESEND_API_KEY)" })
      .eq("id", orderId).eq("status", "to_send");
    return json({ sent: false, reason: "Email is not set up" });
  }

  // claim it: only one call can send it
  const { data: order } = await admin
    .from("purchase_orders")
    .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
    .eq("id", orderId)
    .eq("status", "to_send")
    .eq("order_status", "requested")
    .select("id, supplier_name, supplier_email, note, created_by_name, created_at")
    .maybeSingle();

  if (!order) return json({ sent: false, reason: "Nothing waiting to be emailed" });

  async function fail(reason: string) {
    await admin.from("purchase_orders").update({ status: "failed", sent_at: null, error: reason.slice(0, 300) }).eq("id", orderId);
    return json({ sent: false, reason }, 502);
  }

  if (!order.supplier_email) return fail("This supplier has no email");

  const { data: items } = await admin
    .from("purchase_order_items")
    .select("product_name, qty")
    .eq("order_id", orderId)
    .order("id");

  const day = new Date(order.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
  const rows = (items ?? [])
    .map((item) => `<tr><td style="padding:8px 10px;border-top:1px solid #eee">${escapeHtml(item.product_name)}</td>` +
      `<td style="padding:8px 10px;border-top:1px solid #eee;text-align:right;font-weight:bold">${Number(item.qty)} pcs</td></tr>`)
    .join("");
  const note = order.note ? `<p style="margin:0 0 14px"><b>Note:</b> ${escapeHtml(order.note)}</p>` : "";
  const replyTo = Deno.env.get("OWNER_NOTIFY_EMAIL");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ORDER_FROM") ?? Deno.env.get("NOTIFY_FROM") ?? "10 FIVE 7 Hardware <onboarding@resend.dev>",
      to: [order.supplier_email],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `Order #${order.id} from 10 FIVE 7 Hardware`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;color:#222">
          <table style="border-collapse:collapse;margin:0 0 18px"><tr>
            <td style="padding:0 12px 0 0;vertical-align:middle">
              <img src="https://10five7hardware.com/apple-touch-icon.png" width="48" height="48" alt="10 FIVE 7 Hardware" style="display:block;border-radius:12px">
            </td>
            <td style="vertical-align:middle">
              <div style="font-size:18px;font-weight:bold;color:#111">10 FIVE 7 <span style="color:#e01b32">Hardware</span></div>
              <div style="font-size:12px;color:#777">Inventory Management System</div>
            </td>
          </tr></table>
          <h2 style="color:#e01b32;margin:0 0 6px">Order #${order.id}</h2>
          <p style="margin:0 0 14px;color:#555">From 10 FIVE 7 Hardware · ${escapeHtml(day)}${order.created_by_name ? ` · by ${escapeHtml(order.created_by_name)}` : ""}</p>
          <p style="margin:0 0 10px">Hello ${escapeHtml(order.supplier_name)}, we would like to order:</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 14px;font-size:14px">
            <tr style="background:#f6f6f6"><th style="padding:8px 10px;text-align:left">Product</th><th style="padding:8px 10px;text-align:right">Quantity</th></tr>
            ${rows}
          </table>
          ${note}
          <p style="margin:0 0 6px">Please log in at <a href="https://10five7hardware.com">10five7hardware.com</a> and open <b>Orders</b> to accept it with your delivery date, or to decline it.</p>
          <p style="margin:0;color:#777;font-size:13px">Thank you!</p>
        </div>`,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Resend refused the order email:", response.status, text);
    let reason = `The email service refused it (${response.status})`;
    try {
      const message = JSON.parse(text)?.message;
      if (message) reason = String(message);
    } catch {
      // keep the plain reason
    }
    return fail(reason);
  }

  return json({ sent: true });
});
