import type { Metadata } from "next";
import { DividerHeading } from "@/components/site/DividerHeading";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export const metadata: Metadata = {
  title: "Privacy Policy | Menorah",
  description: "Privacy policy for the Menorah Health platform."
};

const definitions = [
  {
    term: "Personal Data",
    description:
      "Any information relating to an identified or identifiable natural person, including name, email, health data, and device identifiers."
  },
  {
    term: "Sensitive Personal Data (SPD)",
    description:
      "Health records, mental health history, session notes, biometric data, and financial data, as defined under SPDI Rules 2011 and DPDP Act 2023."
  },
  {
    term: "Data Fiduciary",
    description:
      "Menorah Health, as the entity that determines the purposes and means of processing your data, equivalent to 'data controller' under GDPR."
  },
  {
    term: "Data Principal",
    description: "You, the individual user whose personal data is being processed."
  },
  {
    term: "Processing",
    description: "Any operation on personal data including collection, storage, use, disclosure, or deletion."
  }
] as const;

const legalBasisRows = [
  ["Providing therapy and wellness services", "Consent + Contract", "Art. 6(1)(b) - Contract"],
  ["Processing mental health data", "Explicit Consent (DPDP/MHCA)", "Art. 9(2)(a) - Explicit Consent"],
  ["Payment processing", "Contract performance", "Art. 6(1)(b) - Contract"],
  ["Platform safety and crisis intervention", "Legitimate interest / vital interests", "Art. 6(1)(d) - Vital Interests"],
  ["Product improvement (anonymised)", "Legitimate interest", "Art. 6(1)(f) - Legitimate Interest"],
  ["Legal compliance and audit", "Legal obligation", "Art. 6(1)(c) - Legal Obligation"],
  ["Marketing (opt-in only)", "Consent", "Art. 6(1)(a) - Consent"]
] as const;

const privacySections = [
  {
    title: "1. About This Policy",
    paragraphs: [
      "Menorah Health ('Company', 'we', 'us', or 'our') operates a digital men's mental health platform accessible via mobile application and website, collectively the 'Platform'.",
      "This Privacy Policy explains how we collect, use, store, share, and protect your personal data. It also sets out your rights as a user.",
      "By creating an account or using the Platform, you consent to the data practices described in this Policy. If you do not agree, please discontinue use of the Platform immediately."
    ]
  },
  {
    title: "3. Data We Collect",
    subsections: [
      {
        title: "3.1 Data You Provide Directly",
        items: [
          "Registration data: name, date of birth, email address, phone number, gender identity.",
          "Health and wellness data: mood logs, journal entries, symptom check-ins, mental health assessments.",
          "Session data: audio/video recordings of therapy sessions, only with explicit consent, and session notes.",
          "Payment data: billing details processed via PCI-DSS compliant payment gateways; we do not store card numbers.",
          "Communications: messages, feedback, support queries."
        ]
      },
      {
        title: "3.2 Data Collected Automatically",
        items: [
          "Device data: device type, OS, app version, unique device identifiers (UDID/IDFA/GAID).",
          "Usage data: features accessed, session duration, clickstream data.",
          "Log data: IP address, timestamps, crash reports.",
          "Location data: approximate location derived from IP, not GPS, unless you grant location permission."
        ]
      },
      {
        title: "3.3 Data From Third Parties",
        items: [
          "Therapist-provided clinical notes and assessments.",
          "Payment gateway transaction references.",
          "App store analytics, anonymised and aggregated only."
        ]
      }
    ]
  },
  {
    title: "5. Data Sharing & Disclosure",
    subsections: [
      {
        title: "5.1 With Therapists",
        paragraphs: [
          "Your session data and health records are shared with the therapist assigned to you on the Platform, strictly for the purpose of providing therapeutic services."
        ]
      },
      {
        title: "5.2 With Service Providers",
        paragraphs: [
          "We engage third-party processors, including cloud storage, payment gateways, and analytics providers, under Data Processing Agreements that restrict them to processing your data only on our instructions."
        ]
      },
      {
        title: "5.3 Legal Disclosure",
        paragraphs: [
          "We may disclose data where required by Indian law, court order, or a competent authority. We will notify you where legally permissible before complying with such requests."
        ]
      },
      {
        title: "5.4 Crisis Situations",
        paragraphs: [
          "If we reasonably believe a user is at imminent risk of self-harm or harm to others, we may share necessary information with emergency services without prior consent, consistent with our obligations under the MHCA 2017 and Telemedicine Practice Guidelines 2020."
        ]
      },
      {
        title: "5.5 We Never Sell Your Data",
        paragraphs: [
          "Menorah Health does not sell, rent, or trade your personal data to advertisers or any third party for commercial purposes."
        ]
      }
    ]
  },
  {
    title: "6. Data Retention",
    items: [
      "Therapy session notes and clinical records: 7 years from last session, minimum, as recommended under MHCA 2017 guidelines.",
      "Account data: for the duration of your account, plus 3 years after deletion for legal compliance.",
      "Payment records: 8 years, as required under Indian tax laws.",
      "Marketing data: until you withdraw consent.",
      "Anonymised analytics data: indefinitely."
    ]
  },
  {
    title: "7. Data Security",
    paragraphs: ["We implement the following safeguards:"],
    items: [
      "AES-256 encryption for data at rest; TLS 1.3 for data in transit.",
      "Role-based access control: therapists can only access their own clients' data.",
      "Multi-factor authentication for all practitioner accounts.",
      "Regular third-party penetration testing and vulnerability assessments.",
      "Data localisation: all personal data of Indian users is stored on servers physically located in India.",
      "Data breach notification: we will notify affected users and the Data Protection Board of India within 72 hours of becoming aware of a breach, as required under DPDP Rules 2025."
    ]
  },
  {
    title: "8. Your Rights",
    subsections: [
      {
        title: "8.1 Rights Under DPDP Act 2023 (Indian Users)",
        items: [
          "Right to access: obtain a summary of personal data held and how it is being processed.",
          "Right to correction: correct inaccurate or incomplete personal data.",
          "Right to erasure: request deletion of your data, subject to legal retention requirements.",
          "Right to grievance redressal: raise complaints with our Grievance Officer.",
          "Right to nominate: nominate a person to exercise rights on your behalf in case of incapacity or death."
        ]
      },
      {
        title: "8.2 Additional Rights Under GDPR (EU/EEA Users)",
        items: [
          "Right to data portability: receive your data in a structured, machine-readable format.",
          "Right to object: object to processing based on legitimate interests.",
          "Right to restrict processing: request we limit how your data is used.",
          "Right to lodge a complaint with your national supervisory authority."
        ]
      },
      {
        title: "8.3 Additional Rights Under CCPA (California Users)",
        items: [
          "Right to know what personal information is collected and how it is used.",
          "Right to opt-out of any sale of personal information; we do not sell.",
          "Right to non-discrimination for exercising your rights."
        ]
      }
    ]
  },
  {
    title: "9. Cookies & Tracking",
    paragraphs: [
      "Our web platform uses cookies and similar technologies for authentication, security, and analytics. You may control cookie preferences through your browser settings. We do not use third-party advertising cookies."
    ]
  },
  {
    title: "10. Children's Privacy",
    paragraphs: [
      "The Platform is strictly intended for users aged 18 and above. We do not knowingly collect data from minors. If we discover that a minor has provided data without parental consent, we will delete it immediately."
    ]
  },
  {
    title: "11. International Data Transfers",
    paragraphs: [
      "If your data is transferred outside India, for example for global analytics tools, we ensure equivalent protections via Standard Contractual Clauses (SCCs) under GDPR and comply with data localisation obligations under DPDP Rules 2025 for Indian users' sensitive personal data."
    ]
  },
  {
    title: "12. Changes to This Policy",
    paragraphs: [
      "We may update this Policy. Material changes will be notified via email and in-app notification at least 15 days before they take effect. Continued use of the Platform after the effective date constitutes acceptance of the revised Policy."
    ]
  }
] as const;

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-4xl">
          <DividerHeading>PRIVACY POLICY</DividerHeading>

          <article className="mt-12 rounded-[2rem] border border-menorah-cream bg-menorah-page/55 p-6 shadow-dashboard md:p-10">
            <p className="font-brand text-sm uppercase tracking-[0.22em] text-menorah-olive">Menorah Health</p>
            <h1 className="mt-3 font-display text-3xl leading-tight tracking-[0.06em]">Privacy Policy</h1>
            <p className="mt-3 text-sm font-semibold text-foreground/70">Effective: November 11, 2025 | v1.0</p>

            <div className="mt-10 space-y-8">
              {privacySections.slice(0, 1).map((section) => (
                <LegalSection key={section.title} section={section} />
              ))}

              <section className="border-t border-menorah-cream/80 pt-7">
                <h2 className="text-lg font-semibold leading-7">2. Definitions</h2>
                <div className="mt-4 grid gap-3">
                  {definitions.map((definition) => (
                    <div key={definition.term} className="rounded-xl border border-menorah-cream/70 bg-white/55 p-4">
                      <h3 className="text-base font-semibold">{definition.term}</h3>
                      <p className="mt-2 text-[16px] leading-8 text-foreground/75">{definition.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              {privacySections.slice(1, 2).map((section) => (
                <LegalSection key={section.title} section={section} />
              ))}

              <section className="border-t border-menorah-cream/80 pt-7">
                <h2 className="text-lg font-semibold leading-7">4. Purposes of Processing & Legal Basis</h2>
                <div className="mt-4 overflow-x-auto rounded-xl border border-menorah-cream/80 bg-white/55">
                  <table className="min-w-[720px] text-left text-sm">
                    <thead className="bg-menorah-cream/45 text-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Purpose</th>
                        <th className="px-4 py-3 font-semibold">Legal Basis (India)</th>
                        <th className="px-4 py-3 font-semibold">Legal Basis (EU/GDPR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-menorah-cream/80 text-foreground/75">
                      {legalBasisRows.map(([purpose, india, eu]) => (
                        <tr key={purpose}>
                          <td className="px-4 py-3 align-top">{purpose}</td>
                          <td className="px-4 py-3 align-top">{india}</td>
                          <td className="px-4 py-3 align-top">{eu}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {privacySections.slice(2).map((section) => (
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

function LegalSection({ section }: { section: (typeof privacySections)[number] }) {
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
