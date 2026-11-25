import { describe, it, expect } from "vitest";
import { SimulationEngine } from "../core/simulation-engine";
import { VirtualNode } from "../models/virtual-node";
import { createDTNMessage } from "../models/dtn-message";
describe("SimulationEngine — Event Scheduling & Boundary Validation", () => {
    it("BM-FINDING-02: rejects messages created in the virtual past at the API boundary", () => {
        const engine = new SimulationEngine({ seed: 12345, initialTimeMs: 1000 });
        const citizen = new VirtualNode({
            id: "citizen-1",
            type: "CITIZEN",
            position: { x: 0, y: 0 },
        });
        engine.addNode(citizen);
        const pastMsg = createDTNMessage({
            id: "msg-past",
            originNodeId: "citizen-1",
            destinationNodeId: "gateway-1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 999, // Past timestamp (clock is at 1000)
            ttlMs: 60000,
            payloadSizeBytes: 100,
            payload: {},
        });
        expect(() => engine.injectMessage(pastMsg)).toThrowError(/Cannot inject message "msg-past" with createdAtSimTime \(999ms\) in the virtual past \(current: 1000ms\)/);
        // Clock must remain strictly unchanged
        expect(engine.clock.getCurrentTime()).toBe(1000);
        // Message must not be in buffer
        expect(citizen.buffer.has("msg-past")).toBe(false);
        expect(engine.queue.size()).toBe(0);
    });
    it("BM-FINDING-02: rejects contact scheduling in the virtual past at the API boundary", () => {
        const engine = new SimulationEngine({ seed: 12345, initialTimeMs: 2000 });
        const n1 = new VirtualNode({ id: "n1", type: "CITIZEN", position: { x: 0, y: 0 } });
        const n2 = new VirtualNode({ id: "n2", type: "CITIZEN", position: { x: 10, y: 0 } });
        engine.addNode(n1);
        engine.addNode(n2);
        expect(() => engine.scheduleContact("n1", "n2", 1500)).toThrowError(/Cannot schedule contact between "n1" and "n2" at \(1500ms\) in the virtual past \(current: 2000ms\)/);
        expect(engine.clock.getCurrentTime()).toBe(2000);
        expect(engine.queue.size()).toBe(0);
    });
    it("accepts messages and contacts at current and future simulation times", () => {
        const engine = new SimulationEngine({ seed: 12345, initialTimeMs: 1000 });
        const citizen = new VirtualNode({
            id: "citizen-1",
            type: "CITIZEN",
            position: { x: 0, y: 0 },
        });
        const gateway = new VirtualNode({
            id: "gateway-1",
            type: "GATEWAY",
            position: { x: 20, y: 0 },
        });
        engine.addNode(citizen);
        engine.addNode(gateway);
        // 1. Current timestamp: 1000ms (exact match with clock)
        const currentMsg = createDTNMessage({
            id: "msg-current",
            originNodeId: "citizen-1",
            destinationNodeId: "gateway-1",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 1000,
            ttlMs: 60000,
            payloadSizeBytes: 100,
            payload: {},
        });
        expect(() => engine.injectMessage(currentMsg)).not.toThrow();
        // 2. Future timestamp: 1500ms
        const futureMsg = createDTNMessage({
            id: "msg-future",
            originNodeId: "citizen-1",
            destinationNodeId: "gateway-1",
            type: "CHAT",
            priority: 2,
            createdAtSimTime: 1500,
            ttlMs: 60000,
            payloadSizeBytes: 100,
            payload: {},
        });
        expect(() => engine.injectMessage(futureMsg)).not.toThrow();
        // 3. Contact at current time
        expect(() => engine.scheduleContact("citizen-1", "gateway-1", 1000)).not.toThrow();
        // 4. Contact at future time
        expect(() => engine.scheduleContact("citizen-1", "gateway-1", 2000)).not.toThrow();
        expect(engine.queue.size()).toBe(4);
    });
});
