/**
 * BeaconMesh Shared DTN Simulation Service
 *
 * Deterministic, client-side Delay-Tolerant Networking (DTN) store-carry-forward
 * simulation shared between Simulation Laboratory (/command/simulation) and
 * Message Intelligence (/command/messages).
 *
 * Strictly isolated from real BeaconMesh incidents, responders, and Firestore.
 */

export const SIMULATION_SCENARIOS = [
    "Normal connectivity",
    "Intermittent connectivity",
    "Sparse network",
    "Gateway unavailable",
    "Direct gateway",
];

export const SIMULATION_EVENT_TYPES = {
    MESSAGE_CREATED: "MESSAGE_CREATED",
    NODE_CONTACT: "NODE_CONTACT",
    MESSAGE_TRANSFERRED: "MESSAGE_TRANSFERRED",
    MESSAGE_CARRIED: "MESSAGE_CARRIED",
    GATEWAY_REACHED: "GATEWAY_REACHED",
    MESSAGE_DELIVERED: "MESSAGE_DELIVERED",
    TTL_DECREMENTED: "TTL_DECREMENTED",
    MESSAGE_EXPIRED: "MESSAGE_EXPIRED",
    NODE_UNAVAILABLE: "NODE_UNAVAILABLE",
    NODE_RECOVERED: "NODE_RECOVERED",
    SIMULATION_RESET: "SIMULATION_RESET",
};

const MULE_WAYPOINTS = [
    { x: 62, y: 25 },
    { x: 72, y: 42 },
    { x: 62, y: 25 },
    { x: 48, y: 40 },
];

function createInitialNodes(scenario) {
    const isDirect = scenario === "Direct gateway";
    const isGatewayDown = scenario === "Gateway unavailable";
    const range = scenario === "Sparse network" ? 36 : 44;

    return [
        {
            id: "CIT-01",
            label: "Citizen",
            type: "CITIZEN",
            position: isDirect ? { x: 60, y: 55 } : { x: 15, y: 27 },
            available: true,
            range,
            buffer: [],
        },
        {
            id: "REL-01",
            label: "Relay 01",
            type: "RELAY",
            position: { x: 38, y: 54 },
            available: true,
            range,
            buffer: [],
        },
        {
            id: "REL-02",
            label: "Relay 02",
            type: "RELAY",
            position: { x: 27, y: 78 },
            available: true,
            range,
            buffer: [],
        },
        {
            id: "MULE-01",
            label: "Data mule",
            type: "DATA_MULE",
            position: { ...MULE_WAYPOINTS[0] },
            available: true,
            range: range + 6,
            buffer: [],
        },
        {
            id: "GW-01",
            label: "Gateway A",
            type: "GATEWAY",
            position: { x: 81, y: 61 },
            available: !isGatewayDown,
            range,
            buffer: [],
        },
    ];
}

function distanceBetween(a, b) {
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function computeActiveLinks(nodes) {
    const links = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            if (!a.available || !b.available)
                continue;
            const maxRange = Math.max(a.range, b.range);
            if (distanceBetween(a, b) <= maxRange) {
                links.push({ from: a.id, to: b.id });
            }
        }
    }
    return links;
}

function syncNodeBuffers(nodes, messages) {
    for (const node of nodes) {
        node.buffer = messages
            .filter((m) => m.currentHolderId === node.id && m.status !== "Expired")
            .map((m) => m.id);
    }
}

let state = createFreshState("Normal connectivity");
let playTimer = null;
const listeners = new Set();

function createFreshState(scenario = "Normal connectivity") {
    const validScenario = SIMULATION_SCENARIOS.includes(scenario) ? scenario : "Normal connectivity";
    const nodes = createInitialNodes(validScenario);
    return {
        scenario: validScenario,
        tick: 0,
        isPlaying: false,
        nodes,
        links: computeActiveLinks(nodes),
        messages: [],
        events: [],
        nextMsgSeq: 1,
        nextEvtSeq: 1,
        activeTransmissions: [],
    };
}

function cloneState(s) {
    return {
        ...s,
        nodes: s.nodes.map((n) => ({
            ...n,
            position: { ...n.position },
            buffer: [...n.buffer],
        })),
        links: s.links.map((l) => ({ ...l })),
        messages: s.messages.map((m) => ({
            ...m,
            routeHistory: [...m.routeHistory],
            visitedNodeIds: [...m.visitedNodeIds],
            metadata: { ...m.metadata },
        })),
        events: s.events.map((e) => ({ ...e })),
        activeTransmissions: s.activeTransmissions.map((t) => ({ ...t })),
    };
}

function emitState() {
    const snapshot = cloneState(state);
    for (const listener of listeners) {
        try {
            listener(snapshot);
        }
        catch {
            // ignore listener errors
        }
    }
}

function pushEvent({
    eventType,
    messageId = null,
    sourceNodeId = null,
    targetNodeId = null,
    description,
}) {
    const evt = {
        id: `EVT-SIM-${String(state.nextEvtSeq++).padStart(4, "0")}`,
        tick: state.tick,
        eventType,
        messageId,
        sourceNodeId,
        targetNodeId,
        description,
        timestamp: `Tick ${state.tick}`,
    };
    state.events = [evt, ...state.events].slice(0, 200);
    return evt;
}

export function getSimulationState() {
    return cloneState(state);
}

export function subscribeSimulation(listener) {
    if (typeof listener !== "function")
        return () => { };
    listeners.add(listener);
    listener(cloneState(state));
    return () => {
        listeners.delete(listener);
    };
}

export function initializeSimulation(scenario = "Normal connectivity") {
    pauseSimulation();
    state = createFreshState(scenario);
    emitState();
    return getSimulationState();
}

export function resetSimulation() {
    pauseSimulation();
    const currentScenario = state.scenario;
    state = createFreshState(currentScenario);
    pushEvent({
        eventType: SIMULATION_EVENT_TYPES.SIMULATION_RESET,
        description: `Simulation reset for scenario "${currentScenario}".`,
    });
    emitState();
    return getSimulationState();
}

export function injectSimulationMessage(options = {}) {
    const sourceNodeId = options.sourceNodeId || "CIT-01";
    const sourceNode = state.nodes.find((n) => n.id === sourceNodeId) || state.nodes[0];
    const ttl = typeof options.ttl === "number" && options.ttl > 0 ? Math.floor(options.ttl) : 12;
    const msgId = `MSG-SIM-${String(state.nextMsgSeq++).padStart(3, "0")}`;

    const message = {
        id: msgId,
        sourceNodeId: sourceNode.id,
        destinationNodeId: "GW-01",
        createdTick: state.tick,
        ttl,
        initialTtl: ttl,
        hopCount: 0,
        currentHolderId: sourceNode.id,
        status: "Created",
        routeHistory: [sourceNode.id],
        visitedNodeIds: [sourceNode.id],
        metadata: {
            simulationOnly: true,
            scenario: state.scenario,
            label: options.label || "Simulated SOS packet",
        },
    };

    state.messages = [message, ...state.messages];
    syncNodeBuffers(state.nodes, state.messages);
    pushEvent({
        eventType: SIMULATION_EVENT_TYPES.MESSAGE_CREATED,
        messageId: msgId,
        sourceNodeId: sourceNode.id,
        targetNodeId: "GW-01",
        description: `${msgId} created at ${sourceNode.id} (TTL ${ttl}, destination GW-01).`,
    });
    emitState();
    return { ...message, routeHistory: [...message.routeHistory], visitedNodeIds: [...message.visitedNodeIds] };
}

function updateScenarioTopology() {
    const tick = state.tick;
    const scenario = state.scenario;
    const mule = state.nodes.find((n) => n.id === "MULE-01");
    const rel1 = state.nodes.find((n) => n.id === "REL-01");
    const rel2 = state.nodes.find((n) => n.id === "REL-02");
    const gw = state.nodes.find((n) => n.id === "GW-01");

    // Deterministic Data Mule patrol
    if (mule) {
        const wp = MULE_WAYPOINTS[tick % MULE_WAYPOINTS.length];
        mule.position = { ...wp };
    }

    const setAvailability = (node, nextAvailable, reason) => {
        if (!node || node.available === nextAvailable)
            return;
        node.available = nextAvailable;
        pushEvent({
            eventType: nextAvailable
                ? SIMULATION_EVENT_TYPES.NODE_RECOVERED
                : SIMULATION_EVENT_TYPES.NODE_UNAVAILABLE,
            sourceNodeId: node.id,
            description: `${node.id} (${node.label}) ${nextAvailable ? "recovered and online" : "became unavailable"} (${reason}).`,
        });
    };

    if (scenario === "Intermittent connectivity") {
        setAvailability(rel1, tick % 2 === 1, "intermittent link");
        setAvailability(rel2, tick % 3 !== 0, "intermittent link");
    }
    else if (scenario === "Sparse network") {
        setAvailability(rel1, tick % 3 === 0, "sparse contact window");
        setAvailability(rel2, tick % 2 === 0, "sparse contact window");
    }
    else if (scenario === "Gateway unavailable") {
        const gwOnline = tick >= 5;
        setAvailability(gw, gwOnline, gwOnline ? "gateway restored" : "backhaul outage");
    }
    else {
        setAvailability(rel1, true, "normal connectivity");
        setAvailability(rel2, true, "normal connectivity");
        setAvailability(gw, true, "normal connectivity");
    }

    state.links = computeActiveLinks(state.nodes);
}

function getReachableNeighbors(nodeId) {
    const neighbors = [];
    for (const link of state.links) {
        if (link.from === nodeId)
            neighbors.push(link.to);
        else if (link.to === nodeId)
            neighbors.push(link.from);
    }
    return neighbors;
}

export function stepSimulation() {
    state.tick += 1;
    state.activeTransmissions = [];

    updateScenarioTopology();

    const gw = state.nodes.find((n) => n.id === "GW-01");

    for (const msg of state.messages) {
        if (msg.status === "Delivered" || msg.status === "Expired") {
            continue;
        }

        // Decrement TTL each simulation tick
        msg.ttl = Math.max(0, msg.ttl - 1);
        pushEvent({
            eventType: SIMULATION_EVENT_TYPES.TTL_DECREMENTED,
            messageId: msg.id,
            sourceNodeId: msg.currentHolderId,
            description: `${msg.id} TTL decremented to ${msg.ttl} at ${msg.currentHolderId}.`,
        });

        if (msg.ttl <= 0) {
            msg.status = "Expired";
            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.MESSAGE_EXPIRED,
                messageId: msg.id,
                sourceNodeId: msg.currentHolderId,
                description: `${msg.id} expired at ${msg.currentHolderId} after ${msg.hopCount} hop(s).`,
            });
            continue;
        }

        const holder = state.nodes.find((n) => n.id === msg.currentHolderId);
        if (!holder || !holder.available) {
            if (holder && holder.type !== "CITIZEN") {
                msg.status = "Carried";
                pushEvent({
                    eventType: SIMULATION_EVENT_TYPES.MESSAGE_CARRIED,
                    messageId: msg.id,
                    sourceNodeId: holder.id,
                    description: `${msg.id} carried in ${holder.id} buffer while waiting for contact.`,
                });
            }
            continue;
        }

        const neighbors = getReachableNeighbors(holder.id);

        // 1. Direct or Gateway delivery if GW-01 is reachable and online
        if (gw && gw.available && neighbors.includes("GW-01")) {
            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.NODE_CONTACT,
                messageId: msg.id,
                sourceNodeId: holder.id,
                targetNodeId: "GW-01",
                description: `${holder.id} established contact with Gateway GW-01.`,
            });
            msg.hopCount += 1;
            msg.currentHolderId = "GW-01";
            msg.routeHistory.push("GW-01");
            msg.visitedNodeIds.push("GW-01");
            msg.status = "Delivered";
            state.activeTransmissions.push({ from: holder.id, to: "GW-01", messageId: msg.id });

            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.GATEWAY_REACHED,
                messageId: msg.id,
                sourceNodeId: holder.id,
                targetNodeId: "GW-01",
                description: `${msg.id} reached Gateway GW-01 from ${holder.id}.`,
            });
            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.MESSAGE_DELIVERED,
                messageId: msg.id,
                sourceNodeId: holder.id,
                targetNodeId: "GW-01",
                description: `${msg.id} delivered to GW-01 in ${msg.hopCount} hop(s).`,
            });
            continue;
        }

        // 2. Opportunistic store-carry-forward to an unvisited reachable neighbor closer to GW-01
        const holderDist = gw ? distanceBetween(holder, gw) : Infinity;
        const candidates = neighbors
            .filter((nId) => !msg.visitedNodeIds.includes(nId) && nId !== "GW-01")
            .map((nId) => state.nodes.find((n) => n.id === nId))
            .filter((n) => {
                if (!n || !n.available)
                    return false;
                if (n.type === "DATA_MULE")
                    return true;
                return gw ? distanceBetween(n, gw) < holderDist : true;
            });

        // Prefer nodes closer to Gateway (or Data Mule if equal)
        candidates.sort((a, b) => {
            const distA = gw ? distanceBetween(a, gw) : 0;
            const distB = gw ? distanceBetween(b, gw) : 0;
            return distA - distB;
        });

        const nextHop = candidates[0];
        if (nextHop) {
            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.NODE_CONTACT,
                messageId: msg.id,
                sourceNodeId: holder.id,
                targetNodeId: nextHop.id,
                description: `${holder.id} contacted ${nextHop.id} (${nextHop.label}).`,
            });
            msg.hopCount += 1;
            msg.currentHolderId = nextHop.id;
            msg.routeHistory.push(nextHop.id);
            msg.visitedNodeIds.push(nextHop.id);
            msg.status = "Forwarded";
            state.activeTransmissions.push({ from: holder.id, to: nextHop.id, messageId: msg.id });

            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.MESSAGE_TRANSFERRED,
                messageId: msg.id,
                sourceNodeId: holder.id,
                targetNodeId: nextHop.id,
                description: `${msg.id} forwarded from ${holder.id} to ${nextHop.id} (hop ${msg.hopCount}).`,
            });
        }
        else if (holder.type === "RELAY" || holder.type === "DATA_MULE") {
            msg.status = "Carried";
            pushEvent({
                eventType: SIMULATION_EVENT_TYPES.MESSAGE_CARRIED,
                messageId: msg.id,
                sourceNodeId: holder.id,
                description: `${msg.id} carried by ${holder.id} (${holder.label}); awaiting next-hop contact.`,
            });
        }
    }

    syncNodeBuffers(state.nodes, state.messages);

    // Auto-stop Play mode once all injected messages reach a terminal state
    if (
        state.isPlaying &&
        state.messages.length > 0 &&
        state.messages.every((m) => m.status === "Delivered" || m.status === "Expired")
    ) {
        pauseSimulation();
        return getSimulationState();
    }

    emitState();
    return getSimulationState();
}

export function startSimulation(intervalMs = 900) {
    if (playTimer !== null) {
        return getSimulationState();
    }
    state.isPlaying = true;
    emitState();
    playTimer = setInterval(() => {
        stepSimulation();
    }, intervalMs);
    return getSimulationState();
}

export function pauseSimulation() {
    if (playTimer !== null) {
        clearInterval(playTimer);
        playTimer = null;
    }
    if (state.isPlaying) {
        state.isPlaying = false;
        emitState();
    }
    return getSimulationState();
}
