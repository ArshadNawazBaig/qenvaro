"use client";

import { useActionState } from "react";
import {
  acceptInvitationAction,
  type AcceptInvitationActionState,
} from "@/app/accept-invitation/actions";
import { Button } from "@/components/ui/button";

const initialAcceptInvitationState: AcceptInvitationActionState = {
  status: "idle",
  message: "",
};

export function AcceptInvitation({ invitationId }: { invitationId?: string }) {
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialAcceptInvitationState,
  );
  if (!invitationId)
    return (
      <p
        role="alert"
        className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      >
        This invitation link is incomplete.
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="bg-muted text-muted-foreground rounded-lg p-4 text-sm">
        Sign in with the invited, verified email address before accepting. The
        server will validate the invitation and organization membership.
      </p>
      {state.status === "error" && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {state.message}
        </p>
      )}
      <form action={action}>
        <input type="hidden" name="invitationId" value={invitationId} />
        <Button className="w-full" disabled={pending}>
          {pending ? "Accepting…" : "Accept invitation"}
        </Button>
      </form>
    </div>
  );
}
