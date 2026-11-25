/**
 * EventQueue
 *
 * Deterministic priority queue (min-heap) ordered strictly by the 4-tuple:
 * (simTimeMs, eventPhase, nodeId, sequenceId).
 *
 * Guarantees identical execution ordering across identical simulation seeds.
 */
export class EventQueue {
    heap = [];
    sequenceCounter = 0;
    /**
     * Enqueues an event, assigning a monotonic sequence ID if omitted.
     */
    push(event) {
        const assignedEvent = {
            ...event,
            sequenceId: event.sequenceId !== undefined ? event.sequenceId : this.sequenceCounter++,
        };
        if (this.sequenceCounter > Number.MAX_SAFE_INTEGER - 1000) {
            throw new Error("EventQueue: sequenceCounter reached MAX_SAFE_INTEGER boundary.");
        }
        this.heap.push(assignedEvent);
        this.bubbleUp(this.heap.length - 1);
        return assignedEvent;
    }
    /**
     * Pops and returns the highest priority event, or undefined if empty.
     */
    pop() {
        if (this.heap.length === 0) {
            return undefined;
        }
        const root = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length > 0 && last !== undefined) {
            this.heap[0] = last;
            this.bubbleDown(0);
        }
        return root;
    }
    /**
     * Peeks at the next scheduled event without removing it.
     */
    peek() {
        return this.heap[0];
    }
    /**
     * Returns current count of queued events.
     */
    size() {
        return this.heap.length;
    }
    /**
     * Returns true if queue is empty.
     */
    isEmpty() {
        return this.heap.length === 0;
    }
    /**
     * Clears all queued events and resets sequence counter.
     */
    clear() {
        this.heap = [];
        this.sequenceCounter = 0;
    }
    /**
     * Current monotonic sequence counter.
     */
    getSequenceCounter() {
        return this.sequenceCounter;
    }
    /**
     * 4-tuple deterministic comparator:
     * (simTimeMs, eventPhase, nodeId, sequenceId)
     */
    compare(a, b) {
        if (a.simTimeMs !== b.simTimeMs) {
            return a.simTimeMs - b.simTimeMs;
        }
        if (a.eventPhase !== b.eventPhase) {
            return a.eventPhase - b.eventPhase;
        }
        if (a.nodeId !== b.nodeId) {
            return a.nodeId < b.nodeId ? -1 : 1;
        }
        return (a.sequenceId ?? 0) - (b.sequenceId ?? 0);
    }
    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
                this.swap(index, parentIndex);
                index = parentIndex;
            }
            else {
                break;
            }
        }
    }
    bubbleDown(index) {
        const length = this.heap.length;
        while (true) {
            let smallest = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            if (leftChild < length &&
                this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
                smallest = leftChild;
            }
            if (rightChild < length &&
                this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
                smallest = rightChild;
            }
            if (smallest !== index) {
                this.swap(index, smallest);
                index = smallest;
            }
            else {
                break;
            }
        }
    }
    swap(i, j) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;
    }
}
