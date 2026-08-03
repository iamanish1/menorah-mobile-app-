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
      "Menorah is a men's wellbeing platform for finding counsellors reviewed through Menorah's verification process, booking one-to-one sessions, using secure chat, completing optional wellbeing check-ins, and reading practical resources."
  },
  {
    question: "How does the Menorah app work?",
    answer:
      "Create an account, browse counsellor profiles and hourly rates, choose an available time, complete payment, and manage your booking in the app. Secure chat, wellbeing check-ins, and educational articles are also available."
  },
  {
    question: "How is my conversation protected?",
    answer:
      "Menorah uses access controls and secure transport to protect in-app chat. Access and disclosure are governed by our Privacy Policy and applicable safety or legal obligations, so privacy is not without limits and chat is not anonymous."
  },
  {
    question: "How do I connect with a counsellor?",
    answer:
      "Browse verified counsellor profiles, areas of focus, availability, and hourly rates. After you choose and book an available session, the app gives you the relevant booking and secure-chat options. Availability varies by counsellor."
  },
  {
    question: "Does Menorah currently offer peer-to-peer chat?",
    answer:
      "Menorah is currently focused on verified counsellor discovery, paid one-to-one bookings, secure counsellor chat, wellbeing check-ins, and educational resources. Peer-to-peer community chat is not part of the current production service."
  },
  {
    question: "Are there any self-help resources available on the app?",
    answer:
      "Yes. Menorah provides practical mental-health and wellbeing articles alongside optional wellbeing check-ins. These resources are educational and informational; they do not provide a diagnosis, medical advice, or emergency support."
  },
  {
    question: "Is there a cost to using the Menorah app?",
    answer:
      "Browsing resources may not require a paid session, but one-to-one counsellor bookings are paid at the hourly rate shown on the counsellor's profile. Review the rate and final payment details before confirming."
  },
  {
    question: "How do I ensure my safety while using the app?",
    answer:
      "Menorah takes safety seriously. If you encounter inappropriate behavior or have concerns, contact support so the team can review it. In-app reporting and blocking are not currently available."
  },
  {
    question: "How do I get started with the Menorah app?",
    answer:
      "Download Menorah Health, create an account, complete your profile, and browse verified counsellors and educational resources. When you are ready, select an available counsellor and booking time and review the price before payment."
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
            Straight answers about Menorah, counsellor bookings, privacy, safety, and getting started.
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
