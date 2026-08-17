import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirectAuthenticatedUserFromGuestRoute } from "./guest-route";

const mocks = vi.hoisted(() => ({
  findFirstWorkspaceForUser: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/tenants/onboarding-service", () => ({
  findFirstWorkspaceForUser: mocks.findFirstWorkspaceForUser,
}));
vi.mock("@/server/auth/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

describe("redirectAuthenticatedUserFromGuestRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("allows a guest to access an authentication page", async () => {
    mocks.getSession.mockResolvedValue(null);

    await redirectAuthenticatedUserFromGuestRoute();

    expect(mocks.findFirstWorkspaceForUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an authenticated member to an authorized workspace", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user_123" } });
    mocks.findFirstWorkspaceForUser.mockResolvedValue({
      tenantId: "tenant_123",
      tenantSlug: "northstar-goods",
    });

    await redirectAuthenticatedUserFromGuestRoute();

    expect(mocks.findFirstWorkspaceForUser).toHaveBeenCalledWith("user_123");
    expect(mocks.redirect).toHaveBeenCalledWith("/app/northstar-goods");
  });

  it("redirects an authenticated user without a workspace to onboarding", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user_456" } });
    mocks.findFirstWorkspaceForUser.mockResolvedValue(null);

    await redirectAuthenticatedUserFromGuestRoute();

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });
});
