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
  if (!value) return new URL("https://tikatero.com");
  try {
    return new URL(value);
  } catch {
    return new URL("https://tikatero.com");
  }
}

export const metadata: Metadata = {
  metadataBase: siteMetadataBase(),
  title: {
    default: "Tikatero | Discover Events & Book Tickets Online",
    template: "%s · Tikatero",
  },
  description:
    "Discover concerts, workshops, festivals and more on Tikatero. Book event tickets online or create and manage your own events across India.",
  applicationName: "Tikatero",
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  openGraph: {
    type: "website",
    siteName: "Tikatero",
    title: "Tikatero | Discover Events & Book Tickets Online",
    description: "Discover concerts, workshops and festivals. Book tickets or host your next event with Tikatero.",
    url: "https://tikatero.com",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tikatero | Discover Events & Book Tickets Online",
    description: "Discover events, book tickets and host experiences with Tikatero.",
  },
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
