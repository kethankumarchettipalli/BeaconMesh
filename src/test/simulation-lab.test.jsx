/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";

import {
    SIMULATION_EVENT_TYPES,
    initializeSimulation,
    getSimulationState,
    injectSimulationMessage,
    stepSimulation,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    subscribeSimulation,
} from "@/lib/services/simulation-service";

describe("BeaconMesh Simulation Service (DTN Store-Carry-Forward)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        initializeSimulation("Normal connectivity");
    });

    afterEach(() => {
        pauseSimulation();
        vi.useRealTimers();
    });

    it("1-3. initializes Normal connectivity, injects a message, and emits MESSAGE_CREATED", () => {
        const init = getSimulationState();
        expect(init.scenario).toBe("Normal connectivity");
        expect(init.tick).toBe(0);
        expect(init.nodes.length).toBe(5);
        expect(init.messages).toHaveLength(0);

        const msg = injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: 10 });
        expect(msg.id).toBe("MSG-SIM-001");
        expect(msg.status).toBe("Created");

        const after = getSimulationState();
        expect(after.messages).toHaveLength(1);
        expect(after.events.some((e) => e.eventType === SIMULATION_EVENT_TYPES.MESSAGE_CREATED && e.messageId === msg.id)).toBe(true);
    });

    it("4. supports direct citizen-to-gateway delivery in Direct gateway scenario", () => {
        initializeSimulation("Direct gateway");
        const msg = injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: 6 });

        stepSimulation();
        const after = getSimulationState();
        const delivered = after.messages.find((m) => m.id === msg.id);
        expect(delivered.status).toBe("Delivered");
        expect(delivered.hopCount).toBe(1);
        expect(delivered.routeHistory).toEqual(["CIT-01", "GW-01"]);
        expect(after.events.some((e) => e.eventType === SIMULATION_EVENT_TYPES.GATEWAY_REACHED)).toBe(true);
        expect(after.events.some((e) => e.eventType === SIMULATION_EVENT_TYPES.MESSAGE_DELIVERED)).toBe(true);
    });

    it("5-6. forwards multi-hop through Relay and Data Mule until Gateway delivery without duplicate delivery", () => {
        initializeSimulation("Normal connectivity");
        const msg = injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: 12 });

        for (let i = 0; i < 6; i++) {
            stepSimulation();
        }

        const after = getSimulationState();
        const delivered = after.messages.find((m) => m.id === msg.id);
        expect(delivered.status).toBe("Delivered");
        expect(delivered.hopCount).toBeGreaterThanOrEqual(2);
        expect(delivered.routeHistory[0]).toBe("CIT-01");
        expect(delivered.routeHistory[delivered.routeHistory.length - 1]).toBe("GW-01");

        // Stepping further must NOT deliver the same message twice
        const deliveredCountBefore = after.events.filter(
            (e) => e.eventType === SIMULATION_EVENT_TYPES.MESSAGE_DELIVERED && e.messageId === msg.id
        ).length;
        expect(deliveredCountBefore).toBe(1);

        stepSimulation();
        const afterExtra = getSimulationState();
        const deliveredCountAfter = afterExtra.events.filter(
            (e) => e.eventType === SIMULATION_EVENT_TYPES.MESSAGE_DELIVERED && e.messageId === msg.id
        ).length;
        expect(deliveredCountAfter).toBe(1);
    });

    it("7-8. Gateway unavailable blocks delivery until recovery at tick 5", () => {
        initializeSimulation("Gateway unavailable");
        const msg = injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: 12 });

        // Ticks 1..4: Gateway is offline
        for (let i = 0; i < 4; i++) {
            stepSimulation();
        }
        let mid = getSimulationState();
        expect(mid.nodes.find((n) => n.id === "GW-01").available).toBe(false);
        expect(mid.messages.find((m) => m.id === msg.id).status).not.toBe("Delivered");

        // Tick 5+: Gateway recovers and carried message delivers
        for (let i = 0; i < 3; i++) {
            stepSimulation();
        }
        const finalState = getSimulationState();
        expect(finalState.nodes.find((n) => n.id === "GW-01").available).toBe(true);
        expect(finalState.events.some((e) => e.eventType === SIMULATION_EVENT_TYPES.NODE_RECOVERED)).toBe(true);
        expect(finalState.messages.find((m) => m.id === msg.id).status).toBe("Delivered");
    });

    it("9-10. decrements TTL each tick and expires message when TTL reaches 0", () => {
        initializeSimulation("Gateway unavailable");
        const msg = injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: 2 });

        stepSimulation();
        expect(getSimulationState().messages[0].ttl).toBe(1);

        stepSimulation();
        const after = getSimulationState();
        const expired = after.messages[0];
        expect(expired.ttl).toBe(0);
        expect(expired.status).toBe("Expired");
        expect(after.events.some((e) => e.eventType === SIMULATION_EVENT_TYPES.MESSAGE_EXPIRED && e.messageId === msg.id)).toBe(true);
    });

    it("13-16. Reset clears messages/events, Step advances 1 tick, and multiple Play calls do not duplicate timers", () => {
        initializeSimulation("Gateway unavailable");
        injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: 10 });
        stepSimulation();
        expect(getSimulationState().tick).toBe(1);

        // Multiple Play calls
        startSimulation(500);
        startSimulation(500);
        vi.advanceTimersByTime(1000);
        // Should advance 2 ticks (1 + 2 = 3), not 4
        expect(getSimulationState().tick).toBe(3);

        const reset = resetSimulation();
        expect(reset.tick).toBe(0);
        expect(reset.isPlaying).toBe(false);
        expect(reset.messages).toHaveLength(0);
        expect(reset.events.some((e) => e.eventType === SIMULATION_EVENT_TYPES.SIMULATION_RESET)).toBe(true);
    });

    it("notifies subscribers on state changes and cleans up on unsubscribe", () => {
        const listener = vi.fn();
        const unsub = subscribeSimulation(listener);
        expect(listener).toHaveBeenCalledTimes(1);

        injectSimulationMessage({ ttl: 5 });
        expect(listener).toHaveBeenCalledTimes(2);

        unsub();
        stepSimulation();
        expect(listener).toHaveBeenCalledTimes(2);
    });
});
