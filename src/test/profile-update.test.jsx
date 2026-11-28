/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

const { mockUpdateDoc, mockDoc, mockRefreshProfile } = vi.hoisted(() => ({
    mockUpdateDoc: vi.fn(async () => {}),
    mockDoc: vi.fn((_db, col, id) => ({ path: `${col}/${id}` })),
    mockRefreshProfile: vi.fn(async () => {}),
}));

let currentPath = "/responder/profile";
let currentProfile = {
    uid: "resp-1",
    displayName: "Kethan Responder",
    email: "resp@beaconmesh.org",
    role: "RESPONDER",
    responderSubtype: "PROFESSIONAL",
    requestedUnit: "MEDICAL",
    organization: "SDRF",
    designation: "Paramedic",
    experienceYears: 4,
    dutyStatus: "AVAILABLE",
    approvalStatus: "APPROVED",
    accountStatus: "ACTIVE",
    capabilities: ["CITIZEN", "RESPONDER"],
    phoneNumber: "+91 9000000000",
    region: "Andhra Pradesh",
    district: "NTR District",
    city: "Vijayawada",
};

vi.mock("firebase/firestore", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        doc: mockDoc,
        updateDoc: mockUpdateDoc,
        serverTimestamp: vi.fn(() => "SERVER_TS"),
    };
});

vi.mock("@/lib/firebase", () => ({
    db: {},
    auth: { currentUser: { uid: "resp-1", emailVerified: true } },
    isFirebaseConfigured: true,
}));

vi.mock("@tanstack/react-router", () => ({
    Link: ({ children, to, ...props }) => React.createElement("a", { href: to, ...props }, children),
    useNavigate: () => vi.fn(),
    useRouterState: ({ select }) => select({ location: { pathname: currentPath, search: "", searchStr: "" } }),
}));

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({
        user: { uid: currentProfile.uid, email: currentProfile.email, emailVerified: true },
        profile: currentProfile,
        status: "AUTHORIZED",
        loading: false,
        refreshProfile: mockRefreshProfile,
        signOut: vi.fn(),
    }),
    evaluateRoleAuthorization: vi.fn(() => ({ isAuthorized: true, isPending: false })),
}));

vi.mock("@/lib/services/incident-service", () => ({
    createEmergencyReport: vi.fn(),
    getUserIncidents: vi.fn(async () => []),
    getAllIncidents: vi.fn(async () => []),
    updateIncidentStatus: vi.fn(),
    subscribeToIncidents: vi.fn(() => () => {}),
    appendIncidentTimelineEvent: vi.fn(),
    subscribeToIncidentTimeline: vi.fn(() => () => {}),
}));

vi.mock("@/lib/services/safezone-service", () => ({
    createAndVerifySafeZone: vi.fn(),
    subscribeToSafeZones: vi.fn(() => () => {}),
}));

vi.mock("@/lib/services/notification-service", () => ({
    subscribeToUserNotifications: vi.fn((_uid, cb) => {
        cb([]);
        return () => {};
    }),
    markNotificationAsRead: vi.fn(),
    markAllNotificationsAsRead: vi.fn(),
}));

vi.mock("@/lib/services/sync-service", () => ({
    initAutoSync: vi.fn(() => () => {}),
    flushOutbox: vi.fn(async () => ({ processed: 0, failed: 0 })),
}));

import { updateUserPreferences } from "@/lib/user-service";
import { BeaconPage } from "@/components/beaconmesh/app";

describe("Multi-Dashboard Profile Page & Personal Details Update", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
        currentPath = "/responder/profile";
    });

    it("updateUserPreferences sends only Firestore-allowed personal fields and serverTimestamp, never displayName or role", async () => {
        await updateUserPreferences("resp-1", {
            displayName: "Attacker Name",
            role: "COMMAND",
            phoneNumber: "+91 7386014778",
            region: "Andhra Pradesh",
            district: "Krishna",
            city: "Vijayawada",
            language: "Telugu",
            emergencyContacts: "Control · 112",
        });

        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const payload = mockUpdateDoc.mock.calls[0][1];
        expect(payload).toEqual({
            updatedAt: "SERVER_TS",
            phoneNumber: "+91 7386014778",
            region: "Andhra Pradesh",
            district: "Krishna",
            city: "Vijayawada",
        });
        expect(payload.displayName).toBeUndefined();
        expect(payload.role).toBeUndefined();
        expect(payload.language).toBeUndefined();
        expect(payload.emergencyContacts).toBeUndefined();
    });

    it("renders Responder & Command profile pages with locked Full name and saves personal details", async () => {
        const { rerender } = render(<BeaconPage />);

        expect(screen.getByText(/ACCOUNT & ROLE STANDING \(READ-ONLY\)/i)).toBeInTheDocument();
        expect(screen.getByText("SDRF")).toBeInTheDocument();
        expect(screen.getByText("Paramedic")).toBeInTheDocument();

        const nameInput = screen.getByLabelText(/Full name \(locked\)/i);
        expect(nameInput).toBeDisabled();
        expect(nameInput).toHaveValue("Kethan Responder");

        fireEvent.change(screen.getByLabelText(/Phone number/i), { target: { value: "+91 9876543210" } });
        fireEvent.click(screen.getByRole("button", { name: /Save personal details/i }));

        await waitFor(() => {
            expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
            expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
            expect(screen.getByText(/Personal details updated and synced/i)).toBeInTheDocument();
        });

        // Switch to Command profile
        currentProfile = {
            ...currentProfile,
            uid: "cmd-1",
            displayName: "Command Admin",
            role: "COMMAND",
            commandLevel: "ADMINISTRATOR",
            capabilities: ["COMMAND"],
        };
        currentPath = "/command/profile";
        rerender(<BeaconPage />);
        expect(screen.getAllByText(/Command · ADMINISTRATOR/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("Command Level:")).toBeInTheDocument();
    });
});
