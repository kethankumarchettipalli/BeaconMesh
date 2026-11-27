/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

const {
    mockDoc,
    mockGetDoc,
    mockSetDoc,
    mockUpdateDoc,
    mockGetDocs,
    mockOnSnapshot,
    mockWriteBatch,
    mockAuth,
    mockLocalDb,
    mockUseIsMobile,
} = vi.hoisted(() => {
    const store = new Map();
    const localNotifications = new Map();
    const batchOps = [];
    const batch = {
        update: vi.fn((ref, data) => batchOps.push({ ref, data })),
        commit: vi.fn(async () => {
            for (const op of batchOps.splice(0, batchOps.length)) {
                const prev = store.get(op.ref.path) || {};
                store.set(op.ref.path, { ...prev, ...op.data });
            }
        }),
    };
    return {
        store,
        localNotifications,
        mockDoc: vi.fn((_db, col, id) => ({ path: `${col}/${id}`, id })),
        mockGetDoc: vi.fn(async (ref) => ({
            exists: () => store.has(ref.path),
            data: () => store.get(ref.path),
        })),
        mockSetDoc: vi.fn(async (ref, data) => {
            store.set(ref.path, {
                ...data,
                createdAt: new Date().toISOString(),
            });
        }),
        mockUpdateDoc: vi.fn(async (ref, patch) => {
            const prev = store.get(ref.path) || {};
            store.set(ref.path, { ...prev, ...patch });
        }),
        mockGetDocs: vi.fn(async () => ({
            forEach: () => {},
        })),
        mockOnSnapshot: vi.fn((_q, onNext) => {
            onNext({ forEach: () => {} });
            return vi.fn();
        }),
        mockWriteBatch: vi.fn(() => batch),
        mockAuth: { currentUser: { uid: "citizen-1", displayName: "Citizen One" } },
        mockLocalDb: {
            notifications: {
                get: vi.fn(async (id) => localNotifications.get(id)),
                put: vi.fn(async (rec) => {
                    localNotifications.set(rec.id, rec);
                }),
                update: vi.fn(async (id, patch) => {
                    const prev = localNotifications.get(id);
                    if (prev)
                        localNotifications.set(id, { ...prev, ...patch });
                }),
                bulkPut: vi.fn(async (rows) => {
                    for (const r of rows)
                        localNotifications.set(r.id, r);
                }),
                where: vi.fn(() => ({
                    equals: vi.fn((uid) => ({
                        toArray: vi.fn(async () =>
                            Array.from(localNotifications.values()).filter((n) => n.recipientId === uid)
                        ),
                    })),
                })),
            },
            _clear: () => {
                store.clear();
                localNotifications.clear();
            },
            _store: store,
            _localNotifications: localNotifications,
        },
        mockUseIsMobile: vi.fn(() => false),
    };
});

vi.mock("firebase/firestore", () => ({
    collection: vi.fn((_db, name) => ({ name })),
    doc: mockDoc,
    getDoc: mockGetDoc,
    setDoc: mockSetDoc,
    updateDoc: mockUpdateDoc,
    getDocs: mockGetDocs,
    onSnapshot: mockOnSnapshot,
    query: vi.fn((...args) => ({ args })),
    where: vi.fn((...args) => ({ args })),
    orderBy: vi.fn((...args) => ({ args })),
    limit: vi.fn((n) => ({ n })),
    serverTimestamp: vi.fn(() => "SERVER_TS"),
    writeBatch: mockWriteBatch,
}));

vi.mock("@/lib/firebase", () => ({
    db: {},
    auth: mockAuth,
    isFirebaseConfigured: true,
}));

vi.mock("@/lib/db/dexie-db", () => ({
    getLocalDb: () => mockLocalDb,
}));

vi.mock("@/hooks/use-mobile", () => ({
    useIsMobile: mockUseIsMobile,
}));

import {
    NOTIFICATION_EVENTS,
    buildNotificationId,
    createLocalNotification,
    createNotificationIdempotent,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    subscribeToUserNotifications,
} from "@/lib/services/notification-service";
import { NotificationCenter } from "@/components/beaconmesh/notification-center";

describe("BeaconMesh Notification Service & UI", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalDb._clear();
        mockAuth.currentUser = { uid: "citizen-1", displayName: "Citizen One" };
        mockUseIsMobile.mockReturnValue(false);
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    });

    it("generates deterministic notification IDs and prevents duplicate creation on retry", async () => {
        const id1 = buildNotificationId("SOS_SYNCED:BM-2611-TEST01", "citizen-1");
        const id2 = buildNotificationId("SOS_SYNCED:BM-2611-TEST01", "citizen-1");
        expect(id1).toBe(id2);

        const first = await createNotificationIdempotent({
            recipientUid: "citizen-1",
            eventType: NOTIFICATION_EVENTS.SOS_SYNCED,
            title: "SOS synced",
            message: "Command can now receive your SOS.",
            incidentId: "BM-2611-TEST01",
            priority: "HIGH",
            dedupKey: "SOS_SYNCED:BM-2611-TEST01",
        });
        expect(first).not.toBeNull();
        expect(mockSetDoc).toHaveBeenCalledTimes(1);

        // Retry should hit existing doc and NOT call setDoc again
        const second = await createNotificationIdempotent({
            recipientUid: "citizen-1",
            eventType: NOTIFICATION_EVENTS.SOS_SYNCED,
            title: "SOS synced",
            message: "Command can now receive your SOS.",
            incidentId: "BM-2611-TEST01",
            priority: "HIGH",
            dedupKey: "SOS_SYNCED:BM-2611-TEST01",
        });
        expect(second?.id).toBe(first?.id);
        expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    it("creates local-only offline SOS notification without claiming Command received it", async () => {
        const local = await createLocalNotification({
            recipientUid: "citizen-1",
            eventType: NOTIFICATION_EVENTS.SOS_SAVED_LOCALLY,
            title: "SOS BM-2611-OFF01 saved on device",
            message: "Report BM-2611-OFF01 is saved locally offline. Command has NOT received it yet.",
            incidentId: "BM-2611-OFF01",
            priority: "CRITICAL",
            dedupKey: "SOS_SAVED_LOCALLY:BM-2611-OFF01",
        });
        expect(local.isLocalOnly).toBe(true);
        expect(local.message).toContain("Command has NOT received it yet");
        expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it("marks single and all notifications as read and cleans up subscription", async () => {
        await createNotificationIdempotent({
            recipientUid: "citizen-1",
            eventType: NOTIFICATION_EVENTS.SOS_SYNCED,
            title: "SOS synced",
            message: "Synced.",
            incidentId: "BM-1",
            dedupKey: "SOS_SYNCED:BM-1",
        });
        await createNotificationIdempotent({
            recipientUid: "citizen-1",
            eventType: NOTIFICATION_EVENTS.INCIDENT_ACKNOWLEDGED,
            title: "Acknowledged",
            message: "Command acknowledged.",
            incidentId: "BM-1",
            dedupKey: "INCIDENT_ACKNOWLEDGED:BM-1",
        });

        const n1Id = buildNotificationId("SOS_SYNCED:BM-1", "citizen-1");
        const n2Id = buildNotificationId("INCIDENT_ACKNOWLEDGED:BM-1", "citizen-1");

        await markNotificationAsRead(n1Id, "citizen-1");
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);

        await markAllNotificationsAsRead(
            [
                { id: n1Id, recipientUid: "citizen-1", isRead: true },
                { id: n2Id, recipientUid: "citizen-1", isRead: false },
            ],
            "citizen-1"
        );
        expect(mockWriteBatch).toHaveBeenCalledTimes(1);

        const unsub = subscribeToUserNotifications("citizen-1", vi.fn());
        expect(typeof unsub).toBe("function");
        unsub();
    });

    it("renders NotificationCenter unread badge, mark read, incident navigation, and mobile panel", async () => {
        const onMarkRead = vi.fn();
        const onMarkAllRead = vi.fn();
        const onSelectIncident = vi.fn();
        const sample = [
            {
                id: "n-1",
                recipientUid: "citizen-1",
                eventType: NOTIFICATION_EVENTS.RESPONDER_ASSIGNED,
                title: "Responder dispatched (BM-2611-001)",
                message: "A field responder has been assigned to your Medical report.",
                incidentId: "BM-2611-001",
                priority: "HIGH",
                isRead: false,
                createdAt: new Date().toISOString(),
            },
            {
                id: "n-2",
                recipientUid: "citizen-1",
                eventType: NOTIFICATION_EVENTS.SOS_SYNCED,
                title: "SOS synced",
                message: "Report synced.",
                incidentId: "BM-2611-001",
                priority: "NORMAL",
                isRead: true,
                createdAt: new Date().toISOString(),
            },
        ];

        mockUseIsMobile.mockReturnValue(true);
        render(
            <NotificationCenter
                notifications={sample}
                isAuthenticated={true}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onSelectIncident={onSelectIncident}
            />
        );

        expect(screen.getByTestId("notification-unread-badge")).toHaveTextContent("1");
        fireEvent.click(screen.getByRole("button", { name: /Notifications \(1 unread\)/i }));

        const dialog = screen.getByRole("dialog", { name: /Notification center/i });
        expect(dialog.className).toContain("fixed inset-x-3");

        fireEvent.click(screen.getByRole("button", { name: /Mark all read/i }));
        expect(onMarkAllRead).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText(/Responder dispatched \(BM-2611-001\)/i));
        await waitFor(() => {
            expect(onMarkRead).toHaveBeenCalledWith("n-1");
            expect(onSelectIncident).toHaveBeenCalledWith("BM-2611-001", sample[0]);
        });
    });

    it("clears notifications on logout/account switch and handles empty, loading, error, and Escape close", () => {
        const onUpdate = vi.fn();
        const unsubEmpty = subscribeToUserNotifications(null, onUpdate);
        expect(onUpdate).toHaveBeenCalledWith([]);
        unsubEmpty();

        const { rerender } = render(
            <NotificationCenter
                notifications={[]}
                loading={true}
                isAuthenticated={true}
            />
        );
        fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
        expect(screen.getByText(/Loading notifications/i)).toBeInTheDocument();

        rerender(
            <NotificationCenter
                notifications={[]}
                loading={false}
                error="Network unavailable"
                isAuthenticated={true}
                onRefresh={vi.fn()}
            />
        );
        expect(screen.getByText("Network unavailable")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog", { name: /Notification center/i })).not.toBeInTheDocument();
    });

    it("emits deterministic lifecycle notifications without duplicates across retries", async () => {
        const events = [
            [NOTIFICATION_EVENTS.SOS_SYNCED, "citizen-1", "SOS_SYNCED:BM-LC-1"],
            [NOTIFICATION_EVENTS.SOS_RECEIVED, "cmd-1", "SOS_RECEIVED:BM-LC-1"],
            [NOTIFICATION_EVENTS.INCIDENT_ACKNOWLEDGED, "citizen-1", "INCIDENT_ACKNOWLEDGED:BM-LC-1"],
            [NOTIFICATION_EVENTS.ASSIGNMENT_OFFERED, "resp-1", "ASSIGNMENT_OFFERED:BM-LC-1:resp-1"],
            [NOTIFICATION_EVENTS.RESPONDER_ASSIGNED, "citizen-1", "RESPONDER_ASSIGNED:BM-LC-1:resp-1"],
            [NOTIFICATION_EVENTS.ASSIGNMENT_ACCEPTED, "citizen-1", "ASSIGNMENT_ACCEPTED:BM-LC-1:resp-1"],
            [NOTIFICATION_EVENTS.RESPONDER_EN_ROUTE, "citizen-1", "RESPONDER_EN_ROUTE:BM-LC-1:resp-1"],
            [NOTIFICATION_EVENTS.RESPONDER_ON_SCENE, "citizen-1", "RESPONDER_ON_SCENE:BM-LC-1:resp-1"],
            [NOTIFICATION_EVENTS.ASSISTANCE_STARTED, "citizen-1", "ASSISTANCE_STARTED:BM-LC-1:resp-1"],
            [NOTIFICATION_EVENTS.RESOLUTION_SUBMITTED, "cmd-1", "RESOLUTION_SUBMITTED:BM-LC-1"],
            [NOTIFICATION_EVENTS.INCIDENT_CLOSED, "citizen-1", "INCIDENT_CLOSED:BM-LC-1"],
        ];

        for (const [eventType, recipientUid, dedupKey] of events) {
            await createNotificationIdempotent({
                recipientUid,
                eventType,
                title: `${eventType} (BM-LC-1)`,
                message: `Lifecycle event ${eventType}`,
                incidentId: "BM-LC-1",
                priority: "HIGH",
                dedupKey,
            });
            // Retry same event
            await createNotificationIdempotent({
                recipientUid,
                eventType,
                title: `${eventType} (BM-LC-1)`,
                message: `Lifecycle event ${eventType}`,
                incidentId: "BM-LC-1",
                priority: "HIGH",
                dedupKey,
            });
        }

        expect(mockSetDoc).toHaveBeenCalledTimes(events.length);
    });
});
