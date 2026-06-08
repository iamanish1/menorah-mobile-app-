import type { Metadata } from "next";
import { DividerHeading } from "@/components/site/DividerHeading";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export const metadata: Metadata = {
  title: "Terms and Conditions | Menorah",
  description: "Terms and conditions for the Menorah mobile application."
};

const terms = [
  {
    title: "1. App Usage and Eligibility:",
    body: "The minimum age requirement to be an eligible user of Menorah App is 12 years. For individual aged 12-18 years, you need to access this app with consent of a legal guardian. By accessing and using this app, you confirm that you are eligible and have the legal capacity to enter into this Agreement."
  },
  {
    title: "2. Privacy and Confidentiality:",
    body: "We take your privacy and confidentiality seriously. Your interactions within the App, including chats with clinical psychologist students and peers, are secure and anonymous. We collect and handle your personal information in accordance with our Privacy Policy."
  },
  {
    title: "3. Professional Advice:",
    body: "Menorah's main aim is to open up a forum to communicate about mental health and its importance. The clinical psychologist students on the App provide advice, however they are not a substitute for professional mental health treatment. The provided guidance is not intended to replace the professional services of licensed practitioners. If our team advises you to consult a licensed practitioner or a certified senior consultant, it is important that you do so. This does not put any sort of responsibility or liability on Menorah with regards to the further consultation."
  },
  {
    title: "4. User Conduct:",
    body: "You agree to use the App responsibly and refrain from engaging in any harmful, offensive, or inappropriate behavior. You will not impersonate others, distribute harmful content, or violate any applicable laws or regulations."
  },
  {
    title: "5. Content Usage:",
    body: "Any content, including text, images, videos, or resources provided through the App, is for informational purposes only. You may not use, reproduce, or distribute such content without proper authorization from Menorah."
  },
  {
    title: "6. Feedback and Suggestions:",
    body: "We appreciate your feedback and suggestions regarding the App. By submitting feedback, you grant Menorah the right to use and implement your suggestions without any obligation to compensate you."
  },
  {
    title: "7. Intellectual Property:",
    body: "The Menorah logo, name, and any related content are protected by intellectual property laws. You may not use these materials without obtaining explicit permission from Menorah."
  },
  {
    title: "8. Disclaimers and Limitation of Liability:",
    body: 'The App is provided "as is," and Menorah does not make any warranties or guarantees regarding its accuracy, reliability, or effectiveness. We shall not be liable for any direct, indirect, or consequential damages arising from your use of the App.'
  },
  {
    title: "9. Changes to the Agreement:",
    body: "Menorah reserves the right to modify this Agreement at any time. Any changes will be communicated through the App or other means. Continued use of the App after such changes indicates your acceptance of the modified Agreement."
  },
  {
    title: "10. Termination:",
    body: "Menorah may suspend or terminate your access to the App at our discretion if you violate this Agreement or engage in any harmful conduct. You may also terminate your use of the App at any time."
  },
  {
    title: "11. Governing Law:",
    body: "This Agreement is governed by and construed in accordance with the laws of India. Any disputes arising from or relating to this Agreement will be subject to the exclusive jurisdiction of the courts in India."
  }
];

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-4xl">
          <DividerHeading>TERMS AND CONDITIONS</DividerHeading>

          <article className="mt-12 rounded-[2rem] border border-menorah-cream bg-menorah-page/55 p-6 shadow-dashboard md:p-10">
            <h1 className="font-display text-3xl leading-tight tracking-[0.06em]">Terms and Conditions</h1>
            <p className="mt-3 font-semibold">Terms and conditions - Menorah Health LLP</p>
            <p className="mt-7 text-[16px] leading-8 text-foreground/75">
              These Terms and Conditions (&quot;Agreement&quot;) govern your use of the Menorah mobile application
              (&quot;App&quot;), provided by Menorah Mental Health Organization (&quot;Menorah,&quot; &quot;we,&quot;
              &quot;us,&quot; or &quot;our&quot;). By using the Menorah App, you agree to abide by these terms. If you do
              not agree with any part of this Agreement, please do not use the App.
            </p>

            <div className="mt-10 space-y-8">
              {terms.map((term) => (
                <section key={term.title}>
                  <h2 className="text-lg font-semibold">{term.title}</h2>
                  <p className="mt-3 text-[16px] leading-8 text-foreground/75">{term.body}</p>
                </section>
              ))}
            </div>

            <section className="mt-10 border-t border-menorah-cream pt-8">
              <h2 className="text-lg font-semibold">Contact Us:</h2>
              <p className="mt-3 text-[16px] leading-8 text-foreground/75">
                If you have any questions or concerns about these Terms and Conditions, please contact us at{" "}
                <a href="mailto:menorahenquiries@gmail.com" className="font-semibold underline underline-offset-4">
                  menorahenquiries@gmail.com
                </a>
              </p>
              <p className="mt-7 text-[16px] leading-8 text-foreground/75">
                By using the Menorah App, you acknowledge that you have read, understood, and agreed to the terms outlined
                in this Agreement.
              </p>
            </section>
          </article>
        </section>

        <MenorahFooter />
      </main>
    </div>
  );
}
