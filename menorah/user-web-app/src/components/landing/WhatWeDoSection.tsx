"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Building2, Eye, Flag, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MenorahFooter } from "@/components/site/MenorahFooter";

const sections = [
  {
    id: "about",
    eyebrow: "Foundation",
    title: "ABOUT THE\nORGANIZATION",
    icon: Building2,
    image: {
      src: "/what-we-do-about.png",
      alt: "Menorah illustration of a man carrying emotional weight"
    },
    imageSide: "left",
    accent: "bg-menorah-green text-white",
    body: (
      <>
        <strong>Menorah Health, The World&apos;s First Free Mental Health App for Men,</strong> is a groundbreaking
        organization dedicated to providing support, guidance, and resources for men seeking help with their mental
        well-being. The organization&apos;s primary tool for achieving this mission is their innovative and{" "}
        <strong>user-friendly mobile app.</strong> Through this app, <strong>Menorah</strong> strives to dismantle
        barriers that hinder men from seeking help, providing a safe and empathetic space for addressing their mental
        health concerns.
      </>
    )
  },
  {
    id: "mission",
    eyebrow: "Commitment",
    title: "MISSION",
    icon: Flag,
    image: {
      src: "/what-we-do-mission.png",
      alt: "Menorah illustration of a man climbing toward a target"
    },
    imageSide: "right",
    accent: "bg-menorah-olive text-white",
    body: (
      <>
        <strong>Our mission is to empower men</strong> to take an active role in managing their mental health and to
        provide them with the tools and resources they need to thrive. Our organization is committed to creating{" "}
        <strong>safe and supportive spaces</strong> where men can share their experiences, connect with others, and
        receive the help they need to live <strong>healthy, fulfilling lives.</strong>
        <br />
        We believe that men&apos;s mental health is a <strong>critical</strong> issue that deserves attention, and we
        are dedicated to making a positive impact in the lives of <strong>men and their families.</strong>
      </>
    )
  },
  {
    id: "vision",
    eyebrow: "Future",
    title: "VISION",
    icon: Eye,
    image: {
      src: "/what-we-do-vision.png",
      alt: "Menorah illustration of a mental health support conversation"
    },
    imageSide: "left",
    accent: "bg-slate-800 text-white",
    body: (
      <>
        <strong>Our vision</strong> is a world where men are able to live healthy and fulfilling lives, free from the
        constraints of <strong>mental health</strong> issues. Through education, <strong>advocacy</strong>, and{" "}
        <strong>collaboration</strong>, we envision a society where men are empowered to seek help when they need it,
        and where mental health is viewed as an <strong>essential</strong> component of overall health and{" "}
        <strong>wellness.</strong> We yearn to improve the mental health and <strong>well-being</strong> of men by
        promoting awareness, reducing stigma, and <strong>providing support</strong> and resources for men who are
        struggling with mental health issues.
      </>
    )
  }
] as const;

export function WhatWeDoSection() {
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const headerVisible = useInView(headerRef);
  const footerVisible = useInView(footerRef);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section
      id="about"
      className="relative overflow-hidden bg-background px-6 pb-16 pt-12 font-body text-foreground md:px-10 md:pt-16"
    >
      <div className="what-we-do-backdrop" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-[1080px]">
        <div
          ref={headerRef}
          className={cn("what-section-header flex items-center justify-center gap-6 md:gap-8", headerVisible && "is-visible")}
        >
          <div className="what-heading-line h-px flex-1 bg-primary" />
          <div className="relative shrink-0">
            <span className="what-heading-glint" aria-hidden="true" />
            <h2 className="text-center font-display text-4xl leading-none tracking-[0.08em] md:text-[2.8rem]">
              WHAT WE DO
            </h2>
          </div>
          <div className="what-heading-line h-px flex-1 bg-primary" />
        </div>

        <div className="mt-12 space-y-16 md:mt-16 md:space-y-20">
          {sections.map((section, index) => (
            <ContentRow key={section.id} section={section} index={index} reducedMotion={reducedMotion} />
          ))}
        </div>

        <div
          ref={footerRef}
          className="transition duration-700 ease-out"
          style={{
            opacity: reducedMotion || footerVisible ? 1 : 0,
            transform: reducedMotion || footerVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 28px, 0)"
          }}
        >
          <MenorahFooter />
        </div>
      </div>

      <button
        type="button"
        aria-label="Open chat"
        className="fixed bottom-5 right-5 z-40 hidden h-14 w-14 items-center justify-center rounded-full border border-menorah-cream bg-menorah-cream/80 text-foreground shadow-dashboard backdrop-blur-sm transition hover:bg-menorah-cream focus:outline-none focus:ring-4 focus:ring-menorah-green/15 sm:flex"
      >
        <MessageSquare className="h-7 w-7" aria-hidden="true" />
      </button>
    </section>
  );
}

function ContentRow({
  section,
  index,
  reducedMotion
}: {
  section: (typeof sections)[number];
  index: number;
  reducedMotion: boolean;
}) {
  const rowRef = useRef<HTMLElement>(null);
  const isVisible = useInView(rowRef);
  const progress = useElementProgress(rowRef);
  const Icon = section.icon;
  const copyOrder = section.imageSide === "right" ? "md:order-1" : "md:order-2";
  const imageOrder = section.imageSide === "right" ? "md:order-2" : "md:order-1";
  const copyShift = reducedMotion ? 0 : lerp(24, -12, progress);
  const imageShift = reducedMotion ? 0 : lerp(34, -34, progress);
  const copyStyle: CSSProperties = {
    opacity: reducedMotion || isVisible ? 1 : 0,
    transform: reducedMotion || isVisible ? `translate3d(0, ${copyShift}px, 0)` : "translate3d(0, 42px, 0)",
    transitionDelay: `${index * 80 + 90}ms`
  };

  return (
    <article
      ref={rowRef}
      className="what-content-row grid items-center gap-10 md:grid-cols-2 md:gap-14"
      data-visible={isVisible || reducedMotion ? "true" : "false"}
    >
      <div className={cn("flex justify-center", imageOrder)}>
        <IllustrationFrame
          image={section.image}
          index={index}
          progress={progress}
          isVisible={isVisible}
          reducedMotion={reducedMotion}
          imageShift={imageShift}
        />
      </div>

      <div
        className={cn("mx-auto max-w-[500px] text-center transition duration-700 ease-out", copyOrder)}
        style={copyStyle}
      >
        <div className="mb-5 flex justify-center">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg shadow-sm", section.accent)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-menorah-olive">{section.eyebrow}</p>
        <h3 className="mt-3 whitespace-pre-line font-body text-3xl font-medium uppercase leading-[1.18] tracking-[0.2em] text-foreground">
          {section.title.split("\n").map((line, lineIndex) => (
            <span
              key={line}
              className="what-title-line block"
              style={{ transitionDelay: `${index * 90 + lineIndex * 90 + 170}ms` }}
            >
              {line}
            </span>
          ))}
        </h3>
        <div
          className="what-body-copy mt-7 text-[16px] leading-[1.58] text-foreground/80"
          style={{ transitionDelay: `${index * 90 + 290}ms` }}
        >
          {section.body}
        </div>
      </div>
    </article>
  );
}

function IllustrationFrame({
  image,
  index,
  progress,
  isVisible,
  reducedMotion,
  imageShift
}: {
  image: { src: string; alt: string };
  index: number;
  progress: number;
  isVisible: boolean;
  reducedMotion: boolean;
  imageShift: number;
}) {
  const frameStyle: CSSProperties = {
    opacity: reducedMotion || isVisible ? 1 : 0,
    transform:
      reducedMotion || isVisible
        ? `translate3d(0, ${imageShift}px, 0) rotate(${lerp(-2, 2, progress) * (index % 2 === 0 ? 1 : -1)}deg) scale(${lerp(
            0.98,
            1.03,
            progress
          )})`
        : "translate3d(0, 54px, 0) rotate(-8deg) scale(0.92)",
    transitionDelay: `${index * 90}ms`
  };
  const imageStyle: CSSProperties = {
    transform: reducedMotion ? undefined : `scale(${lerp(1.08, 1.02, progress)}) translate3d(0, ${lerp(12, -10, progress)}px, 0)`
  };

  return (
    <div className="what-illustration-shell relative w-full max-w-[430px]" style={frameStyle}>
      <span className="what-image-ring what-image-ring-one" aria-hidden="true" />
      <span className="what-image-ring what-image-ring-two" aria-hidden="true" />
      <div className="what-image-frame relative flex aspect-square items-center justify-center overflow-hidden rounded-full border-[7px] border-menorah-cream bg-background">
        <span className="what-image-sheen" aria-hidden="true" />
        <Image
          src={image.src}
          alt={image.alt}
          width={600}
          height={600}
          sizes="(min-width: 768px) 430px, 86vw"
          className="h-full w-full object-cover"
          style={imageStyle}
        />
      </div>
      <div className="what-image-spark absolute right-8 top-8 flex h-10 w-10 items-center justify-center rounded-full bg-white text-menorah-green shadow-[0_12px_30px_rgba(35,45,36,0.12)]">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </div>
    </div>
  );
}

function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.24) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, threshold]);

  return isVisible;
}

function useElementProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0.5);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const element = ref.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const nextProgress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);

      setProgress((current) => (Math.abs(current - nextProgress) > 0.001 ? nextProgress : current));
    };

    const queueMeasure = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(queueMeasure);

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    measure();
    window.addEventListener("scroll", queueMeasure, { passive: true });
    window.addEventListener("resize", queueMeasure);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      resizeObserver.disconnect();
      window.removeEventListener("scroll", queueMeasure);
      window.removeEventListener("resize", queueMeasure);
    };
  }, [ref]);

  return progress;
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);

    updatePreference();
    media.addEventListener("change", updatePreference);

    return () => media.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
