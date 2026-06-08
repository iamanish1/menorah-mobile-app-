import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about-us" },
  { label: "FAQ's", href: "/faq" },
  { label: "Founder's Note", href: "/founders-note" },
  { label: "Terms and Conditions", href: "/terms-and-conditions" }
];

export function MenorahNavbar({ className, elevated = false }: { className?: string; elevated?: boolean }) {
  return (
    <header
      className={cn(
        "relative z-10 flex items-center justify-between px-6 py-5 font-body md:px-12 lg:px-20",
        elevated && "border-b border-menorah-cream bg-menorah-page/95 backdrop-blur",
        className
      )}
    >
      <Link href="/" className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-foreground">
        <Image
          src="/menorah-logo.png"
          alt="Menorah logo"
          width={48}
          height={48}
          priority
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
        <span>Menorah</span>
      </Link>

      <div className="flex items-center gap-5">
        <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary navigation">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-base font-medium text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/contact-us"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-2 text-base font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          Contact Us
        </Link>
      </div>
    </header>
  );
}
