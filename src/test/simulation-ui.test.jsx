/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

let currentPath = "/command/simulation";
const mockIsMobile = vi.fn(() => false);

vi.mock("@tanstack/react-router", () => ({
    Link: ({ children, to, ...props }) => React.createElement("a", { href: to, ...props }, children),
    useNavigate: () => vi.fn(),
    useRouterState: ({ select }) => select({ location: { pathname: currentPath, search: "", searchStr: "" } }),
}));

vi.mock("@/hooks/use-mobile", () => ({
    useIsMobile: () => mockIsMobile(),
}));

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({
        user: { uid: "coord-1", displayName: "Command Lead", email: "coord@beaconmesh.org", emailVerified: true },
        profile: {
            uid: "coord-1",
            displayName: "Command Lead",
            role: "COMMAND",
            commandLevel: "COORDINATOR",
            accountStatus: "ACTIVE",
            emailVerified: true,
            capabilities: ["COMMAND"],
        },
        status: "AUTHORIZED",
        loading: false,
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

import { BeaconPage } from "@/components/beaconmesh/app";
import { initializeSimulation, pauseSimulation } from "@/lib/services/simulation-service";

describe("Simulation Laboratory & Message Intelligence UI Integration", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        currentPath = "/command/simulation";
        mockIsMobile.mockReturnValue(false);
        initializeSimulation("Normal connectivity");
    });

    afterEach(() => {
        pauseSimulation();
        vi.useRealTimers();
    });

    it("drives Play, Step, Inject, Reset and shares live state with Message Intelligence", () => {
        const { rerender } = render(<BeaconPage />);

        expect(screen.getByText(/Tick 0 · 0 message\(s\)/i)).toBeInTheDocument();

        // Inject simulation message
        fireEvent.click(screen.getByRole("button", { name: /Inject simulation message/i }));
        expect(screen.getByText(/Tick 0 · 1 message\(s\)/i)).toBeInTheDocument();
        expect(screen.getByText(/MSG-SIM-001 · Created/i)).toBeInTheDocument();

        // Step advances exactly 1 tick
        fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));
        expect(screen.getByText(/Tick 1 · 1 message\(s\)/i)).toBeInTheDocument();

        // Play advances simulation automatically
        fireEvent.click(screen.getByRole("button", { name: /^Play$/i }));
        act(() => {
            vi.advanceTimersByTime(3600);
        });
        expect(screen.getByText(/MSG-SIM-001 · Delivered/i)).toBeInTheDocument();

        // Switch route to Message Intelligence (/command/messages) — shared session persists
        currentPath = "/command/messages";
        rerender(<BeaconPage />);

        expect(screen.getByText("SIMULATION DATA")).toBeInTheDocument();
        expect(screen.getByText("MSG-SIM-001")).toBeInTheDocument();
        expect(screen.getByText(/ROUTE HISTORY · MSG-SIM-001/i)).toBeInTheDocument();
        expect(screen.getByText(/MESSAGE_DELIVERED/i)).toBeInTheDocument();

        // Filter & Search work
        const searchInput = screen.getByLabelText("Search simulation messages");
        fireEvent.change(searchInput, { target: { value: "NONEXISTENT" } });
        expect(screen.getByText(/No simulation messages match the current filter/i)).toBeInTheDocument();
        fireEvent.change(searchInput, { target: { value: "MSG-SIM-001" } });
        expect(screen.getByText("MSG-SIM-001")).toBeInTheDocument();

        // Switch back to Simulation Lab and Reset — clears both views
        currentPath = "/command/simulation";
        rerender(<BeaconPage />);
        fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
        expect(screen.getByText(/Tick 0 · 0 message\(s\)/i)).toBeInTheDocument();

        currentPath = "/command/messages";
        rerender(<BeaconPage />);
        expect(screen.getByText(/No simulation messages match/i)).toBeInTheDocument();
    });

    it("renders mobile layout cleanly when useIsMobile returns true", () => {
        mockIsMobile.mockReturnValue(true);
        currentPath = "/command/simulation";
        render(<BeaconPage />);
        expect(screen.getByRole("button", { name: /Inject simulation message/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Play$/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Step$/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Reset$/i })).toBeInTheDocument();
    });
});
