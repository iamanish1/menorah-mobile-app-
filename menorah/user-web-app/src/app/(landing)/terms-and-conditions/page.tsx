import type { Metadata } from "next";
import { DividerHeading } from "@/components/site/DividerHeading";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export const metadata: Metadata = {
  title: "Terms and Conditions | Menorah",
  description: "Terms and conditions for the Menorah Health platform."
};

const termsSections = [
  {
    title: "1. Agreement to Terms",
    paragraphs: [
      "These Terms and Conditions ('Terms') constitute a legally binding agreement between you ('User') and Menorah Health ('Company') governing your use of the Menorah Health mobile application, website, and all associated services (the 'Platform').",
      "By registering or using the Platform, you confirm you have read, understood, and agree to be bound by these Terms. If you do not agree to these Terms, you must not access or use the Platform."
    ]
  },
  {
    title: "2. Eligibility",
    items: [
      "You must be at least 18 years of age to use the Platform.",
      "You must be legally capable of entering into binding contracts under the Indian Contract Act, 1872.",
      "If you are accessing the Platform on behalf of an institution, such as an employer wellness programme, you represent that you have authority to bind that institution.",
      "Users residing outside India may be subject to additional local laws. By using the Platform, you confirm compliance with laws applicable in your jurisdiction."
    ]
  },
  {
    title: "3. Nature of Services",
    subsections: [
      {
        title: "3.1 What We Provide",
        paragraphs: ["Menorah Health provides a digital men's mental health platform offering:"],
        items: [
          "Individual therapy sessions with licensed mental health professionals via audio/video.",
          "Wellness tools including mood tracking, journaling, and psychoeducational content.",
          "Community and peer support features, where available.",
          "Crisis resource information and referrals."
        ]
      },
      {
        title: "3.2 What We Do Not Provide",
        paragraphs: ["The Platform is not a substitute for emergency mental health services. We do not provide:"],
        items: [
          "Psychiatric emergency intervention.",
          "Inpatient or residential mental health treatment.",
          "Prescription of medications, unless through a separately licensed psychiatrist on platform, if applicable.",
          "Medical diagnosis of any condition."
        ]
      }
    ]
  },
  {
    title: "4. Practitioner Standards",
    paragraphs: ["All therapists and mental health professionals on the Platform:"],
    items: [
      "Are registered with the Rehabilitation Council of India (RCI) or the relevant State Medical Council.",
      "Have been verified by Menorah Health prior to onboarding.",
      "Are bound by a separate Therapist/Contractor Agreement incorporating professional ethics obligations.",
      "Are independent professionals; Menorah Health does not control the clinical content of therapeutic advice."
    ],
    closing:
      "Menorah Health is responsible for platform operations and practitioner verification, but is not liable for the specific clinical advice or decisions of individual practitioners."
  },
  {
    title: "5. User Obligations",
    paragraphs: ["By using the Platform, you agree to:"],
    items: [
      "Provide accurate, truthful information during registration and sessions.",
      "Use the Platform only for lawful purposes.",
      "Not record sessions without the prior written consent of the therapist.",
      "Not share your account credentials with any other person.",
      "Not engage in harassment, abuse, or threatening behaviour toward practitioners or other users.",
      "Not attempt to circumvent platform security or access data of other users.",
      "Notify us immediately at support@menorahhealth.com if you believe your account has been compromised."
    ]
  },
  {
    title: "6. Intellectual Property",
    paragraphs: [
      "All content on the Platform, including text, graphics, logos, psychoeducational materials, software, and UX design, is the exclusive intellectual property of Menorah Health or its licensors, protected under the Copyright Act, 1957, and applicable international treaties.",
      "You are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform for personal, non-commercial purposes only.",
      "You may not reproduce, distribute, modify, or create derivative works from any Platform content without our prior written consent."
    ]
  },
  {
    title: "7. Fees, Billing & Auto-Renewal",
    items: [
      "Session fees and subscription prices are displayed on the Platform at the time of purchase and are inclusive of applicable GST.",
      "Subscription plans auto-renew at the end of each billing cycle. You may cancel auto-renewal at any time from your account settings.",
      "We reserve the right to modify pricing. You will be notified of price changes at least 15 days before they take effect.",
      "All payments are processed by PCI-DSS compliant third-party gateways. Menorah Health does not store card details."
    ]
  },
  {
    title: "8. Limitation of Liability",
    paragraphs: ["To the maximum extent permitted under applicable law:"],
    items: [
      "Menorah Health's total aggregate liability for any claim arising from use of the Platform shall not exceed the amount paid by you for services in the 3 months preceding the claim.",
      "We are not liable for indirect, incidental, special, punitive, or consequential damages, including loss of data or loss of opportunity.",
      "We are not liable for the clinical outcomes of therapy sessions conducted by independent practitioners on the Platform."
    ],
    closing:
      "Nothing in these Terms limits liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded under applicable law."
  },
  {
    title: "9. Indemnification",
    paragraphs: [
      "You agree to indemnify and hold harmless Menorah Health, its officers, directors, employees, and agents from any claims, losses, damages, or expenses, including legal fees, arising out of: (a) your breach of these Terms; (b) your misuse of the Platform; or (c) any content you submit through the Platform that infringes the rights of a third party."
    ]
  },
  {
    title: "10. Termination",
    paragraphs: [
      "Menorah Health may suspend or terminate your account without notice if you breach these Terms or if we are required to do so by law.",
      "You may delete your account at any time from account settings. Upon termination, your right to use the Platform ceases, but provisions relating to IP, liability, indemnification, and dispute resolution survive."
    ]
  },
  {
    title: "11. Dispute Resolution",
    subsections: [
      {
        title: "11.1 Grievance (Consumer Protection Act, 2019)",
        paragraphs: [
          "Users may first raise a complaint with our Grievance Officer at grievance@menorahhealth.com. We will respond within 30 days."
        ]
      },
      {
        title: "11.2 Arbitration",
        paragraphs: [
          "Unresolved disputes shall be referred to binding arbitration under the Arbitration and Conciliation Act, 1996, with a sole arbitrator appointed by mutual agreement. The seat of arbitration shall be [City], India. The language of arbitration shall be English."
        ]
      },
      {
        title: "11.3 Governing Law & Jurisdiction",
        paragraphs: [
          "These Terms shall be governed by the laws of India. Subject to the arbitration clause, courts in [City], India shall have exclusive jurisdiction.",
          "International users retain the protection of mandatory consumer laws in their home jurisdiction."
        ]
      }
    ]
  },
  {
    title: "12. Changes to Terms",
    paragraphs: [
      "We reserve the right to amend these Terms. Material changes will be communicated via email and in-app notification at least 15 days in advance. Continued use after the effective date constitutes acceptance of the revised Terms."
    ]
  }
] as const;

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-4xl">
          <DividerHeading>TERMS AND CONDITIONS</DividerHeading>

          <article className="mt-12 rounded-[2rem] border border-menorah-cream bg-menorah-page/55 p-6 shadow-dashboard md:p-10">
            <p className="font-brand text-sm uppercase tracking-[0.22em] text-menorah-olive">Menorah Health</p>
            <h1 className="mt-3 font-display text-3xl leading-tight tracking-[0.06em]">Terms and Conditions</h1>
            <p className="mt-3 text-sm font-semibold text-foreground/70">Effective: November 11, 2025 | v1.0</p>

            <div className="mt-10 space-y-8">
              {termsSections.map((section) => (
                <LegalSection key={section.title} section={section} />
              ))}
            </div>
          </article>
        </section>

        <MenorahFooter />
      </main>
    </div>
  );
}

function LegalSection({ section }: { section: (typeof termsSections)[number] }) {
  return (
    <section className="border-t border-menorah-cream/80 pt-7 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold leading-7">{section.title}</h2>
      {"paragraphs" in section &&
        section.paragraphs?.map((paragraph) => (
          <p key={paragraph} className="mt-3 text-[16px] leading-8 text-foreground/75">
            {paragraph}
          </p>
        ))}
      {"items" in section && section.items ? <LegalList items={section.items} /> : null}
      {"closing" in section && section.closing ? (
        <p className="mt-3 text-[16px] leading-8 text-foreground/75">{section.closing}</p>
      ) : null}
      {"subsections" in section && section.subsections ? (
        <div className="mt-5 space-y-5">
          {section.subsections.map((subsection) => (
            <section key={subsection.title} className="rounded-xl border border-menorah-cream/70 bg-white/55 p-4">
              <h3 className="text-base font-semibold leading-7">{subsection.title}</h3>
              {"paragraphs" in subsection &&
                subsection.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-[16px] leading-8 text-foreground/75">
                    {paragraph}
                  </p>
                ))}
              {"items" in subsection && subsection.items ? <LegalList items={subsection.items} /> : null}
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LegalList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-8 text-foreground/75">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
