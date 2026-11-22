import { Suspense } from "react";
import Script from "next/script";
import { PublicHeader, PublicHeaderFallback } from "@/components/layout/public-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const analyticsEnabled = !!measurementId && /^G-[A-Z0-9]+$/.test(measurementId);
  return (
    <div className="flex min-h-full flex-col bg-white has-[[data-sticky-booking]]:pb-32 md:has-[[data-sticky-booking]]:pb-0">
      <Suspense fallback={<PublicHeaderFallback />}>
        <PublicHeader />
      </Suspense>
      <div id="content" className="flex-1">
        {children}
      </div>
      <SiteFooter />
      {analyticsEnabled && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="tikatero-ga4" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag("js", new Date()); gtag("config", "${measurementId}", { anonymize_ip: true });`}
          </Script>
        </>
      )}
    </div>
  );
}
