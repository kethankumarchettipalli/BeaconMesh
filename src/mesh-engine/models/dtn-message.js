/**
 * Immutable DTN Message
 *
 * Defines the canonical immutable payload and identity of a DTN packet.
 * Enforces runtime deep immutability across nested structures, supports
 * shared references without false circular detection, and generates a
 * deterministic 32-bit FNV-1a in-memory simulation checksum.
 *
 * (Note: FNV-1a is a non-cryptographic checksum used for simulation verification;
 * it is not SHA-256 and provides no cryptographic security or tamper resistance).
 */
/**
 * Recursively deep-clones and freezes JSON-compatible payload structures.
 * Accurately supports shared references (DAGs) while detecting and rejecting
 * genuine circular references (cycles) via an active call-stack tracker.
 */
export function deepCloneAndFreeze(value, activeStack = new WeakSet(), clonedMap = new WeakMap()) {
    if (value === null || typeof value !== "object") {
        if (typeof value === "function" || typeof value === "symbol") {
            throw new Error(`createDTNMessage: Unsupported payload value type: ${typeof value}`);
        }
        return value;
    }
    const obj = value;
    // 1. Genuine circular reference check: is this object currently an ancestor in the active call stack?
    if (activeStack.has(obj)) {
        throw new Error("createDTNMessage: Circular reference detected in payload.");
    }
    // 2. Shared reference check: if already cloned and frozen in another branch of the DAG, reuse it
    if (clonedMap.has(obj)) {
        return clonedMap.get(obj);
    }
    activeStack.add(obj);
    let result;
    try {
        if (Array.isArray(value)) {
            const clonedArray = [];
            clonedMap.set(obj, clonedArray);
            for (const item of value) {
                clonedArray.push(deepCloneAndFreeze(item, activeStack, clonedMap));
            }
            result = Object.freeze(clonedArray);
        }
        else {
            const clonedObj = {};
            clonedMap.set(obj, clonedObj);
            const keys = Object.keys(value).sort();
            for (const key of keys) {
                const prop = value[key];
                if (typeof prop === "function" || typeof prop === "symbol") {
                    throw new Error(`createDTNMessage: Unsupported payload property type at key "${key}": ${typeof prop}`);
                }
                clonedObj[key] = deepCloneAndFreeze(prop, activeStack, clonedMap);
            }
            result = Object.freeze(clonedObj);
        }
    }
    finally {
        activeStack.delete(obj);
    }
    return result;
}
/**
 * Recursively canonicalizes payload into a deterministic JSON string with sorted keys.
 * Tracks active call stack to support shared references without false circular detection.
 */
export function canonicalJsonSerialize(val, activeStack = new WeakSet()) {
    if (val === null || typeof val !== "object") {
        return JSON.stringify(val);
    }
    const obj = val;
    if (activeStack.has(obj)) {
        throw new Error("createDTNMessage: Circular reference detected in payload.");
    }
    activeStack.add(obj);
    let result;
    try {
        if (Array.isArray(val)) {
            result =
                "[" +
                    val.map((item) => canonicalJsonSerialize(item, activeStack)).join(",") +
                    "]";
        }
        else {
            const keys = Object.keys(val).sort();
            const entries = keys.map((k) => JSON.stringify(k) +
                ":" +
                canonicalJsonSerialize(val[k], activeStack));
            result = "{" + entries.join(",") + "}";
        }
    }
    finally {
        activeStack.delete(obj);
    }
    return result;
}
/**
 * Computes deterministic FNV-1a 32-bit hash hex digest of a payload.
 * Used strictly as a non-cryptographic simulation checksum.
 */
export function computePayloadDigest(payload) {
    const serialized = canonicalJsonSerialize(payload);
    let hash = 0x811c9dc5;
    for (let i = 0; i < serialized.length; i++) {
        hash ^= serialized.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
/**
 * Factory function creating a deeply frozen, validated ImmutableDTNMessage.
 */
export function createDTNMessage(params) {
    if (params.ttlMs <= 0) {
        throw new Error(`createDTNMessage: ttlMs must be positive, got ${params.ttlMs}`);
    }
    if (params.payloadSizeBytes <= 0) {
        throw new Error(`createDTNMessage: payloadSizeBytes must be positive, got ${params.payloadSizeBytes}`);
    }
    if (![0, 1, 2].includes(params.priority)) {
        throw new Error(`createDTNMessage: priority must be 0, 1, or 2, got ${params.priority}`);
    }
    const id = params.id ||
        `msg_${params.originNodeId}_${params.createdAtSimTime}_${params.type}`;
    // Validate, deep clone and freeze payload
    const frozenPayload = deepCloneAndFreeze(params.payload);
    const digest = computePayloadDigest(frozenPayload);
    const msg = {
        id,
        originNodeId: params.originNodeId,
        destinationNodeId: params.destinationNodeId,
        type: params.type,
        priority: params.priority,
        createdAtSimTime: params.createdAtSimTime,
        ttlMs: params.ttlMs,
        expiresAtSimTime: params.createdAtSimTime + params.ttlMs,
        payloadSizeBytes: params.payloadSizeBytes,
        payloadDigest: digest,
        payload: frozenPayload,
    };
    return Object.freeze(msg);
}
