import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import AdminNav from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-warm-100">
      <div className="bg-ink-950 text-warm-50">
        <div className="container-page py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2">
              <LogoMark className="h-7 w-7" />
              <span className="font-serif text-lg whitespace-nowrap">Mira &amp; Muse Admin</span>
            </span>
            <Link href="/" className="text-xs text-stone-400 hover:text-warm-50 whitespace-nowrap">
              View store ↗
            </Link>
          </div>
          <AdminNav />
        </div>
      </div>
      <div className="container-page py-10">{children}</div>
    </div>
  );
}
