import Link from "next/link";

const footerLinks = [
  { label: "Articles", href: "/articles" },
  { label: "FAQ's", href: "/faq" },
  { label: "Contact Us", href: "/contact-us" }
];

const legalLinks = [
  { label: "Terms and Conditions", href: "/terms-and-conditions" },
  { label: "Privacy Policy", href: "/privacy-policy" }
];

export function MenorahFooter() {
  return (
    <footer className="mt-20 text-center font-body">
      <nav className="mx-auto flex max-w-[760px] flex-wrap items-center justify-center gap-x-5 gap-y-4 text-sm font-medium uppercase tracking-[0.18em]">
        {footerLinks.map((link) => (
          <Link key={link.label} href={link.href} className="transition hover:text-muted-foreground">
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm font-medium uppercase tracking-[0.18em]">
        {legalLinks.map((link) => (
          <Link key={link.label} href={link.href} className="transition hover:text-muted-foreground">
            {link.label}
          </Link>
        ))}
      </div>
      <p className="mt-12 text-base font-semibold">Menorah Health</p>
      <p className="mt-9 text-sm text-foreground/75">Copyright &copy; 2026 Menorah Health LLP - All Rights Reserved.</p>
    </footer>
  );
}
