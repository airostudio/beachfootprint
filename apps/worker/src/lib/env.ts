import { createServiceRoleSupabaseClient } from "@trend/db";
import { AliExpressClient } from "@trend/core";

export function getDb() {
  return createServiceRoleSupabaseClient();
}

export function getAliExpressClient(): AliExpressClient {
  return AliExpressClient.fromEnv(process.env, {
    onTokenRefreshed: (tokens) => {
      // The Open Platform rotates the refresh token on every exchange, so the new
      // pair must be persisted or the next run's refresh will fail with a stale token.
      // No secrets store is wired up in this scaffold — surface it loudly instead of
      // silently losing the new tokens.
      console.warn(
        "[aliexpress] access token refreshed — update ALIEXPRESS_ACCESS_TOKEN/ALIEXPRESS_REFRESH_TOKEN:",
        JSON.stringify(tokens),
      );
    },
  });
}

/** Resolves every tenant id, so sync/tracking jobs run once per tenant rather than assuming a single store. */
export async function listTenantIds(db: ReturnType<typeof getDb>): Promise<string[]> {
  const { data, error } = await db.from("tenants").select("id");
  if (error) throw new Error(`Could not list tenants: ${error.message}`);
  return (data ?? []).map((row: any) => row.id as string);
}

export async function resolveTenantId(db: ReturnType<typeof getDb>, tenantIdOrSlug?: string): Promise<string> {
  const defaultSlug = process.env.DEFAULT_TENANT_SLUG || "valley-of-the-dolls-demo";
  if (tenantIdOrSlug && /^[0-9a-f-]{36}$/i.test(tenantIdOrSlug)) return tenantIdOrSlug;

  const { data, error } = await db
    .from("tenants")
    .select("id")
    .eq("slug", tenantIdOrSlug || defaultSlug)
    .single();
  if (error || !data) throw new Error(`Could not resolve tenant "${tenantIdOrSlug || defaultSlug}"`);
  return data.id as string;
}

/** Tiny `--flag=value` / `--flag value` argv parser — no dependency needed for four CLI scripts. */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}
