import { describe, it, expect } from "vitest";
import { VirtualNode } from "../models/virtual-node";
import { SprayAndWaitRouter, isMessageDestination } from "../routing/spray-wait-router";
import { EpidemicRouter } from "../routing/epidemic-router";
import { createDTNMessage } from "../models/dtn-message";
import { createOriginCopy } from "../models/message-copy";
import { SimulationEngine } from "../core/simulation-engine";
describe("SprayAndWaitRouter — Binary Spray-and-Wait & Token Conservation", () => {
    function createTestMessage(id, origin = "node-A", destination = "node-DEST", ttlMs = 60000, sizeBytes = 100) {
        return createDTNMessage({
            id,
            originNodeId: origin,
            destinationNodeId: destination,
            type: "ALERT",
            priority: 2,
            createdAtSimTime: 1000,
            ttlMs,
            payloadSizeBytes: sizeBytes,
            payload: { note: "spray-and-wait payload" },
        });
    }
    // =========================================================================
    // SECTION A: Binary Splitting & Token Conservation
    // =========================================================================
    describe("Section A: Binary Splitting & Token Conservation Across Forwarding Hops", () => {
        it("splits tokens logarithmically (16 -> 8/8 -> 4/4 -> 2/2 -> 1/1) while strictly conserving initial budget L=16", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 16, transferDelayMs: 20 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            const nodeC = new VirtualNode({ id: "node-C", type: "COMMAND_RELAY", position: { x: 20, y: 0 } });
            const nodeD = new VirtualNode({ id: "node-D", type: "COMMAND_RELAY", position: { x: 30, y: 0 } });
            const nodeE = new VirtualNode({ id: "node-E", type: "COMMAND_RELAY", position: { x: 40, y: 0 } });
            const allNodes = [nodeA, nodeB, nodeC, nodeD, nodeE];
            allNodes.forEach((n) => engine.addNode(n));
            const msg = createTestMessage("m-split-16", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-split-16", "node-A", 16);
            // Initial state: Node A has 16 available
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-split-16")).toBe(16);
            router.tokenLedger.assertConservation("m-split-16", allNodes);
            // Hop 1: Node A contacts Node B (16 tokens available -> transfers floor(16/2)=8, keeps ceil(16/2)=8)
            const events1 = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events1.length).toBe(1);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-split-16")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-split-16")).toBe(8);
            router.tokenLedger.assertConservation("m-split-16", allNodes);
            // Execute transmission at 1020ms
            router.handleTransmissionEvent(events1[0], engine);
            expect(nodeB.buffer.has("m-split-16")).toBe(true);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-split-16")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-split-16")).toBe(0);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-split-16")).toBe(8);
            router.tokenLedger.assertConservation("m-split-16", allNodes);
            // Hop 2: Node B contacts Node C (8 available -> transfers floor(8/2)=4, keeps 4)
            const events2 = router.onNeighborContact(nodeB, nodeC, 1050);
            expect(events2.length).toBe(1);
            router.handleTransmissionEvent(events2[0], engine);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-split-16")).toBe(4);
            expect(router.tokenLedger.getAvailableTokens("node-C", "m-split-16")).toBe(4);
            router.tokenLedger.assertConservation("m-split-16", allNodes);
            // Hop 3: Node C contacts Node D (4 available -> transfers floor(4/2)=2, keeps 2)
            const events3 = router.onNeighborContact(nodeC, nodeD, 1100);
            expect(events3.length).toBe(1);
            router.handleTransmissionEvent(events3[0], engine);
            expect(router.tokenLedger.getAvailableTokens("node-C", "m-split-16")).toBe(2);
            expect(router.tokenLedger.getAvailableTokens("node-D", "m-split-16")).toBe(2);
            router.tokenLedger.assertConservation("m-split-16", allNodes);
            // Hop 4: Node D contacts Node E (2 available -> transfers floor(2/2)=1, keeps 1)
            const events4 = router.onNeighborContact(nodeD, nodeE, 1150);
            expect(events4.length).toBe(1);
            router.handleTransmissionEvent(events4[0], engine);
            expect(router.tokenLedger.getAvailableTokens("node-D", "m-split-16")).toBe(1);
            expect(router.tokenLedger.getAvailableTokens("node-E", "m-split-16")).toBe(1);
            router.tokenLedger.assertConservation("m-split-16", allNodes);
            // Total ledger balance check: 8 (A) + 4 (B) + 2 (C) + 1 (D) + 1 (E) = 16
            const verification = router.tokenLedger.verifyConservation("m-split-16", allNodes);
            expect(verification.isConserved).toBe(true);
            expect(verification.currentTotal).toBe(16);
            expect(verification.breakdown["node-A"].available).toBe(8);
            expect(verification.breakdown["node-B"].available).toBe(4);
            expect(verification.breakdown["node-C"].available).toBe(2);
            expect(verification.breakdown["node-D"].available).toBe(1);
            expect(verification.breakdown["node-E"].available).toBe(1);
        });
        it("handles odd token split (e.g. 5 tokens -> transfers floor(5/2)=2, retains ceil(5/2)=3)", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 5 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            engine.addNode(nodeA);
            engine.addNode(nodeB);
            const msg = createTestMessage("m-odd-5", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-odd-5", "node-A", 5);
            const events = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events.length).toBe(1);
            expect(events[0].payload.tokenCount).toBe(2);
            router.handleTransmissionEvent(events[0], engine);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-odd-5")).toBe(3);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-odd-5")).toBe(2);
            router.tokenLedger.assertConservation("m-odd-5", [nodeA, nodeB]);
        });
    });
    // =========================================================================
    // SECTION B: Wait Phase (Destination-Only Forwarding)
    // =========================================================================
    describe("Section B: Wait Phase (Destination-Only Forwarding)", () => {
        it("blocks transfer to intermediate relay when node has only 1 token (Wait phase)", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 1 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "carrier", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeRelay = new VirtualNode({ id: "relay-1", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            engine.addNode(nodeA);
            engine.addNode(nodeRelay);
            const msg = createTestMessage("m-wait-1", "carrier", "authoritative-dest");
            nodeA.buffer.store(createOriginCopy(msg, "carrier"), 1000);
            router.registerMessage("m-wait-1", "carrier", 1);
            // Carrier encounters relay
            const events = router.onNeighborContact(nodeA, nodeRelay, 1000);
            // In Wait phase, replication to intermediate relays MUST be blocked
            expect(events.length).toBe(0);
            expect(router.tokenLedger.getAvailableTokens("carrier", "m-wait-1")).toBe(1);
            expect(router.tokenLedger.getAvailableTokens("relay-1", "m-wait-1")).toBe(0);
        });
        it("allows direct delivery when carrier with 1 token encounters the exact destination node", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 1 });
            const engine = new SimulationEngine({ router });
            const nodeCarrier = new VirtualNode({ id: "carrier", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeDest = new VirtualNode({ id: "authoritative-dest", type: "CITIZEN", position: { x: 10, y: 0 } });
            engine.addNode(nodeCarrier);
            engine.addNode(nodeDest);
            const msg = createTestMessage("m-wait-dest", "carrier", "authoritative-dest");
            nodeCarrier.buffer.store(createOriginCopy(msg, "carrier"), 1000);
            router.registerMessage("m-wait-dest", "carrier", 1);
            // Carrier encounters authoritative destination
            const events = router.onNeighborContact(nodeCarrier, nodeDest, 1000);
            expect(events.length).toBe(1);
            expect(events[0].payload.tokenCount).toBe(1);
            router.handleTransmissionEvent(events[0], engine);
            expect(nodeDest.buffer.has("m-wait-dest")).toBe(true);
            expect(nodeDest.hasDelivered("m-wait-dest")).toBe(true);
            expect(engine.getMetrics().messagesDelivered).toBe(1);
            router.tokenLedger.assertConservation("m-wait-dest", [nodeCarrier, nodeDest]);
        });
        it("evaluates gateway wildcard destinations (ANY_GATEWAY, GATEWAY, *) correctly in Wait phase", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 1 });
            const engine = new SimulationEngine({ router });
            const nodeCarrier = new VirtualNode({ id: "carrier", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeGateway = new VirtualNode({ id: "gw-north", type: "GATEWAY", position: { x: 10, y: 0 } });
            const nodeCitizen = new VirtualNode({ id: "citizen-2", type: "CITIZEN", position: { x: 10, y: 0 } });
            engine.addNode(nodeCarrier);
            engine.addNode(nodeGateway);
            engine.addNode(nodeCitizen);
            const msg = createTestMessage("m-gw-wildcard", "carrier", "ANY_GATEWAY");
            nodeCarrier.buffer.store(createOriginCopy(msg, "carrier"), 1000);
            router.registerMessage("m-gw-wildcard", "carrier", 1);
            // Contact with citizen: blocked
            const eventsCitizen = router.onNeighborContact(nodeCarrier, nodeCitizen, 1000);
            expect(eventsCitizen.length).toBe(0);
            // Contact with gateway: allowed because destination matches ANY_GATEWAY
            const eventsGateway = router.onNeighborContact(nodeCarrier, nodeGateway, 1000);
            expect(eventsGateway.length).toBe(1);
            router.handleTransmissionEvent(eventsGateway[0], engine);
            expect(nodeGateway.hasDelivered("m-gw-wildcard")).toBe(true);
            expect(engine.getMetrics().messagesDelivered).toBe(1);
        });
        it("isMessageDestination correctly handles explicit IDs and wildcard types", () => {
            const citizen = new VirtualNode({ id: "c1", type: "CITIZEN", position: { x: 0, y: 0 } });
            const gateway = new VirtualNode({ id: "gw1", type: "GATEWAY", position: { x: 0, y: 0 } });
            const msgToC1 = createTestMessage("m1", "c0", "c1");
            const msgToAnyGw = createTestMessage("m2", "c0", "ANY_GATEWAY");
            const msgToGwStar = createTestMessage("m3", "c0", "*");
            const msgToGwWord = createTestMessage("m4", "c0", "GATEWAY");
            expect(isMessageDestination(citizen, msgToC1)).toBe(true);
            expect(isMessageDestination(gateway, msgToC1)).toBe(false);
            expect(isMessageDestination(gateway, msgToAnyGw)).toBe(true);
            expect(isMessageDestination(citizen, msgToAnyGw)).toBe(false);
            expect(isMessageDestination(gateway, msgToGwStar)).toBe(true);
            expect(isMessageDestination(citizen, msgToGwStar)).toBe(false);
            expect(isMessageDestination(gateway, msgToGwWord)).toBe(true);
            expect(isMessageDestination(citizen, msgToGwWord)).toBe(false);
        });
    });
    // =========================================================================
    // SECTION C: Failed Transfers (Case A - Pre-Acceptance Failure)
    // =========================================================================
    describe("Section C: Failed Transfers (Case A - Pre-Acceptance Failure)", () => {
        it("safely restores reserved tokens to sender when receiver moves out of range before acceptance", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 8 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 }, radioRangeMeters: 50 });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 20, y: 0 }, radioRangeMeters: 50 });
            engine.addNode(nodeA);
            engine.addNode(nodeB);
            const msg = createTestMessage("m-fail-range", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-fail-range", "node-A", 8);
            // Contact initiates transfer
            const events = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events.length).toBe(1);
            const txId = events[0].payload.transactionId;
            // Sender tokens reserved: available 4, reserved 4
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-fail-range")).toBe(4);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-fail-range")).toBe(4);
            // Node B moves out of range before transmission arrival (e.g. distance = 100m)
            nodeB.position = { x: 100, y: 0 };
            // Handle transmission event
            router.handleTransmissionEvent(events[0], engine);
            // Verification:
            // 1. Transaction aborted
            const tx = router.tokenLedger.getTransaction(txId);
            expect(tx?.status).toBe("ABORTED");
            expect(tx?.rejectionReason).toBe("OUT_OF_RANGE_OR_OFFLINE");
            // 2. Sender reserved tokens restored to available balance
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-fail-range")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-fail-range")).toBe(0);
            // 3. Receiver received 0 tokens and no copy stored
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-fail-range")).toBe(0);
            expect(nodeB.buffer.has("m-fail-range")).toBe(false);
            // 4. In-flight lock cleared
            expect(router.isInFlight("node-A", "node-B", "m-fail-range")).toBe(false);
            // 5. Token conservation holds strictly
            router.tokenLedger.assertConservation("m-fail-range", [nodeA, nodeB]);
            // 6. Node B moves back into range -> subsequent contact can retry and succeed
            nodeB.position = { x: 25, y: 0 };
            const retryEvents = router.onNeighborContact(nodeA, nodeB, 1050);
            expect(retryEvents.length).toBe(1);
            router.handleTransmissionEvent(retryEvents[0], engine);
            expect(nodeB.buffer.has("m-fail-range")).toBe(true);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-fail-range")).toBe(4);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-fail-range")).toBe(4);
            router.tokenLedger.assertConservation("m-fail-range", [nodeA, nodeB]);
        });
        it("safely restores reserved tokens when receiver buffer rejects message due to full capacity", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 8 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            // Node B has a tiny buffer capacity of only 50 bytes (cannot fit 100 bytes)
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 }, bufferCapacityBytes: 50 });
            engine.addNode(nodeA);
            engine.addNode(nodeB);
            const msg = createTestMessage("m-fail-buffer", "node-A", "node-DEST", 60000, 100);
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-fail-buffer", "node-A", 8);
            const events = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events.length).toBe(1);
            // Execute transmission
            router.handleTransmissionEvent(events[0], engine);
            // Receiver rejected because of buffer overflow
            expect(nodeB.buffer.has("m-fail-buffer")).toBe(false);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-fail-buffer")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-fail-buffer")).toBe(0);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-fail-buffer")).toBe(0);
            router.tokenLedger.assertConservation("m-fail-buffer", [nodeA, nodeB]);
        });
    });
    // =========================================================================
    // SECTION D: Lost Acknowledgements (Case C - Idempotent Retry)
    // =========================================================================
    describe("Section D: Lost Acknowledgements (Case C - Idempotent Retry)", () => {
        it("handles Case C where receiver accepted message but ACK was lost, retrying idempotently without token duplication", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 16 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            engine.addNode(nodeA);
            engine.addNode(nodeB);
            const msg = createTestMessage("m-lost-ack", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-lost-ack", "node-A", 16);
            const events = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events.length).toBe(1);
            const txId = events[0].payload.transactionId;
            // Simulate lost ACK for this transaction
            router.simulatedLostAcks.add(txId);
            // Transmission arrives at receiver
            router.handleTransmissionEvent(events[0], engine);
            // State after arrival:
            // 1. Receiver committed tokens (8 tokens) and stored copy
            expect(nodeB.buffer.has("m-lost-ack")).toBe(true);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-lost-ack")).toBe(8);
            // 2. Sender did NOT receive ACK -> reserved balance remains 8, available is 8
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-lost-ack")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-lost-ack")).toBe(8);
            // 3. Token ledger verifies conservation:
            // totalTokens = availableTokensOnNodes (8 on A + 8 on B) + inFlightPrepared (0) = 16
            router.tokenLedger.assertConservation("m-lost-ack", [nodeA, nodeB]);
            // 4. Sender retries the exact same transaction ID
            router.retryTransaction(txId, engine);
            expect(engine.queue.size()).toBe(1);
            const retryEvent = engine.queue.peek();
            expect(retryEvent.payload.transactionId).toBe(txId);
            // Advance clock and handle retry transmission
            engine.clock.advanceTo(retryEvent.simTimeMs);
            router.handleTransmissionEvent(retryEvent, engine);
            // 5. Verification after retry:
            // Receiver recognized existing receipt: DID NOT credit tokens again!
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-lost-ack")).toBe(8); // Still 8, NOT 16!
            // Sender received ACK and finalized reservation:
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-lost-ack")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-lost-ack")).toBe(0);
            // Final conservation assertion
            router.tokenLedger.assertConservation("m-lost-ack", [nodeA, nodeB]);
        });
    });
    // =========================================================================
    // SECTION E: Duplicate and Concurrent Encounters
    // =========================================================================
    describe("Section E: Duplicate and Concurrent Encounters", () => {
        it("suppresses redundant transfer scheduling during active in-flight transfer", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 16 });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            const msg = createTestMessage("m-flight", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-flight", "node-A", 16);
            // Contact 1 at t = 1000ms schedules transmission
            const events1 = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events1.length).toBe(1);
            expect(router.isInFlight("node-A", "node-B", "m-flight")).toBe(true);
            // Contact 2 at t = 1010ms (while transfer is in-flight)
            const events2 = router.onNeighborContact(nodeA, nodeB, 1010);
            expect(events2.length).toBe(0);
        });
        it("ensures duplicate contact at the EXACT SAME simulation millisecond is suppressed", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 16 });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            const msg = createTestMessage("m-same-ms", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-same-ms", "node-A", 16);
            const events1 = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events1.length).toBe(1);
            // Duplicate call at identical millisecond 1000ms
            const events2 = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events2.length).toBe(0);
        });
        it("two competing receivers divide sender available tokens without overspending", () => {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 16, transferDelayMs: 20 });
            const engine = new SimulationEngine({ router });
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            const nodeC = new VirtualNode({ id: "node-C", type: "COMMAND_RELAY", position: { x: 0, y: 10 } });
            engine.addNode(nodeA);
            engine.addNode(nodeB);
            engine.addNode(nodeC);
            const msg = createTestMessage("m-compete", "node-A", "node-DEST");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-compete", "node-A", 16);
            // Node A encounters Node B (available 16 -> reserves floor(16/2) = 8, keeps 8)
            const eventsB = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(eventsB.length).toBe(1);
            expect(eventsB[0].payload.tokenCount).toBe(8);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-compete")).toBe(8);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-compete")).toBe(8);
            // At the exact same millisecond, Node A also encounters Node C:
            // Available balance is now 8! So it reserves floor(8/2) = 4, keeps 4!
            const eventsC = router.onNeighborContact(nodeA, nodeC, 1000);
            expect(eventsC.length).toBe(1);
            expect(eventsC[0].payload.tokenCount).toBe(4);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-compete")).toBe(4);
            expect(router.tokenLedger.getReservedTokens("node-A", "m-compete")).toBe(12);
            // Invariant holds strictly: available (4) + reserved (12) = 16
            router.tokenLedger.assertConservation("m-compete", [nodeA, nodeB, nodeC]);
            // Complete both transfers
            router.handleTransmissionEvent(eventsB[0], engine);
            router.handleTransmissionEvent(eventsC[0], engine);
            expect(router.tokenLedger.getAvailableTokens("node-A", "m-compete")).toBe(4);
            expect(router.tokenLedger.getAvailableTokens("node-B", "m-compete")).toBe(8);
            expect(router.tokenLedger.getAvailableTokens("node-C", "m-compete")).toBe(4);
            router.tokenLedger.assertConservation("m-compete", [nodeA, nodeB, nodeC]);
        });
    });
    // =========================================================================
    // SECTION F: Edge Cases & Input Validation
    // =========================================================================
    describe("Section F: Edge Cases & Input Validation", () => {
        it("rejects non-positive or non-integer replication budget at router construction", () => {
            expect(() => new SprayAndWaitRouter({ defaultReplicationBudget: 0 })).toThrow();
            expect(() => new SprayAndWaitRouter({ defaultReplicationBudget: -5 })).toThrow();
            expect(() => new SprayAndWaitRouter({ defaultReplicationBudget: 2.5 })).toThrow();
        });
        it("rejects non-positive or non-integer replication budget in token ledger", () => {
            const router = new SprayAndWaitRouter();
            expect(() => router.registerMessage("m-bad", "node-A", 0)).toThrow();
            expect(() => router.registerMessage("m-bad", "node-A", -10)).toThrow();
            expect(() => router.registerMessage("m-bad", "node-A", 3.14)).toThrow();
        });
        it("does not forward expired messages", () => {
            const router = new SprayAndWaitRouter();
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "COMMAND_RELAY", position: { x: 10, y: 0 } });
            // TTL is 1000ms, created at 1000ms -> expires at 2000ms
            const msg = createTestMessage("m-expired", "node-A", "node-DEST", 1000);
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            router.registerMessage("m-expired", "node-A", 16);
            // Contact occurs at 2500ms (after expiration)
            const events = router.onNeighborContact(nodeA, nodeB, 2500);
            expect(events.length).toBe(0);
        });
        it("does not forward if receiver already delivered the message", () => {
            const router = new SprayAndWaitRouter();
            const nodeA = new VirtualNode({ id: "node-A", type: "CITIZEN", position: { x: 0, y: 0 } });
            const nodeB = new VirtualNode({ id: "node-B", type: "GATEWAY", position: { x: 10, y: 0 } });
            const msg = createTestMessage("m-already-delivered", "node-A", "node-B");
            nodeA.buffer.store(createOriginCopy(msg, "node-A"), 1000);
            nodeB.recordDelivery(msg, 900, 1);
            router.registerMessage("m-already-delivered", "node-A", 16);
            const events = router.onNeighborContact(nodeA, nodeB, 1000);
            expect(events.length).toBe(0);
        });
        it("throws when attempting to abort an already committed or acknowledged transaction", () => {
            const router = new SprayAndWaitRouter();
            router.registerMessage("m-abort-test", "node-A", 16);
            router.tokenLedger.reserveTokens("tx-1", "node-A", "node-B", "m-abort-test", 8, 1000);
            router.tokenLedger.commitTokens("tx-1", 1020);
            expect(() => {
                router.tokenLedger.abortTransaction("tx-1", "TRY_ABORT");
            }).toThrow(/Cannot abort transaction/);
        });
    });
    // =========================================================================
    // SECTION G: Deterministic Integration Scenario
    // =========================================================================
    describe("Section G: Deterministic Integration Scenario", () => {
        function runSimulationRun(seed) {
            const router = new SprayAndWaitRouter({ defaultReplicationBudget: 8, transferDelayMs: 25 });
            const engine = new SimulationEngine({ seed, router });
            const citizen = new VirtualNode({ id: "citizen", type: "CITIZEN", position: { x: 0, y: 0 } });
            const relay1 = new VirtualNode({ id: "relay1", type: "COMMAND_RELAY", position: { x: 20, y: 0 } });
            const relay2 = new VirtualNode({ id: "relay2", type: "COMMAND_RELAY", position: { x: 40, y: 0 } });
            const gateway = new VirtualNode({ id: "gateway", type: "GATEWAY", position: { x: 60, y: 0 } });
            const allNodes = [citizen, relay1, relay2, gateway];
            allNodes.forEach((n) => engine.addNode(n));
            const msg = createDTNMessage({
                id: "msg-deterministic",
                originNodeId: "citizen",
                destinationNodeId: "gateway",
                type: "EMERGENCY_SOS",
                priority: 1,
                createdAtSimTime: 100,
                ttlMs: 100000,
                payloadSizeBytes: 200,
                payload: { distress: true },
            });
            engine.injectMessage(msg);
            router.registerMessage("msg-deterministic", "citizen", 8);
            // Contact schedule:
            // t=100ms: citizen contacts relay1
            // t=200ms: relay1 contacts relay2
            // t=300ms: relay2 contacts gateway
            engine.scheduleContact("citizen", "relay1", 100);
            engine.scheduleContact("relay1", "relay2", 200);
            engine.scheduleContact("relay2", "gateway", 300);
            engine.runUntil(1000);
            const metrics = engine.getMetrics();
            const trace = engine.getExecutionTrace();
            const conservation = router.tokenLedger.verifyConservation("msg-deterministic", allNodes);
            return { metrics, trace, conservation };
        }
        it("produces 100% bit-for-bit identical execution trace, metrics, and token balances across two runs with identical seed", () => {
            const run1 = runSimulationRun(98765);
            const run2 = runSimulationRun(98765);
            expect(run1.metrics).toEqual(run2.metrics);
            expect(run1.conservation).toEqual(run2.conservation);
            expect(run1.trace.length).toBe(run2.trace.length);
            for (let i = 0; i < run1.trace.length; i++) {
                expect(run1.trace[i]).toEqual(run2.trace[i]);
            }
            // Verify delivery occurred
            expect(run1.metrics.messagesDelivered).toBe(1);
            expect(run1.conservation.isConserved).toBe(true);
            expect(run1.conservation.currentTotal).toBe(8);
        });
    });
    // =========================================================================
    // SECTION H: Comparison with Epidemic Routing
    // =========================================================================
    describe("Section H: Comparison with Epidemic Routing", () => {
        it("demonstrates distinct routing behaviors: Epidemic replicates uncontrollably to all relays, Spray-and-Wait bounds replicas strictly to L", () => {
            // Topology: 1 Citizen, 4 Relays in a dense mesh (all in radio range of each other)
            function setupNodes() {
                const citizen = new VirtualNode({ id: "citizen", type: "CITIZEN", position: { x: 0, y: 0 } });
                const r1 = new VirtualNode({ id: "r1", type: "COMMAND_RELAY", position: { x: 5, y: 0 } });
                const r2 = new VirtualNode({ id: "r2", type: "COMMAND_RELAY", position: { x: 0, y: 5 } });
                const r3 = new VirtualNode({ id: "r3", type: "COMMAND_RELAY", position: { x: 5, y: 5 } });
                return { citizen, r1, r2, r3, all: [citizen, r1, r2, r3] };
            }
            // Epidemic Router Run
            const epidemicRouter = new EpidemicRouter(20);
            const epidemicEngine = new SimulationEngine({ router: epidemicRouter });
            const epiNodes = setupNodes();
            epiNodes.all.forEach((n) => epidemicEngine.addNode(n));
            const epiMsg = createTestMessage("m-compare", "citizen", "DEST_NOWHERE");
            epidemicEngine.injectMessage(epiMsg);
            // Contact sequence: citizen contacts r1, citizen contacts r2, citizen contacts r3
            epidemicEngine.scheduleContact("citizen", "r1", 100);
            epidemicEngine.scheduleContact("citizen", "r2", 150);
            epidemicEngine.scheduleContact("citizen", "r3", 200);
            epidemicEngine.runUntil(500);
            const epidemicCopiesHeld = epiNodes.all.filter((n) => n.buffer.has("m-compare")).length;
            expect(epidemicCopiesHeld).toBe(4); // Replicated to every single node unconditionally
            // SprayAndWait Router Run with budget L = 2
            const sprayRouter = new SprayAndWaitRouter({ defaultReplicationBudget: 2, transferDelayMs: 20 });
            const sprayEngine = new SimulationEngine({ router: sprayRouter });
            const sprayNodes = setupNodes();
            sprayNodes.all.forEach((n) => sprayEngine.addNode(n));
            const sprayMsg = createTestMessage("m-compare", "citizen", "DEST_NOWHERE");
            sprayEngine.injectMessage(sprayMsg);
            sprayRouter.registerMessage("m-compare", "citizen", 2);
            // Same contact sequence
            sprayEngine.scheduleContact("citizen", "r1", 100);
            sprayEngine.scheduleContact("citizen", "r2", 150);
            sprayEngine.scheduleContact("citizen", "r3", 200);
            sprayEngine.runUntil(500);
            // In Spray-and-Wait with budget L = 2:
            // citizen has 2 -> contacts r1 -> transfers 1, keeps 1.
            // Now citizen has 1 token (Wait phase) and r1 has 1 token (Wait phase).
            // When citizen contacts r2, transfer is BLOCKED (Wait phase intermediate relay).
            // When citizen contacts r3, transfer is BLOCKED.
            const sprayCopiesHeld = sprayNodes.all.filter((n) => n.buffer.has("m-compare")).length;
            expect(sprayCopiesHeld).toBe(2); // Strictly bounded by L = 2!
            expect(sprayNodes.r2.buffer.has("m-compare")).toBe(false);
            expect(sprayNodes.r3.buffer.has("m-compare")).toBe(false);
            // Strict token conservation holds
            sprayRouter.tokenLedger.assertConservation("m-compare", sprayNodes.all);
        });
    });
});
