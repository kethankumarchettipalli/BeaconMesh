# BM-MIGRATION-001 — Pre-Migration Baseline Report

**Experiment ID:** BM-MIGRATION-001  
**Project:** BeaconMesh — TypeScript React → JavaScript JSX Mechanical Migration  
**Date:** 2026-11-24  
**Git Baseline Commit:** `85e3928174cb968b65e7c43a4a1859a2e4753986` (`85e3928`)  
**Working Directory:** `d:\Personal-Projects\BeaconMesh`  
**Rollback Backup:** `d:\Personal-Projects\BeaconMesh (2).zip` (273,070,071 bytes, timestamp 2026-11-24 14:34)  

---

## 1. Environment & Framework Baseline

| Component | Package / Tool | Version |
|---|---|---|
| **Runtime Environment** | Node.js | v22 (Windows x64) |
| **Package Manager** | npm / bun lockfile | npm 10.x / bun.lock present |
| **Core UI Library** | `react` / `react-dom` | `19.2.0` |
| **Full-Stack Framework** | `@tanstack/react-start` | `1.168.60` |
| **Routing** | `@tanstack/react-router` | `1.170.41` |
| **Route Generator** | `@tanstack/router-plugin` | `1.168.42` |
| **Server Engine** | `nitro` | `3.0.260603-beta` |
| **Bundler** | `vite` | `8.1.5` |
| **Vite TanStack Config** | `@lovable.dev/vite-tanstack-config` | `2.27.2` |
| **Styling** | `tailwindcss` / `@tailwindcss/vite` | `4.2.1` |
| **Test Runner** | `vitest` | `4.1.12` |
| **DOM Environment** | `jsdom` | `20.0.3` |
| **GIS Platform** | `@arcgis/core` | `5.2.5` |
| **Backend / Auth** | `firebase` | `13.4.0` |
| **Local Storage / IndexedDB** | `dexie` | `4.4.7` |
| **TypeScript Compiler** | `typescript` | `5.8.3` |

---

## 2. File Inventory Summary

| File Type | Count | Description / Notes |
|---|---:|---|
| **`.ts`** | 62 | 59 in `src/`, 2 root configs (`vite.config.ts`, `vitest.config.ts`), 1 script (`scripts/migrate-user-profiles.ts`) |
| **`.tsx`** | 91 | All in `src/` (components, routes, UI primitives, hooks) |
| **`.js` / `.mjs`** | 1 | `eslint.config.js` |
| **`.jsx`** | 0 | None prior to migration |
| **`.json`** | 9 | `package.json`, `tsconfig.json`, `components.json`, `firebase.json`, `package-lock.json`, assets metadata |
| **`.css`** | 1 | `src/styles.css` (Tailwind v4 theme setup) |
| **Other Assets / Configs** | 24 | `.env`, `.env.example`, `.env.local`, `firestore.rules`, icons, branding PNGs, documentation |
| **Total Files** | **188** | Complete working tree inventory |

### Total Source Files Targeted for Migration:
- **TypeScript React Components (`.tsx`):** 91 files
- **TypeScript Modules (`.ts`):** 62 files (excluding special Category D files)

---

## 3. Baseline Build Results

**Command Executed:** `cmd /c "npm run build"`  
**Result:** **SUCCESS (Exit code 0)**  
**Duration:** 6.19 seconds  
**Modules Transformed:** 7,807 modules  

### Build Artifacts Verified
- Client bundle generated in `.output/public/assets/`
- SSR server bundle generated in `.output/server/`
- Nitro server runtime generated in `.output/server/index.mjs` (452 kB)
- Wrangler deployment manifest generated in `.output/server/wrangler.json`

### Pre-existing Build Warnings
1. `The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively...` (Harmless deprecation note).
2. `Warning: Route file "D:/Personal-Projects/BeaconMesh/src/routes/beacon-head.ts" does not export a Route.` (Expected; helper file for `<head>` metadata).

---

## 4. Baseline Test Results

**Command Executed:** `cmd /c "npx vitest run"` (with local Firestore Emulator active on `127.0.0.1:8088`)  
**Result:** **100% PASSING (Exit code 0)**  
**Duration:** 33.33 seconds  

```text
 Test Files  22 passed (22)
      Tests  225 passed (225)
   Failures  0
    Skipped  0
```

### Breakdown of Test Suites
| Subsystem / Test File | Tests Passed | Status | Focus Area |
|---|---:|---|---|
| `src/test/real-firestore-emulator.test.ts` | 43 | PASS | Real Firestore Security Rules & RBAC Attack Vectors |
| `src/test/firebase-auth.test.ts` | 48 | PASS | Authentication state, token parsing, email verification |
| `src/test/data-integration.test.ts` | 14 | PASS | Dexie offline outbox & Firestore synchronization |
| `src/test/dual-capability-authorization.test.ts` | 12 | PASS | Citizen/Responder dual-role capability resolution |
| `src/test/firestore-rules-dual-capability.test.ts` | 11 | PASS | Firestore rule evaluation for dual capabilities |
| `src/test/gis-batch1.test.ts` | 6 | PASS | GIS configuration and service layer resolution |
| `src/test/gis-batch2.test.ts` | 3 | PASS | 2D/3D coordinate transformations & spatial HUD |
| `src/test/gis-batch3.test.ts` | 4 | PASS | Layer visibility toggling & operational layers |
| `src/test/gis-batch4.test.ts` | 2 | PASS | Geospatial distance calculation & safe zone proximity |
| `src/test/gis-batch5.test.ts` | 10 | PASS | Offline map tile caching & sync fallback |
| `src/test/gis-batch6.test.ts` | 3 | PASS | Elevation profiling & 3D camera viewpoints |
| `src/test/hero-animation.test.tsx` | 4 | PASS | Cinematic SVG network topology rendering |
| `src/test/app-routing.test.tsx` | 2 | PASS | Declarative TanStack router navigation flow |
| `src/mesh-engine/test/spray-wait-router.test.ts` | 19 | PASS | Binary Spray-and-Wait & Token Conservation |
| `src/mesh-engine/test/message-models.test.ts` | 9 | PASS | Immutable DTN messages & deep freeze |
| `src/mesh-engine/test/clock.test.ts` | 7 | PASS | Monotonic virtual simulation clock |
| `src/mesh-engine/test/buffer-manager.test.ts` | 6 | PASS | Transactional buffer admission & SOS protection |
| `src/mesh-engine/test/epidemic-router.test.ts` | 6 | PASS | Epidemic replication & in-flight duplicate suppression |
| `src/mesh-engine/test/prng.test.ts` | 6 | PASS | Deterministic Mulberry32 PRNG sequences |
| `src/mesh-engine/test/event-queue.test.ts` | 5 | PASS | Deterministic 4-tuple tie-breaking min-heap |
| `src/mesh-engine/test/simulation-engine.test.ts` | 3 | PASS | Core discrete-event simulation engine |
| `src/mesh-engine/test/deterministic-integration.test.ts` | 2 | PASS | Multi-hop reproducible network scenarios |

---

## 5. Existing Lint Baseline

**Command Executed:** `cmd /c "npm run lint"`  
**Result:** 3,306 problems (3,286 errors, 20 warnings)  
**Root Cause:**
- 3,233 formatting errors from Windows CRLF (`\r\n`) line endings conflicting with prettier Unix LF expectations.
- 53 pre-existing `@typescript-eslint/no-explicit-any` warnings in pre-existing test files (`src/test/firebase-auth.test.ts`).

---

## 6. Route & Navigation Inventory

All routes are registered via TanStack Router file-based routing:

| Route Path | File Path | Access / Role |
|---|---|---|
| `/` | `src/routes/index.tsx` | Public Landing Page |
| `/about` | `src/routes/about.tsx` | Public About Page |
| `/how-it-works` | `src/routes/how-it-works.tsx` | Public Architecture & How-It-Works |
| `/login` | `src/routes/login.tsx` | Public Auth Login |
| `/signup` | `src/routes/signup.tsx` | Public Auth Registration |
| `/verify` | `src/routes/verify.tsx` | Public Email Verification |
| `/forgot-password` | `src/routes/forgot-password.tsx` | Public Password Reset |
| `/citizen` | `src/routes/citizen/index.tsx` | Citizen Portal Entry |
| `/citizen/home` | `src/routes/citizen/home.tsx` | Citizen SOS & Live Status |
| `/citizen/reports` | `src/routes/citizen/reports.tsx` | Citizen Incident Reporting |
| `/citizen/safe-zones` | `src/routes/citizen/safe-zones.tsx` | Citizen Safe Zone Finder |
| `/citizen/profile` | `src/routes/citizen/profile.tsx` | Citizen Profile Management |
| `/responder` | `src/routes/responder/index.tsx` | First Responder Portal Entry |
| `/responder/overview` | `src/routes/responder/overview.tsx` | Responder Incident Queue |
| `/responder/field-map` | `src/routes/responder/field-map.tsx` | Responder Tactical Map (ArcGIS 2D) |
| `/responder/status` | `src/routes/responder/status.tsx` | Responder Duty Status (ON_DUTY / OFF_DUTY) |
| `/responder/application-pending` | `src/routes/responder/application-pending.tsx` | Responder Verification Gate |
| `/responder/incidents/$incidentId` | `src/routes/responder/incidents/$incidentId.tsx` | Responder Incident Action Plan |
| `/command` | `src/routes/command/index.tsx` | Command Staff Portal Entry |
| `/command/overview` | `src/routes/command/overview.tsx` | Incident Commander Overview |
| `/command/incidents` | `src/routes/command/incidents.tsx` | Incident Triage & Dispatch Console |
| `/command/map` | `src/routes/command/map.tsx` | Multi-Agency GIS Console (ArcGIS 2D/3D) |
| `/command/messages` | `src/routes/command/messages.tsx` | Secure Broadcast & Mesh Messages |
| `/command/simulation` | `src/routes/command/simulation.tsx` | DTN Mesh Simulation Console |
| `/command/users` | `src/routes/command/users.tsx` | User Management & Capability Assignment |
| Root Layout | `src/routes/__root.tsx` | Global Application Shell & Providers |
| Route Tree | `src/routeTree.gen.ts` | Auto-generated TanStack Route Manifest |
| Meta Helper | `src/routes/beacon-head.ts` | Application Head & OpenGraph metadata |

---

## 7. Risk Classification

- **Category A — Low Risk (67 files):** Standard React UI primitives (`src/components/ui/*.tsx`), standalone presentational components, simple hooks (`src/hooks/use-mobile.tsx`), and pure utility functions (`src/lib/utils.ts`).
- **Category B — Moderate Risk (48 files):** Complex stateful hooks, route files with TanStack Route loaders, context providers (`src/lib/auth-context.tsx`), Dexie database schema (`src/lib/db/dexie-db.ts`), Firebase integration (`src/lib/firebase.ts`), and Vitest test files with mocks and assertions.
- **Category C — High Risk (30 files):**
  - **Runtime Enum:** `EventPhase` in `src/mesh-engine/core/event-types.ts` (requires runtime JavaScript object with reverse mappings).
  - **Mesh Engine DTN Subsystem (14 files):** Deterministic discrete-event simulation engine, Mulberry32 PRNG, custom min-heap event queue, simulation clock, immutable DTN message copies, transactional buffer manager, epidemic router, spray-and-wait router, and token ledger.
  - **Mesh Engine Tests (9 files):** 63 comprehensive unit and integration tests verifying token conservation, duplicate suppression, and deterministic traces.
  - **ArcGIS GIS Core Modules (7 files):** `src/lib/gis/gis-config.ts`, `src/components/gis/BeaconMapConsole.tsx`, `ComparisonView.tsx`, `EarthProNav.tsx`, `MapViewContainer.tsx`, `MeasurementTools.tsx`, `SceneViewContainer.tsx`.
- **Category D — Configuration / Generated / Special Files (8 files):**
  - `src/routeTree.gen.ts` (Auto-generated by TanStack Router plugin)
  - `vite.config.ts` (Vite config)
  - `vitest.config.ts` (Vitest config)
  - `scripts/migrate-user-profiles.ts` (CLI migration script)
  - `src/server.ts` (TanStack Start server SSR entry point)
  - `src/start.ts` (TanStack Start client hydration entry point)
  - `src/test/setup.ts` (Vitest test environment setup)
  - `src/routes/beacon-head.ts` (TanStack Start head configuration helper)
