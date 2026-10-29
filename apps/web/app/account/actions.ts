"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { lookupOrder, type LookedUpOrder } from "@/lib/data/orderLookup";
import { db, getTenantId } from "@/lib/data/client";
import { getEmailProvider } from "@/lib/email/getEmailProvider";
import { parseOrderReference, orderReference } from "@/lib/orderReference";

function requesterIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "unknown";
}

export type LookupState = { order: LookedUpOrder | null; error: string | null; searched: boolean };

/** Order lookup by email + reference. Rate-limited per IP so references can't be enumerated. */
export async function lookupOrderAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const limit = checkRateLimit(`order-lookup:${requesterIp()}`, 10, 600);
  if (!limit.allowed) return { order: null, error: "Too many lookups — please wait a few minutes and try again.", searched: true };

  const email = String(formData.get("email") ?? "");
  const reference = String(formData.get("reference") ?? "");
  if (!parseOrderReference(reference)) {
    return { order: null, error: "Enter the 8-character order reference from your confirmation (e.g. 4D426D11).", searched: true };
  }
  try {
    const order = await lookupOrder(email, reference);
    return order
      ? { order, error: null, searched: true }
      : { order: null, error: "We couldn't find an order with that email and reference. Check both and try again.", searched: true };
  } catch (error) {
    console.error(`[order-lookup] ${error instanceof Error ? error.message : error}`);
    return { order: null, error: "We couldn't look that up right now — please try again shortly.", searched: true };
  }
}

const CATEGORIES = ["ORDER", "PRODUCT", "WARRANTY", "RETURN", "DELIVERY", "OTHER"] as const;
const supportSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(40).optional(),
  category: z.enum(CATEGORIES),
  message: z.string().trim().min(10).max(5000),
});

export type SupportState = { ok: boolean; error: string | null };

/**
 * The support form used to show "we've received your message" and send nothing anywhere. It now
 * stores a support_tickets row (visible in Admin → Support) and emails the store's contact
 * address when one is set. support_tickets has no email column, so the ticket links to the
 * customer record for that email, creating one if this is someone who hasn't ordered yet.
 */
export async function submitSupportAction(_prev: SupportState, formData: FormData): Promise<SupportState> {
  const limit = checkRateLimit(`support:${requesterIp()}`, 5, 3600);
  if (!limit.allowed) return { ok: false, error: "You've sent several messages recently — please wait a little before sending another." };

  const parsed = supportSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    reference: formData.get("reference") || undefined,
    category: formData.get("category"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { ok: false, error: "Please enter a valid email and a message of at least 10 characters." };
  const input = parsed.data;

  try {
    const tenantId = await getTenantId();
    const supabase = db();
    const email = input.email.toLowerCase();

    // Find-or-create, without overwriting an existing customer's name or phone from a form anyone can fill in.
    let { data: customer } = await supabase.from("customers").select("id").eq("tenant_id", tenantId).ilike("email", email).maybeSingle();
    if (!customer) {
      const { data: created, error } = await supabase
        .from("customers")
        .insert({ tenant_id: tenantId, email, name: input.name ?? null })
        .select("id")
        .single();
      if (error) {
        // Created concurrently — read the winner's row.
        ({ data: customer } = await supabase.from("customers").select("id").eq("tenant_id", tenantId).ilike("email", email).maybeSingle());
      } else {
        customer = created;
      }
    }

    const ref = input.reference ? parseOrderReference(input.reference) : null;
    const { error: ticketError } = await supabase.from("support_tickets").insert({
      tenant_id: tenantId,
      customer_id: (customer?.id as string | undefined) ?? null,
      order_reference: ref ? ref.toUpperCase() : input.reference ?? null,
      category: input.category,
      subject: `${input.category.charAt(0)}${input.category.slice(1).toLowerCase()} enquiry from ${email}`,
      message: input.message,
    });
    if (ticketError) throw new Error(ticketError.message);

    const { data: settings } = await supabase.from("tenant_settings").select("contact_email").eq("tenant_id", tenantId).maybeSingle();
    const notify = settings?.contact_email as string | undefined;
    if (notify) {
      await getEmailProvider()
        .sendTransactionalEmail({
          to: notify,
          templateKey: "support-ticket",
          subject: `New support message (${input.category.toLowerCase()})${ref ? ` — order ${orderReference(ref)}` : ""}`,
          data: { from: email, name: input.name ?? null, category: input.category, reference: ref ? ref.toUpperCase() : input.reference ?? null, message: input.message },
        })
        .catch((error: unknown) => console.error(`[support] notification email failed: ${error instanceof Error ? error.message : error}`));
    }

    return { ok: true, error: null };
  } catch (error) {
    console.error(`[support] ${error instanceof Error ? error.message : error}`);
    return { ok: false, error: "We couldn't send your message right now — please try again shortly." };
  }
}
