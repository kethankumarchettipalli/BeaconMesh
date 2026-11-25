import { EventPhase } from "../core/event-types";
import { createForwardedCopy } from "../models/message-copy";
import { TokenLedger } from "./token-ledger";
/**
 * Evaluates whether a virtual node is the intended authoritative destination of a message.
 * Supports specific node IDs, "ANY_GATEWAY", "*", and "GATEWAY".
 */
export function isMessageDestination(node, message) {
    if (message.destinationNodeId === node.id) {
        return true;
    }
    if (node.type === "GATEWAY" &&
        (message.destinationNodeId === "ANY_GATEWAY" ||
            message.destinationNodeId === "*" ||
            message.destinationNodeId === "GATEWAY")) {
        return true;
    }
    return false;
}
/**
 * SprayAndWaitRouter
 *
 * Implements deterministic Binary Spray-and-Wait routing with strict token
 * conservation and atomic, idempotent transfer transaction recovery.
 */
export class SprayAndWaitRouter {
    name = "SprayAndWaitRouter";
    defaultReplicationBudget;
    transferDelayMs;
    ackDelayMs;
    tokenLedger = new TokenLedger();
    // Maps composite key "${sourceId}->${targetId}:${messageId}" -> active transactionId
    inFlightTransfers = new Map();
    // Tracks attempt sequences for deterministic transaction IDs
    attemptCounters = new Map();
    // Set of transaction IDs for which ACK transmission should be simulated as lost (Case C)
    simulatedLostAcks = new Set();
    constructor(config = {}) {
        this.defaultReplicationBudget = config.defaultReplicationBudget ?? 16;
        if (this.defaultReplicationBudget <= 0 ||
            !Number.isInteger(this.defaultReplicationBudget)) {
            throw new Error(`SprayAndWaitRouter: defaultReplicationBudget must be a positive integer, got ${this.defaultReplicationBudget}`);
        }
        this.transferDelayMs = config.transferDelayMs ?? 35;
        this.ackDelayMs = config.ackDelayMs ?? 10;
    }
    getPairKey(sourceId, targetId, messageId) {
        return `${sourceId}->${targetId}:${messageId}`;
    }
    isInFlight(sourceId, targetId, messageId) {
        return this.inFlightTransfers.has(this.getPairKey(sourceId, targetId, messageId));
    }
    getInFlightTransactionId(sourceId, targetId, messageId) {
        return this.inFlightTransfers.get(this.getPairKey(sourceId, targetId, messageId));
    }
    /**
     * Registers initial budget for a message. Can be called explicitly or will auto-register on first encounter.
     */
    registerMessage(messageId, originNodeId, budget) {
        const allocatedBudget = budget ?? this.defaultReplicationBudget;
        this.tokenLedger.registerInitialBudget(messageId, originNodeId, allocatedBudget);
    }
    /**
     * Summary vector exchange and Spray-and-Wait transfer scheduling.
     */
    onNeighborContact(nodeA, nodeB, simTimeMs) {
        const scheduledEvents = [];
        // Direction A -> B
        this.evaluateTransfers(nodeA, nodeB, simTimeMs, scheduledEvents);
        // Direction B -> A
        this.evaluateTransfers(nodeB, nodeA, simTimeMs, scheduledEvents);
        return scheduledEvents;
    }
    evaluateTransfers(sender, receiver, simTimeMs, outEvents) {
        for (const copy of sender.buffer.getAll()) {
            if (copy.status !== "HOLDING" && copy.status !== "TRANSMITTING") {
                continue;
            }
            const msgId = copy.messageId;
            // Filter out expired messages
            if (simTimeMs >= copy.message.expiresAtSimTime) {
                continue;
            }
            // Filter out if receiver already holds the message or has delivered it
            if (receiver.buffer.has(msgId) || receiver.hasDelivered(msgId)) {
                continue;
            }
            const pairKey = this.getPairKey(sender.id, receiver.id, msgId);
            // Check if a transfer is already in-flight
            if (this.inFlightTransfers.has(pairKey)) {
                continue; // Suppress redundant transfer scheduling
            }
            // Auto-register origin budget if not yet registered
            if (!this.tokenLedger.hasMessage(msgId)) {
                this.tokenLedger.registerInitialBudget(msgId, copy.holderNodeId, this.defaultReplicationBudget);
            }
            const availableTokens = this.tokenLedger.getAvailableTokens(sender.id, msgId);
            if (availableTokens <= 0) {
                continue; // Zero tokens available
            }
            let tokensToTransfer = 0;
            const isDestination = isMessageDestination(receiver, copy.message);
            if (availableTokens > 1) {
                // SPRAY PHASE: Binary splitting
                tokensToTransfer = Math.floor(availableTokens / 2);
            }
            else {
                // WAIT PHASE: exactly 1 token remains
                // Only deliver if receiver is the authoritative destination
                if (isDestination) {
                    tokensToTransfer = 1;
                }
                else {
                    // Carrier with 1 token cannot replicate to ordinary relay nodes
                    continue;
                }
            }
            if (tokensToTransfer <= 0) {
                continue;
            }
            // Generate deterministic transaction ID
            const seq = (this.attemptCounters.get(pairKey) ?? 0) + 1;
            this.attemptCounters.set(pairKey, seq);
            const transactionId = `tx_${msgId}_${sender.id}_${receiver.id}_seq${seq}`;
            // Reserve tokens atomically in token ledger
            this.tokenLedger.reserveTokens(transactionId, sender.id, receiver.id, msgId, tokensToTransfer, simTimeMs);
            this.inFlightTransfers.set(pairKey, transactionId);
            outEvents.push({
                simTimeMs: simTimeMs + this.transferDelayMs,
                eventPhase: EventPhase.TRANSMISSION,
                nodeId: sender.id,
                type: "TRANSMISSION",
                payload: {
                    transactionId,
                    sourceNodeId: sender.id,
                    targetNodeId: receiver.id,
                    message: copy.message,
                    tokenCount: tokensToTransfer,
                    priorHopCount: copy.hopCount,
                },
            });
        }
    }
    /**
     * Executes in-flight transmission event.
     */
    handleTransmissionEvent(event, engine) {
        const payload = event.payload;
        if (!payload)
            return;
        const { transactionId, sourceNodeId, targetNodeId, message, tokenCount, priorHopCount } = payload;
        const pairKey = this.getPairKey(sourceNodeId, targetNodeId, message.id);
        engine.recordTransmissionAttempt();
        const sender = engine.getNode(sourceNodeId);
        const receiver = engine.getNode(targetNodeId);
        // Step 1: Pre-acceptance validation (Case A)
        if (!sender || !receiver || !sender.isInRange(receiver) || !sender.buffer.has(message.id)) {
            this.tokenLedger.abortTransaction(transactionId, "OUT_OF_RANGE_OR_OFFLINE");
            this.inFlightTransfers.delete(pairKey);
            engine.recordTransmissionFailure("OUT_OF_RANGE");
            return;
        }
        // Step 2: Idempotent duplicate check (Case C)
        const existingReceipt = this.tokenLedger.getReceipt(transactionId);
        if (existingReceipt) {
            // Receiver ALREADY accepted this transaction previously!
            // Do not credit tokens again. Just re-dispatch ACK.
            this.dispatchAck(transactionId, sourceNodeId, targetNodeId, event.simTimeMs, engine);
            return;
        }
        // Step 3: Check if receiver buffer already holds message from another route
        if (receiver.buffer.has(message.id)) {
            this.tokenLedger.abortTransaction(transactionId, "RECEIVER_ALREADY_HOLDS_MESSAGE");
            this.inFlightTransfers.delete(pairKey);
            engine.recordTransmissionFailure("DUPLICATE_MESSAGE");
            return;
        }
        // Step 4: Attempt storage in receiver buffer
        const newCopy = createForwardedCopy(message, receiver.id, sender.id, event.simTimeMs, priorHopCount);
        const storeResult = receiver.buffer.store(newCopy, event.simTimeMs);
        if (!storeResult.stored) {
            // Buffer full or expired at arrival -> Abort transaction, restore sender tokens
            this.tokenLedger.abortTransaction(transactionId, storeResult.reason || "BUFFER_REJECTED");
            this.inFlightTransfers.delete(pairKey);
            engine.recordTransmissionFailure(storeResult.reason || "BUFFER_REJECTED");
            return;
        }
        // Log any evictions from receiver buffer
        for (const evicted of storeResult.evicted) {
            if (evicted.status === "DROPPED_TTL") {
                engine.recordTtlDrop();
            }
            else if (evicted.status === "EVICTED_CONGESTION") {
                engine.recordCongestionEviction();
            }
        }
        // Step 5: Receiver accepts & commits tokens
        this.tokenLedger.commitTokens(transactionId, event.simTimeMs);
        engine.recordTransmissionSuccess();
        // Check final delivery
        const isDestination = isMessageDestination(receiver, message);
        if (isDestination) {
            newCopy.status = "DELIVERED_FINAL";
            receiver.recordDelivery(message, event.simTimeMs, newCopy.hopCount);
            engine.recordMessageDelivered(message, event.simTimeMs, newCopy.hopCount);
        }
        // Step 6: Link-layer ACK handling
        if (this.simulatedLostAcks.has(transactionId)) {
            // Simulate lost ACK (Case C): do not deliver ACK back to sender
            this.simulatedLostAcks.delete(transactionId);
            // Reservation remains on sender until retry reconciles it
            return;
        }
        // Deliver ACK
        this.dispatchAck(transactionId, sourceNodeId, targetNodeId, event.simTimeMs, engine);
    }
    /**
     * Dispatches ACK back to sender to finalize the transaction.
     */
    dispatchAck(transactionId, senderId, receiverId, simTimeMs, engine) {
        const tx = this.tokenLedger.getTransaction(transactionId);
        if (!tx)
            return;
        const pairKey = this.getPairKey(senderId, receiverId, tx.messageId);
        // Finalize sender reservation in token ledger
        this.tokenLedger.acknowledgeTransaction(transactionId, simTimeMs);
        this.inFlightTransfers.delete(pairKey);
    }
    /**
     * Simulates a retry for a transaction where the ACK was lost (Case C).
     */
    retryTransaction(transactionId, engine) {
        const tx = this.tokenLedger.getTransaction(transactionId);
        if (!tx) {
            throw new Error(`SprayAndWaitRouter: Cannot retry unknown transaction "${transactionId}".`);
        }
        const sender = engine.getNode(tx.senderId);
        const receiver = engine.getNode(tx.receiverId);
        if (!sender || !receiver) {
            throw new Error(`SprayAndWaitRouter: Sender or receiver missing on retry.`);
        }
        const senderCopy = sender.buffer.get(tx.messageId);
        if (!senderCopy) {
            throw new Error(`SprayAndWaitRouter: Sender copy missing on retry.`);
        }
        // Re-dispatch transmission with the EXACT SAME transaction ID
        const retryEvent = {
            simTimeMs: engine.clock.getCurrentTime() + this.transferDelayMs,
            eventPhase: EventPhase.TRANSMISSION,
            nodeId: sender.id,
            type: "TRANSMISSION",
            payload: {
                transactionId: tx.transactionId,
                sourceNodeId: tx.senderId,
                targetNodeId: tx.receiverId,
                message: senderCopy.message,
                tokenCount: tx.tokenCount,
                priorHopCount: senderCopy.hopCount,
            },
        };
        engine.queue.push(retryEvent);
    }
}
