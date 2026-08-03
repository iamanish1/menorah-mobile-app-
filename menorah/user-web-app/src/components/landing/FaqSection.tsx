"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaqQuestionForm } from "@/components/site/FaqQuestionForm";
import { useInView, usePrefersReducedMotion } from "@/components/landing/useLandingMotion";

const faqs = [
  {
    question: "What is Menorah?",
    answer:
      "Menorah is a men's mental health organization that offers support, guidance, and resources for men seeking help with their mental well-being. We provide a mobile app through which users can connect with clinical psychologist students and engage in peer-to-peer conversations to address their mental health concerns."
  },
  {
    question: "How does the Menorah app work?",
    answer:
      "The Menorah app allows you to chat with handpicked clinical psychologist students and engage in peer support with other men who have volunteered to help. You can choose from different age groups (15-18, 19-24, and 25-35) for peer support, and you have access to a range of educational resources, self-help tools, and support groups."
  },
  {
    question: "Is my conversation confidential?",
    answer:
      "Absolutely. We prioritize your privacy and confidentiality. All interactions within the Menorah app, whether with clinical psychologist students or peers, are secure and anonymous. You can express yourself openly without worrying about your information being shared."
  },
  {
    question: "How do I connect with clinical psychologist students?",
    answer:
      "Once you're on the Menorah app, you can initiate a chat with one of our handpicked clinical psychologist students. They are available 24/7 to provide expert advice, guidance, and support tailored to your mental health needs."
  },
  {
    question: 'What is "Man to Man" peer support?',
    answer:
      "Man to Man is a feature on the Menorah app that allows you to connect with other men who have volunteered to offer peer support. You can choose your age group (15-18, 19-24, or 25-35) and engage in conversations with individuals who may have experienced similar challenges or life stages."
  },
  {
    question: "Are there any self-help resources available on the app?",
    answer:
      "Yes, the Menorah app provides a variety of self-help resources, including articles, podcasts, newsletters and videos. These resources cover a wide range of mental health topics and are designed to empower you to take control of your mental well-being."
  },
  {
    question: "Is there a cost to using the Menorah app?",
    answer:
      "Our aim is to make mental health support accessible to all. All features of the app are free to all users. We are committed to providing value and ensuring that everyone can benefit from our resources."
  },
  {
    question: "How do I ensure my safety while using the app?",
    answer:
      "Menorah takes safety seriously. If you encounter inappropriate behavior or have concerns, contact support so the team can review it. In-app reporting and blocking are not currently available."
  },
  {
    question: "How do I get started with the Menorah app?",
    answer:
      "To get started, simply download the Menorah app from the Apple App Store or Google Play Store, create an account, and explore the various features available. You can begin chatting with clinical psychologist students, engaging in peer support, accessing resources, and joining support groups to enhance your mental well-being journey."
  },
  {
    question: "I think I have a serious problem with my mental health. What do I do to tackle it?",
    answer:
      "If you believe your situation is urgent or requires immediate attention, please don't hesitate to reach out to a licensed mental health professional or a healthcare provider in your local area. Remember, seeking help is a sign of strength, and you're taking important steps towards better mental health. Your well-being matters, and there are resources and people available to assist you on this journey."
  }
] as const;

export function FaqSection({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const headerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const headerVisible = useInView(headerRef);
  const formVisible = useInView(formRef);
  const reducedMotion = usePrefersReducedMotion();
  const Heading = headingLevel;

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="relative overflow-hidden bg-menorah-page px-[var(--landing-page-x)] py-[var(--landing-section-y-tight)] font-body text-foreground"
    >
      <div className="what-we-do-backdrop" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-[min(var(--landing-container),78rem)]">
        <div
          ref={headerRef}
          className={cn(
            "what-section-header mx-auto max-w-5xl text-center",
            headerVisible || reducedMotion ? "is-visible" : ""
          )}
        >
          <div className="mx-auto flex h-[clamp(3.5rem,4.4vw,4.75rem)] w-[clamp(3.5rem,4.4vw,4.75rem)] items-center justify-center rounded-full border border-menorah-cream bg-background shadow-dashboard">
            <HelpCircle className="h-8 w-8 text-menorah-olive" aria-hidden="true" />
          </div>
          <Heading id="faq-title" className="mt-[clamp(1.25rem,2vw,1.9rem)] font-display text-[length:var(--landing-h2)] leading-tight tracking-[0.08em]">
            FAQ&apos;S
          </Heading>
          <p className="mx-auto mt-[clamp(1rem,1.6vw,1.45rem)] max-w-[min(44rem,88vw)] text-[length:var(--landing-body-lg)] leading-[1.65] text-foreground/75">
            Straight answers about Menorah, confidentiality, peer support, safety, and getting started.
          </p>
        </div>

        <div className="mx-auto mt-[var(--landing-stack-gap)] max-w-[min(56rem,92vw)] space-y-[clamp(0.8rem,1.2vw,1.2rem)]">
          {faqs.map((faq, index) => (
            <FaqItem key={faq.question} faq={faq} index={index} reducedMotion={reducedMotion} />
          ))}
        </div>

        <section
          ref={formRef}
          className="mx-auto mt-[clamp(3rem,5vw,5rem)] max-w-[min(56rem,92vw)] rounded-[var(--landing-radius-xl)] border border-menorah-cream bg-background px-[var(--landing-card-pad-lg)] py-[clamp(2rem,3.6vw,3.6rem)] text-center shadow-dashboard transition duration-700 ease-out"
          style={getRevealStyle(formVisible, reducedMotion, 0)}
        >
          <h3 className="font-display text-[length:var(--landing-h3)] tracking-[0.08em]">Still have a question?</h3>
          <p className="mt-[clamp(0.75rem,1vw,1rem)] text-[length:var(--landing-body)] text-foreground/70">Ask your question here.</p>
          <FaqQuestionForm />
        </section>
      </div>
    </section>
  );
}

function FaqItem({
  faq,
  index,
  reducedMotion
}: {
  faq: (typeof faqs)[number];
  index: number;
  reducedMotion: boolean;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const isVisible = useInView(itemRef, 0.18);

  return (
    <div
      ref={itemRef}
      className="transition duration-500 ease-out"
      style={getRevealStyle(isVisible, reducedMotion, Math.min(index * 45, 260))}
    >
      <details
        className={cn(
          "group rounded-[var(--landing-radius-md)] border border-menorah-cream bg-background p-[var(--landing-card-pad)] shadow-sm transition-all duration-300 ease-out open:border-menorah-olive/35 open:shadow-dashboard",
          reducedMotion ? "duration-0" : "open:-translate-y-1 open:scale-[1.015]"
        )}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-[clamp(1rem,1.5vw,1.4rem)] text-left">
          <span className="text-[length:var(--landing-body)] font-semibold leading-[1.7]">
            {index + 1}. {faq.question}
          </span>
          <span className="mt-1 flex h-[clamp(1.75rem,2vw,2.15rem)] w-[clamp(1.75rem,2vw,2.15rem)] shrink-0 items-center justify-center rounded-full bg-menorah-page font-semibold text-menorah-olive transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <p className="mt-[clamp(0.9rem,1.2vw,1.15rem)] text-left text-[length:var(--landing-body-sm)] leading-[1.7] text-foreground/75">{faq.answer}</p>
      </details>
    </div>
  );
}

function getRevealStyle(isVisible: boolean, reducedMotion: boolean, delay: number): CSSProperties {
  return {
    opacity: reducedMotion || isVisible ? 1 : 0,
    transform: reducedMotion || isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 28px, 0)",
    transitionDelay: `${delay}ms`
  };
}
