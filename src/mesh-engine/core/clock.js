/**
 * SimulationClock
 *
 * Monotonic virtual time manager for the DTN simulation engine.
 * Guarantees that time strictly advances and cannot regress.
 */
export class SimulationClock {
    currentTimeMs;
    constructor(initialTimeMs = 0) {
        if (initialTimeMs < 0) {
            throw new Error(`SimulationClock: initialTimeMs cannot be negative, got ${initialTimeMs}`);
        }
        this.currentTimeMs = initialTimeMs;
    }
    /**
     * Returns current simulation virtual time in milliseconds.
     */
    getCurrentTime() {
        return this.currentTimeMs;
    }
    /**
     * Advances simulation time to an absolute target timestamp.
     * Throws an error if target is earlier than current time.
     */
    advanceTo(targetSimTimeMs) {
        if (targetSimTimeMs < this.currentTimeMs) {
            throw new Error(`SimulationClock: Cannot move backwards from ${this.currentTimeMs}ms to ${targetSimTimeMs}ms`);
        }
        this.currentTimeMs = targetSimTimeMs;
    }
    /**
     * Advances simulation time by a non-negative relative delta.
     */
    advanceBy(deltaMs) {
        if (deltaMs < 0) {
            throw new Error(`SimulationClock: advanceBy delta cannot be negative, got ${deltaMs}ms`);
        }
        this.currentTimeMs += deltaMs;
    }
    /**
     * Resets simulation clock back to initial timestamp.
     */
    reset(initialTimeMs = 0) {
        if (initialTimeMs < 0) {
            throw new Error(`SimulationClock: reset initialTimeMs cannot be negative, got ${initialTimeMs}`);
        }
        this.currentTimeMs = initialTimeMs;
    }
}
