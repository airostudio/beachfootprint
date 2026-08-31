// One-time OAuth helper to obtain ALIEXPRESS_ACCESS_TOKEN/ALIEXPRESS_REFRESH_TOKEN.
// Not part of the daily-operation CLI surface (import/sync/fulfill/tracking) —
// run this once per AliExpress account you connect, then drop the printed
// tokens into your env vars. After that, AliExpressClient refreshes the
// access token on its own using the refresh token.
//
//   1) npm run auth:aliexpress -- --url --redirect-uri=<your callback URL>
//      Visit the printed URL, log into the AliExpress account being
//      integrated, and approve access. AliExpress redirects to your
//      callback with a `?code=...` query param.
//
//   2) npm run auth:aliexpress -- --code=<code> --redirect-uri=<same callback URL>
//      Exchanges the code for the initial token pair and prints them.
import { buildAuthorizeUrl, exchangeAuthorizationCode } from "@trend/core/aliexpress";
import { parseArgs } from "../lib/env";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const redirectUri = args["redirect-uri"] as string | undefined;
  if (!redirectUri) {
    console.error(
      "Usage:\n" +
        "  npm run auth:aliexpress -- --url --redirect-uri=<callback URL>\n" +
        "  npm run auth:aliexpress -- --code=<code> --redirect-uri=<callback URL>",
    );
    process.exit(1);
  }

  const appKey = requiredEnv("ALIEXPRESS_APP_KEY");

  if (args.url) {
    const authorizeUrl = buildAuthorizeUrl({ appKey, redirectUri });
    console.log("Visit this URL, log in, and approve access:\n");
    console.log(authorizeUrl);
    console.log("\nAliExpress will redirect to your callback with a `?code=...` param.");
    console.log("Then run: npm run auth:aliexpress -- --code=<that code> --redirect-uri=" + redirectUri);
    return;
  }

  const code = args.code as string | undefined;
  if (!code) {
    console.error("Missing --code=<code> (or pass --url first to get the authorization link).");
    process.exit(1);
  }

  const appSecret = requiredEnv("ALIEXPRESS_APP_SECRET");
  const tokens = await exchangeAuthorizationCode({ appKey, appSecret, code, redirectUri });

  console.log("Success — add these to your environment:\n");
  console.log(`ALIEXPRESS_ACCESS_TOKEN=${tokens.accessToken}`);
  console.log(`ALIEXPRESS_REFRESH_TOKEN=${tokens.refreshToken}`);
  if (tokens.expiresAt > 0) {
    console.log(`\n(access token expires ${new Date(tokens.expiresAt).toISOString()} — the refresh token keeps it renewed automatically after that)`);
  }
}

main().catch((err) => {
  console.error("[auth:aliexpress] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
