import { describe, it, expect } from "vitest";
import { EventQueue } from "../core/event-queue";
import { EventPhase } from "../core/event-types";
describe("EventQueue", () => {
    it("orders events chronologically by simTimeMs", () => {
        const queue = new EventQueue();
        queue.push({ simTimeMs: 300, eventPhase: EventPhase.ROUTING, nodeId: "A", type: "T3" });
        queue.push({ simTimeMs: 100, eventPhase: EventPhase.ROUTING, nodeId: "A", type: "T1" });
        queue.push({ simTimeMs: 200, eventPhase: EventPhase.ROUTING, nodeId: "A", type: "T2" });
        expect(queue.pop()?.type).toBe("T1");
        expect(queue.pop()?.type).toBe("T2");
        expect(queue.pop()?.type).toBe("T3");
        expect(queue.isEmpty()).toBe(true);
    });
    it("breaks time ties by eventPhase order", () => {
        const queue = new EventQueue();
        queue.push({ simTimeMs: 1000, eventPhase: EventPhase.TRANSMISSION, nodeId: "A", type: "TX" });
        queue.push({ simTimeMs: 1000, eventPhase: EventPhase.CREATION, nodeId: "A", type: "CR" });
        queue.push({ simTimeMs: 1000, eventPhase: EventPhase.NEIGHBOR, nodeId: "A", type: "NB" });
        queue.push({ simTimeMs: 1000, eventPhase: EventPhase.CLEANUP, nodeId: "A", type: "CL" });
        expect(queue.pop()?.type).toBe("NB"); // Phase 3
        expect(queue.pop()?.type).toBe("CR"); // Phase 4
        expect(queue.pop()?.type).toBe("TX"); // Phase 6
        expect(queue.pop()?.type).toBe("CL"); // Phase 7
    });
    it("breaks time and phase ties deterministically by nodeId", () => {
        const queue = new EventQueue();
        queue.push({ simTimeMs: 500, eventPhase: EventPhase.ROUTING, nodeId: "Node-Z", type: "Z" });
        queue.push({ simTimeMs: 500, eventPhase: EventPhase.ROUTING, nodeId: "Node-A", type: "A" });
        queue.push({ simTimeMs: 500, eventPhase: EventPhase.ROUTING, nodeId: "Node-M", type: "M" });
        expect(queue.pop()?.nodeId).toBe("Node-A");
        expect(queue.pop()?.nodeId).toBe("Node-M");
        expect(queue.pop()?.nodeId).toBe("Node-Z");
    });
    it("breaks full 3-tuple ties deterministically by sequenceId", () => {
        const queue = new EventQueue();
        const ev1 = queue.push({ simTimeMs: 500, eventPhase: EventPhase.ROUTING, nodeId: "Node-1", type: "First" });
        const ev2 = queue.push({ simTimeMs: 500, eventPhase: EventPhase.ROUTING, nodeId: "Node-1", type: "Second" });
        const ev3 = queue.push({ simTimeMs: 500, eventPhase: EventPhase.ROUTING, nodeId: "Node-1", type: "Third" });
        expect(ev1.sequenceId).toBe(0);
        expect(ev2.sequenceId).toBe(1);
        expect(ev3.sequenceId).toBe(2);
        expect(queue.pop()?.type).toBe("First");
        expect(queue.pop()?.type).toBe("Second");
        expect(queue.pop()?.type).toBe("Third");
    });
    it("handles peek, size, and clear correctly", () => {
        const queue = new EventQueue();
        expect(queue.isEmpty()).toBe(true);
        expect(queue.peek()).toBeUndefined();
        queue.push({ simTimeMs: 100, eventPhase: EventPhase.CREATION, nodeId: "A", type: "X" });
        expect(queue.size()).toBe(1);
        expect(queue.peek()?.type).toBe("X");
        queue.clear();
        expect(queue.size()).toBe(0);
        expect(queue.isEmpty()).toBe(true);
        expect(queue.getSequenceCounter()).toBe(0);
    });
});
