import { describe, it, expect } from "vitest";
import { SimulationEngine } from "../core/simulation-engine";
import { VirtualNode } from "../models/virtual-node";
import { createDTNMessage } from "../models/dtn-message";
import { EpidemicRouter } from "../routing/epidemic-router";
describe("Deterministic DTN Simulation Integration", () => {
    it("executes the mandatory 2-node Citizen-to-Gateway SOS delivery scenario", () => {
        // 1 Citizen at (0, 0), 1 Gateway at (20, 0)
        const engine = new SimulationEngine({
            seed: 424242,
            router: new EpidemicRouter(35), // Configured 35 ms transfer delay fixture
        });
        const citizen = new VirtualNode({
            id: "citizen-alpha",
            type: "CITIZEN",
            position: { x: 0, y: 0 },
            radioRangeMeters: 50,
        });
        const gateway = new VirtualNode({
            id: "gateway-north",
            type: "GATEWAY",
            position: { x: 20, y: 0 },
            radioRangeMeters: 50,
        });
        engine.addNode(citizen);
        engine.addNode(gateway);
        expect(citizen.isInRange(gateway)).toBe(true);
        // Citizen generates Critical SOS message at simTimeMs = 1000
        const sosMessage = createDTNMessage({
            id: "sos-emergency-001",
            originNodeId: "citizen-alpha",
            destinationNodeId: "gateway-north",
            type: "SOS",
            priority: 0,
            createdAtSimTime: 1000,
            ttlMs: 180000,
            payloadSizeBytes: 256,
            payload: {
                urgency: "HIGH",
                medical: true,
                gridCoordinate: "SECTOR_7G",
            },
        });
        engine.injectMessage(sosMessage);
        // Schedule mutual contact encounter at simTimeMs = 1000
        engine.scheduleContact("citizen-alpha", "gateway-north", 1000);
        // Run simulation forward to simTimeMs = 2000
        engine.runUntil(2000);
        // Authoritative assertions:
        // 1. Delivered to gateway
        expect(gateway.hasDelivered("sos-emergency-001")).toBe(true);
        const delivery = gateway.deliveredMessages.get("sos-emergency-001");
        expect(delivery.deliveredAtSimTime).toBe(1035); // 1000 ms creation + 35 ms deterministic transfer delay
        expect(delivery.totalHops).toBe(1);
        // 2. Gateway verified identical payload digest
        expect(delivery.message.payloadDigest).toBe(sosMessage.payloadDigest);
        // 3. Metrics verification
        const metrics = engine.getMetrics();
        expect(metrics.messagesCreated).toBe(1);
        expect(metrics.messagesDelivered).toBe(1);
        expect(metrics.deliveryRatio).toBe(1.0);
        expect(metrics.averageLatencyMs).toBe(35);
        expect(metrics.averageHops).toBe(1);
        expect(metrics.transmissionsAttempted).toBe(1);
        expect(metrics.transmissionsSucceeded).toBe(1);
        expect(metrics.transmissionsFailed).toBe(0);
        expect(metrics.congestionEvictions).toBe(0);
        expect(metrics.ttlDrops).toBe(0);
    });
    it("yields bit-for-bit identical execution trace across two separate runs with identical seed", () => {
        function runSimulation(seed) {
            const sim = new SimulationEngine({
                seed,
                router: new EpidemicRouter(35),
            });
            const citizen = new VirtualNode({
                id: "citizen-1",
                type: "CITIZEN",
                position: { x: 0, y: 0 },
                radioRangeMeters: 50,
            });
            const relay = new VirtualNode({
                id: "relay-1",
                type: "COMMAND_RELAY",
                position: { x: 30, y: 0 },
                radioRangeMeters: 50,
            });
            const gateway = new VirtualNode({
                id: "gateway-1",
                type: "GATEWAY",
                position: { x: 60, y: 0 },
                radioRangeMeters: 50,
            });
            sim.addNode(citizen);
            sim.addNode(relay);
            sim.addNode(gateway);
            // Citizen generates message at 500
            const msg = createDTNMessage({
                id: "sos-test",
                originNodeId: "citizen-1",
                destinationNodeId: "gateway-1",
                type: "SOS",
                priority: 0,
                createdAtSimTime: 500,
                ttlMs: 120000,
                payloadSizeBytes: 128,
                payload: { note: "test seed reproducibility" },
            });
            sim.injectMessage(msg);
            // Contact 1: Citizen <-> Relay at 600
            sim.scheduleContact("citizen-1", "relay-1", 600);
            sim.runUntil(700);
            // Contact 2: Relay <-> Gateway at 800
            sim.scheduleContact("relay-1", "gateway-1", 800);
            sim.runUntil(1000);
            return {
                metrics: sim.getMetrics(),
                trace: sim.getExecutionTrace(),
            };
        }
        const runA = runSimulation(98765);
        const runB = runSimulation(98765);
        expect(runA.metrics).toEqual(runB.metrics);
        expect(runA.trace).toEqual(runB.trace);
        expect(runA.metrics.messagesDelivered).toBe(1);
        expect(runA.metrics.averageHops).toBe(2); // Citizen -> Relay -> Gateway
    });
});
