/**
 * Mulberry32 Seeded Pseudo-Random Number Generator (PRNG)
 *
 * Implements a 32-bit generator with excellent statistical properties,
 * zero external dependencies, and 100% deterministic cross-platform output.
 * Math.random() is strictly prohibited across the simulation engine.
 */
export class Mulberry32PRNG {
    initialSeed;
    state;
    constructor(seed) {
        this.initialSeed = seed >>> 0;
        this.state = this.initialSeed;
    }
    /**
     * Generates an unsigned 32-bit pseudo-random integer.
     */
    nextUint32() {
        let t = (this.state += 0x6d2b79f5) >>> 0;
        t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
        t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
        return (t ^ (t >>> 14)) >>> 0;
    }
    /**
     * Generates a floating-point number in the half-open interval [0, 1).
     */
    nextFloat() {
        return this.nextUint32() / 4294967296;
    }
    /**
     * Generates a pseudo-random integer in the closed interval [min, max].
     */
    nextInt(min, max) {
        if (min > max) {
            throw new Error(`Mulberry32PRNG: min (${min}) cannot exceed max (${max})`);
        }
        const range = max - min + 1;
        return min + Math.floor(this.nextFloat() * range);
    }
    /**
     * Generates a boolean flag with specified probability of returning true.
     */
    nextBoolean(probabilityTrue = 0.5) {
        if (probabilityTrue < 0 || probabilityTrue > 1) {
            throw new Error(`Mulberry32PRNG: probabilityTrue must be between 0 and 1, got ${probabilityTrue}`);
        }
        return this.nextFloat() < probabilityTrue;
    }
    /**
     * Returns the initial seed configured for this generator.
     */
    getSeed() {
        return this.initialSeed;
    }
    /**
     * Returns current internal state integer.
     */
    getState() {
        return this.state;
    }
    /**
     * Resets generator state back to initial seed or a new seed.
     */
    reset(seed) {
        if (seed !== undefined) {
            this.initialSeed = seed >>> 0;
        }
        this.state = this.initialSeed;
    }
}
