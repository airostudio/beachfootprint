import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name} (copy .env.example to .env and fill it in)`);
  return value;
}

export function createServiceRoleClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function resolveTenantId(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string> {
  const slug = process.env.TENANT_SLUG || "valley-of-the-dolls-demo";
  const { data, error } = await supabase.from("tenants").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error(`Could not resolve tenant with slug "${slug}": ${error?.message}`);
  return data.id as string;
}
