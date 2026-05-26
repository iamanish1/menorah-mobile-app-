import type { Metadata } from 'next';
import Image from 'next/image';
import { DividerHeading } from '@/components/site/DividerHeading';
import { MenorahFooter } from '@/components/site/MenorahFooter';
import { MenorahNavbar } from '@/components/site/MenorahNavbar';

export const metadata: Metadata = {
  title: "Founder's Note | Menorah",
  description: "A founder's note from Jayden John Jacob, Founder and Director of Menorah.",
};

const founderParagraphs = [
  'Welcome to Menorah, where Mind Over Matter is Redefined!',
  "It is with great pleasure and deep gratitude that I, Jayden John Jacob, write this Founder's Note for our movement, Menorah, as an advocate of Men's Mental Health. Today, as I reflect upon our journey, I am filled with immense pride and hope for what lies ahead. And while it's becoming more acceptable for men to talk about their feelings and seek help, there is still a significant stigma attached to mental health issues, especially for men.",
  'When we embarked on this mission, we knew that we were stepping into uncharted territory, but we were driven by a shared vision to create a safe space where men could find solace, support, and healing for their mental health struggles.',
  'For far too long, societal norms and expectations have stifled conversations about men\'s mental health. The prevailing notion that men must be strong, stoic, and invulnerable has had a detrimental impact on countless lives. It has forced many to suffer in silence, battling their inner demons alone. But we refuse to let this continue.',
  'Our organization was born out of a genuine concern for the well-being of men everywhere. We recognized the urgent need to challenge the stigma surrounding mental health and foster a community where men can openly share their experiences, fears, and vulnerabilities without fear of judgment or ridicule. We aim to empower men to embrace their emotions, seek help when needed, and take charge of their mental well-being.',
  'To our volunteers, supporters, and partners, I extend my sincerest gratitude. Your unwavering commitment and dedication have been instrumental in our progress.',
  'Together, we have created a haven where men can find hope and healing. It is through your generosity and compassion that we can continue to expand our reach and touch more lives.',
  'I also want to express my deep appreciation to the brave men who have shared their stories and trusted us with their vulnerabilities. Your courage is a beacon of light for others who are still searching for their path to healing. By opening up, you have shown that seeking help is not a sign of weakness but a testament to strength and self-awareness.',
  'As we look to the future, let us remain resolute in our pursuit of a world where men\'s mental health is prioritized and supported. Together, we can shatter the barriers that prevent men from seeking help, and create a society that embraces emotional well-being for all.',
];

export default function FoundersNotePage() {
  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:pl-4 lg:pr-3 xl:pl-4 xl:pr-3">
        <section className="ml-0 mr-auto max-w-none">
          <DividerHeading>FOUNDER&apos;S NOTE</DividerHeading>

          <div className="mt-12 grid items-start gap-4 lg:grid-cols-[560px_minmax(0,1fr)] xl:grid-cols-[600px_minmax(0,1fr)]">
            <div className="flex justify-center lg:justify-start">
              <Image
                src="/founder-jayden.png"
                alt="Illustrated portrait of Jayden John Jacob"
                width={512}
                height={512}
                priority
                className="h-auto w-full max-w-[360px] rounded-full object-contain drop-shadow-[0_18px_45px_rgba(0,0,0,0.08)] md:max-w-[430px] lg:ml-0 lg:w-[600px] lg:max-w-none"
              />
            </div>

            <article className="w-full rounded-[2rem] border border-menorah-cream bg-background p-5 text-center shadow-dashboard md:p-7 xl:p-8">
              <div className="space-y-4 text-[14px] leading-7 text-foreground/75 lg:text-[14.5px] lg:leading-7">
                {founderParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="mt-8 border-t border-menorah-cream pt-6">
                <p className="font-display text-2xl tracking-[0.05em]">With gratitude and determination,</p>
                <p className="mt-5 text-lg font-semibold">Jayden John Jacob</p>
                <p className="mt-1 text-foreground/70">Founder and Director, Menorah</p>
              </div>
            </article>
          </div>
        </section>

        <MenorahFooter />
      </main>
    </div>
  );
}
