import type { Metadata } from "next";
import Image from "next/image";
import { HeartHandshake, MessageCircle, Newspaper, ShieldCheck, UsersRound } from "lucide-react";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export const metadata: Metadata = {
  title: "About Us | Menorah",
  description: "Learn how Menorah helps men find verified counsellors, book support, use secure chat, and explore practical wellbeing resources."
};

const offers = [
  {
    title: "Secure Counsellor Chat",
    icon: MessageCircle,
    image: "/what-we-do-vision.png",
    body: "Use secure in-app chat with your assigned counsellor around a booking. Menorah reviews counsellors' submitted professional information before activation and provides account and session updates by email."
  },
  {
    title: "One-to-One Support",
    icon: UsersRound,
    image: "/what-we-do-about.png",
    body: "Menorah is currently focused on verified counsellor discovery, paid one-to-one bookings, secure counsellor chat, wellbeing check-ins, and educational resources. Community features will only be described here after they are available and fully governed."
  },
  {
    title: "Wellbeing Check-ins & Resources",
    icon: ShieldCheck,
    image: "/what-we-do-mission.png",
    body: "Use optional wellbeing check-ins and explore practical educational resources. Check-ins and articles are informational and do not provide a diagnosis, medical advice, or emergency support."
  },
  {
    title: "Practical Articles",
    icon: Newspaper,
    image: "/menorah-logo-banner.jpg",
    body: "Read practical mental-health and wellbeing articles written to help men reflect on stress, burnout, relationships, and help-seeking."
  }
];

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main>
        <section className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative overflow-hidden rounded-[2rem] border border-menorah-cream bg-background shadow-dashboard">
              <Image
                src="/menorah-logo-banner.jpg"
                alt="Menorah Mind Over Matter Redefined logo"
                width={1200}
                height={600}
                priority
                className="h-full w-full object-cover"
              />
            </div>

            <div className="text-center lg:text-left">
              <p className="font-brand text-sm uppercase tracking-[0.28em] text-menorah-olive">Mind over matter, redefined</p>
              <h1 className="mt-5 font-display text-4xl leading-tight tracking-[0.08em] md:text-5xl">ABOUT US</h1>
              <p className="mt-7 text-lg leading-8 text-foreground/75">
                At <strong>Menorah</strong>, we help men find verified counsellors, review transparent hourly rates,
                book one-to-one sessions, use secure chat, and explore practical wellbeing resources. Our mission is to
                make it easier to take a considered next step toward support.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-background px-6 py-16 md:px-10 lg:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-center gap-6 md:gap-8">
              <div className="h-px flex-1 bg-primary" />
              <h2 className="shrink-0 text-center font-display text-3xl leading-none tracking-[0.08em] md:text-[2.4rem]">
                WHAT WE OFFER
              </h2>
              <div className="h-px flex-1 bg-primary" />
            </div>

            <div className="mt-12 grid gap-7 md:grid-cols-2">
              {offers.map((offer, index) => (
                <article key={offer.title} className="grid gap-6 rounded-2xl border border-menorah-cream bg-menorah-page/60 p-6 md:grid-cols-[140px_1fr]">
                  <div className="relative aspect-square overflow-hidden rounded-full border-[6px] border-menorah-cream bg-background">
                    <Image src={offer.image} alt="" width={600} height={600} className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-menorah-green text-primary-foreground">
                        <offer.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <p className="font-brand text-sm uppercase tracking-[0.2em] text-menorah-olive">0{index + 1}</p>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold">{offer.title}</h3>
                    <p className="mt-3 text-[15px] leading-7 text-foreground/75">{offer.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16 text-center md:px-10">
          <div className="mx-auto max-w-3xl">
            <HeartHandshake className="mx-auto h-11 w-11 text-menorah-olive" aria-hidden="true" />
            <p className="mt-6 text-lg leading-8 text-foreground/80">
              At <strong>Menorah</strong>, we are not just an app. We are a movement. A movement dedicated to breaking
              the stigma, fostering real connections, and ensuring that no man suffers in silence. Together, we are
              redefining men&apos;s mental health one conversation at a time.
            </p>
          </div>
          <MenorahFooter />
        </section>
      </main>
    </div>
  );
}
