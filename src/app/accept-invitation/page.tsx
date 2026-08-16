import Link from "next/link";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { AuthCard } from "@/components/auth/auth-card";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <AuthCard
      title="Join your team"
      description="Accept a verified organization invitation."
      footer={
        <>
          Need to sign in first?{" "}
          <Link
            href={`/sign-in`}
            className="text-primary font-medium hover:underline"
          >
            Open sign in
          </Link>
        </>
      }
    >
      <AcceptInvitation invitationId={id} />
    </AuthCard>
  );
}
