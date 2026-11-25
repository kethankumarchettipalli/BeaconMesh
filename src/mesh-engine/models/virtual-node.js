import { BufferManager } from "./buffer-manager";
/**
 * VirtualNode
 *
 * Represents a simulated autonomous device in the DTN mesh.
 * Maintains local physical coordinates, radio range, storage buffer,
 * and delivery log.
 */
export class VirtualNode {
    id;
    type;
    position;
    radioRangeMeters;
    buffer;
    deliveredMessages = new Map();
    isOnline = true;
    constructor(config) {
        this.id = config.id;
        this.type = config.type;
        this.position = { ...config.position };
        this.radioRangeMeters = config.radioRangeMeters ?? 50;
        this.buffer = new BufferManager(config.bufferCapacityBytes ?? 64 * 1024); // 64 KB default
    }
    /**
     * Calculates 2D Euclidean distance to another virtual node.
     */
    distanceTo(other) {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * Returns true if both nodes are online and within radio propagation distance.
     */
    isInRange(other) {
        if (!this.isOnline || !other.isOnline) {
            return false;
        }
        const dist = this.distanceTo(other);
        const effectiveRange = Math.min(this.radioRangeMeters, other.radioRangeMeters);
        return dist <= effectiveRange;
    }
    /**
     * Records authoritative final delivery on Gateway or destination nodes.
     */
    recordDelivery(message, deliveredAtSimTime, totalHops) {
        if (!this.deliveredMessages.has(message.id)) {
            this.deliveredMessages.set(message.id, {
                message,
                deliveredAtSimTime,
                totalHops,
            });
        }
    }
    /**
     * Returns true if this node has authoritatively delivered this message.
     */
    hasDelivered(messageId) {
        return this.deliveredMessages.has(messageId);
    }
}
