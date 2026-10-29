"use server";

import { revalidatePath } from "next/cache";
import { db, getTenantId } from "@/lib/data/client";

const STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;

export async function setTicketStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(STATUSES as readonly string[]).includes(status)) throw new Error("Invalid ticket update");
  const tenantId = await getTenantId();
  const { error } = await db().from("support_tickets").update({ status }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not update the ticket: ${error.message}`);
  revalidatePath("/admin/support");
}
