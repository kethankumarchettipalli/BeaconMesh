import { describe, it, expect } from "vitest";
import { VirtualNode } from "../models/virtual-node";
import { EpidemicRouter } from "../routing/epidemic-router";
import { createDTNMessage } from "../models/dtn-message";
import { createOriginCopy } from "../models/message-copy";
import { EventPhase } from "../core/event-types";
import { SimulationEngine } from "../core/simulation-engine";
describe("EpidemicRouter — In-Flight Duplicate Suppression & Lifetime Verification", () => {
    it("exchanges summary vectors and schedules transmissions for missing messages", () => {
        const router = new EpidemicRouter(35);
        const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
        const nodeB = new VirtualNode({ id: "node-B", type: "CITIZEN", position: { x: 10, y: 0 } });
        const msg = createDTNMessage({
            id: "m-1",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload: { text: "hi" },
        });
        nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
        const events = router.onNeighborContact(nodeA, nodeB, 1000);
        expect(events.length).toBe(1);
        expect(events[0].simTimeMs).toBe(1035);
        expect(events[0].eventPhase).toBe(EventPhase.TRANSMISSION);
        expect(events[0].nodeId).toBe("node-A");
        expect(events[0].payload.targetNodeId).toBe("node-B");
    });
    it("does not schedule transmission if recipient already holds the message", () => {
        const router = new EpidemicRouter(35);
        const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
        const nodeB = new VirtualNode({ id: "node-B", type: "CITIZEN", position: { x: 10, y: 0 } });
        const msg = createDTNMessage({
            id: "m-1",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload: { text: "hi" },
        });
        nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
        nodeB.buffer.store(createOriginCopy(msg, "node-B"), 1000);
        const events = router.onNeighborContact(nodeA, nodeB, 1000);
        expect(events.length).toBe(0);
    });
    it("BM-FINDING-04: suppresses redundant transmission scheduling during repeated contact while transfer is in flight", () => {
        const router = new EpidemicRouter(35);
        const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
        const nodeB = new VirtualNode({ id: "node-B", type: "CITIZEN", position: { x: 10, y: 0 } });
        const msg = createDTNMessage({
            id: "m-flight-1",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload: { text: "in flight test" },
        });
        nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
        // Contact 1 at t = 1000ms schedules transmission at 1035ms
        const events1 = router.onNeighborContact(nodeA, nodeB, 1000);
        expect(events1.length).toBe(1);
        expect(router.isInFlight("node-A", "node-B", "m-flight-1")).toBe(true);
        // Contact 2 occurs at t = 1010ms (while transfer is still in flight)
        const events2 = router.onNeighborContact(nodeA, nodeB, 1010);
        // MUST NOT schedule duplicate in-flight transmission
        expect(events2.length).toBe(0);
    });
    it("Section 3 Requirement: ensures duplicate contact at the EXACT SAME simulation timestamp cannot bypass suppression", () => {
        const router = new EpidemicRouter(35);
        const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
        const nodeB = new VirtualNode({ id: "node-B", type: "CITIZEN", position: { x: 10, y: 0 } });
        const msg = createDTNMessage({
            id: "m-simultaneous",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 500,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload: { urgent: true },
        });
        nodeA.buffer.store(createOriginCopy(msg, "node-A"), 500);
        // Two rapid back-to-back contact encounters triggered at the EXACT SAME timestamp (t = 500ms)
        const eventsA = router.onNeighborContact(nodeA, nodeB, 500);
        const eventsB = router.onNeighborContact(nodeA, nodeB, 500);
        expect(eventsA.length).toBe(1);
        expect(eventsB.length).toBe(0); // Second encounter at same millisecond is suppressed!
    });
    it("Section 3 Requirement: in-flight reservation lifetime (pending -> success -> cleared, receiver holds)", () => {
        const router = new EpidemicRouter(35);
        const engine = new SimulationEngine({ seed: 777, router });
        const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
        const gateway = new VirtualNode({ id: "gw-1", type: "GATEWAY", position: { x: 20, y: 0 } });
        engine.addNode(nodeA);
        engine.addNode(gateway);
        const msg = createDTNMessage({
            id: "m-lifetime-ok",
            originNodeId: "node-A",
            destinationNodeId: "gw-1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload: { status: "test lifetime" },
        });
        nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
        // 1. Initial contact schedules transfer
        const events = router.onNeighborContact(nodeA, gateway, 1000);
        expect(events.length).toBe(1);
        // 2. Reservation is active while transfer is pending
        expect(router.isInFlight("node-A", "gw-1", "m-lifetime-ok")).toBe(true);
        // 3. Execute successful transmission event
        router.handleTransmissionEvent(events[0], engine);
        // 4. Reservation is cleared
        expect(router.isInFlight("node-A", "gw-1", "m-lifetime-ok")).toBe(false);
        // 5. Gateway holds delivered message
        expect(gateway.hasDelivered("m-lifetime-ok")).toBe(true);
        // 6. Subsequent contact does NOT schedule transfers because gateway already has it
        const postEvents = router.onNeighborContact(nodeA, gateway, 1050);
        expect(postEvents.length).toBe(0);
    });
    it("releases in-flight reservation on failed execution allowing retry on subsequent contact", () => {
        const router = new EpidemicRouter(35);
        const engine = new SimulationEngine({ seed: 100, router });
        const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 }, radioRangeMeters: 50 });
        const nodeB = new VirtualNode({ id: "node-B", type: "CITIZEN", position: { x: 10, y: 0 }, radioRangeMeters: 50 });
        engine.addNode(nodeA);
        engine.addNode(nodeB);
        const msg = createDTNMessage({
            id: "m-fail-retry",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload: { text: "retry me" },
        });
        nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
        // 1. Initial contact schedules transfer
        const events = router.onNeighborContact(nodeA, nodeB, 1000);
        expect(events.length).toBe(1);
        expect(router.isInFlight("node-A", "node-B", "m-fail-retry")).toBe(true);
        // 2. Move nodeB out of range before transmission executes
        nodeB.position = { x: 500, y: 500 };
        // 3. Execute transmission event -> fails OUT_OF_RANGE
        router.handleTransmissionEvent(events[0], engine);
        // In-flight reservation must be released!
        expect(router.isInFlight("node-A", "node-B", "m-fail-retry")).toBe(false);
        expect(nodeB.buffer.has("m-fail-retry")).toBe(false);
        // 4. Move nodeB back in range and establish contact again
        nodeB.position = { x: 10, y: 0 };
        const retryEvents = router.onNeighborContact(nodeA, nodeB, 1100);
        // Retry is successfully scheduled!
        expect(retryEvents.length).toBe(1);
        expect(router.isInFlight("node-A", "node-B", "m-fail-retry")).toBe(true);
        // 5. Execute retry -> succeeds!
        router.handleTransmissionEvent(retryEvents[0], engine);
        expect(nodeB.buffer.has("m-fail-retry")).toBe(true);
        expect(router.isInFlight("node-A", "node-B", "m-fail-retry")).toBe(false);
    });
});
