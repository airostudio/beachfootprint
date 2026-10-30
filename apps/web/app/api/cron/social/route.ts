import { NextResponse } from "next/server";
import { dispatchSocialPosts } from "@/lib/social/dispatch";
import { timingSafeStringEqual } from "@/lib/timingSafeEqual";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily sweep of the social post queue (vercel.json crons): retries posts that hit a Meta outage
 * or rate limit, and posts anything the after-publish dispatch didn't get to.
 *
 * When CRON_SECRET is set, Vercel sends it as a bearer token and anything else is refused. Without
 * it the route still runs — all it can do is post products that are already queued for posting,
 * claimed one at a time, so calling it early or often does no harm.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && !(await timingSafeStringEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await dispatchSocialPosts({ deadlineMs: 55_000 });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`social_cron_failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
