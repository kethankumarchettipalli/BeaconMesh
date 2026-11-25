import { describe, it, expect } from "vitest";
import { BufferManager } from "../models/buffer-manager";
import { createDTNMessage } from "../models/dtn-message";
import { createOriginCopy, createForwardedCopy } from "../models/message-copy";
describe("BufferManager — Transactional Admission & Invariant Hardening", () => {
    it("rejects messages exceeding total buffer capacity", () => {
        const buffer = new BufferManager(100);
        const msg = createDTNMessage({
            originNodeId: "A",
            destinationNodeId: "B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 0,
            ttlMs: 5000,
            payloadSizeBytes: 150,
            payload: {},
        });
        const copy = createOriginCopy(msg, "A");
        const result = buffer.store(copy, 0);
        expect(result.stored).toBe(false);
        expect(result.reason).toBe("MESSAGE_EXCEEDS_MAX_CAPACITY");
    });
    it("drops expired messages during store without modifying buffer", () => {
        const buffer = new BufferManager(1000);
        const msg = createDTNMessage({
            originNodeId: "A",
            destinationNodeId: "B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 100,
            ttlMs: 500, // expires at 600
            payloadSizeBytes: 100,
            payload: {},
        });
        const copy = createOriginCopy(msg, "A");
        const result = buffer.store(copy, 650);
        expect(result.stored).toBe(false);
        expect(result.reason).toBe("EXPIRED_AT_ARRIVAL");
        expect(buffer.getUsageBytes()).toBe(0);
    });
    it("BM-FINDING-01: executes transactional admission for the exact 200-byte audit example without evicting valid copies", () => {
        // Audit scenario:
        // Capacity: 200 bytes
        // Held: 100-byte Routine (Priority 2) + 100-byte Origin SOS (Priority 0)
        // Incoming: 150-byte High Priority (Priority 1)
        // Result: 150 bytes cannot fit even if Routine is evicted (200 - 100 = 100 < 150).
        // Invariant: The 100-byte Routine message MUST NOT be evicted!
        const buffer = new BufferManager(200);
        const routineMsg = createDTNMessage({
            id: "routine-msg-1",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 100,
            ttlMs: 50000,
            payloadSizeBytes: 100,
            payload: {},
        });
        const routineCopy = createOriginCopy(routineMsg, "node-A");
        buffer.store(routineCopy, 100);
        const sosMsg = createDTNMessage({
            id: "sos-msg-1",
            originNodeId: "node-A",
            destinationNodeId: "gateway",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 100,
            ttlMs: 50000,
            payloadSizeBytes: 100,
            payload: {},
        });
        const sosCopy = createOriginCopy(sosMsg, "node-A");
        buffer.store(sosCopy, 100);
        expect(buffer.getUsageBytes()).toBe(200);
        expect(buffer.has("routine-msg-1")).toBe(true);
        expect(buffer.has("sos-msg-1")).toBe(true);
        // Incoming 150-byte Priority 1 message
        const highMsg = createDTNMessage({
            id: "high-msg-1",
            originNodeId: "node-C",
            destinationNodeId: "node-A",
            type: "HAZARD_REPORT",
            priority: 1,
            createdAtSimTime: 200,
            ttlMs: 50000,
            payloadSizeBytes: 150,
            payload: {},
        });
        const highCopy = createForwardedCopy(highMsg, "node-A", "node-C", 200, 1);
        const result = buffer.store(highCopy, 200);
        // Must be rejected transactionally
        expect(result.stored).toBe(false);
        expect(result.reason).toBe("INSUFFICIENT_BUFFER_CAPACITY");
        expect(result.evicted.length).toBe(0);
        // Existing buffer state MUST be 100% untouched
        expect(buffer.getUsageBytes()).toBe(200);
        expect(buffer.has("routine-msg-1")).toBe(true);
        expect(buffer.has("sos-msg-1")).toBe(true);
        expect(buffer.get("routine-msg-1")?.status).toBe("HOLDING");
    });
    it("evicts ONLY the minimum necessary candidates when admission succeeds", () => {
        // Capacity: 200 bytes
        // Held: two 50-byte Routine messages (Priority 2) + one 100-byte SOS (Priority 0)
        // Incoming: 40-byte High Priority message (Priority 1)
        // Invariant: Only the oldest 50-byte Routine message should be evicted. The second 50-byte Routine message remains!
        const buffer = new BufferManager(200);
        const r1 = createDTNMessage({
            id: "r1",
            originNodeId: "A",
            destinationNodeId: "B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 10,
            ttlMs: 50000,
            payloadSizeBytes: 50,
            payload: {},
        });
        buffer.store(createOriginCopy(r1, "A"), 10);
        const r2 = createDTNMessage({
            id: "r2",
            originNodeId: "A",
            destinationNodeId: "B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 20,
            ttlMs: 50000,
            payloadSizeBytes: 50,
            payload: {},
        });
        buffer.store(createOriginCopy(r2, "A"), 20);
        const sos = createDTNMessage({
            id: "sos",
            originNodeId: "A",
            destinationNodeId: "G",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 30,
            ttlMs: 50000,
            payloadSizeBytes: 100,
            payload: {},
        });
        buffer.store(createOriginCopy(sos, "A"), 30);
        expect(buffer.getUsageBytes()).toBe(200);
        // Incoming 40-byte message
        const incoming = createDTNMessage({
            id: "high-40",
            originNodeId: "C",
            destinationNodeId: "A",
            type: "HAZARD_REPORT",
            priority: 1,
            createdAtSimTime: 40,
            ttlMs: 50000,
            payloadSizeBytes: 40,
            payload: {},
        });
        const result = buffer.store(createForwardedCopy(incoming, "A", "C", 40, 1), 40);
        expect(result.stored).toBe(true);
        expect(result.evicted.length).toBe(1);
        expect(result.evicted[0].messageId).toBe("r1"); // Oldest evicted
        // Second routine message r2 MUST still be held!
        expect(buffer.has("r1")).toBe(false);
        expect(buffer.has("r2")).toBe(true);
        expect(buffer.has("sos")).toBe(true);
        expect(buffer.has("high-40")).toBe(true);
        // Total usage = 50 (r2) + 100 (sos) + 40 (high-40) = 190 <= 200
        expect(buffer.getUsageBytes()).toBe(190);
        expect(buffer.getUsageBytes()).toBeLessThanOrEqual(buffer.getMaxCapacityBytes());
    });
    it("strictly enforces FIFO eviction ordering: Routine (P2) before High (P1)", () => {
        const buffer = new BufferManager(200);
        const routineMsg = createDTNMessage({
            id: "p2",
            originNodeId: "A",
            destinationNodeId: "B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 10,
            ttlMs: 50000,
            payloadSizeBytes: 100,
            payload: {},
        });
        buffer.store(createOriginCopy(routineMsg, "A"), 10);
        const highMsg = createDTNMessage({
            id: "p1",
            originNodeId: "A",
            destinationNodeId: "B",
            type: "HAZARD_REPORT",
            priority: 1,
            createdAtSimTime: 20,
            ttlMs: 50000,
            payloadSizeBytes: 100,
            payload: {},
        });
        buffer.store(createOriginCopy(highMsg, "A"), 20);
        expect(buffer.getUsageBytes()).toBe(200);
        // Incoming 100-byte message should evict P2, leaving P1 intact
        const newMsg = createDTNMessage({
            id: "new-p1",
            originNodeId: "C",
            destinationNodeId: "B",
            type: "HAZARD_REPORT",
            priority: 1,
            createdAtSimTime: 30,
            ttlMs: 50000,
            payloadSizeBytes: 100,
            payload: {},
        });
        const result = buffer.store(createForwardedCopy(newMsg, "A", "C", 30, 1), 30);
        expect(result.stored).toBe(true);
        expect(result.evicted.length).toBe(1);
        expect(result.evicted[0].messageId).toBe("p2");
        expect(buffer.has("p1")).toBe(true);
        expect(buffer.has("new-p1")).toBe(true);
    });
    it("strictly protects origin-generated Critical SOS messages from eviction", () => {
        const buffer = new BufferManager(200);
        const sos1 = createDTNMessage({
            id: "sos-1",
            originNodeId: "citizen-1",
            destinationNodeId: "gateway",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 100,
            ttlMs: 60000,
            payloadSizeBytes: 100,
            payload: {},
        });
        buffer.store(createOriginCopy(sos1, "citizen-1"), 100);
        const sos2 = createDTNMessage({
            id: "sos-2",
            originNodeId: "citizen-1",
            destinationNodeId: "gateway",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 200,
            ttlMs: 60000,
            payloadSizeBytes: 100,
            payload: {},
        });
        buffer.store(createOriginCopy(sos2, "citizen-1"), 200);
        expect(buffer.getUsageBytes()).toBe(200);
        const transitSos = createDTNMessage({
            id: "transit-sos",
            originNodeId: "citizen-2",
            destinationNodeId: "gateway",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 300,
            ttlMs: 60000,
            payloadSizeBytes: 100,
            payload: {},
        });
        const copyTransit = createForwardedCopy(transitSos, "citizen-1", "citizen-2", 350, 1);
        const result = buffer.store(copyTransit, 350);
        expect(result.stored).toBe(false);
        expect(result.reason).toBe("CRITICAL_SATURATION_PROTECTED");
        expect(buffer.has("sos-1")).toBe(true);
        expect(buffer.has("sos-2")).toBe(true);
        expect(buffer.has("transit-sos")).toBe(false);
        expect(buffer.getUsageBytes()).toBe(200);
    });
});
