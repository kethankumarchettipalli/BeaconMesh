import { EventPhase } from "../core/event-types";
import { createForwardedCopy } from "../models/message-copy";
/**
 * EpidemicRouter
 *
 * Classic flooding / anti-entropy DTN router.
 * Features in-flight transmission deduplication to suppress redundant
 * scheduling during repeated contact while keeping retry capabilities on failure.
 */
export class EpidemicRouter {
    name = "EpidemicRouter";
    transferDelayMs;
    inFlightTransfers = new Set();
    constructor(transferDelayMs = 35) {
        if (transferDelayMs < 0) {
            throw new Error(`EpidemicRouter: transferDelayMs cannot be negative, got ${transferDelayMs}`);
        }
        this.transferDelayMs = transferDelayMs;
    }
    /**
     * Generates a stable composite key for tracking an in-flight transfer.
     */
    getTransferKey(sourceId, targetId, messageId) {
        return `${sourceId}->${targetId}:${messageId}`;
    }
    /**
     * Returns true if a transfer for this message between sender and receiver is currently in flight.
     */
    isInFlight(sourceId, targetId, messageId) {
        return this.inFlightTransfers.has(this.getTransferKey(sourceId, targetId, messageId));
    }
    /**
     * Clears all in-flight transfer reservations (e.g., on simulation reset).
     */
    resetInFlight() {
        this.inFlightTransfers.clear();
    }
    /**
     * Summary vector exchange when contact occurs.
     * Suppresses scheduling if a transfer for the same message is already in flight.
     */
    onNeighborContact(nodeA, nodeB, simTimeMs) {
        const scheduledEvents = [];
        // Transfer messages from A -> B that B does not hold, has not delivered, and is not already in-flight
        for (const copyA of nodeA.buffer.getAll()) {
            if (copyA.status !== "HOLDING" && copyA.status !== "TRANSMITTING") {
                continue;
            }
            const msgId = copyA.messageId;
            if (!nodeB.buffer.has(msgId) &&
                !nodeB.hasDelivered(msgId) &&
                !this.isInFlight(nodeA.id, nodeB.id, msgId)) {
                this.inFlightTransfers.add(this.getTransferKey(nodeA.id, nodeB.id, msgId));
                scheduledEvents.push({
                    simTimeMs: simTimeMs + this.transferDelayMs,
                    eventPhase: EventPhase.TRANSMISSION,
                    nodeId: nodeA.id,
                    type: "TRANSMISSION",
                    payload: {
                        sourceNodeId: nodeA.id,
                        targetNodeId: nodeB.id,
                        message: copyA.message,
                        priorHopCount: copyA.hopCount,
                    },
                });
            }
        }
        // Transfer messages from B -> A that A does not hold, has not delivered, and is not already in-flight
        for (const copyB of nodeB.buffer.getAll()) {
            if (copyB.status !== "HOLDING" && copyB.status !== "TRANSMITTING") {
                continue;
            }
            const msgId = copyB.messageId;
            if (!nodeA.buffer.has(msgId) &&
                !nodeA.hasDelivered(msgId) &&
                !this.isInFlight(nodeB.id, nodeA.id, msgId)) {
                this.inFlightTransfers.add(this.getTransferKey(nodeB.id, nodeA.id, msgId));
                scheduledEvents.push({
                    simTimeMs: simTimeMs + this.transferDelayMs,
                    eventPhase: EventPhase.TRANSMISSION,
                    nodeId: nodeB.id,
                    type: "TRANSMISSION",
                    payload: {
                        sourceNodeId: nodeB.id,
                        targetNodeId: nodeA.id,
                        message: copyB.message,
                        priorHopCount: copyB.hopCount,
                    },
                });
            }
        }
        return scheduledEvents;
    }
    /**
     * Executes in-flight transmission event.
     * Releases in-flight reservation on both success and failure to allow future retries if needed.
     */
    handleTransmissionEvent(event, engine) {
        const payload = event.payload;
        if (!payload)
            return;
        // Release in-flight reservation immediately upon execution
        const transferKey = this.getTransferKey(payload.sourceNodeId, payload.targetNodeId, payload.message.id);
        this.inFlightTransfers.delete(transferKey);
        engine.recordTransmissionAttempt();
        const sender = engine.getNode(payload.sourceNodeId);
        const receiver = engine.getNode(payload.targetNodeId);
        if (!sender || !receiver) {
            engine.recordTransmissionFailure("NODE_NOT_FOUND");
            return;
        }
        if (!sender.isInRange(receiver)) {
            engine.recordTransmissionFailure("OUT_OF_RANGE");
            return;
        }
        // Sender must still hold the message
        const senderCopy = sender.buffer.get(payload.message.id);
        if (!senderCopy) {
            engine.recordTransmissionFailure("SENDER_MESSAGE_MISSING");
            return;
        }
        // Receiver creates new forwarded copy
        const newCopy = createForwardedCopy(payload.message, receiver.id, sender.id, event.simTimeMs, payload.priorHopCount);
        const storeResult = receiver.buffer.store(newCopy, event.simTimeMs);
        if (!storeResult.stored) {
            engine.recordTransmissionFailure(storeResult.reason || "BUFFER_REJECTED");
            return;
        }
        // Log evictions
        for (const evicted of storeResult.evicted) {
            if (evicted.status === "DROPPED_TTL") {
                engine.recordTtlDrop();
            }
            else if (evicted.status === "EVICTED_CONGESTION") {
                engine.recordCongestionEviction();
            }
        }
        engine.recordTransmissionSuccess();
        // Check if receiver is Gateway or the intended destination
        const isDestination = receiver.type === "GATEWAY" ||
            payload.message.destinationNodeId === receiver.id ||
            payload.message.destinationNodeId === "*";
        if (isDestination) {
            newCopy.status = "DELIVERED_FINAL";
            receiver.recordDelivery(payload.message, event.simTimeMs, newCopy.hopCount);
            engine.recordMessageDelivered(payload.message, event.simTimeMs, newCopy.hopCount);
        }
    }
}
