import Image from 'next/image';
import { MessageSquare } from 'lucide-react';
import { MenorahFooter } from '@/components/site/MenorahFooter';

const sections = [
  {
    id: 'about',
    title: 'ABOUT THE\nORGANIZATION',
    image: { src: '/what-we-do-about.png', alt: 'Menorah illustration of a man carrying emotional weight' },
    imageSide: 'left',
    body: (
      <>
        <strong>Menorah Health, The World&apos;s First Free Mental Health App for Men,</strong> is a groundbreaking
        organization dedicated to providing support, guidance, and resources for men seeking help with their mental
        well-being. The organization&apos;s primary tool for achieving this mission is their innovative and{' '}
        <strong>user-friendly mobile app.</strong> Through this app, <strong>Menorah</strong> strives to dismantle
        barriers that hinder men from seeking help, providing a safe and empathetic space for addressing their mental
        health concerns.
      </>
    ),
  },
  {
    id: 'mission',
    title: 'MISSION',
    image: { src: '/what-we-do-mission.png', alt: 'Menorah illustration of a man climbing toward a target' },
    imageSide: 'right',
    body: (
      <>
        <strong>Our mission is to empower men</strong> to take an active role in managing their mental health and to
        provide them with the tools and resources they need to thrive. Our organization is committed to creating{' '}
        <strong>safe and supportive spaces</strong> where men can share their experiences, connect with others, and
        receive the help they need to live <strong>healthy, fulfilling lives.</strong>
        <br />
        We believe that men&apos;s mental health is a <strong>critical</strong> issue that deserves attention, and we
        are dedicated to making a positive impact in the lives of <strong>men and their families.</strong>
      </>
    ),
  },
  {
    id: 'vision',
    title: 'VISION',
    image: { src: '/what-we-do-vision.png', alt: 'Menorah illustration of a mental health support conversation' },
    imageSide: 'left',
    body: (
      <>
        <strong>Our vision</strong> is a world where men are able to live healthy and fulfilling lives, free from the
        constraints of <strong>mental health</strong> issues. Through education, <strong>advocacy</strong>, and{' '}
        <strong>collaboration</strong>, we envision a society where men are empowered to seek help when they need it,
        and where mental health is viewed as an <strong>essential</strong> component of overall health and{' '}
        <strong>wellness.</strong> We yearn to improve the mental health and <strong>well-being</strong> of men by
        promoting awareness, reducing stigma, and <strong>providing support</strong> and resources for men who are
        struggling with mental health issues.
      </>
    ),
  },
] as const;

export function WhatWeDoSection() {
  return (
    <section id="about" className="relative bg-background px-6 pb-16 pt-12 font-body text-foreground md:px-10 md:pt-14">
      <div className="mx-auto max-w-[980px]">
        <div className="flex items-center justify-center gap-6 md:gap-8">
          <div className="h-px flex-1 bg-primary" />
          <h2 className="shrink-0 text-center font-display text-4xl leading-none tracking-[0.08em] md:text-[2.6rem]">
            WHAT WE DO
          </h2>
          <div className="h-px flex-1 bg-primary" />
        </div>

        <div className="mt-12 space-y-14 md:mt-14 md:space-y-16">
          {sections.map((section) => (
            <ContentRow key={section.id} section={section} />
          ))}
        </div>

        <MenorahFooter />
      </div>

      <button
        type="button"
        aria-label="Open chat"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-menorah-cream bg-menorah-cream/80 text-foreground shadow-dashboard backdrop-blur-sm transition hover:bg-menorah-cream"
      >
        <MessageSquare className="h-7 w-7" aria-hidden="true" />
      </button>
    </section>
  );
}

function ContentRow({ section }: { section: (typeof sections)[number] }) {
  const image = (
    <div className="flex justify-center">
      <IllustrationFrame image={section.image} />
    </div>
  );
  const copy = (
    <div className="mx-auto max-w-[460px] text-center">
      <h3 className="whitespace-pre-line font-body text-3xl font-medium uppercase leading-[1.18] tracking-[0.2em] text-foreground">
        {section.title}
      </h3>
      <p className="mt-7 text-[16px] leading-[1.52] text-foreground/80">{section.body}</p>
    </div>
  );

  return (
    <article className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
      {section.imageSide === 'left' ? (
        <>
          {image}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {image}
        </>
      )}
    </article>
  );
}

function IllustrationFrame({ image }: { image: { src: string; alt: string } }) {
  return (
    <div className="relative flex aspect-square w-full max-w-[430px] items-center justify-center overflow-hidden rounded-full border-[7px] border-menorah-cream bg-background">
      <Image
        src={image.src}
        alt={image.alt}
        width={600}
        height={600}
        sizes="(min-width: 768px) 430px, 86vw"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
