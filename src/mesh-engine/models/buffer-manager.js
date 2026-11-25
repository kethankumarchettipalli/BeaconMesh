/**
 * BufferManager
 *
 * Manages virtual node storage buffer with strict capacity constraints,
 * zero silent packet loss, transactional admission, and absolute protection
 * for origin-generated Critical SOS messages.
 */
export class BufferManager {
    maxCapacityBytes;
    copies = new Map();
    currentUsageBytes = 0;
    constructor(maxCapacityBytes) {
        if (maxCapacityBytes <= 0) {
            throw new Error(`BufferManager: maxCapacityBytes must be positive, got ${maxCapacityBytes}`);
        }
        this.maxCapacityBytes = maxCapacityBytes;
    }
    getMaxCapacityBytes() {
        return this.maxCapacityBytes;
    }
    getUsageBytes() {
        return this.currentUsageBytes;
    }
    getFreeSpaceBytes() {
        return this.maxCapacityBytes - this.currentUsageBytes;
    }
    has(messageId) {
        return this.copies.has(messageId);
    }
    get(messageId) {
        return this.copies.get(messageId);
    }
    getAll() {
        return Array.from(this.copies.values());
    }
    remove(messageId) {
        const existing = this.copies.get(messageId);
        if (existing) {
            this.copies.delete(messageId);
            this.currentUsageBytes -= existing.message.payloadSizeBytes;
        }
        return existing;
    }
    /**
     * Prunes expired copies based on simulation clock.
     * Returns array of pruned copies marked as DROPPED_TTL.
     */
    pruneExpired(currentSimTimeMs) {
        const pruned = [];
        for (const [id, copy] of this.copies.entries()) {
            if (currentSimTimeMs >= copy.message.expiresAtSimTime) {
                copy.status = "DROPPED_TTL";
                this.copies.delete(id);
                this.currentUsageBytes -= copy.message.payloadSizeBytes;
                pruned.push(copy);
            }
        }
        return pruned;
    }
    /**
     * Stores a message copy using transactional admission.
     *
     * Protection & Admission Invariants:
     * 1. If copy has already expired at arrival, reject with EXPIRED_AT_ARRIVAL.
     * 2. If copy already exists in buffer or was delivered, reject without modifying buffer.
     * 3. If copy size exceeds total buffer capacity, reject immediately.
     * 4. Perform transactional capacity planning:
     *    - Collect eligible eviction candidates in established priority order.
     *    - If current free space + eligible candidate space < requiredBytes,
     *      REJECT IMMEDIATELY WITHOUT EVICTING ANY EXISTING VALID COPIES.
     * 5. If capacity is sufficient, commit only the minimum necessary evictions
     *    and store the incoming copy.
     * 6. Origin-generated Critical SOS copies (isOriginCopy = true && priority = 0)
     *    are NEVER evicted under any circumstances.
     */
    store(copy, currentSimTimeMs) {
        // 1. Check if copy itself is already expired
        if (currentSimTimeMs >= copy.message.expiresAtSimTime) {
            copy.status = "DROPPED_TTL";
            return {
                stored: false,
                evicted: [],
                reason: "EXPIRED_AT_ARRIVAL",
            };
        }
        // 2. Check duplicate
        const existing = this.copies.get(copy.messageId);
        if (existing) {
            if (existing.status === "DELIVERED_FINAL") {
                return { stored: false, evicted: [], reason: "ALREADY_DELIVERED_FINAL" };
            }
            return { stored: false, evicted: [], reason: "DUPLICATE_MESSAGE" };
        }
        const requiredBytes = copy.message.payloadSizeBytes;
        if (requiredBytes > this.maxCapacityBytes) {
            return {
                stored: false,
                evicted: [],
                reason: "MESSAGE_EXCEEDS_MAX_CAPACITY",
            };
        }
        // 3. Collect candidates for transactional admission planning
        // Tier 0: Expired copies
        const expiredCandidates = [];
        // Tier 1: Stale / acknowledged copies
        const staleCandidates = [];
        // Tier 2: Priority 2 (Routine) copies
        const routineCandidates = [];
        // Tier 3: Priority 1 (High) copies
        const highCandidates = [];
        // Tier 4: Priority 0 (Critical) transit copies (only if incoming is Priority 0)
        const transitCriticalCandidates = [];
        for (const c of this.copies.values()) {
            if (currentSimTimeMs >= c.message.expiresAtSimTime) {
                expiredCandidates.push(c);
            }
            else if (c.status === "ACKED_STALE" || c.status === "FORWARDED") {
                staleCandidates.push(c);
            }
            else if (c.message.priority === 2) {
                routineCandidates.push(c);
            }
            else if (c.message.priority === 1) {
                highCandidates.push(c);
            }
            else if (c.message.priority === 0 &&
                !c.isOriginCopy &&
                copy.message.priority === 0 &&
                c.message.createdAtSimTime <= copy.message.createdAtSimTime) {
                transitCriticalCandidates.push(c);
            }
        }
        // Sort FIFO candidates by receivedAtSimTime ascending
        routineCandidates.sort((a, b) => a.receivedAtSimTime - b.receivedAtSimTime);
        highCandidates.sort((a, b) => a.receivedAtSimTime - b.receivedAtSimTime);
        // Sort transit critical candidates by createdAtSimTime ascending
        transitCriticalCandidates.sort((a, b) => a.message.createdAtSimTime - b.message.createdAtSimTime);
        const orderedCandidates = [
            ...expiredCandidates.map((c) => ({ copy: c, isExpired: true })),
            ...staleCandidates.map((c) => ({ copy: c, isExpired: false })),
            ...routineCandidates.map((c) => ({ copy: c, isExpired: false })),
            ...highCandidates.map((c) => ({ copy: c, isExpired: false })),
            ...transitCriticalCandidates.map((c) => ({ copy: c, isExpired: false })),
        ];
        // Calculate maximum available space if all eligible candidates were evicted
        let potentialFreeSpace = this.getFreeSpaceBytes();
        for (const item of orderedCandidates) {
            potentialFreeSpace += item.copy.message.payloadSizeBytes;
        }
        // 4. Transactional check: If even all eligible candidates cannot accommodate the message, reject!
        if (potentialFreeSpace < requiredBytes) {
            return {
                stored: false,
                evicted: [],
                reason: copy.message.priority === 0
                    ? "CRITICAL_SATURATION_PROTECTED"
                    : "INSUFFICIENT_BUFFER_CAPACITY",
            };
        }
        // 5. Commit phase: Evict ONLY the minimum necessary candidates in strict priority order
        const committedEvicted = [];
        for (const item of orderedCandidates) {
            if (this.getFreeSpaceBytes() >= requiredBytes) {
                break;
            }
            const candidate = item.copy;
            this.copies.delete(candidate.messageId);
            this.currentUsageBytes -= candidate.message.payloadSizeBytes;
            candidate.status = item.isExpired ? "DROPPED_TTL" : "EVICTED_CONGESTION";
            committedEvicted.push(candidate);
        }
        // 6. Store the incoming copy
        this.copies.set(copy.messageId, copy);
        this.currentUsageBytes += requiredBytes;
        return {
            stored: true,
            evicted: committedEvicted,
        };
    }
}
