import Link from "next/link";
import { FOOTER_CREDIT, footerLinks } from "@/lib/legal";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white px-4 py-6 text-center text-muted">
      <p>
        {FOOTER_CREDIT}
        {footerLinks.map((link) => (
          <span key={link.href}>
            {" · "}
            <Link
              href={link.href}
              className="font-semibold text-ink underline-offset-2 hover:underline"
            >
              {link.label}
            </Link>
          </span>
        ))}
      </p>
    </footer>
  );
}
