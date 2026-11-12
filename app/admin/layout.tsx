import { requireStaff } from "@/lib/admin/access";
import { SurfaceGuard } from "@/components/auth/surface-guard";
import { Suspense } from "react";
import { SideNav } from "@/components/layout/side-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { adminNav } from "@/lib/nav";

function NavFallback() {
  return (
    <div className="min-h-16 border-b border-line bg-white md:w-60 md:border-r md:border-b-0" />
  );
}

async function AdminNav() {
  const { client } = await requireStaff();
  const { count, error } = await client
    .from("event_removal_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error("Removal requests could not be loaded.");
  const items = adminNav.map((item) =>
    item.href === "/admin/events" ? { ...item, count: count ?? 0 } : item,
  );
  return <SideNav title="Tikatero admin" items={items} />;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="flex flex-1 flex-col md:flex-row">
        <Suspense fallback={<NavFallback />}>
          <AdminNav />
        </Suspense>
        <div id="content" className="min-w-0 flex-1">
          <Suspense fallback={<p className="p-8">Loading your account…</p>}>
            <SurfaceGuard surface="admin">{children}</SurfaceGuard>
          </Suspense>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
