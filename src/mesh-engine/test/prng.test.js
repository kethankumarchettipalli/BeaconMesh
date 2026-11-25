import { describe, it, expect } from "vitest";
import { Mulberry32PRNG } from "../core/prng";
describe("Mulberry32PRNG", () => {
    it("produces identical sequences with the same seed", () => {
        const prng1 = new Mulberry32PRNG(123456);
        const prng2 = new Mulberry32PRNG(123456);
        const seq1 = Array.from({ length: 50 }, () => prng1.nextFloat());
        const seq2 = Array.from({ length: 50 }, () => prng2.nextFloat());
        expect(seq1).toEqual(seq2);
    });
    it("produces different sequences with different seeds", () => {
        const prng1 = new Mulberry32PRNG(11111);
        const prng2 = new Mulberry32PRNG(22222);
        const seq1 = Array.from({ length: 20 }, () => prng1.nextUint32());
        const seq2 = Array.from({ length: 20 }, () => prng2.nextUint32());
        expect(seq1).not.toEqual(seq2);
    });
    it("generates integers strictly within [min, max] interval", () => {
        const prng = new Mulberry32PRNG(42);
        for (let i = 0; i < 200; i++) {
            const val = prng.nextInt(5, 15);
            expect(val).toBeGreaterThanOrEqual(5);
            expect(val).toBeLessThanOrEqual(15);
            expect(Number.isInteger(val)).toBe(true);
        }
    });
    it("throws when min exceeds max in nextInt", () => {
        const prng = new Mulberry32PRNG(42);
        expect(() => prng.nextInt(10, 5)).toThrowError(/cannot exceed max/);
    });
    it("generates booleans with appropriate boundary validation", () => {
        const prng = new Mulberry32PRNG(999);
        expect(prng.nextBoolean(1.0)).toBe(true);
        expect(prng.nextBoolean(0.0)).toBe(false);
        expect(() => prng.nextBoolean(-0.1)).toThrowError(/between 0 and 1/);
        expect(() => prng.nextBoolean(1.1)).toThrowError(/between 0 and 1/);
    });
    it("resets correctly to initial seed or new seed", () => {
        const prng = new Mulberry32PRNG(54321);
        const firstFive = Array.from({ length: 5 }, () => prng.nextUint32());
        prng.reset();
        const replayFive = Array.from({ length: 5 }, () => prng.nextUint32());
        expect(replayFive).toEqual(firstFive);
        prng.reset(98765);
        const newSeedFive = Array.from({ length: 5 }, () => prng.nextUint32());
        expect(newSeedFive).not.toEqual(firstFive);
    });
});
