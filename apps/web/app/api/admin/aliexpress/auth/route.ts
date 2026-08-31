import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAuthorizeUrl, exchangeAuthorizationCode } from "@trend/core/aliexpress";

export const runtime = "nodejs";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * One-time AliExpress OAuth bootstrap, run from the deployed environment so
 * ALIEXPRESS_APP_KEY/ALIEXPRESS_APP_SECRET never have to leave Vercel's own
 * env vars (unlike the equivalent `auth:aliexpress` CLI, which needs them
 * set wherever it runs). Deliberately doesn't use AliExpressClient.fromEnv()
 * — this route runs before ALIEXPRESS_ACCESS_TOKEN/ALIEXPRESS_REFRESH_TOKEN
 * exist, so it only touches the two OAuth helper functions that don't need
 * them.
 *
 * GET  /api/admin/aliexpress/auth?redirectUri=<callback>
 *   -> { authorizeUrl } — visit it, log in, approve; AliExpress redirects to
 *      redirectUri with ?code=...
 * POST /api/admin/aliexpress/auth { code, redirectUri }
 *   -> { accessToken, refreshToken, expiresAt } — copy accessToken/refreshToken
 *      into ALIEXPRESS_ACCESS_TOKEN/ALIEXPRESS_REFRESH_TOKEN.
 */
export async function GET(request: Request) {
  const redirectUri = new URL(request.url).searchParams.get("redirectUri");
  if (!redirectUri) return NextResponse.json({ error: "Missing redirectUri query param" }, { status: 400 });

  try {
    const authorizeUrl = buildAuthorizeUrl({ appKey: requiredEnv("ALIEXPRESS_APP_KEY"), redirectUri });
    return NextResponse.json({ authorizeUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not build authorize URL" }, { status: 500 });
  }
}

const bodySchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const tokens = await exchangeAuthorizationCode({
      appKey: requiredEnv("ALIEXPRESS_APP_KEY"),
      appSecret: requiredEnv("ALIEXPRESS_APP_SECRET"),
      code: parsed.data.code,
      redirectUri: parsed.data.redirectUri,
    });
    return NextResponse.json(tokens);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress token exchange failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
