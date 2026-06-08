"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaqQuestionForm } from "@/components/site/FaqQuestionForm";

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
      "Menorah takes safety seriously. We have implemented measures to ensure a safe and respectful environment within the app. If you encounter any inappropriate behavior or have concerns, you can report it, and our team will take appropriate action."
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
      className="relative overflow-hidden bg-menorah-page px-6 py-16 font-body text-foreground md:px-10 lg:px-20"
    >
      <div className="what-we-do-backdrop" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div
          ref={headerRef}
          className={cn(
            "what-section-header mx-auto max-w-5xl text-center",
            headerVisible || reducedMotion ? "is-visible" : ""
          )}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-menorah-cream bg-background shadow-dashboard">
            <HelpCircle className="h-8 w-8 text-menorah-olive" aria-hidden="true" />
          </div>
          <Heading id="faq-title" className="mt-6 font-display text-4xl leading-tight tracking-[0.08em] md:text-5xl">
            FAQ&apos;S
          </Heading>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-foreground/75">
            Straight answers about Menorah, confidentiality, peer support, safety, and getting started.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl space-y-4">
          {faqs.map((faq, index) => (
            <FaqItem key={faq.question} faq={faq} index={index} reducedMotion={reducedMotion} />
          ))}
        </div>

        <section
          ref={formRef}
          className="mx-auto mt-16 max-w-4xl rounded-[2rem] border border-menorah-cream bg-background px-6 py-10 text-center shadow-dashboard transition duration-700 ease-out md:px-10"
          style={getRevealStyle(formVisible, reducedMotion, 0)}
        >
          <h3 className="font-display text-3xl tracking-[0.08em]">Still have a question?</h3>
          <p className="mt-3 text-foreground/70">Ask your question here.</p>
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
          "group rounded-2xl border border-menorah-cream bg-background p-5 shadow-sm transition-all duration-300 ease-out open:border-menorah-olive/35 open:shadow-dashboard",
          reducedMotion ? "duration-0" : "open:-translate-y-1 open:scale-[1.015]"
        )}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-left">
          <span className="text-base font-semibold leading-7">
            {index + 1}. {faq.question}
          </span>
          <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-menorah-page font-semibold text-menorah-olive transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <p className="mt-4 text-left text-[15px] leading-7 text-foreground/75">{faq.answer}</p>
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
