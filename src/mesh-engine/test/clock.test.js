import { describe, it, expect } from "vitest";
import { SimulationClock } from "../core/clock";
describe("SimulationClock", () => {
    it("initializes to default 0 or configured time", () => {
        const clockDefault = new SimulationClock();
        expect(clockDefault.getCurrentTime()).toBe(0);
        const clockCustom = new SimulationClock(5000);
        expect(clockCustom.getCurrentTime()).toBe(5000);
    });
    it("rejects negative initial time", () => {
        expect(() => new SimulationClock(-100)).toThrowError(/cannot be negative/);
    });
    it("advances monotonically to absolute target time", () => {
        const clock = new SimulationClock(100);
        clock.advanceTo(250);
        expect(clock.getCurrentTime()).toBe(250);
        clock.advanceTo(250); // Same time is permitted
        expect(clock.getCurrentTime()).toBe(250);
    });
    it("strictly rejects backwards time movement", () => {
        const clock = new SimulationClock(500);
        expect(() => clock.advanceTo(499)).toThrowError(/Cannot move backwards/);
    });
    it("advances by non-negative deltas", () => {
        const clock = new SimulationClock(100);
        clock.advanceBy(50);
        expect(clock.getCurrentTime()).toBe(150);
        clock.advanceBy(0);
        expect(clock.getCurrentTime()).toBe(150);
    });
    it("rejects negative deltas", () => {
        const clock = new SimulationClock(100);
        expect(() => clock.advanceBy(-10)).toThrowError(/cannot be negative/);
    });
    it("resets clock to specified timestamp", () => {
        const clock = new SimulationClock(100);
        clock.advanceTo(1000);
        clock.reset(50);
        expect(clock.getCurrentTime()).toBe(50);
    });
});
