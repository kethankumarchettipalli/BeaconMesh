# BM-MIGRATION-001 — Migration File Tracker

**Experiment ID:** BM-MIGRATION-001  
**Project:** BeaconMesh — TypeScript React → JavaScript JSX Mechanical Migration  
**Date:** 2026-11-24  
**Total Source Files Tracked:** 153  
**Files Converted to JS/JSX:** 152 (Pilot: 3, Batch 1: 44, Batch 2: 4, Batch 3: 11, Batch 4: 26, Batch 5: 20, Batch 6: 14, Batch 7: 22, Phase 9: 8)  
**Remaining TS/TSX Files:** 1 (Sole framework-generated file: `src/routeTree.gen.ts`)  
**Handwritten TS/TSX Files Remaining:** 0 (Zero Handwritten TypeScript Goal Achieved)  

## Summary by Category
- **Category A (Low Risk):** 67 (67 converted, 0 remaining)
- **Category B (Moderate Risk):** 48 (48 converted, 0 remaining)
- **Category C (High Risk):** 30 (30 converted, 0 remaining)
- **Category D (Configuration / Generated / Special):** 8 (7 converted, 1 retained generated)

---

## File Tracking Table

| Original File | Converted File | Category | Status | Validation | Notes |
|---|---|:---:|:---:|:---:|---|
| `scripts/migrate-user-profiles.ts` | `scripts/migrate-user-profiles.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | User Profile Migration Engine standalone CLI script |
| `src/lib/auth-service.ts` | `src/lib/auth-service.js` | A | VALIDATED | Build & Tests Passed (Batch 3) | Authentication service with Firebase Auth |
| `src/lib/auth-types.ts` | `src/lib/auth-types.js` | A | VALIDATED | Build & Tests Passed (Sub-batch 5A) | Auth constants (WORKSPACE_ROUTES, SESSION_ROLE_KEY, PENDING_RESPONDER_ROUTE) |
| `src/lib/db/dexie-db.ts` | `src/lib/db/dexie-db.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | Dexie IndexedDB schemas and stores |
| `src/lib/error-capture.ts` | `src/lib/error-capture.js` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard React component / hook / utility |
| `src/lib/error-page.ts` | `src/lib/error-page.js` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard React component / hook / utility |
| `src/lib/firebase.ts` | `src/lib/firebase.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | Firebase App, Auth & Firestore initialization |
| `src/lib/gis/citation-service.ts` | `src/lib/gis/citation-service.js` | A | VALIDATED | Build & Tests Passed (Sub-batch 5B) | Esri World Imagery Citation & Resolution Metadata Service |
| `src/lib/gis/geolocation-service.ts` | `src/lib/gis/geolocation-service.js` | A | VALIDATED | Build & Tests Passed (Sub-batch 5B) | Real device geolocation with Zero Synthetic Fallback |
| `src/lib/gis/gis-config.ts` | `src/lib/gis/gis-config.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | GIS policies, service URLs and Esri interceptor |
| `src/lib/gis/resolution-utils.ts` | `src/lib/gis/resolution-utils.js` | A | VALIDATED | Build & Tests Passed (Sub-batch 5B) | Web Mercator GSD, scale ratios & overzoom diagnostics |
| `src/lib/lovable-error-reporting.ts` | `src/lib/lovable-error-reporting.js` | A | VALIDATED | Build & Tests Passed (Sub-batch 5A) | Error reporting utility & runtime hooks |
| `src/lib/services/command-service.ts` | `src/lib/services/command-service.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | State/DB/Firebase/Auth service |
| `src/lib/services/incident-service.ts` | `src/lib/services/incident-service.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | State/DB/Firebase/Auth service |
| `src/lib/services/responder-service.ts` | `src/lib/services/responder-service.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | State/DB/Firebase/Auth service |
| `src/lib/services/safezone-service.ts` | `src/lib/services/safezone-service.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | State/DB/Firebase/Auth service |
| `src/lib/services/sync-service.ts` | `src/lib/services/sync-service.js` | B | VALIDATED | Build & Tests Passed (Batch 3) | State/DB/Firebase/Auth service |
| `src/lib/types/data-models.ts` | `src/lib/types/data-models.js` | A | VALIDATED | Build & Tests Passed (Batch 3) | Data model validation functions |
| `src/lib/user-normalization.ts` | `src/lib/user-normalization.js` | A | VALIDATED | Build & Tests Passed (Batch 3) | User profile normalization helpers |
| `src/lib/user-service.ts` | `src/lib/user-service.js` | A | VALIDATED | Build & Tests Passed (Batch 3) | Firestore user profiles & roles management |
| `src/lib/utils.ts` | `src/lib/utils.js` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard React component / hook / utility |
| `src/mesh-engine/core/clock.ts` | `src/mesh-engine/core/clock.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Simulation clock advancement & time scale |
| `src/mesh-engine/core/event-queue.ts` | `src/mesh-engine/core/event-queue.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Priority event queue & tie-breaking |
| `src/mesh-engine/core/event-types.ts` | `src/mesh-engine/core/event-types.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Event phase enums & event definitions |
| `src/mesh-engine/core/prng.ts` | `src/mesh-engine/core/prng.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Mulberry32 deterministic 32-bit PRNG |
| `src/mesh-engine/core/simulation-engine.ts` | `src/mesh-engine/core/simulation-engine.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Discrete-event simulation runner & trace |
| `src/mesh-engine/index.ts` | `src/mesh-engine/index.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Mesh engine public module exports |
| `src/mesh-engine/models/buffer-manager.ts` | `src/mesh-engine/models/buffer-manager.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | DTN buffer capacity, TTL & eviction |
| `src/mesh-engine/models/dtn-message.ts` | `src/mesh-engine/models/dtn-message.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Immutable DTN message model & serialization |
| `src/mesh-engine/models/message-copy.ts` | `src/mesh-engine/models/message-copy.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Local message copy tracking & status |
| `src/mesh-engine/models/virtual-node.ts` | `src/mesh-engine/models/virtual-node.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Virtual DTN node, radio range & delivery |
| `src/mesh-engine/routing/epidemic-router.ts` | `src/mesh-engine/routing/epidemic-router.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Flooding-based epidemic router protocol |
| `src/mesh-engine/routing/router-interface.ts` | `src/mesh-engine/routing/router-interface.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Abstract DTN router contract |
| `src/mesh-engine/routing/spray-wait-router.ts` | `src/mesh-engine/routing/spray-wait-router.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Binary Spray-and-Wait routing protocol |
| `src/mesh-engine/routing/token-ledger.ts` | `src/mesh-engine/routing/token-ledger.js` | C | VALIDATED | Build & Tests Passed (Batch 6) | Token balance tracking & transfer receipts |
| `src/mesh-engine/test/buffer-manager.test.ts` | `src/mesh-engine/test/buffer-manager.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/clock.test.ts` | `src/mesh-engine/test/clock.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/deterministic-integration.test.ts` | `src/mesh-engine/test/deterministic-integration.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/epidemic-router.test.ts` | `src/mesh-engine/test/epidemic-router.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/event-queue.test.ts` | `src/mesh-engine/test/event-queue.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/message-models.test.ts` | `src/mesh-engine/test/message-models.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/prng.test.ts` | `src/mesh-engine/test/prng.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/simulation-engine.test.ts` | `src/mesh-engine/test/simulation-engine.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/mesh-engine/test/spray-wait-router.test.ts` | `src/mesh-engine/test/spray-wait-router.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | Mesh Engine DTN core simulation logic |
| `src/routes/beacon-head.ts` | `src/lib/beacon-head.js` | B | VALIDATED | Build & Tests Passed (Phase 9) | HTML head meta generator; relocated to lib/ to eliminate route warning |
| `src/routeTree.gen.ts` | `src/routeTree.gen.ts (Framework Generated)` | D | VALIDATED | Framework Requirement Confirmed | TanStack Router auto-generated route tree with hardcoded TS module declaration footer |
| `src/server.ts` | `src/server.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | Server entry point for SSR error capture & Nitro integration |
| `src/start.ts` | `src/start.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | TanStack Start initialization & CSRF/error middleware |
| `src/test/data-integration.test.ts` | `src/test/data-integration.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/dual-capability-authorization.test.ts` | `src/test/dual-capability-authorization.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/firebase-auth.test.ts` | `src/test/firebase-auth.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/firestore-rules-dual-capability.test.ts` | `src/test/firestore-rules-dual-capability.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/gis-batch1.test.ts` | `src/test/gis-batch1.test.js` | C | VALIDATED | Build & Tests Passed (Batch 7) | ArcGIS GIS core modules |
| `src/test/gis-batch2.test.ts` | `src/test/gis-batch2.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/gis-batch3.test.ts` | `src/test/gis-batch3.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/gis-batch4.test.ts` | `src/test/gis-batch4.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/gis-batch5.test.ts` | `src/test/gis-batch5.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/gis-batch6.test.ts` | `src/test/gis-batch6.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/real-firestore-emulator.test.ts` | `src/test/real-firestore-emulator.test.js` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/setup.ts` | `src/test/setup.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | Vitest test setup with jest-dom & DOM window mocks |
| `vite.config.ts` | `vite.config.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | Vite configuration using @lovable.dev/vite-tanstack-config |
| `vitest.config.ts` | `vitest.config.js` | D | VALIDATED | Build & Tests Passed (Phase 9) | Vitest configuration supporting JS/JSX test discovery & JSDOM |
| `src/components/beaconmesh/app.tsx` | `src/components/beaconmesh/app.jsx` | A | VALIDATED | Build & Tests Passed (Batch 5) | Master BeaconPage application navigation & shell |
| `src/components/beaconmesh/auth-forms.tsx` | `src/components/beaconmesh/auth-forms.jsx` | A | VALIDATED | Build & Tests Passed (Batch 5) | Login, signup, password reset & verification forms |
| `src/components/beaconmesh/hero-cinematic-animation.tsx` | `src/components/beaconmesh/hero-cinematic-animation.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard React component / hook / utility |
| `src/components/gis/BeaconMapConsole.tsx` | `src/components/gis/BeaconMapConsole.jsx` | C | VALIDATED | Build & Tests Passed (Batch 5) | Primary GIS map command console & layer hub |
| `src/components/gis/CommandModeSelector.tsx` | `src/components/gis/CommandModeSelector.jsx` | A | VALIDATED | Build & Tests Passed (Sub-batch 5C) | Basemap and 2D/3D dimension selector controls |
| `src/components/gis/ComparisonView.tsx` | `src/components/gis/ComparisonView.jsx` | C | VALIDATED | Build & Tests Passed (Batch 5) | Side-by-side / swipe comparison view |
| `src/components/gis/CoordinateHUD.tsx` | `src/components/gis/CoordinateHUD.jsx` | A | VALIDATED | Build & Tests Passed (Sub-batch 5C) | Live coordinate, LOD, scale, and GSD HUD |
| `src/components/gis/EarthProNav.tsx` | `src/components/gis/EarthProNav.jsx` | C | VALIDATED | Build & Tests Passed (Batch 5) | 3D flight camera & orbit navigation overlay |
| `src/components/gis/ImageryInspector.tsx` | `src/components/gis/ImageryInspector.jsx` | A | VALIDATED | Build & Tests Passed (Sub-batch 5C) | Sensor citation metadata & overzoom alert inspector |
| `src/components/gis/LayerPanel.tsx` | `src/components/gis/LayerPanel.jsx` | A | VALIDATED | Build & Tests Passed (Sub-batch 5C) | Operational, analytical & simulation layer manager |
| `src/components/gis/MapControls.tsx` | `src/components/gis/MapControls.jsx` | A | VALIDATED | Build & Tests Passed (Sub-batch 5C) | Navigation tools, presets & coordinate search |
| `src/components/gis/MapViewContainer.tsx` | `src/components/gis/MapViewContainer.jsx` | C | VALIDATED | Build & Tests Passed (Batch 5) | ArcGIS 2D MapView container & lifecycle |
| `src/components/gis/MeasurementTools.tsx` | `src/components/gis/MeasurementTools.jsx` | C | VALIDATED | Build & Tests Passed (Batch 5) | Distance & Area 2D/3D measurement tools |
| `src/components/gis/SceneViewContainer.tsx` | `src/components/gis/SceneViewContainer.jsx` | C | VALIDATED | Build & Tests Passed (Batch 5) | ArcGIS 3D SceneView container & WebGL lifecycle |
| `src/components/ui/accordion.tsx` | `src/components/ui/accordion.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/alert-dialog.tsx` | `src/components/ui/alert-dialog.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/alert.tsx` | `src/components/ui/alert.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/aspect-ratio.tsx` | `src/components/ui/aspect-ratio.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/avatar.tsx` | `src/components/ui/avatar.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/badge.tsx` | `src/components/ui/badge.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/breadcrumb.tsx` | `src/components/ui/breadcrumb.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/button.tsx` | `src/components/ui/button.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/calendar.tsx` | `src/components/ui/calendar.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/card.tsx` | `src/components/ui/card.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/carousel.tsx` | `src/components/ui/carousel.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/chart.tsx` | `src/components/ui/chart.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/checkbox.tsx` | `src/components/ui/checkbox.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/collapsible.tsx` | `src/components/ui/collapsible.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/command.tsx` | `src/components/ui/command.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/context-menu.tsx` | `src/components/ui/context-menu.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/dialog.tsx` | `src/components/ui/dialog.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/drawer.tsx` | `src/components/ui/drawer.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/dropdown-menu.tsx` | `src/components/ui/dropdown-menu.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/form.tsx` | `src/components/ui/form.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/hover-card.tsx` | `src/components/ui/hover-card.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/input-otp.tsx` | `src/components/ui/input-otp.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/input.tsx` | `src/components/ui/input.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/label.tsx` | `src/components/ui/label.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/menubar.tsx` | `src/components/ui/menubar.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/navigation-menu.tsx` | `src/components/ui/navigation-menu.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/pagination.tsx` | `src/components/ui/pagination.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/popover.tsx` | `src/components/ui/popover.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/progress.tsx` | `src/components/ui/progress.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/radio-group.tsx` | `src/components/ui/radio-group.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/resizable.tsx` | `src/components/ui/resizable.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/scroll-area.tsx` | `src/components/ui/scroll-area.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/select.tsx` | `src/components/ui/select.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/separator.tsx` | `src/components/ui/separator.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/sheet.tsx` | `src/components/ui/sheet.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/sidebar.tsx` | `src/components/ui/sidebar.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/skeleton.tsx` | `src/components/ui/skeleton.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/slider.tsx` | `src/components/ui/slider.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/sonner.tsx` | `src/components/ui/sonner.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/switch.tsx` | `src/components/ui/switch.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/table.tsx` | `src/components/ui/table.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/tabs.tsx` | `src/components/ui/tabs.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/textarea.tsx` | `src/components/ui/textarea.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/toggle-group.tsx` | `src/components/ui/toggle-group.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/toggle.tsx` | `src/components/ui/toggle.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/components/ui/tooltip.tsx` | `src/components/ui/tooltip.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard UI component |
| `src/hooks/use-mobile.tsx` | `src/hooks/use-mobile.jsx` | A | VALIDATED | Build & Tests Passed (Batch 1 & 2) | Standard React component / hook / utility |
| `src/lib/auth-context.tsx` | `src/lib/auth-context.jsx` | B | VALIDATED | Build & Tests Passed (Batch 5) | Global auth context, session state & role evaluation |
| `src/router.tsx` | `src/router.jsx` | B | VALIDATED | Build & Tests Passed (Batch 5) | TanStack Start client router & QueryClient integration |
| `src/routes/about.tsx` | `src/routes/about.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/citizen/home.tsx` | `src/routes/citizen/home.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/citizen/index.tsx` | `src/routes/citizen/index.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/citizen/profile.tsx` | `src/routes/citizen/profile.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/citizen/reports.tsx` | `src/routes/citizen/reports.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/citizen/safe-zones.tsx` | `src/routes/citizen/safe-zones.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/incidents.tsx` | `src/routes/command/incidents.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/index.tsx` | `src/routes/command/index.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/map.tsx` | `src/routes/command/map.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/messages.tsx` | `src/routes/command/messages.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/overview.tsx` | `src/routes/command/overview.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/simulation.tsx` | `src/routes/command/simulation.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/command/users.tsx` | `src/routes/command/users.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/forgot-password.tsx` | `src/routes/forgot-password.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/how-it-works.tsx` | `src/routes/how-it-works.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/index.tsx` | `src/routes/index.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/login.tsx` | `src/routes/login.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/responder/application-pending.tsx` | `src/routes/responder/application-pending.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/responder/field-map.tsx` | `src/routes/responder/field-map.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/responder/incidents/$incidentId.tsx` | `src/routes/responder/incidents/$incidentId.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/responder/index.tsx` | `src/routes/responder/index.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/responder/overview.tsx` | `src/routes/responder/overview.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/responder/status.tsx` | `src/routes/responder/status.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/signup.tsx` | `src/routes/signup.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/verify.tsx` | `src/routes/verify.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/routes/__root.tsx` | `src/routes/__root.jsx` | B | VALIDATED | Build & Tests Passed (Batch 4) | TanStack Route implementation |
| `src/test/app-routing.test.tsx` | `src/test/app-routing.test.jsx` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
| `src/test/hero-animation.test.tsx` | `src/test/hero-animation.test.jsx` | B | VALIDATED | Build & Tests Passed (Batch 7) | Vitest suite with type assertions/mocks |
