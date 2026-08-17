import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="A transparent outline of the data categories and safeguards the final counsel-approved policy should address."
      sections={[
        {
          title: "Data we process",
          body: "Account identity, tenant configuration, operational records submitted by authorized users, subscription metadata, security events, and limited service telemetry may be processed to provide the service.",
        },
        {
          title: "Purpose and access",
          body: "Data should be used to operate, secure, support, and improve Qenvaro. Tenant business records remain tenant scoped; platform administrators normally see only tenant, subscription, limit, and health metadata.",
        },
        {
          title: "Retention and requests",
          body: "Retention periods, export rights, deletion workflows, legal holds, processor obligations, and regional rights must be finalized with counsel. Qenvaro uses a controlled request workflow rather than immediate browser deletion.",
        },
        {
          title: "Providers and transfers",
          body: "The final policy must identify hosting, authentication, email, billing, media, observability, and other subprocessors, including applicable transfer safeguards.",
        },
        {
          title: "Contact",
          body: "Replace this placeholder with the legal entity, privacy contact, registered address, and jurisdiction-specific disclosures before launch.",
        },
      ]}
    />
  );
}
