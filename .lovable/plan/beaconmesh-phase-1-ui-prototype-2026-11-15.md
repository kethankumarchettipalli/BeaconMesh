# BeaconMesh Phase 1 — UI Prototype

## Goal

Build one cohesive, responsive BeaconMesh application with a public landing experience, preview-only authentication, and Citizen, Responder, and Command workspaces. All incidents, connectivity, maps, and network activity use clearly identified mock data; no backend, real dispatch, or device networking is added.

## Build batches

1. **Brand and public experience:** Create the landing page with an animated, reduced-motion-aware signal story, product sections, and footer; add login, signup, password recovery, and verification screens with preview-only flows. Use the uploaded BeaconMesh icon and wordmark as the primary visual references, derive the visual identity from them, and use the icon for the favicon.
2. **Shared application foundation:** Establish shared navigation and workspace shells, reusable operational and incident UI, preview-only role switching for Citizen, Responder (Professional/Volunteer), Coordinator, and Administrator, responsive navigation, and light/dark themes persisted across refreshes. Coordinator and Administrator share Command while exposing different preview actions.
3. **Citizen workspace:** Build Home/SOS, Reports, Safe Zones, and Profile. Prioritize mobile layouts, accessible controls, and local mock incident creation and tracking.
4. **Responder workspace:** Build Overview, incident detail, Field Map, and Status pages, including professional/volunteer preview distinctions where useful.
5. **Command workspace:** Build Overview, Map, real-incident management, Simulation Laboratory, simulation-only Message Intelligence, and role-aware User Management.
6. **Quality pass:** Verify every route by direct navigation and refresh, browser back/forward, navigation and representative interactions, theme persistence, and narrow/mobile layouts at 360px and 390px plus tablet and desktop; fix overflow and incomplete states. Before each batch is complete, report routes, interactions tested, files changed, and outstanding issues.

## Route coverage

- Public: `/`, `/about`, `/how-it-works`.
- Preview authentication: `/login`, `/signup`, `/forgot-password`, `/verify`.
- Citizen: `/citizen/home`, `/citizen/reports`, `/citizen/safe-zones`, `/citizen/profile`.
- Responder: `/responder/overview`, `/responder/incidents/$incidentId`, `/responder/field-map`, `/responder/status`.
- Shared Command: `/command/overview`, `/command/map`, `/command/incidents`, `/command/simulation`, `/command/messages`, `/command/users`.
- Provide workspace base paths `/citizen`, `/responder`, and `/command` as useful entry points into their workspace.

## Data and interaction acceptance

- Label mock citizen incidents as **DEMO DATA** and simulation messages/deliveries separately as **SIMULATION**; never mix their records or feeds.
- Make prominent controls, forms, menus, filters, dialogs, navigation, incident creation/tracking, and simulation controls meaningfully interactive with frontend-only state.
- Validate the Citizen workspace without horizontal overflow at 360px and 390px, and at tablet and desktop widths.

## Boundaries and implementation

- Preserve the existing TanStack Start routing and project dependencies; do not introduce React Router or backend services.
- Keep all work in this one application, using existing shadcn/ui and Lucide dependencies where appropriate.
- Use mock interfaces and data that can later be replaced; keep citizen incidents separate from simulation messages and deliveries.
- Treat the supplied icon and wordmark as the source for the brand palette and visual language; preserve their proportions and artwork.
- Leave protected engine, offline, configuration, Firebase, and simulation-test areas untouched.
