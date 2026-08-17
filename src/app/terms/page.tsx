import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of service" };
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      summary="A product-aligned outline for the binding agreement that counsel must prepare before production launch."
      sections={[
        {
          title: "Service scope",
          body: "Qenvaro provides multi-tenant operational software for catalog, inventory, sales, purchasing, people, payroll, expenses, and reporting according to the subscribed plan.",
        },
        {
          title: "Operational limitations",
          body: "Recorded payment methods do not process a tenant’s customer payments. Payroll and operational reports do not claim jurisdiction-specific tax, payroll, or statutory accounting compliance.",
        },
        {
          title: "Accounts and acceptable use",
          body: "Customers are responsible for authorized access, accurate configuration, lawful content, secure credentials, and compliance with applicable laws. Abuse, unauthorized access, malicious uploads, and attempts to bypass plan or security controls must be prohibited.",
        },
        {
          title: "Billing and availability",
          body: "The final terms must define trials, renewals, cancellation, taxes, failed payments, suspension, service levels, support, warranties, liability, and termination using counsel-approved language.",
        },
        {
          title: "Governing terms",
          body: "Replace this placeholder with the contracting entity, governing law, dispute process, notice address, and effective date before launch.",
        },
      ]}
    />
  );
}
