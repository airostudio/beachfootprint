import { db, getTenantId } from "@/lib/data/client";
import { setTicketStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  AWAITING_CUSTOMER: "Awaiting customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Messages from the storefront support form (/account/support). Reply by email to the address shown. */
export default async function AdminSupportPage() {
  const tenantId = await getTenantId();
  const { data, error } = await db()
    .from("support_tickets")
    .select("id, created_at, category, subject, message, status, order_reference, customers(email, name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load support messages: ${error.message}`);

  type Row = {
    id: string;
    created_at: string;
    category: string;
    message: string;
    status: string;
    order_reference: string | null;
    customers: { email: string; name: string | null } | { email: string; name: string | null }[] | null;
  };
  const tickets = (data ?? []) as unknown as Row[];
  const open = tickets.filter((t) => t.status === "OPEN").length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-serif text-3xl">Support</h1>
        <p className="text-xs text-stone-500">{open} open</p>
      </div>
      {tickets.length === 0 ? (
        <p className="text-sm text-stone-500 border border-stone-200 p-6">No messages yet. Messages sent from the storefront&rsquo;s support form appear here.</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const customer = Array.isArray(t.customers) ? t.customers[0] : t.customers;
            return (
              <div key={t.id} className={`border p-4 text-sm ${t.status === "OPEN" ? "border-amber-300 bg-amber-50/40" : "border-stone-200"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <p>
                    {customer ? (
                      <a href={`mailto:${customer.email}`} className="font-medium underline">
                        {customer.name ? `${customer.name} <${customer.email}>` : customer.email}
                      </a>
                    ) : (
                      <span className="text-stone-500">Unknown sender</span>
                    )}
                    <span className="text-stone-500">
                      {" "}
                      · {t.category.toLowerCase()}
                      {t.order_reference ? ` · order ${t.order_reference}` : ""}
                    </span>
                  </p>
                  <p className="text-xs text-stone-500">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <p className="whitespace-pre-wrap text-stone-700 mb-3">{t.message}</p>
                <form action={setTicketStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <label className="text-xs text-stone-500" htmlFor={`status-${t.id}`}>
                    Status
                  </label>
                  <select id={`status-${t.id}`} name="status" defaultValue={t.status} className="text-xs border border-stone-300 px-2 py-1">
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="text-xs underline">
                    Update
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
