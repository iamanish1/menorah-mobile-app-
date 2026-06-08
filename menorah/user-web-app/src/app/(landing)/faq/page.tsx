import type { Metadata } from "next";
import { FaqSection } from "@/components/landing/FaqSection";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export const metadata: Metadata = {
  title: "FAQ's | Menorah",
  description: "Frequently asked questions about Menorah and the Menorah mental health app for men."
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main>
        <FaqSection headingLevel="h1" />
        <MenorahFooter />
      </main>
    </div>
  );
}
