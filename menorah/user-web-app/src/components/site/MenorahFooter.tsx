import Link from "next/link";

const footerLinks = [
  { label: "Articles", href: "/articles" },
  { label: "Counsellors", href: "https://counsellor.menorah.me/register" },
  { label: "Contact Us", href: "/contact-us" },
  { label: "FAQ's", href: "/#faq" }
];

const legalLinks = [
  { label: "Terms and Conditions", href: "/terms-and-conditions" },
  { label: "Privacy Policy", href: "/privacy-policy" }
];

export function MenorahFooter() {
  return (
    <footer className="mt-[clamp(4rem,6vw,7rem)] px-[var(--landing-page-x)] text-center font-body">
      <nav className="mx-auto flex max-w-[min(48rem,92vw)] flex-wrap items-center justify-center gap-x-[clamp(1rem,1.8vw,1.8rem)] gap-y-[clamp(0.85rem,1.2vw,1.2rem)] text-[length:var(--landing-body-sm)] font-medium uppercase tracking-[0.18em]">
        {footerLinks.map((link) =>
          link.href.startsWith("http") ? (
            <a key={link.label} href={link.href} className="transition hover:text-muted-foreground">
              {link.label}
            </a>
          ) : (
            <Link key={link.label} href={link.href} className="transition hover:text-muted-foreground">
              {link.label}
            </Link>
          )
        )}
      </nav>
      <div className="mt-[clamp(1.1rem,1.8vw,1.6rem)] flex flex-wrap items-center justify-center gap-x-[clamp(1rem,1.8vw,1.8rem)] gap-y-[clamp(0.75rem,1vw,1rem)] text-[length:var(--landing-body-sm)] font-medium uppercase tracking-[0.18em]">
        {legalLinks.map((link) => (
          <Link key={link.label} href={link.href} className="transition hover:text-muted-foreground">
            {link.label}
          </Link>
        ))}
      </div>
      <p className="mt-[clamp(2.5rem,4vw,4rem)] text-[length:var(--landing-body)] font-semibold">Menorah Health</p>
      <p className="mt-[clamp(1.75rem,2.8vw,3rem)] text-[length:var(--landing-body-sm)] text-foreground/75">Copyright &copy; 2026 Menorah Health LLP - All Rights Reserved.</p>
    </footer>
  );
}
