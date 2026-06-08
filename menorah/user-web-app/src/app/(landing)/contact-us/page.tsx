import type { Metadata } from "next";
import Link from "next/link";
import { ContactMessageForm } from "@/components/site/ContactMessageForm";
import { DividerHeading } from "@/components/site/DividerHeading";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export const metadata: Metadata = {
  title: "Contact Us | Menorah",
  description: "Contact Menorah for general enquiries and support."
};

const socialLinks = [
  { label: "Facebook", glyph: "f", href: "https://www.facebook.com/wearemenorah/#", className: "bg-social-facebook" },
  { label: "Instagram", glyph: "IG", href: "https://www.instagram.com/wearemenorah", className: "bg-social-instagram" },
  { label: "LinkedIn", glyph: "in", href: "https://www.linkedin.com/company/wearemenorah/", className: "bg-social-linkedin" },
  { label: "X", glyph: "X", href: "https://x.com/wearemenorah", className: "bg-social-x" },
  { label: "YouTube", glyph: "YT", href: "https://www.youtube.com/@menorahorganization", className: "bg-social-youtube" }
];

export default function ContactUsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MenorahNavbar elevated />
      <main className="border-t border-primary px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-[940px]">
          <DividerHeading>SOCIAL</DividerHeading>
          <div className="mt-12 flex items-center justify-center gap-8 md:gap-11">
            {socialLinks.map((social) => (
              <Link
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold leading-none text-primary-foreground transition hover:scale-105 ${social.className}`}
              >
                <span className="font-brand">{social.glyph}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-[940px] text-center">
          <DividerHeading>CONTACT US</DividerHeading>
          <p className="mt-14 font-brand text-base uppercase tracking-[0.24em]">Start your mental health journey with us</p>
          <p className="mx-auto mt-7 max-w-[720px] text-[17px] leading-8 text-foreground/75">
            Mental Health is the foundation of your body and mind. Drop us a line today, and we can get you started on
            the path to health tomorrow. For general inquiries, please contact us.
          </p>

          <p className="mt-14 font-brand text-base uppercase tracking-[0.2em]">Menorah</p>
          <Link href="mailto:menorahenquiries@gmail.com" className="mt-7 inline-block text-[17px] text-foreground/70 hover:text-foreground">
            Menorahenquiries@gmail.com
          </Link>

          <ContactMessageForm />
        </section>

        <MenorahFooter />
      </main>
    </div>
  );
}
