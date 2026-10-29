import { Suspense } from "react";
import { PublicHeader, PublicHeaderFallback } from "@/components/layout/public-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white has-[[data-sticky-booking]]:pb-32 md:has-[[data-sticky-booking]]:pb-0">
      <Suspense fallback={<PublicHeaderFallback />}>
        <PublicHeader />
      </Suspense>
      <div id="content" className="flex-1">
        {children}
      </div>
      <SiteFooter copyrightOnly />
    </div>
  );
}
