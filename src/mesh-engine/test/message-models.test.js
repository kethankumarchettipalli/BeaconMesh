import { describe, it, expect } from "vitest";
import { createDTNMessage, computePayloadDigest, } from "../models/dtn-message";
import { createOriginCopy, createForwardedCopy, } from "../models/message-copy";
describe("DTN Message Models — Immutability & Shared Reference Support", () => {
    it("creates an immutable frozen DTN message with deterministic digest", () => {
        const payload = { latitude: 37.7749, longitude: -122.4194, text: "SOS help needed" };
        const msg = createDTNMessage({
            id: "sos-001",
            originNodeId: "citizen-1",
            destinationNodeId: "gateway-1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 1000,
            ttlMs: 300000,
            payloadSizeBytes: 256,
            payload,
        });
        expect(msg.id).toBe("sos-001");
        expect(msg.priority).toBe(0);
        expect(msg.expiresAtSimTime).toBe(301000);
        expect(msg.payloadDigest).toBe(computePayloadDigest(payload));
        expect(Object.isFrozen(msg)).toBe(true);
        expect(Object.isFrozen(msg.payload)).toBe(true);
        // Mutation throws in strict mode
        expect(() => {
            // @ts-expect-error mutating frozen object
            msg.priority = 1;
        }).toThrow();
    });
    it("Section 2 Requirement: accepts valid shared references (DAG) without false circular error", () => {
        const shared = { lat: 16.5, lon: 80.6 };
        const payload = {
            origin: shared,
            destination: shared,
        };
        // Must NOT throw "Circular reference detected"
        const msg = createDTNMessage({
            id: "sos-shared-ref",
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 128,
            payload,
        });
        // 1. Both references point to deeply frozen objects
        const p = msg.payload;
        expect(p.origin).toEqual({ lat: 16.5, lon: 80.6 });
        expect(p.destination).toEqual({ lat: 16.5, lon: 80.6 });
        expect(Object.isFrozen(p.origin)).toBe(true);
        expect(Object.isFrozen(p.destination)).toBe(true);
        // 2. Shared reference identity is preserved in the clone
        expect(p.origin).toBe(p.destination);
        // 3. Mutating throws in strict mode
        expect(() => {
            p.origin.lat = 99.9;
        }).toThrow();
        // 4. Modifying caller's original unshared object has zero impact
        shared.lat = 0.0;
        expect(p.origin.lat).toBe(16.5);
        expect(p.destination.lat).toBe(16.5);
        // 5. Canonical digest is deterministic
        expect(typeof msg.payloadDigest).toBe("string");
        expect(msg.payloadDigest.length).toBe(8);
    });
    it("continues to strictly reject genuine circular references (cycles)", () => {
        // 1. Self-reference
        const selfRef = { note: "self cycle" };
        selfRef.self = selfRef;
        expect(() => createDTNMessage({
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 0,
            ttlMs: 1000,
            payloadSizeBytes: 100,
            payload: selfRef,
        })).toThrowError(/Circular reference detected/);
        // 2. Mutual circular reference (A -> B -> A)
        const nodeA = { name: "A" };
        const nodeB = { name: "B", backToA: nodeA };
        nodeA.forwardToB = nodeB;
        expect(() => createDTNMessage({
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 0,
            ttlMs: 1000,
            payloadSizeBytes: 100,
            payload: { root: nodeA },
        })).toThrowError(/Circular reference detected/);
    });
    it("BM-FINDING-03: guarantees deep immutability across nested objects and arrays", () => {
        const callerPayload = {
            incident: {
                id: "inc-100",
                location: {
                    latitude: 16.5062,
                    longitude: 80.648,
                    waypoints: [1, 2, 3],
                },
            },
            tags: ["medical", "emergency"],
        };
        const msg = createDTNMessage({
            id: "sos-nested",
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 500,
            ttlMs: 60000,
            payloadSizeBytes: 256,
            payload: callerPayload,
        });
        expect(Object.isFrozen(msg.payload)).toBe(true);
        const incident = msg.payload.incident;
        expect(Object.isFrozen(incident)).toBe(true);
        expect(Object.isFrozen(incident.location)).toBe(true);
        expect(Object.isFrozen(incident.location.waypoints)).toBe(true);
        expect(Object.isFrozen(msg.payload.tags)).toBe(true);
        expect(() => {
            incident.location.latitude = 99.999;
        }).toThrow();
        expect(() => {
            msg.payload.tags.push("tampered");
        }).toThrow();
        callerPayload.incident.location.latitude = 0.0;
        callerPayload.tags.push("external-mutation");
        expect(incident.location.latitude).toBe(16.5062);
        expect(msg.payload.tags.length).toBe(2);
    });
    it("ensures payload digest is deterministic regardless of key order at all nesting depths", () => {
        const payload1 = {
            meta: { b: 2, a: 1 },
            items: [{ y: "second", x: "first" }],
            z: 10,
        };
        const payload2 = {
            z: 10,
            items: [{ x: "first", y: "second" }],
            meta: { a: 1, b: 2 },
        };
        expect(computePayloadDigest(payload1)).toBe(computePayloadDigest(payload2));
    });
    it("rejects unsupported payload types (functions, symbols)", () => {
        expect(() => createDTNMessage({
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 0,
            ttlMs: 1000,
            payloadSizeBytes: 100,
            payload: { fn: () => console.log("bad") },
        })).toThrowError(/Unsupported payload property type/);
    });
    it("validates ttlMs, payloadSizeBytes, and priority boundaries", () => {
        expect(() => createDTNMessage({
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 0,
            ttlMs: 0,
            payloadSizeBytes: 100,
            payload: {},
        })).toThrowError(/ttlMs must be positive/);
        expect(() => createDTNMessage({
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 0,
            ttlMs: 1000,
            payloadSizeBytes: 0,
            payload: {},
        })).toThrowError(/payloadSizeBytes must be positive/);
        expect(() => createDTNMessage({
            originNodeId: "c1",
            destinationNodeId: "g1",
            type: "SOS",
            // @ts-expect-error invalid priority
            priority: 5,
            createdAtSimTime: 0,
            ttlMs: 1000,
            payloadSizeBytes: 100,
            payload: {},
        })).toThrowError(/priority must be 0, 1, or 2/);
    });
    it("creates origin copy with null sender and 0 initial hops", () => {
        const msg = createDTNMessage({
            id: "msg-1",
            originNodeId: "node-A",
            destinationNodeId: "node-B",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 500,
            ttlMs: 60000,
            payloadSizeBytes: 64,
            payload: { hello: "world" },
        });
        const copy = createOriginCopy(msg, "node-A");
        expect(copy.holderNodeId).toBe("node-A");
        expect(copy.receivedFromNodeId).toBeNull();
        expect(copy.hopCount).toBe(0);
        expect(copy.isOriginCopy).toBe(true);
        expect(copy.status).toBe("HOLDING");
    });
    it("creates forwarded copy incrementing hops and tracking predecessor sender", () => {
        const msg = createDTNMessage({
            id: "msg-1",
            originNodeId: "node-A",
            destinationNodeId: "node-C",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 500,
            ttlMs: 60000,
            payloadSizeBytes: 64,
            payload: { hello: "world" },
        });
        const hop1 = createForwardedCopy(msg, "node-B", "node-A", 550, 0);
        expect(hop1.holderNodeId).toBe("node-B");
        expect(hop1.receivedFromNodeId).toBe("node-A");
        expect(hop1.hopCount).toBe(1);
        expect(hop1.isOriginCopy).toBe(false);
        const hop2 = createForwardedCopy(msg, "node-C", "node-B", 600, hop1.hopCount);
        expect(hop2.holderNodeId).toBe("node-C");
        expect(hop2.receivedFromNodeId).toBe("node-B");
        expect(hop2.hopCount).toBe(2);
    });
});
