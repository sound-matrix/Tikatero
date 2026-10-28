import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

function siteMetadataBase(): URL | undefined {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteMetadataBase(),
  title: {
    default: "Tikatero",
    template: "%s · Tikatero",
  },
  description:
    "Find events and book tickets with Tikatero, a product of Sound Matrix. Prices include GST.",
  applicationName: "Tikatero",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-white font-sans text-ink antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:font-semibold"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
