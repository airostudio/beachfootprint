"use server";

import { revalidatePath } from "next/cache";
import { db, getTenantId } from "@/lib/data/client";
import { dispatchSocialPosts, type DispatchSummary } from "@/lib/social/dispatch";
import { checkConnection, metaConfig, type ConnectionCheck } from "@/lib/social/meta";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function describe(summary: DispatchSummary): ActionResult {
  const parts: string[] = [];
  if (summary.posted) parts.push(`${summary.posted} posted`);
  if (summary.failed) parts.push(`${summary.failed} failed`);
  if (summary.retrying) parts.push(`${summary.retrying} will retry`);
  if (summary.skipped) parts.push(`${summary.skipped} skipped`);
  const text = parts.length ? `${parts.join(", ")}.` : summary.note ? "" : "Nothing waiting to post.";
  return { ok: summary.configured && summary.failed === 0, message: [text, summary.note].filter(Boolean).join(" ") };
}

/** Sends everything waiting in the queue now, rather than waiting for the next automatic run. */
export async function postQueuedNow(): Promise<ActionResult> {
  try {
    const result = describe(await dispatchSocialPosts({ deadlineMs: 50_000 }));
    revalidatePath("/admin/social");
    return result;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Posts (or re-posts after a failure) one product to one channel, right now. */
export async function postOne(id: string): Promise<ActionResult> {
  const tenantId = await getTenantId();
  const { data, error } = await db()
    .from("social_posts")
    .update({ status: "PENDING", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .in("status", ["FAILED", "SKIPPED", "PENDING"])
    .select("id");
  if (error) return { ok: false, message: `Could not queue it: ${error.message}` };
  if (!data?.length) return { ok: false, message: "That post has already gone out or is being sent." };
  try {
    const result = describe(await dispatchSocialPosts({ deadlineMs: 50_000, ids: [id] }));
    revalidatePath("/admin/social");
    return result;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function skipPost(id: string): Promise<ActionResult> {
  const tenantId = await getTenantId();
  const { data, error } = await db()
    .from("social_posts")
    .update({ status: "SKIPPED", last_error: "Skipped from the admin", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .in("status", ["PENDING", "FAILED"])
    .select("id");
  if (error) return { ok: false, message: `Could not skip it: ${error.message}` };
  revalidatePath("/admin/social");
  return data?.length ? { ok: true, message: "Skipped." } : { ok: false, message: "That post has already gone out or is being sent." };
}

export async function setCategorySocialExcluded(categoryId: string, excluded: boolean): Promise<ActionResult> {
  const tenantId = await getTenantId();
  const { data, error } = await db().from("categories").update({ social_excluded: excluded }).eq("id", categoryId).eq("tenant_id", tenantId).select("id");
  if (error) return { ok: false, message: `Could not save: ${error.message}` };
  if (!data?.length) return { ok: false, message: "That category no longer exists." };
  revalidatePath("/admin/social");
  return { ok: true, message: excluded ? "Won't be posted." : "Will be posted." };
}

/** Reads the Page name and Instagram username back from Meta, without posting anything. */
export async function testConnection(): Promise<ConnectionCheck | { error: string }> {
  const config = metaConfig();
  if (!config) return { error: "META_PAGE_ACCESS_TOKEN isn't set in Vercel yet." };
  return checkConnection(config);
}
