# Neighborly Emergency Beacons

# BEACONMESH

## Master Project Context & Phase 1 — Complete UI Development

**Brand tagline:** Every signal finds its way.

**Project type:** Decentralized, offline-first emergency communication and disaster response platform.

**Development approach:** UI-first, mobile-first, single React application, followed by backend and simulation integration.

---

# PART A — MASTER PROJECT CONTEXT

## 1. Understand the product

BeaconMesh is a decentralized, offline-first emergency communication and disaster response platform designed for situations where conventional cellular and internet infrastructure may become unavailable or unreliable.

During floods, cyclones, earthquakes, fires and other emergencies, people may become isolated. Conventional centralized applications can become ineffective when internet connectivity disappears.

BeaconMesh explores an alternative communication model inspired by Delay-Tolerant Networking (DTN), Epidemic Routing and the Store-Carry-Forward principle.

The central concept:

**A message should have a way to travel even when a direct connection to the internet is unavailable.**

A citizen creates an emergency message. Nearby network nodes can receive and carry the message. When nodes encounter other nodes, they exchange eligible messages. Eventually, a message may reach a gateway that can communicate with the connected infrastructure.

The platform combines:

- Emergency reporting.
- Offline-first incident storage.
- Decentralized message-routing simulation.
- Responder coordination.
- Geographic emergency operations.
- Network monitoring and visualization.

This is initially a university prototype, not a certified disaster-response system.

## 2. Product vision

BeaconMesh should feel like a serious, professional emergency-response technology platform.

It should communicate:

- Reliability.
- Urgency without unnecessary panic.
- Connectivity in isolated environments.
- Human-centered emergency assistance.
- Technological innovation.
- Operational clarity.

Do not make it look like a generic admin dashboard, ordinary social media application, cryptocurrency platform or generic SaaS template.

The product should have a distinctive identity and a consistent visual language.

## 3. Brand identity

The official working brand is:

**BeaconMesh**

Tagline:

**Every signal finds its way.**

The user will upload the BeaconMesh standalone lighthouse-and-network icon.

Use this uploaded logo as the primary visual brand reference.

Interpret its visual character and develop a cohesive design system around it.

IMPORTANT:

- You have creative freedom to select the complete colour palette.
- Do not require the user to specify individual colours.
- Derive an appropriate palette from the supplied logo.
- Design both light and dark themes intentionally.
- Both themes must feel polished and complete.
- Do not simply invert the colours of one theme.
- Maintain consistent branding, iconography, typography, spacing and component styling.
- The logo symbol and wordmark should be usable independently.
- Never distort, stretch or recreate the uploaded logo unnecessarily.

The user expects high-quality visual judgment, not a basic implementation of a supplied colour list.

## 4. Human roles and application workspaces

There are four human role categories.

### CITIZEN

Ordinary users who report emergencies, track their incidents and find safety information.

### RESPONDER

Emergency personnel and volunteers.

The responder has a subtype:

- PROFESSIONAL
- VOLUNTEER

These are subtypes of one RESPONDER role, not separate dashboards.

### COORDINATOR

Personnel responsible for coordinating emergency operations, managing incidents and monitoring response activities.

### ADMINISTRATOR

Personnel responsible for platform administration and authorized user management.

There are three application workspaces:

1. Citizen Dashboard
2. Responder Dashboard
3. Command Dashboard

Coordinator and Administrator access the shared Command workspace, with different permissions.

Do not create separate applications or separate Lovable projects for these workspaces.

## 5. Network simulation node types

These are NOT human application roles.

The network simulator contains four types of nodes:

1. Citizen Node — originates emergency messages.
2. Relay Node — receives and forwards eligible messages.
3. Data Mule Node — moves between network regions and carries messages.
4. Gateway Node — represents a connection to external infrastructure.

The Simulation Laboratory must visually distinguish these node types.

The simulation is an educational and technical demonstration. Do not claim actual Bluetooth mesh, LoRa, satellite or drone communication is implemented.

## 6. Core product concepts

### Emergency reporting

Citizens can create SOS reports containing:

- Unique incident ID.
- Emergency category.
- Description.
- Location and coordinates.
- Creation timestamp.
- Current status.
- Local delivery state.

### Offline-first behavior

The intended architecture uses:

- IndexedDB for local incident storage and an outbox.
- A service worker for caching the application shell.
- Firebase for cloud authentication and data storage.
- Retry-based synchronization when connectivity returns.

During this UI phase, show these states using realistic mock data:

- Saved on device.
- Waiting for connection.
- Synchronizing.
- Delivered.
- Acknowledged.

Do not pretend that mock synchronization is real.

### Decentralized routing

The intended simulation includes:

- Message forwarding.
- Duplicate suppression.
- Message expiry.
- Hop limits.
- Node buffers.
- Network partitions.
- Gateway delivery.
- Acknowledgement propagation.
- Data Mule movement.

### Geographic operations

The application will eventually integrate a real map provider.

For now, design complete map interfaces with mock data and a map placeholder.

Do not build a fake interactive geographic system and claim it is a real map integration.

## 7. Product boundaries

The first version is a prototype.

The following are not implemented in the UI phase:

- Actual BLE phone-to-phone communication.
- Actual LoRa radio networking.
- Physical drone communication.
- Satellite connectivity.
- Production emergency-service integrations.
- Real-time verified rescue dispatch.
- Real geographic routing.
- Production map integration.
- Real Firebase authentication or persistence.

These capabilities may be integrated or simulated later.

The UI should distinguish real emergency incident workflows from simulation-only workflows.

---

# PART B — COMPLETE APPLICATION HIERARCHY

## 8. Public website

Routes:

- /
- /about (optional separate page; can initially be a landing-page section)
- /how-it-works (optional separate page; can initially be a landing-page section)

The landing page is a major part of the product identity.

### Landing page sections

1. Cinematic hero.
2. Problem statement.
3. BeaconMesh solution.
4. How decentralized communication works.
5. Store-Carry-Forward explanation.
6. Four network node types.
7. Citizen, Responder and Command capabilities.
8. Main product features.
9. Call to action.
10. Footer with relevant information.

### Hero animation concept

Create an ambitious cinematic experience:

Scene 1:
A disaster-affected landscape, with a lone emergency responder walking through an isolated environment.

Scene 2:
The responder raises a satellite-style emergency communication device and searches for a signal.

Scene 3:
A signal-search visual effect appears.

Scene 4:
Nearby network nodes begin connecting through illuminated network lines.

Scene 5:
The network expands, showing that messages can move through intermediate nodes.

Scene 6:
A powerful beacon/signal visual activates.

Scene 7:
The BeaconMesh logo and tagline appear.

The animation should communicate the product's purpose through visual storytelling.

Use your creative judgment for animation, lighting, scene composition, transitions and typography.

Do not create a static hero that merely places the logo over a generic gradient.

Try to build the experience with performant web-native techniques such as CSS, SVG, layered imagery and animation.

Respect reduced-motion preferences.

If a truly cinematic result cannot be achieved within the implementation constraints, create the best feasible version with a clear structure that can later be enhanced.

## 9. Authentication

Routes:

- /login
- /signup
- /forgot-password
- /verify

### Login

- BeaconMesh branding.
- Email and password login interface.
- Phone number and OTP login option.
- Remember me.
- Forgot password.
- Registration link.
- Validation and error states.
- Login success state.

### Registration

- Full name.
- Email address.
- Phone number.
- Password.
- Confirm password.
- Region/location.
- Terms and privacy consent.
- Verification screen.

Public signup should represent Citizen registration.

Responder, Coordinator and Administrator accounts are provisioned through authorized administration in the eventual backend.

### Authentication UI requirements

Design email and phone login options, but do not implement real authentication during Phase 1.

Use realistic mock authentication only to demonstrate frontend navigation.

Provide a role-selection/demo-access mechanism for previewing the three workspaces. Clearly treat this as a UI preview, not actual authorization.

## 10. Citizen Dashboard

Base route: /citizen

This is the highest-priority mobile-first workspace.

### Page 1: Home & SOS

Route: /citizen/home

Contents:

- Welcome message.
- Current location.
- Connectivity indicator.
- Prominent SOS action.
- Emergency category selector.
- Emergency description.
- Location confirmation.
- GPS availability indicator.
- Optional attachment area.
- Submit emergency interface.
- Recent incident summary.
- Emergency safety information.

Emergency categories:

- Medical.
- Trapped.
- Fire.
- Flood.
- Accident.
- Other.

The SOS action must be immediately visible and easy to reach.

### Page 2: My Reports & Tracking

Route: /citizen/reports

Contents:

- List of submitted reports.
- Incident IDs.
- Emergency category.
- Creation time.
- Status badges.
- Delivery state.
- Incident details.
- Incident timeline.
- Responder assignment information.
- Response updates.
- Acknowledgement status.
- Resolution information.

### Page 3: Safe Zones

Route: /citizen/safe-zones

Contents:

- Map placeholder.
- Nearby safe zones.
- Evacuation centres.
- Shelters.
- Medical facilities.
- Safe-zone details.
- Capacity/status indicators where available.
- Distance and directions placeholders.
- Last updated information.
- Offline map availability notice.

### Page 4: Profile & Settings

Route: /citizen/profile

Contents:

- Personal details.
- Email and phone.
- Emergency contacts.
- Region/location preferences.
- Language preferences.
- Light/dark theme.
- Notification settings.
- Privacy.
- Account settings.
- Logout.

## 11. Responder Dashboard

Base route: /responder

### Page 1: Overview & Assigned Incidents

Route: /responder/overview

Contents:

- Responder welcome panel.
- Availability status.
- Assigned incident count.
- Priority incident queue.
- New assignments.
- Active operations.
- Completed operations.
- Incident quick actions.

### Page 2: Incident Details

Route: /responder/incidents/:incidentId

Contents:

- Incident ID.
- Emergency category.
- Description.
- Location.
- Coordinates.
- Severity.
- Assignment details.
- Relevant citizen information subject to permissions.
- Incident history.
- Assignment actions.
- Status update actions.
- Field notes.

### Page 3: Field Operations Map

Route: /responder/field-map

Contents:

- Map placeholder.
- Assigned incidents.
- Responder's last-known location.
- Nearby incidents.
- Safe zones.
- Emergency facilities.
- Authorized operational units.
- Filters.
- Map legend.
- Selected incident details panel.

### Page 4: Status Updates

Route: /responder/status

Contents:

- Availability.
- Travelling to incident.
- Arrived at scene.
- Assistance in progress.
- Resolved/completed.
- Operation notes.
- Status history.

Professional and Volunteer responders share this workspace, but their available actions may differ.

## 12. Command Dashboard

Base route: /command

This is the primary operational and demonstration workspace.

### Page 1: Command Overview

Route: /command/overview

Contents:

- Total incidents.
- Active incidents.
- Pending incidents.
- Critical incidents.
- Resolved incidents.
- Responder availability.
- Incident priority distribution.
- Geographic overview.
- Recent operational activity.
- Connectivity/network health summary.
- Quick action panels.

### Page 2: Live Operations Map

Route: /command/map

Contents:

- Large map placeholder.
- Incident markers.
- Responder markers.
- Safe zones.
- Emergency facilities.
- Network node overlay.
- Layer selection.
- Search and filters.
- Map legend.
- Zoom controls.
- Selected marker information panel.

### Page 3: Incident Management

Route: /command/incidents

Contents:

- Real citizen incident list.
- Search.
- Sorting.
- Filtering.
- Priority.
- Severity.
- Incident details.
- Assignment to responders/teams.
- Status management.
- Incident history.
- Acknowledgement and resolution tracking.

IMPORTANT:
This page contains real citizen incidents only.

Do not insert simulated gateway deliveries into Incident Management.

### Page 4: Simulation Laboratory

Route: /command/simulation

This is the technical showcase.

Contents:

- Scenario selector.
- Network topology canvas.
- Citizen nodes.
- Relay nodes.
- Data Mule nodes.
- Gateway nodes.
- Play/pause/reset.
- Single-step controls.
- Simulation speed.
- Message creation.
- Message injection.
- Node details.
- Node buffer information.
- Link visualization.
- Network partitions.
- Message forwarding visualization.
- TTL and hop count.
- Gateway delivery.
- ACK status.
- Simulation event log.
- Statistics.

Initial scenarios:

1. Normal connectivity.
2. Internet unavailable / offline workflow demonstration.
3. Dense network.
4. Network partition.
5. Data Mule.
6. Duplicate messages.

During Phase 1, use mock data and visual interactions. The actual simulation engine will be integrated later.

### Page 5: Message Intelligence

Route: /command/messages

Contents:

- Simulation event feed.
- Message IDs.
- Source nodes.
- Destination nodes.
- Forwarding history.
- Hop counts.
- Expiry information.
- Duplicate suppression statistics.
- Gateway delivery records.
- ACK propagation.
- Delivery statistics.
- Scenario and node filters.

IMPORTANT:
This page is for simulation messages and simulation deliveries. Clearly label them SIMULATION.

### Page 6: User Management

Route: /command/users

Contents:

- User directory.
- Search and filtering.
- Citizens.
- Professional responders.
- Volunteer responders.
- Coordinators.
- Administrators.
- User profiles.
- Account status.
- Role information.
- Team assignment.
- Account activation/suspension controls.

Coordinator and Administrator should see different available actions.

---

# PART C — UI DESIGN AND EXPERIENCE REQUIREMENTS

## 13. Design philosophy

Create a premium, polished, modern emergency-response technology platform.

The result must feel deliberately designed.

Avoid:

- Generic dashboard templates.
- Excessive empty cards.
- Unnecessary gradients everywhere.
- Overcrowded pages.
- Excessive decorative animations.
- Tiny text.
- Poor contrast.
- Inconsistent spacing.
- Random icon styles.
- Placeholder-looking sections.
- Repeated identical dashboard layouts without role-specific character.

Use professional typography, a consistent spacing system, clear information hierarchy, deliberate composition and appropriate visual storytelling.

You have creative freedom over colours and visual styling.

Use the uploaded BeaconMesh icon as the primary brand reference and derive a consistent visual system from it.

## 14. Dual-theme system

Implement both:

1. Light theme.
2. Dark theme.

Requirements:

- Both themes must be intentionally designed.
- A global theme switcher.
- Persist the selected theme locally.
- Apply the theme consistently across all routes.
- Ensure readable text and contrast.
- Design maps, dialogs, tables, navigation, cards and forms for both themes.
- Avoid simply reversing the background and foreground colours.
- The landing page should also support the theme system where appropriate.

The citizen experience must be especially clear and accessible in either theme.

## 15. Mobile-first design

This is a critical requirement.

Prioritize the Citizen dashboard for mobile screens before desktop.

Design and validate at:

- Small mobile: approximately 360px width.
- Standard mobile: approximately 390–430px.
- Tablet.
- Desktop.
- Large desktop.

### Citizen mobile requirements

- Mobile-first layouts.
- Large touch-friendly SOS button.
- Clear emergency category selection.
- Minimal form complexity.
- Fixed or easily accessible primary SOS action where appropriate.
- Bottom navigation for major citizen sections.
- Responsive incident cards.
- Readable timelines.
- Simple status indicators.
- Appropriate modal and drawer behavior.
- No horizontal overflow.
- Comfortable touch targets.
- Accessible form labels and validation.

Desktop should adapt naturally from the mobile layout.

### Responder and Command

These can use desktop-oriented sidebars and operational layouts, but must remain responsive on tablets and phones.

On mobile:

- Sidebar becomes a drawer or compact navigation.
- Tables become responsive cards or controlled horizontal views.
- Map panels adapt vertically.
- Important actions remain accessible.

## 16. Shared design components

Create reusable components such as:

- Application header.
- Sidebar.
- Mobile navigation.
- User profile menu.
- Theme switcher.
- Notification centre.
- Connectivity indicator.
- Incident card.
- Status badge.
- Priority badge.
- Statistics card.
- Data table.
- Search and filter controls.
- Modal/dialog.
- Form controls.
- Timeline.
- Empty state.
- Loading state.
- Error state.
- Confirmation dialog.
- Map placeholder.
- Event log.
- Simulation node legend.

Do not duplicate components unnecessarily across dashboards.

## 17. Interaction requirements

Even though this is a static UI phase, the frontend should not be dead.

Implement realistic frontend-only interactions:

- All navigation links work.
- Sidebar items navigate correctly.
- Buttons have meaningful UI actions.
- Dropdowns open and close.
- Dialogs work.
- Tabs switch.
- Filters modify displayed mock data.
- Search works against mock records.
- Theme switching works.
- Mobile navigation works.
- Forms validate.
- SOS submission creates a mock incident.
- Mock incident details can be opened.
- Status badges update where appropriate.
- Simulation controls change the visual demo state.
- Scenario selection changes mock topology/data.
- User profile menus work.

Use local state and mock data.

Do not create fake backend operations.

## 18. Maps and simulation boundaries

Create visually complete map containers and controls using placeholder data.

The actual Esri map integration will happen in a later phase.

Create a visually complete Simulation Laboratory using mock network nodes and events.

Do not implement a separate simulation engine inside React components.

The actual engine will later be imported from the dedicated TypeScript engine module.

Keep these visual components integration-ready.

## 19. Accessibility and quality

- Semantic HTML.
- Keyboard-accessible controls.
- Proper form labels.
- Visible focus states.
- Appropriate contrast.
- Accessible status indicators.
- Reduced-motion support.
- Responsive layouts.
- Meaningful empty states.
- Clear error feedback.
- No horizontal overflow.
- Consistent loading states.

---

# PART D — TECHNICAL AND DEVELOPMENT BOUNDARIES

## 20. Approved technology direction

The intended project stack is:

- React.
- Vite.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Lucide React.
- React Router.
- Zustand for UI-facing state where appropriate.
- Firebase for eventual backend services.
- Dexie / IndexedDB for offline data.
- Vitest for engine testing.

Use the existing project configuration if one already exists.

Do not unnecessarily replace the architecture or install duplicate libraries.

## 21. Important separation of responsibilities

The project will eventually have this architecture:

- src/app — routes, providers and application guards.
- src/features/citizen — citizen UI.
- src/features/responder — responder UI.
- src/features/command — command UI.
- src/features/auth — authentication UI.
- src/features/simulation — simulation visualizations.
- src/components — shared UI.
- src/config — roles, permissions and region configuration.
- src/engine — pure TypeScript simulation engine.
- src/lib/firebase — Firebase integration.
- src/lib/offline — IndexedDB and synchronization.
- src/lib/map — map components and integration.

The simulation engine must remain independent of React and Firebase.

The offline synchronization layer must remain separate from presentation components.

## 22. Protected files and folders

During Phase 1, do not create or implement backend services.

Do not invent a new backend architecture.

Do not install or configure Supabase.

Do not add Firebase configuration merely to make mock pages appear functional.

If the following files or folders already exist, do not modify them without explicit approval:

- src/engine/
- src/lib/offline/
- src/config/
- firestore.rules
- Firebase configuration files.
- Existing simulation tests.

Use the project's approved types and interfaces when they are available.

If they do not exist yet, build UI components with clear, simple mock-data interfaces and keep them easy to replace.

---

# PART E — PHASE 1 EXECUTION INSTRUCTIONS

## 23. Your immediate task

You are responsible for creating the complete BeaconMesh frontend visual prototype.

The task is to build the public experience, authentication screens and all three dashboard workspaces.

This is a UI-first phase.

Use realistic mock data and frontend-only interactions.

Do not implement backend services or actual networking.

## 24. Development sequence

Build in controlled batches.

### Batch 1 — Brand and public experience

- Landing page.
- Hero animation.
- About section.
- How It Works section.
- Product feature sections.
- Footer.
- Login.
- Registration.
- Forgot password.
- Verification.

### Batch 2 — Shared application foundation

- Application layouts.
- Route structure.
- Sidebar.
- Header.
- Mobile navigation.
- Theme system.
- Shared components.
- Mock user context.
- Demo role switching.

### Batch 3 — Citizen dashboard

Implement all four pages.

This batch has the highest mobile-first priority.

Review mobile responsiveness carefully before moving forward.

### Batch 4 — Responder dashboard

Implement all four pages with appropriate operational workflows and subtype-aware UI previews.

### Batch 5 — Command dashboard

Implement all six pages.

Give special attention to:

- Command Overview.
- Live Operations Map.
- Simulation Laboratory.
- Message Intelligence.

### Batch 6 — Final UI quality pass

- Test all routes.
- Test navigation.
- Test light and dark themes.
- Test mobile responsiveness.
- Test frontend interactions.
- Remove visual inconsistencies.
- Fix overflow and layout problems.
- Check all empty/loading/error states.
- Ensure the brand identity is consistent.

## 25. Expected deliverables

At the end of Phase 1, provide:

1. Complete public website.
2. Login and registration experience.
3. Citizen dashboard with four pages.
4. Responder dashboard with four pages.
5. Command dashboard with six pages.
6. Working navigation between all pages.
7. Dual-theme system.
8. Mobile-first citizen experience.
9. Responsive operational dashboards.
10. Reusable component system.
11. Mock data and frontend interactions.
12. Complete route hierarchy.
13. A clean, integration-ready codebase.

## 26. Quality expectations

Do not sacrifice quality just to generate every page quickly.

The landing page should be memorable.

The Citizen dashboard should be exceptionally easy to use on mobile.

The Responder dashboard should feel operational.

The Command dashboard should feel like a serious emergency operations centre.

The Simulation Laboratory should visually communicate the innovation of decentralized networking.

Every page should have a clear purpose and a coherent layout.

Do not leave major pages as empty placeholders.

Do not generate multiple disconnected prototypes.

Do not create multiple applications.

Everything belongs to one cohesive BeaconMesh application.

## 27. Working agreement

Before making major changes:

- Inspect the existing repository.
- Understand its current structure.
- Preserve existing working code.
- Reuse available components.
- Avoid unnecessary dependency changes.

Work in batches and maintain a consistent design system.

After each batch, summarize:

- Pages created.
- Routes implemented.
- Interactions completed.
- Components reused.
- Files changed.
- Remaining work.
- Any technical limitations.

If the landing animation cannot be implemented to a high standard, explain the limitation rather than presenting a poor imitation as finished.

**Final objective: Build the complete visual experience of BeaconMesh first. The next development phase will bring its underlying systems to life.**

# END OF MASTER PROJECT CONTEXT

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/538c997d-c348-4a6c-a0f6-a2af2dcb18c9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

---

# PART B — FIREBASE AUTHENTICATION & SECURITY CONFIGURATION

## 1. Overview & Spark Plan Constraints

BeaconMesh runs entirely on the **Firebase Spark Plan (Free Tier)**. No credit card or billing upgrade to Blaze is required.

Supported and configured services:

1. **Firebase Authentication** (Email/Password & Google Sign-In)
2. **Cloud Firestore** (User profiles, incidents, security rules)

Explicitly excluded to maintain free-tier compliance:

- No Phone Authentication or SMS OTP (which incur billing costs).
- No Cloud Functions requiring Blaze billing.
- No third-party paid authentication providers.
- Phone number inputs remain optional contact metadata and are not verified.

---

## 2. Firebase Console Step-by-Step Setup Guide

Follow these manual configuration steps in the [Firebase Console](https://console.firebase.google.com/):

### Step 1: Enable Email/Password Provider

1. Go to **Firebase Console > Authentication > Sign-in method**.
2. Click **Add new provider** and select **Email/Password**.
3. Toggle **Enable** to ON.
4. Leave _Email link (passwordless sign-in)_ **disabled**.
5. Click **Save**.

### Step 2: Enable Google Sign-In Provider

1. In **Authentication > Sign-in method**, click **Add new provider** and select **Google**.
2. Toggle **Enable** to ON.
3. Select your project public-facing name (e.g., `BeaconMesh Emergency Network`).
4. Select your support email address from the dropdown.
5. Click **Save**.

### Step 3: Configure Authorized Domains

1. In **Authentication > Settings > Authorized domains**.
2. Ensure `localhost` and `127.0.0.1` are present for local development.
3. When deploying to production (e.g. Cloudflare Pages, Vercel, Netlify), add your custom domain or deployment hostname to the list.

### Step 4: Configure Email Templates

1. In **Authentication > Templates > Email address verification**:
   - Customize the sender name to `BeaconMesh Operations`.
   - In the action URL configuration, point to your verification route:
     `https://<your-app-domain>/verify`
2. In **Authentication > Templates > Password reset**:
   - Ensure the sender name and instructions reflect BeaconMesh emergency communications.

### Step 5: Initialize Cloud Firestore

1. Go to **Firebase Console > Firestore Database**.
2. Click **Create database**.
3. Select a region close to your primary operational area (e.g., `nam5 / us-central` or `eur3 / europe-west`).
4. Select **Start in production mode** (all read/write access denied by default).
5. Click **Create**.

### Step 6: Deploy Firestore Security Rules

1. In the repository root, `firestore.rules` contains the production-grade security rules designed and validated by the Firestore Rules Specialist.
2. Deploy the rules via Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```
   Or copy the entire content of `firestore.rules` and paste it into **Firestore Database > Rules** in the Firebase Console, then click **Publish**.

### Step 7: Configure Web App Environment Variables

1. Go to **Project Settings > General > Your apps**.
2. Click the **Web app** icon (`</>`) to register a web application named `BeaconMesh Web`.
3. Copy the configuration object and populate `.env.local` in your project root:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=beaconmesh-xxxx.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=beaconmesh-xxxx
   VITE_FIREBASE_STORAGE_BUCKET=beaconmesh-xxxx.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
   ```

---

## 3. Trusted Role Provisioning & Workflow

BeaconMesh enforces an exact **Three-Role Architecture**:

- `CITIZEN`
- `RESPONDER`
- `COMMAND`

To prevent privilege escalation attacks, **clients cannot grant themselves privileged roles**. The Firestore Security Rules reject client modifications to `role`, `responderSubtype`, `commandLevel`, `approvalStatus`, and `accountStatus`.

Privileged accounts must be provisioned through a trusted administrative procedure:

### A. Approving a Responder Application

When a user signs up as a Responder, they enter the database with:

- `role: "CITIZEN"`
- `requestedRole: "RESPONDER"`
- `requestedResponderSubtype: "PROFESSIONAL"` or `"VOLUNTEER"`
- `approvalStatus: "PENDING"`

To approve the responder:

1. In **Firebase Console > Firestore Database > `users` collection**, locate the applicant's document (`users/{uid}`).
2. Update the fields:
   - `role`: `"RESPONDER"`
   - `approvalStatus`: `"APPROVED"`
   - `responderSubtype`: Set to `"PROFESSIONAL"` or `"VOLUNTEER"` (matching their request).
   - `updatedAt`: Current timestamp.
3. The responder will immediately gain operational access to the Responder dashboard upon next page navigation or session reload.

### B. Provisioning a Command Coordinator Account

1. Have the operational officer create a standard account via Sign Up or Google Sign-In.
2. In **Firestore Database > `users` collection**, open their document (`users/{uid}`).
3. Update the fields:
   - `role`: `"COMMAND"`
   - `commandLevel`: `"COORDINATOR"`
   - `approvalStatus`: `"APPROVED"`
   - `updatedAt`: Current timestamp.
4. The user now has access to `/command/overview`, live maps, incident coordination, and read-only user directories.

### C. Provisioning an Administrator Account

1. In the target user's document (`users/{uid}`):
2. Update the fields:
   - `role`: `"COMMAND"`
   - `commandLevel`: `"ADMINISTRATOR"`
   - `approvalStatus`: `"APPROVED"`
   - `updatedAt`: Current timestamp.
3. The user now has full administrative command capabilities, including user management and account controls.

### D. Suspending an Account

1. To immediately revoke access to all BeaconMesh workspaces for a compromised or deactivated account:
2. In `users/{uid}`, set:
   - `accountStatus`: `"SUSPENDED"`
3. The client route guards and Firestore Security Rules will immediately reject read/write requests from this user.
