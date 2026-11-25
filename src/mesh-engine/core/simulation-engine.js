import { SimulationClock } from "./clock";
import { EventQueue } from "./event-queue";
import { EventPhase } from "./event-types";
import { Mulberry32PRNG } from "./prng";
import { createOriginCopy } from "../models/message-copy";
import { EpidemicRouter } from "../routing/epidemic-router";
/**
 * SimulationEngine
 *
 * Foundational discrete-event simulation coordinator for DTN mesh networking.
 * Pure TypeScript, zero external UI/network dependencies, completely deterministic.
 */
export class SimulationEngine {
    clock;
    queue;
    prng;
    router;
    nodes = new Map();
    trace = [];
    // Metrics accumulators
    messagesCreatedCount = 0;
    messagesDeliveredCount = 0;
    totalLatencyMs = 0;
    totalHops = 0;
    transmissionsAttemptedCount = 0;
    transmissionsSucceededCount = 0;
    transmissionsFailedCount = 0;
    congestionEvictionsCount = 0;
    ttlDropsCount = 0;
    constructor(config) {
        this.prng = new Mulberry32PRNG(config.seed);
        this.clock = new SimulationClock(config.initialTimeMs ?? 0);
        this.queue = new EventQueue();
        this.router = config.router ?? new EpidemicRouter();
    }
    addNode(node) {
        if (this.nodes.has(node.id)) {
            throw new Error(`SimulationEngine: Node with ID "${node.id}" already registered.`);
        }
        this.nodes.set(node.id, node);
    }
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    /**
     * Injects an immutable message at an origin node and enqueues creation event.
     * Rejects messages scheduled in the virtual past at the API boundary.
     */
    injectMessage(message) {
        const currentSimTime = this.clock.getCurrentTime();
        if (message.createdAtSimTime < currentSimTime) {
            throw new Error(`SimulationEngine: Cannot inject message "${message.id}" with createdAtSimTime (${message.createdAtSimTime}ms) in the virtual past (current: ${currentSimTime}ms).`);
        }
        const originNode = this.nodes.get(message.originNodeId);
        if (!originNode) {
            throw new Error(`SimulationEngine: Origin node "${message.originNodeId}" not found for message "${message.id}".`);
        }
        const copy = createOriginCopy(message, originNode.id);
        const storeResult = originNode.buffer.store(copy, message.createdAtSimTime);
        if (!storeResult.stored) {
            throw new Error(`SimulationEngine: Failed to store origin message "${message.id}" in buffer: ${storeResult.reason}`);
        }
        this.messagesCreatedCount++;
        this.queue.push({
            simTimeMs: message.createdAtSimTime,
            eventPhase: EventPhase.CREATION,
            nodeId: originNode.id,
            type: "MESSAGE_CREATED",
            payload: message,
        });
    }
    /**
     * Schedules a mutual contact encounter between two nodes at a given simTime.
     * Rejects contacts scheduled in the virtual past at the API boundary.
     */
    scheduleContact(nodeAId, nodeBId, simTimeMs) {
        const currentSimTime = this.clock.getCurrentTime();
        if (simTimeMs < currentSimTime) {
            throw new Error(`SimulationEngine: Cannot schedule contact between "${nodeAId}" and "${nodeBId}" at (${simTimeMs}ms) in the virtual past (current: ${currentSimTime}ms).`);
        }
        const nodeA = this.nodes.get(nodeAId);
        const nodeB = this.nodes.get(nodeBId);
        if (!nodeA || !nodeB) {
            throw new Error(`SimulationEngine: Cannot schedule contact between unknown nodes.`);
        }
        this.queue.push({
            simTimeMs,
            eventPhase: EventPhase.NEIGHBOR,
            nodeId: nodeAId,
            type: "NEIGHBOR_CONTACT",
            payload: { nodeAId, nodeBId },
        });
    }
    /**
     * Executes the next event in chronological / phase / tie-breaker order.
     * Advances simulation clock to the event's timestamp.
     * Returns true if an event was processed, false if queue is empty.
     */
    step() {
        const event = this.queue.pop();
        if (!event) {
            return false;
        }
        // Monotonic clock advance
        this.clock.advanceTo(event.simTimeMs);
        // Record trace
        this.trace.push({
            simTimeMs: event.simTimeMs,
            phase: event.eventPhase,
            nodeId: event.nodeId,
            eventType: event.type,
            sequenceId: event.sequenceId ?? 0,
        });
        // Handle event dispatch
        if (event.type === "NEIGHBOR_CONTACT") {
            const payload = event.payload;
            const nodeA = this.nodes.get(payload.nodeAId);
            const nodeB = this.nodes.get(payload.nodeBId);
            if (nodeA && nodeB && nodeA.isInRange(nodeB)) {
                const transmissionEvents = this.router.onNeighborContact(nodeA, nodeB, event.simTimeMs);
                for (const txEvent of transmissionEvents) {
                    this.queue.push(txEvent);
                }
            }
        }
        else if (event.type === "TRANSMISSION") {
            this.router.handleTransmissionEvent(event, this);
        }
        else if (event.execute) {
            event.execute(this);
        }
        return true;
    }
    /**
     * Runs the simulation forward until all events up to targetSimTimeMs are processed.
     */
    runUntil(targetSimTimeMs) {
        while (!this.queue.isEmpty() && this.queue.peek().simTimeMs <= targetSimTimeMs) {
            this.step();
        }
        if (this.clock.getCurrentTime() < targetSimTimeMs) {
            this.clock.advanceTo(targetSimTimeMs);
        }
    }
    // Metrics update callbacks
    recordTransmissionAttempt() {
        this.transmissionsAttemptedCount++;
    }
    recordTransmissionSuccess() {
        this.transmissionsSucceededCount++;
    }
    recordTransmissionFailure(reason) {
        this.transmissionsFailedCount++;
    }
    recordCongestionEviction() {
        this.congestionEvictionsCount++;
    }
    recordTtlDrop() {
        this.ttlDropsCount++;
    }
    recordMessageDelivered(message, deliveredAtSimTime, hops) {
        this.messagesDeliveredCount++;
        this.totalLatencyMs += deliveredAtSimTime - message.createdAtSimTime;
        this.totalHops += hops;
    }
    /**
     * Returns authoritative metrics snapshot.
     */
    getMetrics() {
        const created = this.messagesCreatedCount;
        const delivered = this.messagesDeliveredCount;
        return {
            messagesCreated: created,
            messagesDelivered: delivered,
            deliveryRatio: created > 0 ? delivered / created : 0,
            averageLatencyMs: delivered > 0 ? this.totalLatencyMs / delivered : 0,
            averageHops: delivered > 0 ? this.totalHops / delivered : 0,
            transmissionsAttempted: this.transmissionsAttemptedCount,
            transmissionsSucceeded: this.transmissionsSucceededCount,
            transmissionsFailed: this.transmissionsFailedCount,
            congestionEvictions: this.congestionEvictionsCount,
            ttlDrops: this.ttlDropsCount,
        };
    }
    /**
     * Returns deterministic execution event trace for reproducible verification.
     */
    getExecutionTrace() {
        return this.trace;
    }
}
