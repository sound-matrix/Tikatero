import Link from "next/link";
import { FOOTER_CREDIT, footerLinks } from "@/lib/legal";

export function SiteFooter({ copyrightOnly = false }: { copyrightOnly?: boolean }) {
  return (
    <footer className="border-t border-line bg-white px-4 py-6 text-center text-muted">
      <p>
        {FOOTER_CREDIT}
        {!copyrightOnly &&
          footerLinks.map((link) => (
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
