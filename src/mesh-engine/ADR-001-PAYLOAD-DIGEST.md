# ADR-001: In-Memory Payload Digest & Verification Model

**Status:** ACCEPTED  
**Date:** 2026-11-20  
**Context:** Phase 2 DTN Simulation Engine Foundation (`src/mesh-engine/`)

---

## 1. Context & Problem Statement

`BM-MESH-ARCH-002-SPEC` Section 2.1 specified `payloadDigest` as a 32-byte representation of simulated SHA-256 payload integrity.
In pure TypeScript environments, cryptographic SHA-256 presents key architectural trade-offs:
1. `node:crypto` is Node-specific and breaks standard browser/web worker execution.
2. Web Cryptography API (`crypto.subtle.digest`) is asynchronous (`Promise<ArrayBuffer>`), which forces packet creation, validation, and event loop stepping to become asynchronous, introducing microtask queue indeterminism into discrete-event simulation.
3. Adding a synchronous pure JS SHA-256 library (such as `@noble/hashes`) would violate the non-negotiable constraint forbidding new external packages in `package.json`.

---

## 2. Decision & Implementation

1. **Algorithm:** The DTN engine uses deterministic 32-bit FNV-1a (`computePayloadDigest`), returning an 8-character hex string.
2. **Deterministic Canonical Serialization:** Payloads are serialized using `canonicalJsonSerialize()`, which recursively sorts all object keys across arbitrary nesting depths and normalizes arrays and primitive values.
3. **Simulation Checksum Classification:**
   - The digest is strictly an **in-simulation data integrity checksum**.
   - It verifies that payload data transferred between virtual nodes matches the origin message bit-for-bit without corruption.
   - **It is NOT SHA-256 and NOT a cryptographic integrity or security mechanism.** It does not protect against adversarial preimage attacks or malicious payload tampering.
4. **Runtime Immutability:** Payloads are deep-cloned and recursively frozen (`deepCloneAndFreeze`) upon message creation. Mutating nested objects or arrays post-creation is blocked at runtime.
