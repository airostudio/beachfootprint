import type { EmailProvider } from "../email";
import type { TransactionalEmail } from "../../types";

/**
 * Everything interpolated into these templates comes from outside: product titles are supplier
 * (AliExpress/CSV) text, carrier and tracking values come from the dropship engine. Escaped so a
 * title containing markup can't inject HTML or links into a customer's inbox.
 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links are rendered — a `javascript:` tracking URL becomes plain text. */
function safeUrl(value: unknown): string | undefined {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : undefined;
}

/** Minimal HTML per known template — good enough for a transactional receipt, not a design system. */
function renderBody(email: TransactionalEmail): { subject: string; html: string } {
  const data = email.data as Record<string, unknown>;
  switch (email.templateKey) {
    case "order-confirmation": {
      const items = Array.isArray(data.items) ? (data.items as Array<{ name: string; quantity: number }>) : [];
      const rows = items.map((item) => `<li>${esc(item.quantity)} × ${esc(item.name)}</li>`).join("");
      return {
        subject: email.subject ?? "Your Mira & Muse order is confirmed",
        html: `<p>Thanks for your order! We've received your payment for order <strong>${esc(data.orderReference ?? data.orderId)}</strong>.</p>${rows ? `<ul>${rows}</ul>` : ""}<p>Total: ${esc(data.total)}</p><p>We'll email you again once it ships.</p>`,
      };
    }
    case "order-shipped": {
      const trackingUrl = safeUrl(data.trackingUrl);
      const tracking = trackingUrl ? `<a href="${esc(trackingUrl)}">${esc(data.trackingNumber)}</a>` : esc(data.trackingNumber);
      return {
        subject: email.subject ?? "Your Mira & Muse order has shipped",
        html: `<p>Your order <strong>${esc(data.orderReference ?? data.orderId)}</strong> has shipped via ${esc(data.carrier)}.</p><p>Tracking: ${tracking}</p>`,
      };
    }
    case "support-ticket": {
      return {
        subject: email.subject ?? "New support message",
        html:
          `<p><strong>From:</strong> ${esc(data.name ? `${data.name} <${data.from}>` : data.from)}</p>` +
          `<p><strong>Category:</strong> ${esc(data.category)}${data.reference ? ` · <strong>Order:</strong> ${esc(data.reference)}` : ""}</p>` +
          `<p style="white-space:pre-wrap">${esc(data.message)}</p>` +
          `<p>Reply directly to ${esc(data.from)}. The message is also in Admin → Support.</p>`,
      };
    }
    default:
      return { subject: email.subject ?? email.templateKey, html: `<pre>${esc(JSON.stringify(data, null, 2))}</pre>` };
  }
}

/**
 * Resend adapter, talking to its REST API directly (no SDK dependency — Resend's API is a single
 * POST). Constructed with the deployment's API key and default From address so this stays
 * injectable/testable like the other adapters, rather than reading env vars itself.
 */
export class ResendEmailProvider implements EmailProvider {
  id = "resend";
  displayName = "Resend";

  constructor(
    private readonly apiKey: string,
    private readonly defaultFrom: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendTransactionalEmail(email: TransactionalEmail): Promise<{ id: string }> {
    const { subject, html } = renderBody(email);
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.fromOverride ?? this.defaultFrom,
        to: email.to,
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend rejected email (${response.status}): ${body || response.statusText}`);
    }
    const result = (await response.json()) as { id: string };
    return { id: result.id };
  }
}
