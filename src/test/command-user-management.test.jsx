import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockAuthState = {
  user: { uid: "admin-1", displayName: "Kethan Kumar Chettipalli", email: "admin@beaconmesh.org", emailVerified: true },
  profile: {
    uid: "admin-1",
    displayName: "Kethan Kumar Chettipalli",
    email: "admin@beaconmesh.org",
    role: "COMMAND",
    commandLevel: "ADMINISTRATOR",
    accountStatus: "ACTIVE",
    emailVerified: true,
    capabilities: [],
  },
  status: "AUTHORIZED",
  emailVerified: true,
  loading: false,
  isConfigured: true,
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
  setSessionRole: vi.fn(),
};

let currentPath = "/command/users";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }) => React.createElement("a", { href: to, ...props }, children),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }) => select({ location: { pathname: currentPath, search: "" } }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockAuthState,
  evaluateRoleAuthorization: vi.fn(() => ({ isAuthorized: true, isPending: false })),
}));

const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db, name) => ({ _collection: name })),
    doc: vi.fn((_db, col, id) => ({ _collection: col, id })),
    query: vi.fn((col, ...constraints) => ({ col, constraints })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    orderBy: vi.fn((field, dir) => ({ field, dir })),
    limit: vi.fn((n) => ({ limit: n })),
    getDocs: (...args) => mockGetDocs(...args),
    getDoc: (...args) => mockGetDoc(...args),
    setDoc: (...args) => mockSetDoc(...args),
    updateDoc: (...args) => mockUpdateDoc(...args),
    writeBatch: () => ({
      update: mockBatchUpdate,
      set: mockBatchSet,
      commit: mockBatchCommit,
    }),
  };
});

const mockFirebase = vi.hoisted(() => ({
  auth: { currentUser: { uid: "admin-1", displayName: "Kethan Kumar Chettipalli", email: "admin@beaconmesh.org" } },
  db: {},
  isFirebaseConfigured: true,
}));
vi.mock("@/lib/firebase", () => mockFirebase);

import {
  getOperationalUserDirectory,
  createPersonnelInvitation,
  approveResponderApplication,
  rejectResponderApplication,
  suspendUserAccount,
  reactivateUserAccount,
  claimInvitationAndCreateProfile,
} from "@/lib/services/command-service";
import { BeaconPage } from "@/components/beaconmesh/app";

describe("Command Personnel Provisioning, Directory Scoping & Audit Trail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPath = "/command/users";
    mockFirebase.auth.currentUser = {
      uid: "admin-1",
      displayName: "Kethan Kumar Chettipalli",
      email: "admin@beaconmesh.org",
      emailVerified: true,
    };
    mockAuthState.user = mockFirebase.auth.currentUser;
    mockAuthState.profile = {
      uid: "admin-1",
      displayName: "Kethan Kumar Chettipalli",
      email: "admin@beaconmesh.org",
      role: "COMMAND",
      commandLevel: "ADMINISTRATOR",
      accountStatus: "ACTIVE",
      emailVerified: true,
      capabilities: [],
    };
    mockGetDocs.mockResolvedValue({ empty: true, forEach: () => {} });
    mockBatchCommit.mockResolvedValue();
  });

  it("scopes Coordinator directory to RESPONDER only and blocks Citizens/Admins/Coordinators", async () => {
    mockGetDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({ data: () => ({ uid: "c1", displayName: "Cit", role: "CITIZEN", accountStatus: "ACTIVE", email: "c@x.com" }) });
        cb({ data: () => ({ uid: "r1", displayName: "Resp", role: "RESPONDER", responderSubtype: "PROFESSIONAL", accountStatus: "ACTIVE", email: "r@x.com" }) });
        cb({ data: () => ({ uid: "a1", displayName: "Adm", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE", email: "a@x.com" }) });
      },
    });

    const coordList = await getOperationalUserDirectory("COORDINATOR");
    expect(coordList).toHaveLength(1);
    expect(coordList[0].uid).toBe("r1");
  });

  it("blocks Coordinator from calling createPersonnelInvitation directly and blocks creating ADMINISTRATOR", async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "coord-1", role: "COMMAND", commandLevel: "COORDINATOR", accountStatus: "ACTIVE" }),
    });
    await expect(
      createPersonnelInvitation({
        fullName: "Unauthorized",
        email: "unauth@example.com",
        targetRole: "COMMAND",
        targetCommandLevel: "COORDINATOR",
      })
    ).rejects.toThrow(/Only active Command Administrators/i);

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "admin-1", displayName: "Kethan Admin", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
    });
    await expect(
      createPersonnelInvitation({
        fullName: "Second Admin",
        email: "admin2@example.com",
        targetRole: "COMMAND",
        targetCommandLevel: "ADMINISTRATOR",
      })
    ).rejects.toThrow(/Provisioning another Administrator is prohibited/i);
  });

  it("creates Coordinator invitation with UUID token and rejects duplicate pending email", async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "admin-1", displayName: "Kethan Kumar Chettipalli", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
    });
    mockGetDocs
      .mockResolvedValueOnce({ empty: true })
      .mockResolvedValueOnce({ empty: true });
    mockSetDoc.mockResolvedValueOnce();

    const res = await createPersonnelInvitation({
      fullName: "Priya Sharma",
      email: "Priya@Agency.ORG",
      targetRole: "COMMAND",
      targetCommandLevel: "COORDINATOR",
    });

    expect(res.email).toBe("priya@agency.org");
    expect(res.targetRole).toBe("COMMAND");
    expect(res.targetCommandLevel).toBe("COORDINATOR");
    expect(res.targetUnit).toBeNull();
    expect(res.inviteUrl).toContain("/signup?invite=");
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    // Duplicate pending invitation rejected
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "admin-1", displayName: "Kethan Kumar Chettipalli", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
    });
    mockGetDocs.mockResolvedValueOnce({ empty: false });
    await expect(
      createPersonnelInvitation({
        fullName: "Priya Sharma",
        email: "priya@agency.org",
        targetRole: "COMMAND",
        targetCommandLevel: "COORDINATOR",
      })
    ).rejects.toThrow(/pending invitation already exists/i);
  });

  it("requires operational unit for Responder invitations and forbids unit for Command Operations", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: "admin-1", displayName: "Kethan Admin", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
    });

    await expect(
      createPersonnelInvitation({
        fullName: "Bad Coord",
        email: "coord@agency.org",
        targetRole: "COMMAND",
        targetCommandLevel: "COORDINATOR",
        targetUnit: "MEDICAL",
      })
    ).rejects.toThrow(/cannot specify a responder operational unit/i);

    await expect(
      createPersonnelInvitation({
        fullName: "No Unit Resp",
        email: "resp@agency.org",
        targetRole: "RESPONDER",
        targetResponderSubtype: "PROFESSIONAL",
      })
    ).rejects.toThrow(/valid operational unit is required/i);
  });

  it("blocks self-suspension, requires suspension reason, and reactivates status only", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: "admin-1", displayName: "Kethan Admin", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
    });

    await expect(suspendUserAccount("admin-1", "Test")).rejects.toThrow(/cannot suspend their own account/i);
    await expect(suspendUserAccount("cit-1", "   ")).rejects.toThrow(/reason is required/i);

    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: "admin-1", displayName: "Kethan Admin", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: "cit-1", role: "CITIZEN", accountStatus: "ACTIVE" }),
      });
    const susp = await suspendUserAccount("cit-1", "Policy violation");
    expect(susp.accountStatus).toBe("SUSPENDED");
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accountStatus: "SUSPENDED" }));

    vi.clearAllMocks();
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: "admin-1", displayName: "Kethan Admin", role: "COMMAND", commandLevel: "ADMINISTRATOR", accountStatus: "ACTIVE" }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ uid: "cit-1", role: "CITIZEN", accountStatus: "SUSPENDED" }),
      });
    const react = await reactivateUserAccount("cit-1");
    expect(react.accountStatus).toBe("ACTIVE");
    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accountStatus: "ACTIVE" }));
  });

  it("claims invitation using trusted role/unit and invitee persona fields", async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    const profile = await claimInvitationAndCreateProfile(
      { uid: "inv-u1", email: "resp@agency.org", emailVerified: true },
      {
        id: "inv-1",
        status: "PENDING",
        email: "resp@agency.org",
        fullName: "Invited Medic",
        targetRole: "RESPONDER",
        targetResponderSubtype: "PROFESSIONAL",
        targetUnit: "MEDICAL",
        invitedByUid: "admin-1",
      },
      {
        fullName: "Invited Medic",
        organization: "Red Cross EMS",
        designation: "Senior Paramedic",
        credentialsSummary: "ACLS, PHTLS",
      }
    );

    expect(profile.role).toBe("RESPONDER");
    expect(profile.responderSubtype).toBe("PROFESSIONAL");
    expect(profile.requestedUnit).toBe("MEDICAL");
    expect(profile.organization).toBe("Red Cross EMS");
    expect(profile.designation).toBe("Senior Paramedic");
  });

  it("records trusted reviewerName, reviewerRole COMMAND, and reviewerCommandLevel on approval and rejection", async () => {
    const applicantDoc = {
      exists: () => true,
      data: () => ({
        uid: "app-1",
        displayName: "Applicant One",
        email: "app1@example.com",
        emailVerified: true,
        accountStatus: "ACTIVE",
        responderApplicationStatus: "PENDING",
        approvalStatus: "PENDING",
        requestedResponderSubtype: "PROFESSIONAL",
        citizenEnrollmentStatus: "ACTIVE",
      }),
    };
    const adminReviewerDoc = {
      exists: () => true,
      data: () => ({
        uid: "admin-1",
        displayName: "Kethan Kumar Chettipalli",
        role: "COMMAND",
        commandLevel: "ADMINISTRATOR",
        accountStatus: "ACTIVE",
      }),
    };

    mockGetDoc.mockResolvedValueOnce(applicantDoc).mockResolvedValueOnce(adminReviewerDoc);
    await approveResponderApplication("app-1", "admin-1", { approvedSubtype: "PROFESSIONAL" });

    const reviewCall = mockBatchSet.mock.calls.find((c) => c[0]._collection === "responderApplicationReviews");
    expect(reviewCall[1]).toMatchObject({
      reviewerUid: "admin-1",
      reviewerName: "Kethan Kumar Chettipalli",
      reviewerRole: "COMMAND",
      reviewerCommandLevel: "ADMINISTRATOR",
      reviewerDesignation: "Command Administrator",
      decision: "APPROVED",
    });

    vi.clearAllMocks();
    const coordReviewerDoc = {
      exists: () => true,
      data: () => ({
        uid: "coord-1",
        displayName: "Ravi Operations",
        role: "COMMAND",
        commandLevel: "COORDINATOR",
        accountStatus: "ACTIVE",
      }),
    };
    mockGetDoc.mockResolvedValueOnce(applicantDoc).mockResolvedValueOnce(coordReviewerDoc);
    await rejectResponderApplication("app-1", "coord-1", "Missing SDRF ID");

    const rejectCall = mockBatchSet.mock.calls.find((c) => c[0]._collection === "responderApplicationReviews");
    expect(rejectCall[1]).toMatchObject({
      reviewerUid: "coord-1",
      reviewerName: "Ravi Operations",
      reviewerRole: "COMMAND",
      reviewerCommandLevel: "COORDINATOR",
      reviewerDesignation: "Command Operations / Coordinator",
      decision: "REJECTED",
      rejectionReason: "Missing SDRF ID",
    });
  });

  it("renders Add Personnel tab for ADMINISTRATOR and hides it + Manage controls for COORDINATOR", async () => {
    const { rerender } = render(React.createElement(BeaconPage));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Add Personnel/i })).toBeInTheDocument();
    });

    // Click Add Personnel tab and verify 3 role cards and dynamic Operational Unit visibility
    fireEvent.click(screen.getByRole("tab", { name: /Add Personnel/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Command Operations/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Responder.*Professional/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Responder.*Volunteer/i })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Operational Unit/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Organization/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Responder.*Professional/i }));
    expect(screen.getByLabelText(/Operational Unit/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Organization/i)).not.toBeInTheDocument();

    // Switch to Coordinator
    mockAuthState.profile = {
      ...mockAuthState.profile,
      uid: "coord-1",
      displayName: "Ravi Operations",
      commandLevel: "COORDINATOR",
    };
    rerender(React.createElement(BeaconPage));

    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: /Add Personnel/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Manage$/i })).not.toBeInTheDocument();
  });
});
