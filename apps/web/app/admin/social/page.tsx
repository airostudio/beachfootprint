import Link from "next/link";
import { db, getTenantId } from "@/lib/data/client";
import { metaConfig } from "@/lib/social/meta";
import { CategorySocialToggle, PostQueuedButton, PostRowActions, TestConnectionButton } from "@/components/admin/SocialControls";

export const dynamic = "force-dynamic";
// "Post waiting now" sends posts inside the request; Instagram takes a few seconds per post.
export const maxDuration = 60;

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  POSTING: "bg-blue-100 text-blue-800",
  POSTED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-stone-100 text-stone-600",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Waiting", POSTING: "Sending", POSTED: "Posted", FAILED: "Failed", SKIPPED: "Skipped" };

function EnvRow({ name, set, detail }: { name: string; set: boolean; detail: string }) {
  return (
    <p className="text-sm py-1.5 border-b border-stone-100 last:border-0">
      <span className={set ? "text-green-700" : "text-red-600"}>{set ? "✓" : "✕"}</span> <code className="bg-stone-100 px-1 text-xs">{name}</code>{" "}
      <span className="text-xs text-stone-500">— {detail}</span>
    </p>
  );
}

/** Facebook & Instagram: every product that goes live is posted to both, automatically. */
export default async function AdminSocialPage() {
  const tenantId = await getTenantId();
  const supabase = db();
  const config = metaConfig();

  const [{ data: postRows, error }, { data: categoryRows }] = await Promise.all([
    supabase
      .from("social_posts")
      .select("id, channel, status, attempts, permalink, last_error, posted_at, updated_at, created_at, products(id, title)")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase.from("categories").select("id, name, parent_id, social_excluded, position").eq("tenant_id", tenantId).order("position").order("name"),
  ]);
  if (error) throw new Error(`Could not load social posts: ${error.message}`);

  type Row = {
    id: string;
    channel: "facebook" | "instagram";
    status: string;
    attempts: number;
    permalink: string | null;
    last_error: string | null;
    posted_at: string | null;
    updated_at: string;
    products: { id: string; title: string } | { id: string; title: string }[] | null;
  };
  const rows = (postRows ?? []) as unknown as Row[];
  // Products already in the store when this was set up are listed last, so new activity stays on top.
  const backfill = (r: Row) => r.status === "SKIPPED" && r.last_error?.startsWith("Already in the store");
  const ordered = [...rows.filter((r) => !backfill(r)), ...rows.filter(backfill)];
  const waiting = rows.filter((r) => r.status === "PENDING").length;

  type Category = { id: string; name: string; parent_id: string | null; social_excluded: boolean };
  const categories = (categoryRows ?? []) as Category[];
  const parents = categories.filter((c) => !c.parent_id);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="font-serif text-3xl mb-2">Social</h1>
        <p className="text-sm text-stone-600 max-w-3xl">
          Every product that goes live for the first time is posted to your Facebook Page and Instagram account automatically — its photos, title, description and
          price, with a link back to the product. Restocks and edits aren&rsquo;t re-posted. At most 25 posts per channel go out a day; anything over that goes out
          the next day.
        </p>
      </div>

      <section className="border border-stone-200 p-5 space-y-4">
        <h2 className="font-medium">Connection</h2>
        <div>
          <EnvRow name="META_PAGE_ACCESS_TOKEN" set={Boolean(config)} detail="long-lived Page access token (covers Facebook and Instagram)" />
          <EnvRow name="META_PAGE_ID" set={Boolean(config?.pageId)} detail="your Facebook Page's id — turns on Facebook posts" />
          <EnvRow name="META_INSTAGRAM_ACCOUNT_ID" set={Boolean(config?.instagramId)} detail="the Instagram professional account linked to that Page — turns on Instagram posts" />
        </div>
        <p className="text-xs text-stone-500">Set these in Vercel → Project → Settings → Environment Variables, then redeploy. Values are never shown here.</p>
        {config && <TestConnectionButton />}
      </section>

      <section className="border border-stone-200 p-5">
        <h2 className="font-medium mb-1">Don&rsquo;t post these categories</h2>
        <p className="text-xs text-stone-500 mb-3">
          Products in a ticked category (or its subcategories) are never posted. Meta removes posts selling adult products and can restrict the whole account, so
          tick any category like that.
        </p>
        {categories.length === 0 ? (
          <p className="text-sm text-stone-500">No categories yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            {parents.map((parent) => (
              <div key={parent.id}>
                <CategorySocialToggle id={parent.id} name={parent.name} excluded={parent.social_excluded} />
                {categories
                  .filter((c) => c.parent_id === parent.id)
                  .map((child) => (
                    <div key={child.id} className="pl-5">
                      <CategorySocialToggle id={child.id} name={child.name} excluded={child.social_excluded} />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-medium">Posts</h2>
          <PostQueuedButton waiting={waiting} />
        </div>
        {ordered.length === 0 ? (
          <p className="text-sm text-stone-500 border border-stone-200 p-6">Nothing yet. Publish a product and it shows up here.</p>
        ) : (
          <div className="border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-stone-500 text-left bg-stone-50">
                <tr>
                  <th className="px-3 py-2 font-normal">Product</th>
                  <th className="px-3 py-2 font-normal">Channel</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 font-normal">Details</th>
                  <th className="px-3 py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {ordered.map((r) => {
                  const product = Array.isArray(r.products) ? r.products[0] : r.products;
                  const waitingForSetup = r.status === "PENDING" && !(r.channel === "facebook" ? config?.pageId : config?.instagramId);
                  return (
                    <tr key={r.id} className="border-t border-stone-100 align-top">
                      <td className="px-3 py-2">
                        {product ? (
                          <Link href={`/admin/products/${product.id}`} className="underline">
                            {product.title}
                          </Link>
                        ) : (
                          <span className="text-stone-400">Deleted product</span>
                        )}
                      </td>
                      <td className="px-3 py-2 capitalize">{r.channel}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 whitespace-nowrap ${STATUS_STYLE[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-600 max-w-sm">
                        {r.status === "POSTED" ? (
                          <>
                            {r.posted_at ? new Date(r.posted_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : null}
                            {r.permalink && (
                              <>
                                {" · "}
                                <a href={r.permalink} target="_blank" rel="noreferrer" className="underline">
                                  View post ↗
                                </a>
                              </>
                            )}
                          </>
                        ) : waitingForSetup ? (
                          `Waiting for ${r.channel === "facebook" ? "Facebook" : "Instagram"} to be connected`
                        ) : (
                          r.last_error
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PostRowActions id={r.id} status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
