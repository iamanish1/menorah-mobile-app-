import type { Metadata } from 'next';
import Image from 'next/image';
import { HeartHandshake, MessageCircle, Newspaper, ShieldCheck, UsersRound } from 'lucide-react';
import { MenorahFooter } from '@/components/site/MenorahFooter';
import { MenorahNavbar } from '@/components/site/MenorahNavbar';

export const metadata: Metadata = {
  title: 'About Us | Menorah',
  description: "Learn about Menorah, the world's first free mental health app exclusively for men.",
};

const offers = [
  {
    title: 'Confidential Chat Support',
    icon: MessageCircle,
    image: '/what-we-do-vision.png',
    body: 'Our chat service connects users with clinical psychology students from top universities, offering a unique and empathetic support system. With a built-in profanity filter to ensure respectful conversations, we maintain a safe environment. Plus, our email notification system ensures that no message goes unanswered, keeping support readily available.',
  },
  {
    title: 'Man2Man Community',
    icon: UsersRound,
    image: '/what-we-do-about.png',
    body: 'Recognizing that mental health is a journey best shared, our Man2Man feature enables users to connect with peers across different age groups (15-18, 19-24, 25-35). Whether you are looking for mentorship, companionship, or simply someone who understands, this space fosters meaningful, relatable conversations tailored to different life stages.',
  },
  {
    title: 'Self-help Tools & Mental Wellness Tips',
    icon: ShieldCheck,
    image: '/what-we-do-mission.png',
    body: 'We believe that mental health is more than just conversations. It is about actionable solutions. That is why we provide comprehensive self-help resources, practical coping strategies, and guided exercises designed to enhance emotional resilience and well-being.',
  },
  {
    title: 'Expert Insights & Media',
    icon: Newspaper,
    image: '/menorah-logo-banner.jpg',
    body: 'Stay informed and inspired with our regular newsletters, insightful posts, and engaging media content curated to help men navigate mental health challenges with confidence.',
  },
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
              <p className="font-brand text-sm uppercase tracking-[0.28em] text-menorah-olive">
                Mind over matter, redefined
              </p>
              <h1 className="mt-5 font-display text-4xl leading-tight tracking-[0.08em] md:text-5xl">ABOUT US</h1>
              <p className="mt-7 text-lg leading-8 text-foreground/75">
                At <strong>Menorah</strong>, we are pioneering a transformative approach to revolutionizing men&apos;s
                mental health by creating{' '}
                <strong>The World&apos;s First Free Mental Health App Exclusively for Men.</strong> Our mission is to
                provide a safe, supportive, and judgment-free space where men can openly discuss their struggles, seek
                guidance, and receive the help they need without barriers.
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
                <article
                  key={offer.title}
                  className="grid gap-6 rounded-2xl border border-menorah-cream bg-menorah-page/60 p-6 md:grid-cols-[140px_1fr]"
                >
                  <div className="relative aspect-square overflow-hidden rounded-full border-[6px] border-menorah-cream bg-background">
                    <Image src={offer.image} alt="" width={600} height={600} className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-menorah-green text-primary-foreground">
                        <offer.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <p className="font-brand text-sm uppercase tracking-[0.2em] text-menorah-olive">
                        0{index + 1}
                      </p>
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
