import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, Bell, CircleHelp, Compass, Cross, Flame, HeartPulse, Home, LifeBuoy, Map, MapPin, Moon, Network, Radio, Search, Settings, Shield, Sun, Users, Waves, X, LogOut, ShieldAlert, Clock, CheckCircle2, UserCheck, UserX, AlertCircle, RefreshCw, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import beaconIcon from "@/assets/beacon-network-icon.png.asset.json";
import beaconWordmark from "@/assets/beaconmesh-wordmark.png.asset.json";
import heroImage from "@/assets/beaconmesh-hero.jpg";
import { useAuth, evaluateRoleAuthorization } from "@/lib/auth-context";
import { LoginForm, SignupForm, VerifyEmailForm, ForgotPasswordForm } from "./auth-forms";
import { RegistrationWizard } from "./registration-wizard";
import { HeroCinematicAnimation } from "./hero-cinematic-animation";
import { WORKSPACE_ROUTES } from "@/lib/auth-types";
import { createEmergencyReport, getUserIncidents, getAllIncidents, updateIncidentStatus, subscribeToIncidents, appendIncidentTimelineEvent, subscribeToIncidentTimeline, } from "@/lib/services/incident-service";
import { createAndVerifySafeZone, subscribeToSafeZones, } from "@/lib/services/safezone-service";
import { getResponderProfile, setResponderAvailability, } from "@/lib/services/responder-service";
import { computeIncidentAggregates, getOperationalUserDirectory, fetchPendingResponderApplications, approveResponderApplication, rejectResponderApplication, fetchRecentApplicationReviews, createPersonnelInvitation, sendPersonnelInvitationEmail, buildInvitationUrl, fetchPersonnelInvitations, revokePersonnelInvitation, suspendUserAccount, reactivateUserAccount, fetchAccountAuditHistory, fetchReviewById, assignIncidentAtomic, completeIncidentAtomic, respondToAssignmentOffer, updateResponderFieldProgress, verifyAndCloseIncident, subscribeToResponderAssignments, subscribeToIncidentAssignments, RESPONDER_FIELD_SEQUENCE, } from "@/lib/services/command-service";
import { initAutoSync, flushOutbox } from "@/lib/services/sync-service";
import { NotificationCenter } from "./notification-center";
import { subscribeToUserNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/services/notification-service";
import {
  SIMULATION_SCENARIOS,
  getSimulationState,
  subscribeSimulation,
  initializeSimulation,
  stepSimulation,
  startSimulation,
  pauseSimulation,
  resetSimulation,
  injectSimulationMessage,
} from "@/lib/services/simulation-service";
const BeaconMapConsole = lazy(() => import("@/components/gis/BeaconMapConsole").then((m) => ({
  default: m.BeaconMapConsole,
})));
import { updateUserPreferences } from "@/lib/user-service";
export function formatRelativeTime(isoString) {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60)
      return "Just now";
    if (diff < 3600)
      return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400)
      return `${Math.floor(diff / 3600)} hr ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  }
  catch {
    return "Recently";
  }
}
export function toDisplayIncident(rec) {
  const hasCoords = typeof rec.location?.latitude === "number" && typeof rec.location?.longitude === "number";
  return {
    id: rec.id,
    type: rec.category,
    place: rec.location?.addressLabel ||
      (hasCoords
        ? `GPS (${rec.location.latitude.toFixed(4)}, ${rec.location.longitude.toFixed(4)})`
        : (rec.place || "Location not specified")),
    time: formatRelativeTime(rec.createdAt),
    status: rec.status,
    priority: rec.severity,
    description: rec.description,
    reporterId: rec.reporterId,
    assignedResponderId: rec.assignedResponderId || null,
    assignedResponderIds: rec.assignedResponderIds || (rec.assignedResponderId ? [rec.assignedResponderId] : []),
    notes: rec.notes || null,
    syncStatus: rec.syncStatus,
    syncError: rec.syncError || null,
  };
}
function isIncident(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const record = value;
  return ["id", "type", "place", "time", "status", "priority"].every((field) => typeof record[field] === "string");
}
const initialIncidents = [];
const sections = {
  CITIZEN: {
    title: "My space",
    links: [
      { label: "Home & SOS", href: "/citizen/home", icon: Home },
      { label: "My reports", href: "/citizen/reports", icon: Activity },
      { label: "Safe zones", href: "/citizen/safe-zones", icon: Map },
      { label: "Profile", href: "/citizen/profile", icon: Settings },
    ],
  },
  RESPONDER: {
    title: "Field operations",
    links: [
      { label: "Overview", href: "/responder/overview", icon: Home },
      { label: "Field map", href: "/responder/field-map", icon: Map },
      { label: "Status updates", href: "/responder/status", icon: Activity },
    ],
  },
  COMMAND: {
    title: "Operations",
    links: [
      { label: "Overview", href: "/command/overview", icon: Home },
      { label: "Live map", href: "/command/map", icon: Map },
      { label: "Incidents", href: "/command/incidents", icon: AlertTriangle },
      { label: "Simulation lab", href: "/command/simulation", icon: Network },
      { label: "Message intelligence", href: "/command/messages", icon: Radio },
      { label: "User management", href: "/command/users", icon: Users },
    ],
  },
};
const titleMap = {
  "/citizen/home": "Home & SOS",
  "/citizen/reports": "My reports",
  "/citizen/safe-zones": "Safe zones",
  "/citizen/profile": "Profile & settings",
  "/responder/overview": "Field overview",
  "/responder/field-map": "Field map",
  "/responder/status": "Status updates",
  "/responder/application-pending": "Application pending",
  "/command/overview": "Command overview",
  "/command/map": "Live operations map",
  "/command/incidents": "Incident management",
  "/command/simulation": "Simulation laboratory",
  "/command/messages": "Message intelligence",
  "/command/users": "User management",
  "/login": "Welcome back",
  "/signup": "Create your account",
  "/forgot-password": "Reset your password",
  "/verify": "Verify your account",
};
function Brand({ wordmark = false, className = "" }) {
  return (<Link to="/" aria-label="BeaconMesh home" className={`inline-flex items-center gap-2.5 ${className}`}>
    {wordmark ? (<img src={beaconWordmark.url} alt="BeaconMesh — Every signal finds its way" className="h-10 w-auto object-contain" />) : (<>
      <img src={beaconIcon.url} alt="" className="h-10 w-10 rounded-md object-cover" />
      <span className="font-display text-[1.1rem] font-bold leading-tight">
        Beacon<span className="text-signal">Mesh</span>
        <span className="mt-0.5 block text-[0.57rem] font-medium text-muted-foreground">
          EVERY SIGNAL FINDS ITS WAY
        </span>
      </span>
    </>)}
  </Link>);
}
function Pill({ children, tone = "neutral", className = "", }) {
  return (<span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.07em] ${tone === "warn" ? "border-urgent/30 bg-urgent/10 text-urgent" : tone === "good" ? "border-safe/30 bg-safe/10 text-safe" : tone === "signal" ? "border-signal/30 bg-signal/10 text-signal" : "border-border bg-muted text-muted-foreground"} ${className}`}>
    {children}
  </span>);
}
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("beaconmesh-theme");
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("beaconmesh-theme", next ? "dark" : "light");
  };
  return (<Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}>
    {dark ? <Sun /> : <Moon />}
  </Button>);
}
function PreviewRoleMenu({ role, responderType, onRoleChange, onResponderTypeChange, }) {
  const navigate = useNavigate();
  const value = role === "RESPONDER" ? `RESPONDER:${responderType}` : role;
  const changeRole = (selection) => {
    const nextRole = selection.startsWith("RESPONDER:")
      ? "RESPONDER"
      : selection;
    onRoleChange(nextRole);
    localStorage.setItem("beaconmesh-role", nextRole);
    if (selection.startsWith("RESPONDER:")) {
      const nextType = selection.slice("RESPONDER:".length);
      onResponderTypeChange(nextType);
      localStorage.setItem("beaconmesh-responder-type", nextType);
    }
    if (nextRole === "CITIZEN")
      void navigate({ to: "/citizen/home" });
    if (nextRole === "RESPONDER")
      void navigate({ to: "/responder/overview" });
    if (nextRole === "COORDINATOR" || nextRole === "ADMINISTRATOR")
      void navigate({ to: "/command/overview" });
  };
  return (<div className="flex items-center">
    <label className="sr-only" htmlFor="preview-role">
      Preview workspace role
    </label>
    <select id="preview-role" value={value} onChange={(event) => changeRole(event.target.value)} className="max-w-[116px] rounded-md border border-border bg-background px-2 py-2 text-xs font-semibold text-foreground sm:max-w-[148px]">
      <option value="CITIZEN">Citizen preview</option>
      <option value="RESPONDER:PROFESSIONAL">Professional responder</option>
      <option value="RESPONDER:VOLUNTEER">Volunteer responder</option>
      <option value="COORDINATOR">Coordinator preview</option>
      <option value="ADMINISTRATOR">Administrator preview</option>
    </select>
  </div>);
}
function Header({ landing = false, previewRole, responderType, onRoleChange, onResponderTypeChange, path, }) {
  const { user, profile, signOut } = useAuth();
  const activeRole = profile?.role || "CITIZEN";
  const badgeLabel = activeRole === "RESPONDER"
    ? `RESPONDER · ${profile?.responderSubtype || "VOLUNTEER"}`
    : activeRole === "COMMAND"
      ? `COMMAND · ${profile?.commandLevel || "COORDINATOR"}`
      : "CITIZEN";
  return (<header className="relative z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/95 backdrop-blur px-4 sm:px-7 text-foreground">
    <Brand />
    {landing ? (<nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
      <Link to="/about" className="transition-colors hover:text-foreground">
        About
      </Link>
      <Link to="/how-it-works" className="transition-colors hover:text-foreground">
        How it works
      </Link>
      {user ? (<>
        <Link to={WORKSPACE_ROUTES[activeRole]} className="font-semibold text-signal transition-colors hover:text-foreground">
          Workspace ({activeRole})
        </Link>
        <button type="button" onClick={() => void signOut()} className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">
          Sign out
        </button>
      </>) : (<Link to="/login" className="transition-colors hover:text-foreground">
        Sign in
      </Link>)}
      <ThemeToggle />
    </nav>) : (<div className="flex min-w-0 items-center gap-2">
      {user ? (<div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-2.5 py-1 text-xs font-semibold text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-safe" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Account:</span>
          {badgeLabel}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void signOut()} title="Sign out of current account" className="text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="mr-1 h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>) : (previewRole &&
        responderType &&
        onRoleChange &&
        onResponderTypeChange && (<PreviewRoleMenu role={previewRole} responderType={responderType} onRoleChange={onRoleChange} onResponderTypeChange={onResponderTypeChange} />))}
      <ThemeToggle />
    </div>)}
    {landing && (<div className="flex items-center gap-2 md:hidden">
      <ThemeToggle />
      {user ? (<Button asChild size="sm">
        <Link to={WORKSPACE_ROUTES[activeRole]}>Workspace</Link>
      </Button>) : (<Button asChild size="sm">
        <Link to="/login">Sign in</Link>
      </Button>)}
    </div>)}
  </header>);
}
function Landing() {
  return (<div className="min-h-screen bg-background text-foreground">
    <Header landing />
    <main>
      <section className="landing-hero relative flex min-h-[calc(100svh-4rem)] items-end overflow-hidden bg-ink px-5 pb-14 pt-24 text-primary-foreground sm:px-10 lg:items-center lg:pb-20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <img src={heroImage} alt="An emergency responder searches for a signal above a storm-affected coastal community" width={1920} height={1088} fetchPriority="high" className="hero-cinematic-img absolute inset-0 h-full w-full object-cover object-[68%_center]" />
        </div>
        <div className="hero-shade absolute inset-0 pointer-events-none" aria-hidden="true" />
        <HeroCinematicAnimation />
        <div className="relative z-10 max-w-3xl">
          <Pill tone="signal">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" /> OFFLINE-FIRST
            EMERGENCY NETWORK
          </Pill>
          <h1 className="mt-7 max-w-2xl font-display text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
            Every signal
            <br />
            <span className="text-signal">finds its way.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-primary-foreground/75 sm:text-lg">
            When the network goes quiet, people can still carry a message forward. BeaconMesh
            connects isolated communities through a resilient, human-powered mesh.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Explore the preview <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/30 bg-white/5 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
              <Link to="/how-it-works">
                How it works <ArrowDownRight />
              </Link>
            </Button>
          </div>
          <p className="mt-5 text-xs text-primary-foreground/55">
            University prototype · Preview experience only
          </p>
        </div>
        <div className="absolute bottom-6 right-8 hidden items-center gap-2 text-xs text-primary-foreground/70 lg:flex">
          <span className="h-px w-12 bg-signal" /> A signal can travel further together
        </div>
      </section>
      <section className="border-b border-border bg-background px-5 py-14 sm:px-10 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-7 md:grid-cols-[.85fr_1.15fr] md:items-end">
          <div>
            <p className="section-kicker">THE CHALLENGE</p>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold sm:text-4xl">
              A broken connection shouldn’t mean a lost signal.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Floods, fires and earthquakes can take conventional networks offline just when people
            need them most. BeaconMesh explores another path: messages that can move from person
            to person until they find a way out.
          </p>
        </div>
      </section>
      <section className="bg-muted/60 px-5 py-14 sm:px-10 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="section-kicker">STORE · CARRY · FORWARD</p>
            <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              A message moves with the people who carry it.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Each device can hold an eligible message, share it when nearby nodes meet, and pass
              it along toward a gateway. No direct internet connection is required for every step.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: "Create", d: "A citizen records an emergency and its location." },
              { n: "02", t: "Store", d: "The message waits safely on a nearby node." },
              {
                n: "03",
                t: "Carry & forward",
                d: "Relays and moving data mules pass it onward.",
              },
              {
                n: "04",
                t: "Reach a gateway",
                d: "A connected gateway can carry it to infrastructure.",
              },
            ].map((item) => (<div key={item.n} className="bg-background p-6">
              <span className="font-mono text-sm text-signal">{item.n}</span>
              <h3 className="mt-6 font-display text-xl font-semibold">{item.t}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.d}</p>
            </div>))}
          </div>
        </div>
      </section>
      <section className="bg-background px-5 py-14 sm:px-10 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="section-kicker">A NETWORK OF PEOPLE & PLACES</p>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Four kinds of nodes. One way forward.
          </h2>
          <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: LifeBuoy, name: "Citizen", copy: "Originates an emergency message." },
              { icon: Network, name: "Relay", copy: "Receives and forwards eligible messages." },
              {
                icon: Compass,
                name: "Data mule",
                copy: "Carries messages between network regions.",
              },
              {
                icon: Radio,
                name: "Gateway",
                copy: "Represents a bridge to connected infrastructure.",
              },
            ].map(({ icon: Icon, name, copy }) => (<div className="border-l-2 border-signal px-4 py-3" key={name}>
              <Icon className="h-5 w-5 text-signal" />
              <h3 className="mt-4 font-semibold">{name} node</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
            </div>))}
          </div>
        </div>
      </section>
      <section className="bg-ink px-5 py-14 text-primary-foreground sm:px-10 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <p className="section-kicker">BUILT AROUND THE RESPONSE</p>
            <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              A clear view, for every role.
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3 lg:col-span-2">
            {[
              {
                n: "Citizen",
                d: "Send a report, follow its delivery, and find safety information.",
              },
              {
                n: "Responder",
                d: "Review assignments, update field status, and coordinate action.",
              },
              {
                n: "Command",
                d: "Manage incidents and explore an educational network simulation.",
              },
            ].map(({ n, d }) => (<div key={n} className="border-t border-white/15 pt-5">
              <h3 className="font-display text-xl font-semibold">{n}</h3>
              <p className="mt-2 text-sm leading-6 text-primary-foreground/65">{d}</p>
            </div>))}
          </div>
        </div>
      </section>
      <section className="bg-background px-5 py-14 text-center sm:px-10 lg:py-20">
        <p className="section-kicker">A UNIVERSITY PROTOTYPE</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-semibold sm:text-4xl">
          See what a resilient message path could look like.
        </h2>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground">
          Explore the interface using mock incidents and a clearly labeled simulation. No real
          emergency service or device networking is connected.
        </p>
        <Button asChild size="lg" className="mt-7">
          <Link to="/login">
            Enter preview workspace <ArrowRight />
          </Link>
        </Button>
      </section>
    </main>
    <footer className="flex flex-col gap-4 border-t border-border px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10">
      <Brand />
      <p>BeaconMesh is a university prototype, not a certified emergency response service.</p>
      <div className="flex gap-4">
        <Link to="/about" className="hover:text-foreground">
          About
        </Link>
        <Link to="/how-it-works" className="hover:text-foreground">
          How it works
        </Link>
        <Link to="/login" className="hover:text-foreground">
          Preview
        </Link>
      </div>
    </footer>
  </div>);
}
function Stat({ label, value, hint, tone = "default", }) {
  return (<div className="border-b border-border px-1 py-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className={`mt-2 font-display text-3xl font-semibold ${tone === "urgent" ? "text-urgent" : "text-foreground"}`}>
      {value}
    </p>
    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
  </div>);
}
function IncidentRow({ incident, onOpen, }) {
  const statusTone = incident.status === "Acknowledged" || incident.status === "Resolved" || incident.status === "Closed"
    ? "good"
    : incident.status === "Waiting for connection" || incident.status === "Saved on device" || incident.syncStatus === "SYNC_FAILED"
      ? "warn"
      : "signal";
  return (<button type="button" onClick={() => onOpen(incident)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-signal">{incident.id}</span>
        <Pill tone={incident.priority === "Critical" ? "warn" : "neutral"}>
          {incident.priority}
        </Pill>
        {incident.syncStatus === "SYNC_FAILED" && <Pill tone="warn">Sync failed</Pill>}
        {incident.syncStatus === "LOCAL_ONLY" && <Pill tone="neutral">Offline local</Pill>}
      </span>
      <span className="mt-1.5 block truncate text-sm font-medium">
        {incident.type} · {incident.place}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{incident.time}</span>
    </span>
    <Pill tone={statusTone}>{incident.status}</Pill>
    <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
  </button>);
}
function MapPlaceholder({ title = "Operations area", compact = false, }) {
  return (<div className={`map-surface relative overflow-hidden border border-border ${compact ? "min-h-56" : "min-h-[420px]"}`}>
    <div className="map-grid absolute inset-0" aria-hidden="true" />
    <div className="relative z-10 flex items-start justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Illustrative map · not live geography
        </p>
      </div>
      <Button variant="outline" size="sm">
        <MapPin /> Center
      </Button>
    </div>
    <div className="map-route absolute inset-x-8 bottom-8 top-20" aria-hidden="true">
      <span className="map-pin pin-a">
        <Cross />
      </span>
      <span className="map-pin pin-b">
        <Waves />
      </span>
      <span className="map-pin pin-c">
        <LifeBuoy />
      </span>
      <span className="map-pin pin-d">
        <Radio />
      </span>
    </div>
    <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
      <Pill tone="warn">Incidents</Pill>
      <Pill tone="signal">Responders</Pill>
      <Pill tone="good">Safe zones</Pill>
    </div>
  </div>);
}
function DashboardContent({ path, role, incidents, setIncidents, rawIncidents = [], onRefresh, }) {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState("Medical");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [activeScenario, setActiveScenario] = useState("Normal connectivity");
  const [playing, setPlaying] = useState(false);
  const [simState, setSimState] = useState(() => getSimulationState());
  const [simSearch, setSimSearch] = useState("");
  const [selectedSimMsgId, setSelectedSimMsgId] = useState(null);
  const [simTtl, setSimTtl] = useState(12);
  useEffect(() => {
    const unsub = subscribeSimulation((next) => {
      setSimState(next);
      setActiveScenario(next.scenario);
      setPlaying(next.isPlaying);
    });
    return () => {
      if (typeof unsub === "function")
        unsub();
    };
  }, []);
  const [selected, setSelected] = useState(null);
  const searchIncidentId = useRouterState({
    select: (s) => {
      const searchStr = typeof s.location.searchStr === "string" ? s.location.searchStr : "";
      if (searchStr) {
        return new URLSearchParams(searchStr).get("incident") || "";
      }
      if (s.location.search && typeof s.location.search === "object" && "incident" in s.location.search) {
        return String(s.location.search.incident || "");
      }
      return "";
    },
  });
  useEffect(() => {
    if (!searchIncidentId || incidents.length === 0)
      return;
    const match = incidents.find((item) => item.id === searchIncidentId);
    if (match) {
      setSelected(match);
    }
  }, [searchIncidentId, incidents]);
  const [available, setAvailable] = useState(profile?.dutyStatus === "AVAILABLE");
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [myAssignments, setMyAssignments] = useState([]);
  const [assignmentsStatus, setAssignmentsStatus] = useState("loading");
  const [fieldNote, setFieldNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationLabel, setLocationLabel] = useState("Location coordinates unconfirmed");
  const [manualAddress, setManualAddress] = useState("");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [safeZones, setSafeZones] = useState([]);
  const [operationalUsers, setOperationalUsers] = useState([]);
  const [pendingApplications, setPendingApplications] = useState([]);
  const [recentReviews, setRecentReviews] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [usersTab, setUsersTab] = useState("directory");
  const isMobile = useIsMobile();
  const [provName, setProvName] = useState("");
  const [provEmail, setProvEmail] = useState("");
  const [provTrack, setProvTrack] = useState("COMMAND:COORDINATOR");
  const [provUnit, setProvUnit] = useState("GENERAL");
  const [provSubmitting, setProvSubmitting] = useState(false);
  const [provResult, setProvResult] = useState(null);
  const [provCopied, setProvCopied] = useState(false);
  const [provEmailState, setProvEmailState] = useState(null);
  const [resendingInviteId, setResendingInviteId] = useState(null);
  const [managedUser, setManagedUser] = useState(null);
  const [manageAuditLogs, setManageAuditLogs] = useState([]);
  const [manageApprovalRecord, setManageApprovalRecord] = useState(null);
  const [manageLoadingAudit, setManageLoadingAudit] = useState(false);
  const [manageActionMode, setManageActionMode] = useState(null); // "suspend" | "reactivate" | null
  const [suspendReason, setSuspendReason] = useState("");
  const [manageSubmitting, setManageSubmitting] = useState(false);
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewSubtype, setReviewSubtype] = useState("VOLUNTEER");
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState(null);
  // Profile preferences state
  const [profileFullName, setProfileFullName] = useState(profile?.displayName || "Citizen User");
  const [profilePhone, setProfilePhone] = useState(profile?.phoneNumber || "+91 866 242 4172");
  const [profileRegion, setProfileRegion] = useState("Vijayawada, NTR District");
  const [profileLanguage, setProfileLanguage] = useState("English");
  const [profileContacts, setProfileContacts] = useState("VMC Disaster Control · 0866-2424172");
  useEffect(() => {
    if (profile?.displayName)
      setProfileFullName(profile.displayName);
    if (profile?.phoneNumber)
      setProfilePhone(profile.phoneNumber);
  }, [profile]);

  const refreshUsersAndApplications = async () => {
    setLoadingApplications(true);
    try {
      const [users, apps, reviews, invites] = await Promise.all([
        getOperationalUserDirectory(role),
        fetchPendingResponderApplications(),
        fetchRecentApplicationReviews(),
        role === "ADMINISTRATOR" ? fetchPersonnelInvitations().catch(() => []) : Promise.resolve([]),
      ]);
      setOperationalUsers(users || []);
      setPendingApplications(apps || []);
      setRecentReviews(reviews || []);
      if (role === "ADMINISTRATOR") {
        setInvitations(invites || []);
      }
    } catch (err) {
      console.warn("Refresh users/applications failed:", err);
    } finally {
      setLoadingApplications(false);
    }
  };

  const canVetResponders = role === "COORDINATOR" || role === "ADMINISTRATOR";
  const handleApproveApplication = async (applicant) => {
    if (!user?.uid) return;
    if (!canVetResponders) {
      setReviewFeedback({
        type: "error",
        text: "Authorization error: Only Command staff (Coordinators or Administrators) are authorized to approve responder applications."
      });
      return;
    }
    setReviewSubmitting(true);
    setReviewFeedback(null);
    try {
      const subtypeToAssign = reviewSubtype || applicant.requestedResponderSubtype || "VOLUNTEER";
      const reviewerName = user.displayName || user.email || "Command Officer";
      const reviewerDesignation = role === "ADMINISTRATOR" ? "Command Administrator" : "Command Operations Coordinator";
      await approveResponderApplication(applicant.uid, user.uid, {
        approvedSubtype: subtypeToAssign,
        reviewerRole: role,
        reviewerName,
        reviewerDesignation,
        notes: reviewNotes || null,
      });
      setReviewFeedback({
        type: "success",
        text: `Approved ${applicant.displayName} as ${subtypeToAssign} responder (by ${reviewerName} · ${reviewerDesignation}).`
      });
      setReviewModal(null);
      setReviewNotes("");
      await refreshUsersAndApplications();
    } catch (err) {
      console.error("Failed to approve responder application:", err);
      setReviewFeedback({
        type: "error",
        text: err.message || "Failed to approve responder application."
      });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleRejectApplication = async (applicant) => {
    if (!user?.uid) return;
    if (!canVetResponders) {
      setReviewFeedback({
        type: "error",
        text: "Authorization error: Only Command staff (Coordinators or Administrators) are authorized to reject responder applications."
      });
      return;
    }
    if (!rejectionReason || !rejectionReason.trim()) {
      setReviewFeedback({
        type: "error",
        text: "A rejection reason is mandatory."
      });
      return;
    }
    setReviewSubmitting(true);
    setReviewFeedback(null);
    try {
      const reviewerName = user.displayName || user.email || "Command Officer";
      const reviewerDesignation = role === "ADMINISTRATOR" ? "Command Administrator" : "Command Operations Coordinator";
      await rejectResponderApplication(applicant.uid, user.uid, rejectionReason.trim(), {
        reviewerRole: role,
        reviewerName,
        reviewerDesignation,
        notes: reviewNotes || null,
      });
      setReviewFeedback({
        type: "success",
        text: `Application for ${applicant.displayName} rejected by ${reviewerName} (${reviewerDesignation}) with an immutable audit record.`
      });
      setReviewModal(null);
      setRejectionReason("");
      setReviewNotes("");
      await refreshUsersAndApplications();
    } catch (err) {
      console.error("Failed to reject responder application:", err);
      setReviewFeedback({
        type: "error",
        text: err.message || "Failed to reject responder application."
      });
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const unsubSafeZones = subscribeToSafeZones((zones) => {
      if (mounted)
        setSafeZones(zones);
    });
    const isCommandRole = role === "COORDINATOR" || role === "ADMINISTRATOR";
    if (isCommandRole) {
      getOperationalUserDirectory(role)
        .then((users) => {
          if (mounted && users && users.length > 0)
            setOperationalUsers(users);
        })
        .catch((err) => console.warn("Operational users load failed:", err));
      fetchPendingResponderApplications()
        .then((apps) => {
          if (mounted && apps)
            setPendingApplications(apps);
        })
        .catch((err) => console.warn("Pending responder applications load failed:", err));
    }
    let unsubAssignments = null;
    if (user?.uid && role === "RESPONDER") {
      if (profile?.dutyStatus) {
        setAvailable(profile.dutyStatus === "AVAILABLE");
      }
      else {
        getResponderProfile(user.uid)
          .then((resp) => {
            if (mounted && resp)
              setAvailable(resp.isAvailable);
          })
          .catch((err) => console.warn("Responder profile load failed:", err));
      }
      setAssignmentsStatus("loading");
      unsubAssignments = subscribeToResponderAssignments(user.uid, (list) => {
        if (mounted) {
          setMyAssignments(list || []);
          setAssignmentsStatus("ready");
        }
      }, () => {
        if (mounted)
          setAssignmentsStatus("error");
      });
    }
    else {
      setAssignmentsStatus("ready");
    }
    return () => {
      mounted = false;
      if (typeof unsubSafeZones === "function") {
        unsubSafeZones();
      }
      if (typeof unsubAssignments === "function") {
        unsubAssignments();
      }
    };
  }, [user?.uid, role, profile?.dutyStatus]);
  const command = role === "COORDINATOR" || role === "ADMINISTRATOR";
  const roleKey = role === "CITIZEN" ? "CITIZEN" : role === "RESPONDER" ? "RESPONDER" : "COMMAND";
  const visibleIncidents = useMemo(() => incidents.filter((incident) => `${incident.id} ${incident.type} ${incident.place} ${incident.status}`
    .toLowerCase()
    .includes(query.toLowerCase()) &&
    (filter === "All" || incident.status === filter)), [incidents, query, filter]);
  const confirmLocation = () => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel(`GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        setMessage("Precise GPS coordinates captured.");
      }, () => {
        setGpsCoords(null);
        setLocationLabel("Coordinates Unavailable (GPS Denied/Timeout)");
        setMessage("GPS unavailable or denied. Location coordinates marked unavailable.");
      }, { timeout: 8000 });
    }
    else {
      setGpsCoords(null);
      setLocationLabel("Coordinates Unavailable (No Geolocation Support)");
      setMessage("Geolocation is not supported by your browser/device.");
    }
  };
  const createIncident = async (event) => {
    event.preventDefault();
    if (isSubmitting)
      return;
    if (!description.trim() || description.trim().length < 5) {
      setMessage("Please enter a description of at least 5 characters.");
      return;
    }
    setIsSubmitting(true);
    try {
      const cat = ([
        "Medical",
        "Trapped",
        "Fire",
        "Flood",
        "Accident",
        "Other",
      ].includes(category)
        ? category
        : "Other");
      const trimmedAddress = manualAddress.trim();
      const locationPayload = gpsCoords
        ? {
          latitude: gpsCoords.lat,
          longitude: gpsCoords.lng,
          accuracyMeters: 10,
          source: "GPS",
          addressLabel: trimmedAddress
            ? `${trimmedAddress} · GPS (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)})`
            : locationLabel || `GPS (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)})`,
          country: "India",
        }
        : {
          latitude: null,
          longitude: null,
          source: trimmedAddress ? "MANUAL" : "UNAVAILABLE",
          addressLabel: trimmedAddress || "Coordinates Unavailable",
          country: "India",
        };
      const record = await createEmergencyReport({
        reporterId: user?.uid,
        reporterNameSnapshot: profile?.displayName || user?.displayName || "Citizen",
        reporterContact: profile?.phoneNumber || undefined,
        category: cat,
        description: description.trim(),
        severity: category === "Medical" || category === "Fire" || category === "Trapped" ? "Critical" : "High",
        location: locationPayload,
      });
      const displayInc = toDisplayIncident(record);
      setIncidents([displayInc, ...incidents]);
      setDescription("");
      if (typeof navigator !== "undefined" && navigator.onLine && user?.uid) {
        const syncRes = await flushOutbox();
        if (syncRes.failed > 0) {
          setIncidents((prev) => prev.map((item) => (item.id === record.id ? { ...item, syncStatus: "SYNC_FAILED", syncError: "Cloud sync failed; queued for retry." } : item)));
          setMessage(`Report ${record.id} saved on device, but Cloud sync failed. It will retry automatically.`);
        }
        else {
          setIncidents((prev) => prev.map((item) => (item.id === record.id ? { ...item, syncStatus: "SYNCED", status: "Waiting for connection", syncError: null } : item)));
          setMessage(`Report ${record.id} saved on device and transmitted to Command.`);
        }
      }
      else {
        setMessage(`Report ${record.id} saved locally on device (offline). It will sync automatically when reconnected.`);
      }
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Report error: ${err?.message || "Failed to submit"}`);
    }
    finally {
      setIsSubmitting(false);
    }
  };
  const setStatus = async (status, notesText = undefined) => {
    if (!selected || !command)
      return;
    let canonicalStatus = "Waiting for connection";
    if (status.includes("Acknowledged"))
      canonicalStatus = "Acknowledged";
    else if (status.includes("progress"))
      canonicalStatus = "In progress";
    else if (status.includes("Resolved"))
      canonicalStatus = "Resolved";
    else if (status.includes("Closed"))
      canonicalStatus = "Closed";
    else if (status.includes("Saved"))
      canonicalStatus = "Saved on device";
    setActionLoading(true);
    try {
      await updateIncidentStatus(selected.id, canonicalStatus, notesText, user?.uid || "operator");
      await appendIncidentTimelineEvent(selected.id, {
        eventType: canonicalStatus === "Acknowledged" ? "INCIDENT_ACKNOWLEDGED" : "STATUS_UPDATED",
        actorUid: user?.uid,
        actorRole: "COMMAND",
        details: notesText ? `${canonicalStatus}: ${notesText}` : `Command updated status to ${canonicalStatus}`,
      }).catch(() => {});
      setIncidents(incidents.map((item) => (item.id === selected.id ? { ...item, status: canonicalStatus } : item)));
      setSelected({ ...selected, status: canonicalStatus });
      setMessage(`${selected.id} updated to ${canonicalStatus}.`);
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Failed to update ${selected.id}: ${err?.message || "Permission denied"}`);
    }
    finally {
      setActionLoading(false);
    }
  };
  const handleAssignResponder = async (responderId, responderName) => {
    if (!selected || !command || !user?.uid)
      return;
    setActionLoading(true);
    try {
      await assignIncidentAtomic(selected.id, responderId, user.uid, { responderName });
      setIncidents(incidents.map((item) => item.id === selected.id
        ? { ...item, status: "Acknowledged", assignedResponderId: responderId, assignedResponderIds: [responderId] }
        : item));
      setSelected({
        ...selected,
        status: "Acknowledged",
        assignedResponderId: responderId,
        assignedResponderIds: [responderId],
      });
      setMessage(`Dispatched ${selected.id} to ${responderName} (awaiting responder acceptance).`);
      await refreshUsersAndApplications();
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Dispatch failed: ${err?.message || "Permission denied or responder unavailable"}`);
    }
    finally {
      setActionLoading(false);
    }
  };
  const handleCloseIncident = async (closingNotes) => {
    if (!selected || !command || !user?.uid)
      return;
    setActionLoading(true);
    try {
      await verifyAndCloseIncident(selected.id, user.uid, closingNotes);
      setIncidents(incidents.map((item) => (item.id === selected.id ? { ...item, status: "Closed" } : item)));
      setSelected({ ...selected, status: "Closed" });
      setMessage(`${selected.id} verified and closed by Command.`);
      await refreshUsersAndApplications();
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Closure failed: ${err?.message || "Permission denied"}`);
    }
    finally {
      setActionLoading(false);
    }
  };
  const handleResponderDecision = async (incidentId, decision, reason = null) => {
    if (!user?.uid)
      return;
    setActionLoading(true);
    try {
      await respondToAssignmentOffer(incidentId, user.uid, decision, reason);
      setMessage(decision === "ACCEPTED"
        ? `Accepted assignment for ${incidentId}.`
        : `Declined assignment for ${incidentId}. Command has been notified to reassign.`);
      if (decision === "DECLINED" && selected?.id === incidentId) {
        setSelected(null);
      }
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Assignment response failed: ${err?.message || "Permission denied"}`);
    }
    finally {
      setActionLoading(false);
    }
  };
  const handleResponderFieldStep = async (incidentId, nextStatus, notesText = null) => {
    if (!user?.uid)
      return;
    setActionLoading(true);
    try {
      const restoreStatus = available ? "AVAILABLE" : "UNAVAILABLE";
      await updateResponderFieldProgress(incidentId, user.uid, nextStatus, notesText, restoreStatus);
      setIncidents(incidents.map((item) => (item.id === incidentId ? { ...item, status: nextStatus } : item)));
      if (selected?.id === incidentId) {
        setSelected({ ...selected, status: nextStatus, ...(notesText ? { notes: notesText } : {}) });
      }
      if (nextStatus === "Resolved") {
        setMessage(`${incidentId} marked Resolved and your availability was restored to ${restoreStatus}.`);
      }
      else {
        setMessage(`${incidentId} updated to "${nextStatus}".`);
      }
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Status update rejected: ${err?.message || "Invalid transition or permission denied"}`);
    }
    finally {
      setActionLoading(false);
    }
  };
  const toggleAvailability = async () => {
    if (availabilitySaving)
      return;
    const prevVal = available;
    const nextVal = !prevVal;
    setAvailabilityError("");
    setAvailabilitySaving(true);
    if (user?.uid) {
      try {
        const persisted = await setResponderAvailability(user.uid, nextVal);
        setAvailable(persisted === "AVAILABLE");
        setMessage(`Responder availability set to ${persisted === "AVAILABLE" ? "Available" : "Unavailable"}.`);
        if (onRefresh)
          onRefresh();
      }
      catch (e) {
        setAvailable(prevVal);
        const errMsg = `Cannot change availability: ${e?.message || "Permission denied."}`;
        setAvailabilityError(errMsg);
        setMessage("");
      }
      finally {
        setAvailabilitySaving(false);
      }
    }
    else {
      setAvailable(nextVal);
      setMessage(`Responder availability set to ${nextVal ? "Available" : "Unavailable"}.`);
      setAvailabilitySaving(false);
    }
  };
  const handleSavePreferences = async (e) => {
    e.preventDefault();
    if (user?.uid) {
      try {
        await updateUserPreferences(user.uid, {
          displayName: profileFullName,
          phoneNumber: profilePhone,
          region: profileRegion,
          language: profileLanguage,
          emergencyContacts: profileContacts,
        });
        setMessage("Your profile preferences have been successfully updated in Firebase & locally.");
      }
      catch {
        setMessage("Your preferences have been saved on this device.");
      }
    }
    else {
      setMessage("Your preview preferences have been saved on this device.");
    }
  };
  if (path.startsWith("/auth"))
    path = "/login";
  if (path.startsWith("/citizen") && path.endsWith("/home"))
    return (<div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(270px,.65fr)]">
      <div className="space-y-8">
        <section className="border-b border-border pb-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {user ? (<Pill tone="good">
              <span className="h-1.5 w-1.5 rounded-full bg-safe" /> LIVE NODE · VIJAYAWADA SECTOR
            </Pill>) : (<Pill tone="warn">
              <AlertTriangle /> PREVIEW MODE
            </Pill>)}
            <Pill tone="good">
              <span className="h-1.5 w-1.5 rounded-full bg-safe" /> Store-Carry-Forward Enabled
            </Pill>
          </div>
          <h2 className="mt-5 font-display text-3xl font-semibold">You’re not alone.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Share what’s happening. Your report is protected in local IndexedDB first and
            dispatched across mesh gateways or Cloud Firestore when available.
          </p>
        </section>
        <form onSubmit={createIncident} className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold">What kind of help do you need?</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { n: "Medical", i: HeartPulse },
                { n: "Trapped", i: LifeBuoy },
                { n: "Fire", i: Flame },
                { n: "Flood", i: Waves },
                { n: "Accident", i: AlertTriangle },
                { n: "Other", i: CircleHelp },
              ].map(({ n, i: Icon }) => (<button key={n} type="button" aria-pressed={category === n} onClick={() => setCategory(n)} className={`flex min-h-14 items-center gap-2 border px-3 text-sm font-medium transition-colors ${category === n ? "border-signal bg-signal/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>
                <Icon className="h-4 w-4 text-signal" />
                {n}
              </button>))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold">
            Describe the situation{" "}
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened? Anyone injured or trapped with you?" className="mt-2 min-h-24" />
          </label>
          <div className="space-y-2 border-y border-border py-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-signal" /> Status: {locationLabel}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={confirmLocation}>
                Capture GPS
              </Button>
            </div>
            <input type="text" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} placeholder="Optional manual landmark or cross-street (e.g. Near Benz Circle, Opposite SBI ATM)" className="w-full rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-signal focus:outline-none" />
          </div>
          <Button type="submit" size="lg" disabled={isSubmitting} className="min-h-14 w-full justify-center text-base">
            <LifeBuoy /> {isSubmitting ? "Registering report..." : "Save emergency report"} <ArrowRight />
          </Button>
          {message && (<p role="status" className="text-sm text-safe">
            {message}
          </p>)}
        </form>
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-xl font-semibold">Recent reports</h3>
            <Link to="/citizen/reports" className="text-sm font-semibold text-signal">
              View all
            </Link>
          </div>
          <div className="mt-2">
            {incidents.length > 0 ? (incidents.slice(0, 2).map((incident) => (<IncidentRow key={incident.id} incident={incident} onOpen={setSelected} />))) : (<p className="py-6 text-sm text-muted-foreground">
              No emergency reports recorded on this device yet.
            </p>)}
          </div>
        </section>
      </div>
      <aside className="space-y-7">
        <div className="border-l-2 border-signal bg-muted/50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-signal">Safety notice · Vijayawada Sector</p>
          <h3 className="mt-3 font-semibold">Krishna River High Ground Protocol</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            In case of flooding near Krishna River canal sluices or low-lying areas, proceed to
            designated civic relief shelters such as IGMC Stadium.
          </p>
          <Button variant="link" className="mt-2 h-auto p-0" asChild>
            <Link to="/citizen/safe-zones">
              View verified safe zones <ArrowRight />
            </Link>
          </Button>
        </div>
        <div>
          <p className="text-sm font-semibold">Operational jurisdiction</p>
          <div className="mt-3">
            <Suspense fallback={<div className="flex h-64 w-full items-center justify-center rounded-lg border border-border bg-card">
              <p className="text-xs text-muted-foreground">Loading operational map...</p>
            </div>}>
              <BeaconMapConsole role={role} incidents={incidents} safeZones={safeZones} activeUserId={user?.uid} compact={true} className="h-64 w-full" />
            </Suspense>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Vijayawada, NTR District, Andhra Pradesh, India.
          </p>
        </div>
      </aside>
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} onCloseIncident={handleCloseIncident} onResponderDecision={handleResponderDecision} onResponderFieldStep={handleResponderFieldStep} responders={operationalUsers} isCommand={command} viewerRole={role} viewerUid={user?.uid} assignments={myAssignments} assignmentsStatus={assignmentsStatus} actionLoading={actionLoading} />)}
    </div>);
  if (path === "/citizen/reports" || path === "/command/incidents")
    return (<section>
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Pill tone="signal">INCIDENT LOG</Pill>
            <Pill tone="neutral">VIJAYAWADA JURISDICTION</Pill>
          </div>
          <h2 className="mt-3 font-display text-2xl font-semibold">
            {path === "/command/incidents" ? "Citizen incident records" : "Your incident reports"}
          </h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative">
            <span className="sr-only">Search incidents</span>
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports" className="pl-9" />
          </label>
          <label>
            <span className="sr-only">Filter reports by status</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-48">
              <option>All</option>
              <option>Waiting for connection</option>
              <option>Acknowledged</option>
              <option>En route</option>
              <option>On scene</option>
              <option>In progress</option>
              <option>Resolved</option>
              <option>Closed</option>
              <option>Saved on device</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mt-2">
        {visibleIncidents.length ? (visibleIncidents.map((incident) => (<IncidentRow key={incident.id} incident={incident} onOpen={setSelected} />))) : (<p className="py-10 text-center text-sm text-muted-foreground">No matching reports found.</p>)}
      </div>
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} onCloseIncident={handleCloseIncident} onResponderDecision={handleResponderDecision} onResponderFieldStep={handleResponderFieldStep} responders={operationalUsers} isCommand={command} viewerRole={role} viewerUid={user?.uid} assignments={myAssignments} assignmentsStatus={assignmentsStatus} actionLoading={actionLoading} />)}
    </section>);
  if (path.includes("safe-zones") || path.endsWith("/map") || path.endsWith("field-map"))
    return (<div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Suspense fallback={<div className="flex h-[680px] w-full items-center justify-center rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-signal border-t-transparent" />
          <span>Loading Map Console...</span>
        </div>
      </div>}>
        <BeaconMapConsole role={role} incidents={incidents} safeZones={safeZones} activeUserId={user?.uid} className="h-[680px] w-full" />
      </Suspense>
      <aside className="space-y-5">
        <div>
          <p className="section-kicker">VERIFIED LOCATIONS</p>
          <h3 className="mt-2 font-display text-xl font-semibold">Vijayawada Safe Zones</h3>
          <p className="mt-1 text-xs text-muted-foreground">NTR District, Andhra Pradesh, India</p>
        </div>
        {safeZones.length > 0 ? (safeZones.map((zone) => {
          const Icon = zone.facilities?.some((f) => f.toLowerCase().includes("medical"))
            ? Cross
            : Shield;
          return (<button key={zone.id || zone.name} onClick={() => setMessage(`${zone.name} selected (${zone.location?.address || zone.location?.locality || "Vijayawada"}). Capacity: ${zone.availableCapacity ?? zone.capacity ?? "Standby"}. Status: ${zone.operationalStatus}.`)} className="flex w-full items-start gap-3 border-b border-border py-4 text-left transition-colors hover:bg-muted/30">
            <Icon className="mt-0.5 h-4 w-4 text-signal shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">{zone.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {zone.location?.locality ? `${zone.location.locality}, ` : ""}
                {zone.location?.city || "Vijayawada"} · {zone.operationalStatus}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center text-[10px] bg-safe/15 text-safe font-medium px-1.5 py-0.5 rounded">
                  ✓ {zone.verificationStatus}
                </span>
                {zone.capacity ? (<span className="text-[10px] text-muted-foreground">
                  Cap: {zone.availableCapacity ?? zone.capacity}/{zone.capacity}
                </span>) : null}
              </span>
            </span>
          </button>);
        })) : (<div className="py-8 text-center border-b border-border">
          <p className="text-sm font-medium text-muted-foreground">
            No verified safe zones currently published for this operational sector.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Awaiting official emergency shelter verification from Disaster Management.
          </p>
        </div>)}
        {command && (<div className="border border-border p-3 rounded-md bg-muted/20">
          <p className="text-xs font-semibold uppercase text-signal">Command Action</p>
          <Button size="sm" variant="outline" className="mt-2 w-full text-xs" onClick={async () => {
            const name = window.prompt("Enter new Verified Safe Zone Name (Vijayawada):");
            if (name && name.trim()) {
              try {
                const newZone = await createAndVerifySafeZone({
                  name: name.trim(),
                  location: {
                    latitude: 16.5062,
                    longitude: 80.648,
                    address: "Vijayawada Emergency Sector",
                    locality: "Central",
                    city: "Vijayawada",
                    district: "NTR District",
                    state: "Andhra Pradesh",
                    country: "India",
                  },
                  facilities: ["Shelter", "Drinking Water", "First Aid"],
                  capacity: 500,
                  availableCapacity: 500,
                  operationalStatus: "OPEN",
                  sourceName: "Command Authority Field Verification",
                }, user?.uid || "command-coordinator");
                setSafeZones([newZone, ...safeZones]);
                setMessage(`Safe zone "${newZone.name}" verified and published to network.`);
              }
              catch (err) {
                setMessage(`Failed to add safe zone: ${err.message}`);
              }
            }
          }}>
            + Add Verified Safe Zone
          </Button>
        </div>)}
        <p role="status" className="text-xs text-muted-foreground">
          {message || "Verified public disaster relief infrastructure · Vijayawada, NTR District, Andhra Pradesh."}
        </p>
      </aside>
    </div>);
  if (path.endsWith("/profile"))
    return (<div className="max-w-3xl">
      <Pill tone="signal">{user ? "Authenticated Account" : "Preview Account"}</Pill>
      <h2 className="mt-4 font-display text-2xl font-semibold">Your details</h2>
      <form onSubmit={handleSavePreferences} className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Full name
          <Input value={profileFullName} onChange={(e) => setProfileFullName(e.target.value)} className="mt-2" />
        </label>
        <label className="text-sm font-medium">
          Phone number
          <Input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} className="mt-2" />
        </label>
        <label className="text-sm font-medium">
          Region / Jurisdiction
          <Input value={profileRegion} onChange={(e) => setProfileRegion(e.target.value)} className="mt-2" />
        </label>
        <label className="text-sm font-medium">
          Language
          <select value={profileLanguage} onChange={(e) => setProfileLanguage(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3">
            <option>English</option>
            <option>Telugu</option>
            <option>Hindi</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <h3 className="font-semibold">Emergency contacts</h3>
          <p className="mt-1 text-sm text-muted-foreground">{profileContacts}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => {
            const updated = window.prompt("Enter emergency contact (Name · Phone):", profileContacts);
            if (updated)
              setProfileContacts(updated);
          }}>
            Edit contacts
          </Button>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground">
            Theme preference is saved on this device
          </span>
        </div>
        <Button type="submit" className="sm:col-span-2 sm:w-fit">
          Save preferences
        </Button>
        {message && (<p role="status" className="text-sm text-safe sm:col-span-2">
          {message}
        </p>)}
      </form>
    </div>);
  if (path.endsWith("/status")) {
    const activeAssigned = (rawIncidents || []).find(
      (i) => user?.uid && i.assignedResponderId === user.uid && !["Resolved", "Closed", "Cancelled"].includes(i.status)
    );
    const activeOffer = activeAssigned
      ? myAssignments.find((a) => a.incidentId === activeAssigned.id && a.status === "ACTIVE")
      : null;
    const isOfferPending = activeOffer && (!activeOffer.acceptanceStatus || activeOffer.acceptanceStatus === "OFFERED");
    const steps = ["En route", "On scene", "In progress", "Resolved"];
    const currentIdx = activeAssigned ? RESPONDER_FIELD_SEQUENCE.indexOf(activeAssigned.status) : -1;

    return (<div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div>
            <p className="text-sm text-muted-foreground">Availability</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              {available ? "Available for assignments" : "Unavailable"}
            </h2>
          </div>
          <Button variant={available ? "outline" : "default"} onClick={toggleAvailability} disabled={Boolean(activeAssigned) || availabilitySaving}>
            {availabilitySaving ? "Updating..." : available ? "Set unavailable" : "Set available"}
          </Button>
        </div>

        {activeAssigned ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-signal">{activeAssigned.id}</span>
                <Pill tone="signal">{activeAssigned.status}</Pill>
              </div>
              <p className="mt-1 text-sm font-semibold">{activeAssigned.category || activeAssigned.type} · {activeAssigned.place}</p>
              {activeAssigned.description && (
                <p className="mt-1 text-xs text-muted-foreground">{activeAssigned.description}</p>
              )}
            </div>

            {isOfferPending ? (
              <div className="rounded-lg border border-signal/40 bg-signal/5 p-4 space-y-3">
                <p className="text-sm font-semibold">New Dispatch Offer — Response Required</p>
                <p className="text-xs text-muted-foreground">
                  Accept to lock this assignment and unlock field status progression, or decline so Command can reassign immediately.
                </p>
                <Input
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Optional decline reason (e.g. Equipment unavailable / En route elsewhere)"
                  className="text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={actionLoading} onClick={() => handleResponderDecision(activeAssigned.id, "ACCEPTED")}>
                    Accept Assignment
                  </Button>
                  <Button variant="outline" disabled={actionLoading} onClick={() => handleResponderDecision(activeAssigned.id, "DECLINED", declineReason)}>
                    Decline Assignment
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {steps.map((stepStatus, i) => {
                  const stepIdx = RESPONDER_FIELD_SEQUENCE.indexOf(stepStatus);
                  const isDone = currentIdx >= stepIdx;
                  const isNext = currentIdx === stepIdx - 1;
                  return (
                    <button
                      key={stepStatus}
                      type="button"
                      disabled={actionLoading || !isNext}
                      onClick={() => handleResponderFieldStep(activeAssigned.id, stepStatus, fieldNote)}
                      className="flex w-full items-center gap-4 border-b border-border py-4 text-left disabled:opacity-50 hover:bg-muted/30"
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isDone ? "bg-safe/20 text-safe" : isNext ? "bg-signal/15 text-signal" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold">
                        {stepStatus === "Resolved" ? "Resolved / completed" : stepStatus}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {isDone ? "Completed" : isNext ? "Next step" : "Locked"}
                      </span>
                    </button>
                  );
                })}
                <Textarea
                  value={fieldNote}
                  onChange={(e) => setFieldNote(e.target.value)}
                  placeholder="Add an operation / resolution note (included with your next status update)…"
                  className="mt-5"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            No active dispatch assignment. When Command dispatches an incident to you, it will appear here for acceptance and field updates.
          </div>
        )}

        {availabilityError && (
          <p role="alert" className="mt-3 text-sm text-urgent">
            {availabilityError}
          </p>
        )}
        {message && (
          <p role="status" className="mt-3 text-sm text-safe">
            {message}
          </p>
        )}
      </section>
      <div className="border-l border-border pl-5">
        <p className="section-kicker">DUTY STATUS</p>
        <p className="mt-4 text-sm font-medium">
          {available
            ? "AVAILABLE (On duty · Free for dispatch)"
            : profile?.dutyStatus === "DISPATCHED" || profile?.dutyStatus === "ON_SCENE"
              ? `${profile.dutyStatus} (Locked to active incident)`
              : profile?.dutyStatus === "OFF_DUTY"
                ? "OFF_DUTY (Not dispatchable)"
                : "UNAVAILABLE (Not accepting dispatch)"}
        </p>
        {profile?.dutyStatus && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">Persisted state: {profile.dutyStatus}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Operation activity · Vijayawada Sector</p>
      </div>
    </div>);
  }
  if (path.endsWith("/simulation")) {
    const latestMsg = simState.messages[0] || null;
    const holderSet = new Set(
      simState.messages
        .filter((m) => m.status !== "Delivered" && m.status !== "Expired")
        .map((m) => m.currentHolderId)
    );
    const getNodeIcon = (type) => {
      if (type === "CITIZEN")
        return LifeBuoy;
      if (type === "DATA_MULE")
        return Compass;
      if (type === "GATEWAY")
        return Radio;
      return Network;
    };
    return (<div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="signal">
            <Network /> SIMULATION DATA
          </Pill>
          <span className="font-mono text-xs text-muted-foreground">
            Tick {simState.tick} · {simState.messages.length} message(s)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Choose simulation scenario"
            value={simState.scenario}
            onChange={(e) => initializeSimulation(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {SIMULATION_SCENARIOS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={() => (simState.isPlaying ? pauseSimulation() : startSimulation())}
          >
            {simState.isPlaying ? "Pause" : "Play"}
          </Button>
          <Button type="button" variant="outline" onClick={() => stepSimulation()}>
            Step
          </Button>
          <Button type="button" variant="ghost" onClick={() => resetSimulation()}>
            Reset
          </Button>
        </div>
      </div>
      <div className={`grid gap-6 ${isMobile ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_300px]"}`}>
        <div className="simulation-board relative min-h-[380px] overflow-hidden border border-border sm:min-h-[420px]">
          <div className="absolute inset-0 simulation-grid" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {simState.links.map((link) => {
              const fromNode = simState.nodes.find((n) => n.id === link.from);
              const toNode = simState.nodes.find((n) => n.id === link.to);
              if (!fromNode || !toNode)
                return null;
              const isTransmitting = simState.activeTransmissions.some(
                (t) => (t.from === link.from && t.to === link.to) || (t.from === link.to && t.to === link.from)
              );
              return (
                <line
                  key={`${link.from}-${link.to}`}
                  x1={fromNode.position.x}
                  y1={fromNode.position.y}
                  x2={toNode.position.x}
                  y2={toNode.position.y}
                  className={isTransmitting ? "stroke-signal stroke-[0.9]" : "network-line"}
                  strokeDasharray={isTransmitting ? "2 1" : undefined}
                />
              );
            })}
          </svg>
          {simState.nodes.map((node) => {
            const Icon = getNodeIcon(node.type);
            const isCarrying = holderSet.has(node.id);
            const isTransmitting = simState.activeTransmissions.some(
              (t) => t.from === node.id || t.to === node.id
            );
            return (
              <div
                key={node.id}
                data-testid={`sim-node-${node.id}`}
                className={`node transition-all duration-300 ${node.available ? (isCarrying || isTransmitting ? "node-active" : "") : "opacity-40"}`}
                style={{ left: `${node.position.x}%`, top: `${node.position.y}%` }}
              >
                <span className={`node-dot relative ${isCarrying ? "ring-2 ring-signal ring-offset-2" : ""}`}>
                  <Icon />
                  {node.buffer.length > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold text-white">
                      {node.buffer.length}
                    </span>
                  )}
                </span>
                <span className="node-label">
                  {node.id} · {node.label}{!node.available ? " (Offline)" : ""}
                </span>
              </div>
            );
          })}
          <span className="absolute bottom-3 left-3 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">
            Scenario: {simState.scenario} · Tick {simState.tick}
          </span>
        </div>
        <aside className="space-y-5">
          <div>
            <p className="section-kicker">NODES & BUFFERS</p>
            <div className="mt-2 divide-y divide-border">
              {simState.nodes.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <span className="font-medium text-foreground">
                    {n.id} · {n.label}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {n.available ? `Online (${n.buffer.length})` : "Offline"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="section-kicker">ACTIVE MESSAGE & EVENT LOG</p>
            {latestMsg ? (
              <p className="mt-2 font-mono text-xs text-signal">
                {latestMsg.id} · {latestMsg.status} · {latestMsg.hopCount} hop(s) · TTL {latestMsg.ttl} · Holder: {latestMsg.currentHolderId}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No simulation messages injected yet.
              </p>
            )}
            <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded border border-border bg-muted/20 p-2.5 text-xs">
              {simState.events.length === 0 ? (
                <p className="text-muted-foreground">Awaiting simulation events…</p>
              ) : (
                simState.events.slice(0, 12).map((ev) => (
                  <div key={ev.id} className="border-b border-border/60 pb-1 last:border-b-0">
                    <span className="font-mono text-[10px] text-signal">[T{ev.tick}] {ev.eventType}</span>
                    <p className="text-foreground">{ev.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              Message TTL (ticks)
              <Input
                type="number"
                min={1}
                max={30}
                value={simTtl}
                onChange={(e) => setSimTtl(Math.max(1, Number(e.target.value) || 12))}
                className="mt-1 h-8 text-xs"
              />
            </label>
            <Button
              type="button"
              className="w-full"
              onClick={() => injectSimulationMessage({ sourceNodeId: "CIT-01", ttl: simTtl })}
            >
              Inject simulation message
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Educational simulation only. Never creates real Citizen SOS incidents or dispatches responders.
          </p>
        </aside>
      </div>
    </div>);
  }
  if (path.endsWith("/messages")) {
    const filteredMessages = simState.messages.filter((m) => {
      const matchesStatus = filter === "All" || m.status === filter;
      const q = simSearch.trim().toLowerCase();
      const matchesSearch = !q ||
        m.id.toLowerCase().includes(q) ||
        m.sourceNodeId.toLowerCase().includes(q) ||
        m.currentHolderId.toLowerCase().includes(q) ||
        m.routeHistory.some((r) => r.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
    const selectedSimMsg = simState.messages.find((m) => m.id === selectedSimMsgId) || filteredMessages[0] || null;
    const selectedMsgEvents = selectedSimMsg
      ? simState.events.filter((ev) => ev.messageId === selectedSimMsg.id)
      : [];
    return (<section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <Pill tone="signal">
            <Network /> SIMULATION DATA
          </Pill>
          <h2 className="mt-3 font-display text-2xl font-semibold">Simulated message activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Live DTN event stream from Simulation Laboratory · Scenario: {simState.scenario} · Tick {simState.tick}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label="Search simulation messages"
            placeholder="Search ID or node..."
            value={simSearch}
            onChange={(e) => setSimSearch(e.target.value)}
            className="h-9 w-44 text-sm sm:w-52"
          />
          <label>
            <span className="sr-only">Filter messages</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="All">All</option>
              <option value="Created">Created</option>
              <option value="Forwarded">Forwarded</option>
              <option value="Carried">Carried</option>
              <option value="Delivered">Delivered</option>
              <option value="Expired">Expired</option>
            </select>
          </label>
        </div>
      </div>

      {filteredMessages.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No simulation messages match the current filter. Inject a simulation message in Simulation Laboratory to trace its DTN hops and events.
        </div>
      ) : (
        <div className={`grid gap-6 ${isMobile ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"}`}>
          <div className="divide-y divide-border rounded-lg border border-border">
            {filteredMessages.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedSimMsgId(m.id)}
                className={`grid w-full grid-cols-1 gap-2 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[1.1fr_1.2fr_auto_auto] sm:items-center ${
                  selectedSimMsg?.id === m.id ? "bg-signal/5 border-l-2 border-l-signal" : ""
                }`}
              >
                <span className="font-mono text-xs font-semibold text-signal">{m.id}</span>
                <span className="text-xs text-foreground">
                  {m.sourceNodeId} → {m.currentHolderId} (dest {m.destinationNodeId})
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {m.hopCount} hop(s) · TTL {m.ttl}
                </span>
                <Pill tone={m.status === "Delivered" ? "good" : m.status === "Expired" ? "warn" : "neutral"}>
                  SIMULATION · {m.status}
                </Pill>
              </button>
            ))}
          </div>

          {selectedSimMsg && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div>
                <p className="section-kicker">ROUTE HISTORY · {selectedSimMsg.id}</p>
                <p className="mt-2 font-mono text-xs text-foreground">
                  {selectedSimMsg.routeHistory.join(" → ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status: {selectedSimMsg.status} · Hops: {selectedSimMsg.hopCount} · Remaining TTL: {selectedSimMsg.ttl}
                </p>
              </div>
              <div>
                <p className="section-kicker">MESSAGE EVENT TRACE</p>
                <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                  {selectedMsgEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events recorded for this message.</p>
                  ) : (
                    selectedMsgEvents.map((ev) => (
                      <div key={ev.id} className="rounded border border-border/70 bg-background p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-signal">{ev.eventType}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{ev.id} · {ev.timestamp}</span>
                        </div>
                        <p className="mt-1 text-foreground">{ev.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Simulation messages and gateway deliveries are strictly isolated from real Citizen SOS incident records.
      </p>
    </section>);
  }
  if (path.endsWith("/users"))
    return (<section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Pill tone="signal">{user ? "Command Operations" : "Preview directory"}</Pill>
            {pendingApplications.length > 0 && (
              <Pill tone="warn">{pendingApplications.length} PENDING APPLICATION{pendingApplications.length === 1 ? "" : "S"}</Pill>
            )}
          </div>
          <h2 className="mt-2 font-display text-2xl font-semibold">User Directory & Vetting Console</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review credentialed responder applications, grant dual citizen/responder capabilities, and oversee sector personnel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill>{role}</Pill>
          {user && (
            <Button size="sm" variant="outline" onClick={refreshUsersAndApplications} disabled={loadingApplications} aria-label="Refresh user directory">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingApplications ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Tab Controls */}
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={usersTab === "directory"}
          onClick={() => setUsersTab("directory")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${usersTab === "directory"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <Users className="h-4 w-4" />
          Personnel Directory
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {operationalUsers.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={usersTab === "applications"}
          onClick={() => setUsersTab("applications")}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${usersTab === "applications"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <UserCheck className="h-4 w-4" />
          Responder Applications
          {pendingApplications.length > 0 ? (
            <span className="ml-1 rounded-full bg-urgent/15 px-2 py-0.5 text-xs font-semibold text-urgent">
              {pendingApplications.length}
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">0</span>
          )}
        </button>
        {role === "ADMINISTRATOR" && (
          <button
            type="button"
            role="tab"
            aria-selected={usersTab === "provision"}
            onClick={() => setUsersTab("provision")}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${usersTab === "provision"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <Shield className="h-4 w-4" />
            Add Personnel
          </button>
        )}
      </div>

      {/* Feedback Alert */}
      {reviewFeedback && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-lg border p-4 text-sm ${reviewFeedback.type === "success"
              ? "border-safe/30 bg-safe/10 text-safe"
              : "border-urgent/30 bg-urgent/10 text-urgent"
            }`}
        >
          <div className="flex items-center gap-2">
            {reviewFeedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{reviewFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setReviewFeedback(null)}
            className="text-xs underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Directory Tab Content */}
      {usersTab === "directory" && (
        <div>
          <div className="mt-4 space-y-0">
            {(() => {
              const previewDirectory = [
                { uid: "u-1", displayName: "Citizen User", role: "Citizen", rawRole: "CITIZEN", status: "Active" },
                { uid: "u-2", displayName: "NTR District First Responder", role: "Professional responder", rawRole: "RESPONDER", responderSubtype: "PROFESSIONAL", status: "Active" },
                { uid: "u-3", displayName: "AP Volunteer Rescue", role: "Volunteer responder", rawRole: "RESPONDER", responderSubtype: "VOLUNTEER", status: "Active" },
                { uid: "u-4", displayName: "VMC Incident Coordinator", role: "Coordinator", rawRole: "COMMAND", status: "Active" },
                { uid: "u-5", displayName: "State Disaster Admin", role: "Administrator", rawRole: "COMMAND", status: "Active" },
              ];
              const directoryRows = user
                ? operationalUsers
                : role === "COORDINATOR"
                  ? previewDirectory.filter((item) => item.rawRole === "RESPONDER")
                  : previewDirectory;
              if (directoryRows.length === 0) {
                return (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    {role === "COORDINATOR"
                      ? "No active responders found in your directory."
                      : "No personnel records found."}
                  </div>
                );
              }
              return directoryRows.map((u) => (
                <div
                  key={u.uid}
                  className="grid grid-cols-[1fr_auto] gap-3 border-b border-border py-4 sm:grid-cols-[1.2fr_1fr_auto_auto]"
                >
                  <div>
                    <span className="text-sm font-semibold">{u.displayName}</span>
                    {u.email && <p className="text-xs text-muted-foreground">{u.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{u.role}</span>
                    {u.responderSubtype && (
                      <Pill tone="neutral" className="text-[0.6rem]">{u.responderSubtype}</Pill>
                    )}
                  </div>
                  <Pill tone={u.status === "ACTIVE" || u.status === "Active" ? "good" : "warn"}>{u.status}</Pill>
                  {role === "ADMINISTRATOR" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setManagedUser(u);
                        setManageActionMode(null);
                        setSuspendReason("");
                        setManageAuditLogs([]);
                        setManageApprovalRecord(null);
                        setManageLoadingAudit(true);
                        try {
                          const [logs, rev] = await Promise.all([
                            fetchAccountAuditHistory(u.uid, u.invitationId).catch(() => []),
                            u.lastReviewId ? fetchReviewById(u.lastReviewId).catch(() => null) : Promise.resolve(null),
                          ]);
                          setManageAuditLogs(logs || []);
                          setManageApprovalRecord(rev || null);
                        } finally {
                          setManageLoadingAudit(false);
                        }
                      }}
                    >
                      Manage
                    </Button>
                  ) : (
                    <span className="hidden text-xs text-muted-foreground sm:block">Read-only</span>
                  )}
                </div>
              ));
            })()}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {role === "COORDINATOR"
              ? "Coordinator directory is read-only and scoped to Responder accounts only."
              : "Coordinator view is read-only. Administrator has authorization to manage roles and assignments."}
          </p>
        </div>
      )}

      {/* Applications Tab Content */}
      {usersTab === "applications" && (
        <div className="space-y-4">
          {loadingApplications ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin mb-2 text-primary" />
              Loading pending responder applications...
            </div>
          ) : pendingApplications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-safe mb-2" />
              <h3 className="font-display text-lg font-semibold">No Pending Applications</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                All submitted responder applications in this operational jurisdiction have been reviewed. New applications will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingApplications.map((app) => (
                <div
                  key={app.uid}
                  className="rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:border-border/80"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-foreground">
                          {app.displayName}
                        </h3>
                        <Pill tone="warn">PENDING VETTING</Pill>
                        <Pill tone="signal">TRACK: {app.requestedResponderSubtype || "VOLUNTEER"}</Pill>
                        {app.requestedUnit && (
                          <Pill tone="neutral">UNIT: {app.requestedUnit}</Pill>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {app.email} {app.phoneNumber ? `· ${app.phoneNumber}` : ""} · Applied: {app.createdAt ? formatRelativeTime(app.createdAt) : "Recently"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canVetResponders ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              setReviewModal({ type: "approve", applicant: app });
                              setReviewSubtype(app.requestedResponderSubtype || "VOLUNTEER");
                              setReviewNotes("");
                            }}
                          >
                            <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                            Review & Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-urgent hover:bg-urgent/10 hover:text-urgent"
                            onClick={() => {
                              setReviewModal({ type: "reject", applicant: app });
                              setRejectionReason("");
                              setReviewNotes("");
                            }}
                          >
                            <UserX className="mr-1.5 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </>
                      ) : (
                        <span className="rounded border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground italic">
                          Vetting restricted to Command Operations (Coordinator)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider font-medium">Jurisdiction / Location</span>
                      <p className="mt-1 font-medium text-foreground">
                        {[app.city, app.district, app.region].filter(Boolean).join(", ") || "Vijayawada Sector, NTR District"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider font-medium">Organization & Designation</span>
                      <p className="mt-1 font-medium text-foreground">
                        {app.organization ? `${app.organization} · ` : ""}{app.designation || "Independent Volunteer"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider font-medium">Field Experience</span>
                      <p className="mt-1 font-medium text-foreground">
                        {app.experienceYears != null ? `${app.experienceYears} Years in Disaster Response` : "0 Years"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase tracking-wider font-medium">Citizen Standing</span>
                      <p className="mt-1 font-medium text-foreground">
                        {app.citizenEnrollmentStatus === "ACTIVE" ? "Dual Active Citizen" : "New Registration"}
                      </p>
                    </div>
                  </div>

                  {app.credentialsSummary && (
                    <div className="mt-3 rounded border border-border/60 bg-muted/30 p-3 text-xs">
                      <span className="font-semibold text-foreground">Credentials & Certifications:</span>
                      <p className="mt-1 text-muted-foreground">{app.credentialsSummary}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Immutable Vetting Audit Trail */}
          {recentReviews.length > 0 && (
            <div className="pt-4 border-t border-border space-y-3">
              <h3 className="font-display text-base font-semibold text-foreground">
                Recent Vetting Decisions (Audit Trail)
              </h3>
              <div className="space-y-2.5">
                {recentReviews.map((rev) => {
                  const decisionLabel = rev.decision === "REJECTED" ? "Rejected" : "Approved";
                  const reviewerLevelLabel =
                    rev.reviewerDesignation ||
                    (rev.reviewerCommandLevel === "ADMINISTRATOR" || rev.reviewerRole === "ADMINISTRATOR"
                      ? "Command Administrator"
                      : "Command Operations / Coordinator");
                  const formattedDate = rev.reviewedAtIso
                    ? new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      }).format(new Date(rev.reviewedAtIso))
                    : "Just now";
                  return (
                    <div
                      key={rev.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-card/60 p-3.5 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={rev.decision === "REJECTED" ? "warn" : "good"}>{rev.decision}</Pill>
                          <span className="font-semibold text-foreground">
                            {rev.applicantName || rev.applicantUid}
                          </span>
                          {rev.assignedSubtype && (
                            <Pill tone="neutral">{rev.assignedSubtype}</Pill>
                          )}
                        </div>
                        <p className="text-foreground font-medium">
                          {decisionLabel} by {rev.reviewerName || rev.reviewerUid}
                        </p>
                        <p className="text-muted-foreground">
                          {reviewerLevelLabel} · {formattedDate}
                        </p>
                        {rev.rejectionReason && (
                          <p className="text-urgent">Reason: {rev.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Personnel Tab Content (Administrator Only) */}
      {usersTab === "provision" && role === "ADMINISTRATOR" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-5">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                Provision Authorized Personnel
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Select an authorized personnel category and issue a single-use invitation link. Personal and professional
                persona details are completed by the invitee after verifying their email.
              </p>
            </div>

            {/* 3 Visual Role-Selection Cards */}
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Personnel Role
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    key: "COMMAND:COORDINATOR",
                    title: "Command Operations",
                    subtitle: "Coordinator / Operations",
                    description: "Authorized personnel responsible for coordination and incident operations.",
                    icon: Radio,
                  },
                  {
                    key: "RESPONDER:PROFESSIONAL",
                    title: "Responder",
                    subtitle: "Professional",
                    description: "Agency-affiliated or professional emergency response personnel.",
                    icon: Shield,
                  },
                  {
                    key: "RESPONDER:VOLUNTEER",
                    title: "Responder",
                    subtitle: "Volunteer",
                    description: "Community or voluntary emergency response personnel.",
                    icon: LifeBuoy,
                  },
                ].map(({ key, title, subtitle, description, icon: Icon }) => {
                  const isSelected = provTrack === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={provSubmitting}
                      onClick={() => {
                        setProvTrack(key);
                        setProvUnit("GENERAL");
                        setProvResult(null);
                        setReviewFeedback(null);
                      }}
                      className={`flex min-h-[104px] flex-col items-start justify-between rounded-lg border p-3.5 text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-signal bg-signal/10 ring-1 ring-signal/40 shadow-sm"
                          : "border-border bg-background hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <Icon className="h-4 w-4 text-signal shrink-0" />
                          {title}
                        </span>
                        <Pill tone={isSelected ? "signal" : "neutral"} className="text-[0.6rem]">
                          {subtitle}
                        </Pill>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setReviewFeedback(null);
                setProvResult(null);
                setProvEmailState(null);
                setProvCopied(false);
                setProvSubmitting(true);
                try {
                  const [tRole, tSub] = provTrack.split(":");
                  const res = await createPersonnelInvitation({
                    fullName: provName,
                    email: provEmail,
                    targetRole: tRole,
                    targetCommandLevel: tRole === "COMMAND" ? tSub : null,
                    targetResponderSubtype: tRole === "RESPONDER" ? tSub : null,
                    targetUnit: tRole === "RESPONDER" ? provUnit : null,
                  });
                  setProvResult(res);
                  setProvName("");
                  setProvEmail("");
                  setProvUnit("GENERAL");
                  setProvEmailState({ status: "sending" });
                  setReviewFeedback({
                    type: "success",
                    text: `Invitation created for ${res.fullName}. Sending invitation email...`,
                  });
                  await refreshUsersAndApplications();
                  const emailRes = await sendPersonnelInvitationEmail({ invitationId: res.id });
                  if (emailRes.ok) {
                    setProvEmailState({ status: "sent", messageId: emailRes.messageId });
                    setReviewFeedback({
                      type: "success",
                      text: `Invitation created and email accepted by SMTP server for ${res.email}.`,
                    });
                  } else {
                    setProvEmailState({ status: "failed", error: emailRes.error });
                    setReviewFeedback({
                      type: "error",
                      text: `Invitation created, but email sending failed: ${emailRes.error}`,
                    });
                  }
                } catch (err) {
                  setReviewFeedback({
                    type: "error",
                    text: err?.message || "Failed to create personnel invitation.",
                  });
                } finally {
                  setProvSubmitting(false);
                }
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Full name
                  <Input
                    required
                    placeholder="e.g., Priya Sharma"
                    value={provName}
                    onChange={(e) => setProvName(e.target.value)}
                    disabled={provSubmitting}
                    className="mt-1.5"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Email address
                  <Input
                    required
                    type="email"
                    placeholder="personnel@agency.org"
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                    disabled={provSubmitting}
                    className="mt-1.5"
                  />
                </label>
              </div>

              {provTrack.startsWith("RESPONDER:") && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-foreground">
                    Operational Unit (Required)
                    <select
                      required
                      value={provUnit}
                      onChange={(e) => setProvUnit(e.target.value)}
                      disabled={provSubmitting}
                      className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="GENERAL">General</option>
                      <option value="MEDICAL">Medical</option>
                      <option value="SEARCH_AND_RESCUE">Search &amp; Rescue</option>
                      <option value="FIRE_HAZARD">Fire Hazard</option>
                      <option value="LOGISTICS">Logistics</option>
                    </select>
                  </label>
                </div>
              )}

              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[0.7rem] text-muted-foreground">
                  Spark tier: Share the generated single-use invite link directly with the recipient; they verify their email and complete their persona profile.
                </p>
                <Button type="submit" disabled={provSubmitting} className="bg-signal hover:bg-signal/90 text-white">
                  {provSubmitting ? "Generating Invite..." : "Create Personnel Invitation"}
                </Button>
              </div>
            </form>

            {provResult && (
              <div className="rounded-md border border-safe/30 bg-safe/10 p-4 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-safe">Invitation Ready (Expires in 7 days)</p>
                  {provEmailState?.status === "sending" && (
                    <Pill tone="signal">Sending…</Pill>
                  )}
                  {provEmailState?.status === "sent" && (
                    <Pill tone="good">
                      Email accepted by SMTP server{provEmailState.messageId ? ` · ${provEmailState.messageId}` : ""}
                    </Pill>
                  )}
                  {provEmailState?.status === "failed" && (
                    <Pill tone="warn">Email sending failed</Pill>
                  )}
                </div>
                {provEmailState?.status === "failed" && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-urgent/30 bg-urgent/10 p-2.5 text-urgent">
                    <span>{provEmailState.error}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setProvEmailState({ status: "sending" });
                        const retryRes = await sendPersonnelInvitationEmail({
                          invitationId: provResult.id,
                          isRetry: true,
                        });
                        if (retryRes.ok) {
                          setProvEmailState({ status: "sent", messageId: retryRes.messageId });
                          setReviewFeedback({
                            type: "success",
                            text: `Invitation email accepted for delivery to ${provResult.email}.`,
                          });
                        } else {
                          setProvEmailState({ status: "failed", error: retryRes.error });
                        }
                      }}
                    >
                      Retry Send Email
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <code className="flex-1 break-all rounded bg-background px-2.5 py-1.5 font-mono text-[0.7rem] border border-border">
                    {provResult.inviteUrl}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (navigator.clipboard) {
                        void navigator.clipboard.writeText(provResult.inviteUrl);
                        setProvCopied(true);
                      }
                    }}
                  >
                    {provCopied ? "Copied" : "Copy Link"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {invitations.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-display text-base font-semibold text-foreground">
                Provisioning Invitations ({invitations.length})
              </h4>
              <div className="space-y-2">
                {invitations.map((inv) => {
                  const isExpired = inv.status === "PENDING" && inv.expiresAtIso && new Date(inv.expiresAtIso).getTime() <= Date.now();
                  const displayStatus = isExpired ? "EXPIRED" : inv.status;
                  return (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{inv.fullName}</span>
                        <Pill tone={displayStatus === "PENDING" ? "warn" : displayStatus === "CLAIMED" ? "good" : "neutral"}>
                          {displayStatus}
                        </Pill>
                        <Pill tone="neutral">{inv.targetCommandLevel || inv.targetResponderSubtype || inv.targetRole}</Pill>
                      </div>
                      <p className="text-muted-foreground">
                        {inv.email} · {inv.targetUnit || inv.targetCommandLevel || "Personnel"} · Invited by {inv.invitedByName}
                      </p>
                    </div>
                    {inv.status === "PENDING" && !isExpired && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={resendingInviteId === inv.id}
                          onClick={async () => {
                            setResendingInviteId(inv.id);
                            try {
                              const resendRes = await sendPersonnelInvitationEmail({
                                invitationId: inv.id,
                                isResend: true,
                              });
                              if (resendRes.ok) {
                                setReviewFeedback({
                                  type: "success",
                                  text: `Invitation email accepted for delivery to ${inv.email}.`,
                                });
                              } else {
                                setReviewFeedback({
                                  type: "error",
                                  text: `Resend failed for ${inv.email}: ${resendRes.error}`,
                                });
                              }
                            } finally {
                              setResendingInviteId(null);
                            }
                          }}
                        >
                          {resendingInviteId === inv.id ? "Sending..." : "Resend Email"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const url = buildInvitationUrl(inv.id, inv.email);
                            if (navigator.clipboard) {
                              void navigator.clipboard.writeText(url);
                              setReviewFeedback({ type: "success", text: `Copied invite link for ${inv.email}.` });
                            }
                          }}
                        >
                          Copy Link
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await revokePersonnelInvitation(inv.id);
                              setReviewFeedback({ type: "success", text: `Revoked invitation for ${inv.email}.` });
                              await refreshUsersAndApplications();
                            } catch (err) {
                              setReviewFeedback({ type: "error", text: err?.message || "Failed to revoke invitation." });
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approval Modal */}
      {reviewModal?.type === "approve" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !reviewSubmitting) setReviewModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="approve-modal-title"
            className="w-full max-w-lg border border-border bg-background p-6 shadow-xl sm:rounded-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Pill tone="good">Dual Capability Grant</Pill>
                <h3 id="approve-modal-title" className="mt-2 font-display text-lg font-semibold text-foreground">
                  Approve Responder Application
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reviewModal.applicant.displayName} ({reviewModal.applicant.email})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={reviewSubmitting}
                onClick={() => setReviewModal(null)}
                aria-label="Close approval modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="approved-subtype-select" className="text-xs font-semibold uppercase text-muted-foreground">
                  Operational Responder Subtype
                </label>
                <select
                  id="approved-subtype-select"
                  value={reviewSubtype}
                  onChange={(e) => setReviewSubtype(e.target.value)}
                  disabled={reviewSubmitting}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="VOLUNTEER">VOLUNTEER — Community Auxiliary Responder</option>
                  <option value="PROFESSIONAL">PROFESSIONAL — Certified First Responder / Disaster Force</option>
                </select>
                <p className="mt-1 text-[0.7rem] text-muted-foreground">
                  Applicant requested: <span className="font-semibold text-foreground">{reviewModal.applicant.requestedResponderSubtype || "VOLUNTEER"}</span>
                </p>
              </div>

              <div>
                <label htmlFor="approve-review-notes" className="text-xs font-semibold uppercase text-muted-foreground">
                  Reviewer Operational Notes (Optional)
                </label>
                <Textarea
                  id="approve-review-notes"
                  placeholder="e.g., SDRF certification verified against state registry. Assigned to Vijayawada Sector Unit 1."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  disabled={reviewSubmitting}
                  className="mt-1.5 text-xs"
                  rows={3}
                />
              </div>

              <div className="rounded border border-safe/30 bg-safe/5 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-safe">Atomic Authorization Contract:</p>
                <p className="mt-1">
                  Approving grants dual capability <code className="font-mono text-foreground">['CITIZEN', 'RESPONDER']</code>, activates citizen standing, initializes professional responder profile, and writes an append-only audit entry.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={reviewSubmitting}
                onClick={() => setReviewModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={reviewSubmitting}
                onClick={() => handleApproveApplication(reviewModal.applicant)}
              >
                {reviewSubmitting ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Granting Credentials...
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                    Confirm Approval & Issue Credentials
                  </>
                )}
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* Account Management Dialog (Desktop/Tablet) / Bottom Sheet (Mobile) — Administrator Only */}
      {managedUser && role === "ADMINISTRATOR" && (() => {
        const isSelf = managedUser.uid === user?.uid;
        const isTargetAdmin = managedUser.commandLevel === "ADMINISTRATOR";
        const isTargetSuspended = managedUser.accountStatus === "SUSPENDED" || managedUser.status === "Suspended";
        const canChangeStatus = !isSelf && !isTargetAdmin;
        const locationStr = [managedUser.city, managedUser.district, managedUser.region].filter(Boolean).join(", ");
        const regDateStr = managedUser.createdAtIso
          ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(managedUser.createdAtIso))
          : "Unavailable";

        const manageBody = (
          <div className="space-y-5 text-xs">
            {/* Profile Details */}
            <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[0.65rem]">
                Profile &amp; Standing
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Full Name:</span> <strong className="text-foreground">{managedUser.displayName}</strong></div>
                <div><span className="text-muted-foreground">Email:</span> <strong className="text-foreground break-all">{managedUser.email || "—"}</strong></div>
                <div><span className="text-muted-foreground">Phone:</span> <strong className="text-foreground">{managedUser.phoneNumber || "Not provided"}</strong></div>
                <div><span className="text-muted-foreground">Location:</span> <strong className="text-foreground">{locationStr || "Not provided"}</strong></div>
                <div><span className="text-muted-foreground">UID:</span> <code className="font-mono text-[0.68rem] break-all">{managedUser.uid}</code></div>
                <div><span className="text-muted-foreground">Email Verification:</span> <strong className={managedUser.emailVerified ? "text-safe" : "text-urgent"}>{managedUser.emailVerified ? "Verified" : "Unverified"}</strong></div>
                <div><span className="text-muted-foreground">Registered:</span> <strong className="text-foreground">{regDateStr}</strong></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Account Status:</span>
                  <Pill tone={isTargetSuspended ? "warn" : "good"}>{isTargetSuspended ? "SUSPENDED" : "ACTIVE"}</Pill>
                </div>
              </div>
            </div>

            {/* Authorization Overview */}
            <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[0.65rem]">
                Authorization Overview
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Role:</span> <strong className="text-foreground">{managedUser.role}</strong></div>
                <div>
                  <span className="text-muted-foreground">Capabilities:</span>{" "}
                  <strong className="text-foreground">
                    {managedUser.capabilities?.length > 0 ? managedUser.capabilities.join(", ") : "None (Command / Pending)"}
                  </strong>
                </div>
                {managedUser.designation && (
                  <div className="sm:col-span-2"><span className="text-muted-foreground">Designation:</span> <strong className="text-foreground">{managedUser.designation}</strong></div>
                )}
              </div>
            </div>

            {/* Responder-Specific Details & Approval Audit */}
            {(managedUser.rawRole === "RESPONDER" || managedUser.responderSubtype) && (
              <div className="rounded-md border border-signal/30 bg-signal/5 p-3.5 space-y-2">
                <p className="font-semibold uppercase tracking-wider text-signal text-[0.65rem]">
                  Responder Operational Profile &amp; Approval Audit
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Classification:</span> <strong className="text-foreground">{managedUser.responderSubtype || "—"}</strong></div>
                  <div><span className="text-muted-foreground">Operational Unit:</span> <strong className="text-foreground">{managedUser.requestedUnit || "GENERAL"}</strong></div>
                  <div><span className="text-muted-foreground">Organization:</span> <strong className="text-foreground">{managedUser.organization || "Not provided"}</strong></div>
                  <div><span className="text-muted-foreground">Designation:</span> <strong className="text-foreground">{managedUser.designation || "Not provided"}</strong></div>
                  <div><span className="text-muted-foreground">Experience:</span> <strong className="text-foreground">{managedUser.experienceYears != null ? `${managedUser.experienceYears} years` : "Not provided"}</strong></div>
                  <div><span className="text-muted-foreground">Duty / Assignment:</span> <strong className="text-foreground">{managedUser.dutyStatus || "OFF_DUTY"}{managedUser.activeIncidentId ? ` · ${managedUser.activeIncidentId}` : ""}</strong></div>
                  {managedUser.credentialsSummary && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Qualifications:</span> <span className="text-foreground">{managedUser.credentialsSummary}</span></div>
                  )}
                </div>
                {manageApprovalRecord ? (
                  <div className="mt-2 rounded border border-border bg-background/80 p-2.5 space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {manageApprovalRecord.decision === "REJECTED" ? "Rejected" : "Approved"} by{" "}
                      {manageApprovalRecord.reviewerName || manageApprovalRecord.reviewerUid} —{" "}
                      {manageApprovalRecord.reviewerCommandLevel === "ADMINISTRATOR" || manageApprovalRecord.reviewerRole === "ADMINISTRATOR"
                        ? "Administrator"
                        : "Coordinator"}
                    </p>
                    <p className="text-muted-foreground">
                      Reviewer UID: <code className="font-mono">{manageApprovalRecord.reviewerUid}</code>
                      {manageApprovalRecord.reviewedAtIso && ` · ${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(manageApprovalRecord.reviewedAtIso))}`}
                    </p>
                    {manageApprovalRecord.reviewerNotes && (
                      <p className="text-muted-foreground">Notes: {manageApprovalRecord.reviewerNotes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">
                    {managedUser.invitationId ? "Provisioned via Administrator invitation." : "No separate vetting review record linked."}
                  </p>
                )}
              </div>
            )}

            {/* Administrative Audit History */}
            <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[0.65rem]">
                Administrative Audit History
              </p>
              {manageLoadingAudit ? (
                <p className="text-muted-foreground">Loading audit history...</p>
              ) : manageAuditLogs.length === 0 ? (
                <p className="text-muted-foreground">No administrative actions recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {manageAuditLogs.map((log) => (
                    <div key={log.id} className="rounded border border-border bg-background p-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-semibold text-foreground">{log.action}</span>
                        <span className="text-muted-foreground">
                          {log.createdAtIso
                            ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(log.createdAtIso))
                            : "Recorded"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        By {log.actorName} ({log.actorDesignation || log.actorCommandLevel})
                      </p>
                      {log.reason && <p className="text-foreground mt-0.5">Reason: {log.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suspend / Reactivate Actions */}
            <div className="border-t border-border pt-4 space-y-3">
              {!canChangeStatus ? (
                <p className="text-muted-foreground italic">
                  {isSelf
                    ? "Self-suspension or self-modification is prohibited."
                    : "Administrator accounts cannot be suspended or modified through this panel."}
                </p>
              ) : manageActionMode === "suspend" ? (
                <div className="rounded-md border border-urgent/30 bg-urgent/5 p-3.5 space-y-3">
                  <p className="font-semibold text-urgent">
                    Confirm Account Suspension — {managedUser.displayName}
                  </p>
                  <p className="text-muted-foreground">
                    Suspending this account immediately disables workspace access and blocks protected Firestore operations.
                  </p>
                  <div>
                    <label className="block font-semibold text-foreground">
                      Suspension Reason (Required)
                      <Textarea
                        required
                        rows={2}
                        placeholder="State the administrative reason for suspending this account..."
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        disabled={manageSubmitting}
                        className="mt-1.5"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={manageSubmitting}
                      onClick={() => {
                        setManageActionMode(null);
                        setSuspendReason("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={manageSubmitting || !suspendReason.trim()}
                      onClick={async () => {
                        setManageSubmitting(true);
                        try {
                          await suspendUserAccount(managedUser.uid, suspendReason);
                          setReviewFeedback({
                            type: "success",
                            text: `Account ${managedUser.displayName} suspended and logged.`,
                          });
                          setManagedUser({ ...managedUser, accountStatus: "SUSPENDED", status: "Suspended" });
                          setManageActionMode(null);
                          setSuspendReason("");
                          const logs = await fetchAccountAuditHistory(managedUser.uid, managedUser.invitationId).catch(() => []);
                          setManageAuditLogs(logs);
                          await refreshUsersAndApplications();
                        } catch (err) {
                          setReviewFeedback({
                            type: "error",
                            text: err?.message || "Failed to suspend account.",
                          });
                        } finally {
                          setManageSubmitting(false);
                        }
                      }}
                    >
                      {manageSubmitting ? "Suspending..." : "Confirm Suspension"}
                    </Button>
                  </div>
                </div>
              ) : manageActionMode === "reactivate" ? (
                <div className="rounded-md border border-safe/30 bg-safe/10 p-3.5 space-y-3">
                  <p className="font-semibold text-safe">
                    Confirm Account Reactivation — {managedUser.displayName}
                  </p>
                  <p className="text-muted-foreground">
                    Reactivating restores account status to ACTIVE only. Role, verification, unit, and responder approval remain unchanged.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={manageSubmitting}
                      onClick={() => setManageActionMode(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-safe hover:bg-safe/90 text-white"
                      disabled={manageSubmitting}
                      onClick={async () => {
                        setManageSubmitting(true);
                        try {
                          await reactivateUserAccount(managedUser.uid);
                          setReviewFeedback({
                            type: "success",
                            text: `Account ${managedUser.displayName} reactivated and logged.`,
                          });
                          setManagedUser({ ...managedUser, accountStatus: "ACTIVE", status: "Active" });
                          setManageActionMode(null);
                          const logs = await fetchAccountAuditHistory(managedUser.uid, managedUser.invitationId).catch(() => []);
                          setManageAuditLogs(logs);
                          await refreshUsersAndApplications();
                        } catch (err) {
                          setReviewFeedback({
                            type: "error",
                            text: err?.message || "Failed to reactivate account.",
                          });
                        } finally {
                          setManageSubmitting(false);
                        }
                      }}
                    >
                      {manageSubmitting ? "Reactivating..." : "Confirm Reactivation"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setManagedUser(null)}>
                    Close
                  </Button>
                  {isTargetSuspended ? (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-safe hover:bg-safe/90 text-white"
                      onClick={() => setManageActionMode("reactivate")}
                    >
                      Reactivate Account
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setManageActionMode("suspend")}
                    >
                      Suspend Account
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );

        return isMobile ? (
          <Sheet open={Boolean(managedUser)} onOpenChange={(open) => { if (!open && !manageSubmitting) setManagedUser(null); }}>
            <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <SheetHeader>
                <SheetTitle>Manage Account · {managedUser.displayName}</SheetTitle>
                <SheetDescription>{managedUser.role} · {managedUser.email}</SheetDescription>
              </SheetHeader>
              <div className="mt-4">{manageBody}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={Boolean(managedUser)} onOpenChange={(open) => { if (!open && !manageSubmitting) setManagedUser(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Account · {managedUser.displayName}</DialogTitle>
                <DialogDescription>{managedUser.role} · {managedUser.email}</DialogDescription>
              </DialogHeader>
              {manageBody}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Rejection Modal */}
      {reviewModal?.type === "reject" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !reviewSubmitting) setReviewModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
            className="w-full max-w-lg border border-border bg-background p-6 shadow-xl sm:rounded-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Pill tone="warn">Mandatory Audit Rejection</Pill>
                <h3 id="reject-modal-title" className="mt-2 font-display text-lg font-semibold text-foreground">
                  Reject Responder Application
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reviewModal.applicant.displayName} ({reviewModal.applicant.email})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={reviewSubmitting}
                onClick={() => setReviewModal(null)}
                aria-label="Close rejection modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Preset Rejection Reasons
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    "Credentials and certifications could not be verified",
                    "Incomplete required identity or training documentation",
                    "Jurisdiction mismatch — outside Vijayawada operational sector",
                    "Applicant does not meet field emergency response criteria",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionReason(preset)}
                      className="rounded border border-border bg-muted/40 px-2.5 py-1 text-[0.7rem] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="rejection-reason-input" className="text-xs font-semibold uppercase text-muted-foreground">
                  Rejection Reason <span className="text-urgent">*</span>
                </label>
                <Textarea
                  id="rejection-reason-input"
                  placeholder="State the formal, audited reason for rejecting this application (required, max 500 characters)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  disabled={reviewSubmitting}
                  className="mt-1.5 text-xs"
                  rows={3}
                  maxLength={500}
                />
                <div className="mt-1 flex justify-between text-[0.7rem] text-muted-foreground">
                  <span>This reason will be recorded in the append-only audit trail.</span>
                  <span>{rejectionReason.length}/500</span>
                </div>
              </div>

              <div>
                <label htmlFor="reject-review-notes" className="text-xs font-semibold uppercase text-muted-foreground">
                  Internal Reviewer Notes (Optional)
                </label>
                <Textarea
                  id="reject-review-notes"
                  placeholder="Optional coordinator notes for internal command record..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  disabled={reviewSubmitting}
                  className="mt-1.5 text-xs"
                  rows={2}
                />
              </div>

              <div className="rounded border border-urgent/30 bg-urgent/5 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-urgent">Audited Rejection Contract:</p>
                <p className="mt-1">
                  The user's role remains <code className="font-mono text-foreground">CITIZEN</code>. If the applicant had active citizen enrollment, their citizen emergency reporting capability is preserved. An immutable audit record is logged.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={reviewSubmitting}
                onClick={() => setReviewModal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={reviewSubmitting || !rejectionReason.trim()}
                onClick={() => handleRejectApplication(reviewModal.applicant)}
              >
                {reviewSubmitting ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <UserX className="mr-1.5 h-3.5 w-3.5" />
                    Confirm Rejection
                  </>
                )}
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* Account Management Dialog (Desktop/Tablet) / Bottom Sheet (Mobile) — Administrator Only */}
      {managedUser && role === "ADMINISTRATOR" && (() => {
        const isSelf = managedUser.uid === user?.uid;
        const isTargetAdmin = managedUser.commandLevel === "ADMINISTRATOR";
        const isTargetSuspended = managedUser.accountStatus === "SUSPENDED" || managedUser.status === "Suspended";
        const canChangeStatus = !isSelf && !isTargetAdmin;
        const locationStr = [managedUser.city, managedUser.district, managedUser.region].filter(Boolean).join(", ");
        const regDateStr = managedUser.createdAtIso
          ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(managedUser.createdAtIso))
          : "Unavailable";

        const manageBody = (
          <div className="space-y-5 text-xs">
            {/* Profile Details */}
            <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[0.65rem]">
                Profile &amp; Standing
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Full Name:</span> <strong className="text-foreground">{managedUser.displayName}</strong></div>
                <div><span className="text-muted-foreground">Email:</span> <strong className="text-foreground break-all">{managedUser.email || "—"}</strong></div>
                <div><span className="text-muted-foreground">Phone:</span> <strong className="text-foreground">{managedUser.phoneNumber || "Not provided"}</strong></div>
                <div><span className="text-muted-foreground">Location:</span> <strong className="text-foreground">{locationStr || "Not provided"}</strong></div>
                <div><span className="text-muted-foreground">UID:</span> <code className="font-mono text-[0.68rem] break-all">{managedUser.uid}</code></div>
                <div><span className="text-muted-foreground">Email Verification:</span> <strong className={managedUser.emailVerified ? "text-safe" : "text-urgent"}>{managedUser.emailVerified ? "Verified" : "Unverified"}</strong></div>
                <div><span className="text-muted-foreground">Registered:</span> <strong className="text-foreground">{regDateStr}</strong></div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Account Status:</span>
                  <Pill tone={isTargetSuspended ? "warn" : "good"}>{isTargetSuspended ? "SUSPENDED" : "ACTIVE"}</Pill>
                </div>
              </div>
            </div>

            {/* Authorization Overview */}
            <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[0.65rem]">
                Authorization Overview
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Role:</span> <strong className="text-foreground">{managedUser.role}</strong></div>
                <div>
                  <span className="text-muted-foreground">Capabilities:</span>{" "}
                  <strong className="text-foreground">
                    {managedUser.capabilities?.length > 0 ? managedUser.capabilities.join(", ") : "None (Command / Pending)"}
                  </strong>
                </div>
                {managedUser.designation && (
                  <div className="sm:col-span-2"><span className="text-muted-foreground">Designation:</span> <strong className="text-foreground">{managedUser.designation}</strong></div>
                )}
              </div>
            </div>

            {/* Responder-Specific Details & Approval Audit */}
            {(managedUser.rawRole === "RESPONDER" || managedUser.responderSubtype) && (
              <div className="rounded-md border border-signal/30 bg-signal/5 p-3.5 space-y-2">
                <p className="font-semibold uppercase tracking-wider text-signal text-[0.65rem]">
                  Responder Operational Profile &amp; Approval Audit
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Classification:</span> <strong className="text-foreground">{managedUser.responderSubtype || "—"}</strong></div>
                  <div><span className="text-muted-foreground">Operational Unit:</span> <strong className="text-foreground">{managedUser.requestedUnit || "GENERAL"}</strong></div>
                  <div><span className="text-muted-foreground">Organization:</span> <strong className="text-foreground">{managedUser.organization || "Not provided"}</strong></div>
                  <div><span className="text-muted-foreground">Designation:</span> <strong className="text-foreground">{managedUser.designation || "Not provided"}</strong></div>
                  <div><span className="text-muted-foreground">Experience:</span> <strong className="text-foreground">{managedUser.experienceYears != null ? `${managedUser.experienceYears} years` : "Not provided"}</strong></div>
                  <div><span className="text-muted-foreground">Duty / Assignment:</span> <strong className="text-foreground">{managedUser.dutyStatus || "OFF_DUTY"}{managedUser.activeIncidentId ? ` · ${managedUser.activeIncidentId}` : ""}</strong></div>
                  {managedUser.credentialsSummary && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Qualifications:</span> <span className="text-foreground">{managedUser.credentialsSummary}</span></div>
                  )}
                </div>
                {manageApprovalRecord ? (
                  <div className="mt-2 rounded border border-border bg-background/80 p-2.5 space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {manageApprovalRecord.decision === "REJECTED" ? "Rejected" : "Approved"} by{" "}
                      {manageApprovalRecord.reviewerName || manageApprovalRecord.reviewerUid} —{" "}
                      {manageApprovalRecord.reviewerCommandLevel === "ADMINISTRATOR" || manageApprovalRecord.reviewerRole === "ADMINISTRATOR"
                        ? "Administrator"
                        : "Coordinator"}
                    </p>
                    <p className="text-muted-foreground">
                      Reviewer UID: <code className="font-mono">{manageApprovalRecord.reviewerUid}</code>
                      {manageApprovalRecord.reviewedAtIso && ` · ${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(manageApprovalRecord.reviewedAtIso))}`}
                    </p>
                    {manageApprovalRecord.reviewerNotes && (
                      <p className="text-muted-foreground">Notes: {manageApprovalRecord.reviewerNotes}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">
                    {managedUser.invitationId ? "Provisioned via Administrator invitation." : "No separate vetting review record linked."}
                  </p>
                )}
              </div>
            )}

            {/* Administrative Audit History */}
            <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground text-[0.65rem]">
                Administrative Audit History
              </p>
              {manageLoadingAudit ? (
                <p className="text-muted-foreground">Loading audit history...</p>
              ) : manageAuditLogs.length === 0 ? (
                <p className="text-muted-foreground">No administrative actions recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {manageAuditLogs.map((log) => (
                    <div key={log.id} className="rounded border border-border bg-background p-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-semibold text-foreground">{log.action}</span>
                        <span className="text-muted-foreground">
                          {log.createdAtIso
                            ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(log.createdAtIso))
                            : "Recorded"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        By {log.actorName} ({log.actorDesignation || log.actorCommandLevel})
                      </p>
                      {log.reason && <p className="text-foreground mt-0.5">Reason: {log.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suspend / Reactivate Actions */}
            <div className="border-t border-border pt-4 space-y-3">
              {!canChangeStatus ? (
                <p className="text-muted-foreground italic">
                  {isSelf
                    ? "Self-suspension or self-modification is prohibited."
                    : "Administrator accounts cannot be suspended or modified through this panel."}
                </p>
              ) : manageActionMode === "suspend" ? (
                <div className="rounded-md border border-urgent/30 bg-urgent/5 p-3.5 space-y-3">
                  <p className="font-semibold text-urgent">
                    Confirm Account Suspension — {managedUser.displayName}
                  </p>
                  <p className="text-muted-foreground">
                    Suspending this account immediately disables workspace access and blocks protected Firestore operations.
                  </p>
                  <div>
                    <label className="block font-semibold text-foreground">
                      Suspension Reason (Required)
                      <Textarea
                        required
                        rows={2}
                        placeholder="State the administrative reason for suspending this account..."
                        value={suspendReason}
                        onChange={(e) => setSuspendReason(e.target.value)}
                        disabled={manageSubmitting}
                        className="mt-1.5"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={manageSubmitting}
                      onClick={() => {
                        setManageActionMode(null);
                        setSuspendReason("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={manageSubmitting || !suspendReason.trim()}
                      onClick={async () => {
                        setManageSubmitting(true);
                        try {
                          await suspendUserAccount(managedUser.uid, suspendReason);
                          setReviewFeedback({
                            type: "success",
                            text: `Account ${managedUser.displayName} suspended and logged.`,
                          });
                          setManagedUser({ ...managedUser, accountStatus: "SUSPENDED", status: "Suspended" });
                          setManageActionMode(null);
                          setSuspendReason("");
                          const logs = await fetchAccountAuditHistory(managedUser.uid, managedUser.invitationId).catch(() => []);
                          setManageAuditLogs(logs);
                          await refreshUsersAndApplications();
                        } catch (err) {
                          setReviewFeedback({
                            type: "error",
                            text: err?.message || "Failed to suspend account.",
                          });
                        } finally {
                          setManageSubmitting(false);
                        }
                      }}
                    >
                      {manageSubmitting ? "Suspending..." : "Confirm Suspension"}
                    </Button>
                  </div>
                </div>
              ) : manageActionMode === "reactivate" ? (
                <div className="rounded-md border border-safe/30 bg-safe/10 p-3.5 space-y-3">
                  <p className="font-semibold text-safe">
                    Confirm Account Reactivation — {managedUser.displayName}
                  </p>
                  <p className="text-muted-foreground">
                    Reactivating restores account status to ACTIVE only. Role, verification, unit, and responder approval remain unchanged.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={manageSubmitting}
                      onClick={() => setManageActionMode(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-safe hover:bg-safe/90 text-white"
                      disabled={manageSubmitting}
                      onClick={async () => {
                        setManageSubmitting(true);
                        try {
                          await reactivateUserAccount(managedUser.uid);
                          setReviewFeedback({
                            type: "success",
                            text: `Account ${managedUser.displayName} reactivated and logged.`,
                          });
                          setManagedUser({ ...managedUser, accountStatus: "ACTIVE", status: "Active" });
                          setManageActionMode(null);
                          const logs = await fetchAccountAuditHistory(managedUser.uid, managedUser.invitationId).catch(() => []);
                          setManageAuditLogs(logs);
                          await refreshUsersAndApplications();
                        } catch (err) {
                          setReviewFeedback({
                            type: "error",
                            text: err?.message || "Failed to reactivate account.",
                          });
                        } finally {
                          setManageSubmitting(false);
                        }
                      }}
                    >
                      {manageSubmitting ? "Reactivating..." : "Confirm Reactivation"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setManagedUser(null)}>
                    Close
                  </Button>
                  {isTargetSuspended ? (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-safe hover:bg-safe/90 text-white"
                      onClick={() => setManageActionMode("reactivate")}
                    >
                      Reactivate Account
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => setManageActionMode("suspend")}
                    >
                      Suspend Account
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );

        return isMobile ? (
          <Sheet open={Boolean(managedUser)} onOpenChange={(open) => { if (!open && !manageSubmitting) setManagedUser(null); }}>
            <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <SheetHeader>
                <SheetTitle>Manage Account · {managedUser.displayName}</SheetTitle>
                <SheetDescription>{managedUser.role} · {managedUser.email}</SheetDescription>
              </SheetHeader>
              <div className="mt-4">{manageBody}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={Boolean(managedUser)} onOpenChange={(open) => { if (!open && !manageSubmitting) setManagedUser(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Account · {managedUser.displayName}</DialogTitle>
                <DialogDescription>{managedUser.role} · {managedUser.email}</DialogDescription>
              </DialogHeader>
              {manageBody}
            </DialogContent>
          </Dialog>
        );
      })()}

      <p role="status" className="mt-2 text-sm text-safe">
        {message}
      </p>
    </section>);
  if (role === "RESPONDER") {
    const assignedToMe = (rawIncidents || []).filter((i) => (user?.uid && (i.assignedResponderId === user.uid || i.assignedResponderIds?.includes(user.uid))));
    const displayQueue = assignedToMe.map(toDisplayIncident);
    return (<div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <Pill tone="signal">
            {profile?.responderType ||
              (typeof window !== "undefined"
                ? localStorage.getItem("beaconmesh-responder-type") || "PROFESSIONAL"
                : "PROFESSIONAL")}{" "}
            · {user ? "ACTIVE RESPONDER" : "PREVIEW"}
          </Pill>
          <h2 className="mt-3 font-display text-2xl font-semibold">
            Good morning, {profile?.displayName?.split(" ")[0] || "Responder"}.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user
              ? "Vijayawada Sector field operations and assigned emergency incidents."
              : "Field updates in preview mode."}
          </p>
        </div>
        <Button variant={available ? "outline" : "default"} onClick={toggleAvailability}>
          {available ? "Available" : "Unavailable"}
        </Button>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Assigned to me" value={String(assignedToMe.length).padStart(2, "0")} hint={assignedToMe.length > 0 ? "Active field load" : "No assignments"} tone={assignedToMe.length > 0 ? "urgent" : "neutral"} />
        <Stat label="Active operations" value={String(incidents.filter((i) => i.status !== "Resolved").length).padStart(2, "0")} hint="Jurisdiction load" />
        <Stat label="Completed today" value={String(incidents.filter((i) => i.status === "Resolved").length).padStart(2, "0")} hint="Resolved records" />
      </div>
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Priority incident queue</h3>
          <Pill tone={displayQueue.length > 0 ? "signal" : "neutral"}>
            {displayQueue.length > 0 ? `${displayQueue.length} INCIDENTS` : "STANDBY"}
          </Pill>
        </div>
        {displayQueue.length > 0 ? (displayQueue
          .slice(0, 3)
          .map((incident) => (<IncidentRow key={incident.id} incident={incident} onOpen={setSelected} />))) : (<p className="py-6 text-sm text-muted-foreground">
            No priority incidents currently queued for your unit.
          </p>)}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="flex h-64 w-full items-center justify-center rounded-lg border border-border bg-card">
          <p className="text-xs text-muted-foreground">Loading operational map...</p>
        </div>}>
          <BeaconMapConsole role={role} incidents={incidents} safeZones={safeZones} activeUserId={user?.uid} compact={true} className="h-64 w-full" />
        </Suspense>
        <div className="border-l-2 border-safe bg-muted/40 p-5">
          <p className="section-kicker">QUICK UPDATE</p>
          <h3 className="mt-3 font-display text-xl font-semibold">On your way?</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Keep your assignment status current for the Command coordination team.
          </p>
          <Button className="mt-4" disabled={!displayQueue[0] || actionLoading} onClick={() => {
            if (displayQueue[0]) {
              void handleResponderFieldStep(displayQueue[0].id, "En route");
            }
          }}>
            Mark En route
          </Button>
          {message && (<p role="status" className="mt-3 text-sm text-safe">
            {message}
          </p>)}
        </div>
      </div>
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} onCloseIncident={handleCloseIncident} onResponderDecision={handleResponderDecision} onResponderFieldStep={handleResponderFieldStep} responders={operationalUsers} isCommand={false} viewerRole={role} viewerUid={user?.uid} assignments={myAssignments} assignmentsStatus={assignmentsStatus} actionLoading={actionLoading} />)}
    </div>);
  }
  if (command) {
    const aggregates = computeIncidentAggregates(rawIncidents || []);
    return (<div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Pill tone="signal">
            {role} · {user ? "OPERATIONAL" : "PREVIEW"}
          </Pill>
          <h2 className="mt-3 font-display text-2xl font-semibold">Operations at a glance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {rawIncidents.length > 0
              ? "Real-time incident intelligence synchronized across Vijayawada Sector."
              : "No active incidents reported in this operational period."}
          </p>
        </div>
        <Pill tone="good">
          <span className="h-1.5 w-1.5 rounded-full bg-safe" />
          Network status · Real-Time Listener Active
        </Pill>
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total incidents" value={String(aggregates.total).padStart(2, "0")} hint={aggregates.total > 0 ? "All records" : "Standby"} />
        <Stat label="Active" value={String(aggregates.active).padStart(2, "0")} hint="Across all categories" tone={aggregates.active > 0 ? "urgent" : "neutral"} />
        <Stat label="Pending" value={String(aggregates.pending).padStart(2, "0")} hint="Awaiting acknowledgement" />
        <Stat label="Critical" value={String(aggregates.critical).padStart(2, "0")} hint="Priority response" tone={aggregates.critical > 0 ? "urgent" : "neutral"} />
        <Stat label="Resolved" value={String(aggregates.resolved).padStart(2, "0")} hint="Completed records" />
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold">Live citizen incidents</h3>
            <Pill tone={incidents.length > 0 ? "signal" : "neutral"}>
              {incidents.length > 0 ? `${incidents.length} RECORDS` : "EMPTY"}
            </Pill>
          </div>
          {incidents.length > 0 ? (incidents
            .slice(0, 4)
            .map((incident) => (<IncidentRow key={incident.id} incident={incident} onOpen={setSelected} />))) : (<p className="py-8 text-center text-sm text-muted-foreground">
              No citizen emergency incidents reported in this operational period.
            </p>)}
        </section>
        <div className="space-y-6">
          <Suspense fallback={<div className="flex h-64 w-full items-center justify-center rounded-lg border border-border bg-card">
            <p className="text-xs text-muted-foreground">Loading operational map...</p>
          </div>}>
            <BeaconMapConsole role={role} incidents={incidents} safeZones={safeZones} activeUserId={user?.uid} compact={true} className="h-64 w-full" />
          </Suspense>
          <section className="border-t border-border pt-4">
            <p className="section-kicker">RESPONDER AVAILABILITY</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-3xl font-semibold">
                {operationalUsers.filter((u) => u.role.toLowerCase().includes("responder")).length || "02"}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">registered field units</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 bg-safe" />
            </div>
          </section>
        </div>
      </div>
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} onCloseIncident={handleCloseIncident} onResponderDecision={handleResponderDecision} onResponderFieldStep={handleResponderFieldStep} responders={operationalUsers} isCommand={true} viewerRole={role} viewerUid={user?.uid} assignments={myAssignments} assignmentsStatus={assignmentsStatus} actionLoading={actionLoading} />)}
    </div>);
  }
  return (<section className="max-w-3xl">
    <Pill tone="signal">About BeaconMesh</Pill>
    <h2 className="mt-4 font-display text-3xl font-semibold">
      Communication that can travel beyond the network.
    </h2>
    <p className="mt-4 leading-7 text-muted-foreground">
      BeaconMesh is an emergency communication system exploring store-carry-forward and cloud
      synchronization for high-risk disaster environments.
    </p>
    <div className="mt-8 border-l-2 border-signal pl-5">
      <h3 className="font-semibold">Resilient Emergency Mesh Network</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Store-carry-forward queueing ensures citizen reports are protected locally in IndexedDB and
        synced idempotently when network or gateway connectivity is restored.
      </p>
    </div>
    <Button asChild className="mt-7">
      <Link to="/how-it-works">
        Explore how it works <ArrowRight />
      </Link>
    </Button>
  </section>);
}
function IncidentDialog({ incident, onClose, onStatus, onAssign, onCloseIncident, onResponderDecision, onResponderFieldStep, responders = [], isCommand = false, viewerRole = "CITIZEN", viewerUid = null, assignments = [], assignmentsStatus = "ready", actionLoading = false, }) {
  const [selectedResponder, setSelectedResponder] = useState("");
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [incidentAssignments, setIncidentAssignments] = useState([]);
  const [closingNotes, setClosingNotes] = useState("");
  const [fieldNotes, setFieldNotes] = useState("");
  const [declineNote, setDeclineNote] = useState("");

  useEffect(() => {
    const unsubTimeline = subscribeToIncidentTimeline(incident.id, setTimelineEvents, () => {});
    let unsubAsg = null;
    if (isCommand) {
      unsubAsg = subscribeToIncidentAssignments(incident.id, setIncidentAssignments, () => {});
    }
    return () => {
      if (typeof unsubTimeline === "function") unsubTimeline();
      if (typeof unsubAsg === "function") unsubAsg();
    };
  }, [incident.id, isCommand]);

  const eligibleProfessionals = responders.filter(
    (r) =>
      r.rawRole === "RESPONDER" &&
      r.responderSubtype === "PROFESSIONAL" &&
      r.accountStatus === "ACTIVE" &&
      r.dutyStatus === "AVAILABLE" &&
      !r.activeIncidentId
  );

  const isAssignedResponder = Boolean(
    viewerRole === "RESPONDER" &&
      viewerUid &&
      (incident.assignedResponderId === viewerUid || incident.assignedResponderIds?.includes(viewerUid))
  );
  const myAsg = isAssignedResponder
    ? assignments.find((a) => a.incidentId === incident.id && a.status === "ACTIVE")
    : null;
  const isOfferPending = Boolean(myAsg && (!myAsg.acceptanceStatus || myAsg.acceptanceStatus === "OFFERED"));
  const currentStepIdx = RESPONDER_FIELD_SEQUENCE.indexOf(incident.status);
  const nextResponderStep =
    currentStepIdx >= 0 && currentStepIdx < RESPONDER_FIELD_SEQUENCE.length - 1
      ? RESPONDER_FIELD_SEQUENCE[currentStepIdx + 1]
      : null;

  const latestAssignment = incidentAssignments[0] || null;
  const isClosed = incident.status === "Closed";
  const isResolved = incident.status === "Resolved";

  return (<div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(e) => {
    if (e.target === e.currentTarget)
      onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="incident-title" className="max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-t-xl border border-border bg-background p-5 shadow-xl sm:rounded-lg sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="signal">{incident.priority} PRIORITY</Pill>
            {incident.syncStatus && (<Pill tone={incident.syncStatus === "SYNCED" ? "good" : incident.syncStatus === "SYNC_FAILED" ? "warn" : "neutral"}>
              {incident.syncStatus}
            </Pill>)}
          </div>
          <h2 id="incident-title" className="mt-3 font-display text-xl font-semibold break-words">
            {incident.id} · {incident.type}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground break-words">
            {incident.place} · {incident.time}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close incident details" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="my-5 border-y border-border py-4 space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Incident details &amp; timeline</p>
        {incident.description && (<p className="text-sm italic text-foreground break-words">"{incident.description}"</p>)}
        <p className="text-sm">Report created · {incident.time}</p>
        <p className="text-sm">Current status · <span className="font-semibold">{incident.status}</span></p>
        {incident.notes && (<p className="text-xs text-muted-foreground break-words">Notes: {incident.notes}</p>)}
        {incident.syncError && (<p className="text-xs text-urgent break-words">Sync error: {incident.syncError}</p>)}
        {incident.assignedResponderIds && incident.assignedResponderIds.length > 0 && (<p className="text-xs text-muted-foreground break-all">
          Assigned unit: {incident.assignedResponderIds.join(", ")}
        </p>)}
        {isCommand && latestAssignment && (
          <p className="text-xs text-muted-foreground">
            Assignment state: <strong className="text-foreground">{latestAssignment.acceptanceStatus || latestAssignment.status}</strong>
            {latestAssignment.declineReason ? ` (${latestAssignment.declineReason})` : ""}
          </p>
        )}
        {timelineEvents.length > 0 && (
          <div className="mt-3 border-t border-border pt-3 space-y-1.5">
            <p className="text-[0.7rem] font-semibold uppercase text-muted-foreground">Operational Timeline</p>
            {timelineEvents.map((evt) => (
              <div key={evt.id} className="text-xs text-muted-foreground flex flex-wrap justify-between gap-2">
                <span className="text-foreground">{evt.details || evt.eventType}</span>
                <span className="font-mono text-[0.68rem]">{evt.actorRole}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isCommand && !isResolved && !isClosed && (
        <div className="mb-5 border-b border-border pb-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Dispatch Professional Responder</p>
          {eligibleProfessionals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <select aria-label="Select responder to assign" value={selectedResponder} onChange={(e) => setSelectedResponder(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-xs flex-1 min-w-[200px]">
                <option value="">-- Choose Available Professional Unit --</option>
                {eligibleProfessionals.map((r) => (<option key={r.uid} value={r.uid}>
                  {r.displayName} ({r.requestedUnit || "GENERAL"} · AVAILABLE)
                </option>))}
              </select>
              <Button size="sm" className="min-h-10" disabled={!selectedResponder || actionLoading} onClick={() => {
                const target = eligibleProfessionals.find((r) => r.uid === selectedResponder);
                if (target && onAssign)
                  onAssign(target.uid, target.displayName);
              }}>
                Dispatch Unit
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No ACTIVE, AVAILABLE Professional responders are currently free for dispatch.
            </p>
          )}
        </div>
      )}

      {isCommand && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {!isResolved && !isClosed && (
              <Button size="sm" className="min-h-10" disabled={actionLoading} onClick={() => onStatus("Acknowledged")}>
                Acknowledge
              </Button>
            )}
            {isResolved && !isClosed && (
              <Button size="sm" variant="outline" className="min-h-10" disabled={actionLoading} onClick={() => onCloseIncident && onCloseIncident(closingNotes)}>
                Verify &amp; Close Incident
              </Button>
            )}
          </div>
          {isResolved && !isClosed && (
            <Input
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Optional Command verification / closure note..."
              className="text-xs"
            />
          )}
        </div>
      )}

      {isAssignedResponder && !isResolved && !isClosed && (
        <div className="space-y-3">
          {assignmentsStatus === "loading" ? (
            <p className="text-xs text-muted-foreground">Verifying assignment state...</p>
          ) : assignmentsStatus === "error" || !myAsg ? (
            <p className="text-xs text-urgent">Unable to verify active assignment state. Operational actions are locked.</p>
          ) : isOfferPending ? (
            <>
              <p className="text-xs font-semibold uppercase text-signal">Dispatch Offer Pending Acceptance</p>
              <Input
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="Optional decline reason..."
                className="text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="min-h-10" disabled={actionLoading} onClick={() => onResponderDecision && onResponderDecision(incident.id, "ACCEPTED")}>
                  Accept Dispatch
                </Button>
                <Button size="sm" variant="outline" className="min-h-10" disabled={actionLoading} onClick={() => onResponderDecision && onResponderDecision(incident.id, "DECLINED", declineNote)}>
                  Decline Dispatch
                </Button>
              </div>
            </>
          ) : nextResponderStep ? (
            <>
              <Input
                value={fieldNotes}
                onChange={(e) => setFieldNotes(e.target.value)}
                placeholder="Optional field / resolution note..."
                className="text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="min-h-10" disabled={actionLoading} onClick={() => onResponderFieldStep && onResponderFieldStep(incident.id, nextResponderStep, fieldNotes)}>
                  Advance to: {nextResponderStep}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {!isCommand && !isAssignedResponder && (
        <p className="text-xs text-muted-foreground">
          Status updates are managed by Command Operations and your assigned emergency responder.
        </p>
      )}
    </section>
  </div>);
}
function AuthPage({ path }) {
  const isSignup = path === "/signup";
  const isForgot = path === "/forgot-password";
  const isVerify = path === "/verify";
  return (<main className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_0.95fr]">
    {/* Left Visual Panel — Desktop Only */}
    <aside className="auth-visual relative hidden min-h-full overflow-hidden bg-ink lg:block">
      <img src={heroImage} alt="A responder searches for a signal in a storm-affected coastal community" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover object-[70%_center]" />
      <div className="hero-shade absolute inset-0" aria-hidden="true" />
      <div className="absolute bottom-12 left-10 right-10 z-10 text-primary-foreground">
        <p className="section-kicker text-signal">OFFLINE-FIRST EMERGENCY NETWORK</p>
        <h2 className="mt-3 max-w-lg font-display text-3xl font-semibold leading-tight text-white">
          A message should have a way to travel.
        </h2>
      </div>
    </aside>

    {/* Right Authentication Panel — Compact, Centered */}
    <section className="flex items-center justify-center px-5 py-8 sm:px-10">
      <div className="w-full max-w-[440px] space-y-6">
        <div>
          <Pill tone="signal">OFFLINE-FIRST NETWORK</Pill>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {isVerify
              ? "Check your email"
              : isForgot
                ? "Reset your password"
                : isSignup
                  ? "Create your account"
                  : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed sm:text-sm">
            {isVerify
              ? "Verify your email address with Firebase Authentication to access your workspace."
              : isForgot
                ? "Enter your registered email address to receive password reset instructions."
                : isSignup
                  ? "Register for access to the BeaconMesh emergency communication network."
                  : "Sign in with your credentials to access your designated workspace."}
          </p>
        </div>

        <div>
          {isSignup && <RegistrationWizard />}
          {isForgot && <ForgotPasswordForm />}
          {isVerify && <VerifyEmailForm />}
          {!isSignup && !isForgot && !isVerify && <LoginForm />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          {!isSignup && (<Link to="/forgot-password" className="hover:text-foreground">
            Forgot password?
          </Link>)}
          {!isSignup && (<Link to="/signup" className="font-medium text-signal hover:underline">
            Create an account
          </Link>)}
          {isSignup && (<Link to="/login" className="hover:text-foreground">
            Already have an account?{" "}
            <span className="font-medium text-signal hover:underline">Sign in</span>
          </Link>)}
          {isForgot && (<Link to="/login" className="font-medium text-signal hover:underline">
            Back to Sign in
          </Link>)}
        </div>

        <p className="text-[0.7rem] leading-normal text-muted-foreground">
          If you are facing an emergency, contact your local emergency services directly.
          BeaconMesh is not a live response service.
        </p>
      </div>
    </section>
  </main>);
}
export function BeaconPage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, profile, status, loading: authLoading, signOut } = useAuth();
  const [role, setRole] = useState("CITIZEN");
  const [incidents, setIncidents] = useState(initialIncidents);
  const [rawIncidents, setRawIncidents] = useState([]);
  const [incidentsReady, setIncidentsReady] = useState(false);
  const [responderType, setResponderType] = useState("PROFESSIONAL");
  const [demoPreviewActive, setDemoPreviewActive] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notifNonce, setNotifNonce] = useState(0);
  // Real-time user-scoped notification subscription (clears on logout/account switch)
  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setNotificationsLoading(false);
      setNotificationsError("");
      return;
    }
    setNotifications([]);
    setNotificationsLoading(true);
    setNotificationsError("");
    const unsubscribe = subscribeToUserNotifications(
      user.uid,
      (list) => {
        setNotifications(list);
        setNotificationsLoading(false);
      },
      (err) => {
        setNotificationsError(err?.message || "Failed to load notifications.");
        setNotificationsLoading(false);
      }
    );
    return () => {
      if (typeof unsubscribe === "function")
        unsubscribe();
    };
  }, [user?.uid, notifNonce]);
  // Initialize offline sync queue worker
  useEffect(() => {
    const cleanup = initAutoSync();
    return () => {
      if (typeof cleanup === "function")
        cleanup();
    };
  }, []);
  const loadIncidents = async () => {
    try {
      let records = [];
      if (user?.uid && profile?.role === "CITIZEN") {
        records = await getUserIncidents(user.uid);
      }
      else {
        records = await getAllIncidents();
      }
      setRawIncidents(records);
      if (records.length > 0) {
        setIncidents(records.map(toDisplayIncident));
      }
      else {
        const saved = localStorage.getItem("beaconmesh-incidents");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setIncidents(parsed.filter(isIncident));
            }
            else {
              setIncidents([]);
            }
          }
          catch {
            setIncidents([]);
          }
        }
        else {
          setIncidents([]);
        }
      }
    }
    catch (e) {
      console.warn("Failed loading incidents from db:", e);
    }
    finally {
      setIncidentsReady(true);
    }
  };
  useEffect(() => {
    const activeRole = path.startsWith("/command")
      ? "COMMAND"
      : path.startsWith("/citizen")
        ? "CITIZEN"
        : path.startsWith("/responder")
          ? "RESPONDER"
          : (profile?.role || "CITIZEN");
    const includeCitizenOwned = Boolean(profile?.capabilities?.includes("CITIZEN"));
    const unsubscribe = subscribeToIncidents({
      role: activeRole,
      userId: user?.uid,
      includeCitizenOwned,
      onUpdate: (records) => {
        setRawIncidents(records);
        if (records.length > 0) {
          setIncidents(records.map(toDisplayIncident));
        }
        else {
          setIncidents([]);
        }
        setIncidentsReady(true);
      },
      onError: (err) => console.warn("Incident subscription notice:", err),
    });
    const savedRole = localStorage.getItem("beaconmesh-role");
    if (savedRole)
      setRole(savedRole);
    const savedSubtype = localStorage.getItem("beaconmesh-responder-type");
    if (savedSubtype)
      setResponderType(savedSubtype);
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [user?.uid, profile?.role, path]);
  useEffect(() => {
    if (incidentsReady) {
      localStorage.setItem("beaconmesh-incidents", JSON.stringify(incidents));
    }
  }, [incidents, incidentsReady]);
  const chooseRole = (next) => {
    setRole(next);
    localStorage.setItem("beaconmesh-role", next);
  };
  const chooseResponderType = (next) => {
    setResponderType(next);
    localStorage.setItem("beaconmesh-responder-type", next);
  };
  if (path === "/" || path === "/about" || path === "/how-it-works")
    return path === "/" ? (<Landing />) : (<>
      <Header landing />
      <main className="min-h-[80svh] px-5 py-12 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="section-kicker">BEACONMESH</p>
          <h1 className="mt-4 font-display text-4xl font-semibold">
            {path === "/about" ? "About the prototype" : "How a message finds its way"}
          </h1>
          <div className="mt-10 max-w-3xl">
            <DashboardContent path={path} role="CITIZEN" incidents={incidents} setIncidents={setIncidents} rawIncidents={rawIncidents} onRefresh={loadIncidents} />
          </div>
        </div>
      </main>
      <footer className="border-t border-border px-5 py-6 text-sm text-muted-foreground sm:px-10">
        BeaconMesh · University prototype
      </footer>
    </>);
  if (["/login", "/signup", "/forgot-password", "/verify"].includes(path))
    return (<>
      <Header previewRole={role} responderType={responderType} onRoleChange={chooseRole} onResponderTypeChange={chooseResponderType} />
      <AuthPage path={path} />
    </>);
  const isPendingRoute = path === "/responder/application-pending";
  const isCitizen = path.startsWith("/citizen");
  const isResponder = path.startsWith("/responder");
  const isCommand = path.startsWith("/command");
  const isWorkspace = isCitizen || isResponder || isCommand;
  // 1. Loading guard for workspace routes
  if (isWorkspace && (authLoading || status === "INITIALIZING" || status === "PROFILE_LOADING")) {
    return (<div className="min-h-screen bg-background text-foreground">
      <Header previewRole={role} responderType={responderType} onRoleChange={chooseRole} onResponderTypeChange={chooseResponderType} />
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-signal border-t-transparent" />
          <p className="text-sm text-muted-foreground">Authenticating workspace...</p>
        </div>
      </div>
    </div>);
  }
  // 2. Unauthenticated user guard (Must precede any authenticated checks)
  if (isWorkspace && !user) {
    return (<div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <Pill tone="signal">Authentication Required</Pill>
          <h2 className="font-display text-2xl font-semibold">Sign in to continue</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You must sign in to access the{" "}
            {isCitizen ? "Citizen" : isResponder ? "Responder" : "Command"} workspace.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild className="w-full">
              <Link to="/login" search={{ redirect: path }}>
                Sign in with credentials
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/signup">Create an account</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground hover:text-foreground">
              <Link to="/">Back to Home Page</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>);
  }
  // 3. Suspended account guard
  if (isWorkspace && user && (status === "SUSPENDED" || profile?.accountStatus === "SUSPENDED")) {
    return (<div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-urgent/40 bg-urgent/10 p-6 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-urgent" />
          <h2 className="font-display text-2xl font-semibold text-urgent">Account Suspended</h2>
          <p className="text-sm leading-relaxed text-foreground">
            Your BeaconMesh account access has been suspended by system operations. Please contact
            an authorized coordinator or administrator for assistance.
          </p>
        </div>
      </div>
    </div>);
  }
  // 4. Unverified email guard
  if (isWorkspace && user && (!user.emailVerified || status === "EMAIL_UNVERIFIED")) {
    return (<div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-signal/40 bg-signal/10 p-6 text-center">
          <Clock className="mx-auto h-12 w-12 text-signal" />
          <h2 className="font-display text-2xl font-semibold">Email Verification Required</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Please verify your email address before accessing the{" "}
            {isCitizen ? "Citizen" : isResponder ? "Responder" : "Command"} workspace.
          </p>
          <Button asChild className="w-full">
            <Link to="/verify" search={{ email: user.email || "" }}>
              Verify email now <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>);
  }
  // Dual-Capability & Pending Status Invariants
  const hasCitizenCapability = Boolean(profile?.capabilities?.includes("CITIZEN") && profile?.citizenEnrollmentStatus === "ACTIVE");
  const hasResponderCapability = Boolean(profile?.capabilities?.includes("RESPONDER") && profile?.approvalStatus === "APPROVED");
  const isPendingResponder = profile?.responderApplicationStatus === "PENDING" ||
    (profile?.requestedRole === "RESPONDER" && profile?.approvalStatus === "PENDING");
  // 5. Dedicated handler for /responder/application-pending
  if (isWorkspace && user && isPendingRoute) {
    if (isPendingResponder) {
      return (<div className="min-h-screen bg-background text-foreground">
        <Header path={path} />
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-signal/40 bg-signal/10 p-6 text-center">
            <Clock className="mx-auto h-12 w-12 text-signal" />
            <Pill tone="signal">Vetting In Progress</Pill>
            <h2 className="font-display text-2xl font-semibold">Responder Application Pending</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your application to join as a{" "}
              <strong>{profile?.requestedResponderSubtype || profile?.responderSubtype || "Volunteer"}</strong> responder has been
              received and is awaiting operational clearance and administrative Command review. Operational tools remain
              locked until approved.
            </p>
            <div className="rounded border border-border bg-background p-3 text-xs text-muted-foreground space-y-1.5 text-left">
              <div className="flex justify-between">
                <span>Application Status:</span>
                <span className="font-semibold text-signal">PENDING REVIEW</span>
              </div>
              <div className="flex justify-between">
                <span>Account Role:</span>
                <span className="font-mono text-foreground">{profile?.role || "CITIZEN"} (Baseline)</span>
              </div>
              <div className="flex justify-between">
                <span>Requested Track:</span>
                <span className="font-mono text-signal">{profile?.requestedResponderSubtype || "VOLUNTEER"}</span>
              </div>
              <div className="flex justify-between">
                <span>Email Verification:</span>
                <span className="font-semibold text-safe">{user.emailVerified ? "VERIFIED" : "PENDING"}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Coordinators will review your application. You will receive an operational clearance notification upon approval.
            </p>
          </div>
        </div>
      </div>);
    }
    else {
      return (<div className="min-h-screen bg-background text-foreground">
        <Header path={path} />
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-safe" />
            <h2 className="font-display text-2xl font-semibold">No Pending Application</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You do not have a pending responder application. Your account is currently active as <strong>{profile?.role}</strong>.
            </p>
            <Button asChild className="w-full">
              <Link to={hasResponderCapability ? "/responder/overview" : "/citizen/home"}>
                Go to your workspace <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>);
    }
  }
  // 6. Citizen Space Access Guard (/citizen/*)
  // Requires: Explicit CITIZEN authorization via role or granted capabilities
  if (isWorkspace && user && isCitizen && profile) {
    const isAuthorized = evaluateRoleAuthorization(profile, "CITIZEN").isAuthorized;
    if (!isAuthorized) {
      return (<div className="min-h-screen bg-background text-foreground">
        <Header path={path} />
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-urgent/30 bg-urgent/10 p-6 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-urgent" />
            <h2 className="font-display text-2xl font-semibold text-urgent">
              Dashboard Access Restricted
            </h2>
            <p className="text-sm leading-relaxed text-foreground">
              You do not have access to this dashboard. Please select an authorized role or contact your administrator.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {profile && evaluateRoleAuthorization(profile, profile.role).isAuthorized && (<Button asChild className="w-full">
                <Link to={WORKSPACE_ROUTES[profile.role]}>
                  Return to {profile.role} Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>)}
              <Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>);
    }
  }
  // 7. Responder Space Access Guard (/responder/*, excluding pending route)
  // Requires: Explicit RESPONDER authorization via approved role or granted capabilities
  if (isWorkspace && user && isResponder && profile && !isPendingRoute) {
    if (isPendingResponder) {
      return (<div className="min-h-screen bg-background text-foreground">
        <Header path={path} />
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-signal/40 bg-signal/10 p-6 text-center">
            <Clock className="mx-auto h-12 w-12 text-signal" />
            <Pill tone="signal">Vetting In Progress</Pill>
            <h2 className="font-display text-2xl font-semibold">Responder Application Pending</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your Responder application is awaiting administrative Command review and operational clearance.
            </p>
            <Button asChild className="w-full">
              <Link to="/responder/application-pending">
                Check Application Status <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>);
    }
    const isAuthorized = evaluateRoleAuthorization(profile, "RESPONDER").isAuthorized;
    if (!isAuthorized) {
      return (<div className="min-h-screen bg-background text-foreground">
        <Header path={path} />
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-urgent/30 bg-urgent/10 p-6 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-urgent" />
            <h2 className="font-display text-2xl font-semibold text-urgent">
              Dashboard Access Restricted
            </h2>
            <p className="text-sm leading-relaxed text-foreground">
              You do not have access to this dashboard. Please select an authorized role or contact your administrator.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {profile && evaluateRoleAuthorization(profile, profile.role).isAuthorized && (<Button asChild className="w-full">
                <Link to={WORKSPACE_ROUTES[profile.role]}>
                  Return to {profile.role} Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>)}
              <Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>);
    }
  }
  // 8. Command Space Access Guard (/command/*)
  // Requires: Explicit COMMAND authorization with valid commandLevel
  if (isWorkspace && user && isCommand && profile) {
    const isCommandAuthorized = evaluateRoleAuthorization(profile, "COMMAND").isAuthorized;
    if (!isCommandAuthorized) {
      return (<div className="min-h-screen bg-background text-foreground">
        <Header path={path} />
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-urgent/30 bg-urgent/10 p-6 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-urgent" />
            <h2 className="font-display text-2xl font-semibold text-urgent">
              Dashboard Access Restricted
            </h2>
            <p className="text-sm leading-relaxed text-foreground">
              You do not have access to this dashboard. Please select an authorized role or contact your administrator.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              {profile && evaluateRoleAuthorization(profile, profile.role).isAuthorized && (<Button asChild className="w-full">
                <Link to={WORKSPACE_ROUTES[profile.role]}>
                  Return to {profile.role} Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>)}
              <Button type="button" variant="outline" className="w-full" onClick={() => void signOut()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>);
    }
  }
  const routeRole = user && profile
    ? isCommand
      ? profile.commandLevel || "COORDINATOR"
      : isResponder
        ? "RESPONDER"
        : isCitizen
          ? "CITIZEN"
          : profile.role === "COMMAND"
            ? profile.commandLevel || "COORDINATOR"
            : profile.role
    : isCitizen
      ? "CITIZEN"
      : isResponder
        ? "RESPONDER"
        : role === "CITIZEN" || role === "RESPONDER"
          ? "COORDINATOR"
          : role;
  const effectiveResponderType = user && profile?.responderSubtype ? profile.responderSubtype : responderType;
  const nav = sections[isCitizen ? "CITIZEN" : isResponder ? "RESPONDER" : "COMMAND"];
  const title = titleMap[path] ?? "Incident details";
  return (<div className="min-h-screen bg-background text-foreground">
    <Header path={path} previewRole={isCitizen ? "CITIZEN" : isResponder ? "RESPONDER" : routeRole} responderType={effectiveResponderType} onRoleChange={chooseRole} onResponderTypeChange={chooseResponderType} />
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1600px]">
      <aside className="hidden w-60 shrink-0 border-r border-border p-4 lg:block">
        <div className="border-b border-border pb-4">
          <Pill tone="signal">{routeRole} SPACE</Pill>
          <p className="mt-3 font-display text-lg font-semibold">
            {isCitizen ? "Citizen" : isResponder ? "Responder" : "Command"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isResponder ? effectiveResponderType.toLowerCase() : routeRole.toLowerCase()}{" "}
            {user ? "active" : "preview"}
          </p>
        </div>
        <nav aria-label={`${nav.title} navigation`} className="mt-4 space-y-1">
          <p className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {nav.title}
          </p>
          {nav.links.map(({ label, href, icon: Icon }) => (<Link key={href} to={href} className={`flex min-h-10 items-center gap-3 px-2 text-sm transition-colors ${path === href ? "bg-signal/10 font-semibold text-signal" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>))}
        </nav>
        <div className="mt-8 border-t border-border pt-4">
          <p className="text-xs leading-5 text-muted-foreground">
            Preview only · no live emergency dispatch
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-7 lg:px-9 lg:pb-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="section-kicker">
                  {isCitizen
                    ? "WORKSPACE: CITIZEN SPACE"
                    : isResponder
                      ? "WORKSPACE: RESPONDER SPACE"
                      : "WORKSPACE: COMMAND"}
                </p>
                {isCitizen || path.endsWith("incidents") ? (user ? (<Pill tone="good">
                  <span className="h-1.5 w-1.5 rounded-full bg-safe" /> LIVE
                </Pill>) : (<Pill tone="warn">DEMO DATA</Pill>)) : path.includes("simulation") || path.endsWith("messages") ? (<Pill tone="signal">SIMULATION</Pill>) : null}
              </div>
              <h1 className="mt-2 font-display text-2xl font-semibold">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone="neutral">
                <span className="h-1.5 w-1.5 rounded-full bg-safe" />
                {user ? "Online · Synced" : "Connectivity · preview"}
              </Pill>
              <NotificationCenter
                notifications={notifications}
                loading={notificationsLoading}
                error={notificationsError}
                isAuthenticated={Boolean(user?.uid)}
                onMarkRead={(id) => user?.uid && markNotificationAsRead(id, user.uid)}
                onMarkAllRead={() => user?.uid && markAllNotificationsAsRead(notifications, user.uid)}
                onRefresh={() => setNotifNonce((n) => n + 1)}
                onSelectIncident={(incidentId) => {
                  const targetPath = isCommand
                    ? "/command/incidents"
                    : isResponder
                      ? "/responder/status"
                      : "/citizen/reports";
                  void navigate({ to: targetPath, search: { incident: incidentId } });
                }}
              />
            </div>
          </div>
          {path.startsWith("/responder/incidents/") ? (<DashboardContent path="/citizen/reports" role={routeRole} incidents={incidents} setIncidents={setIncidents} rawIncidents={rawIncidents} onRefresh={loadIncidents} />) : (<DashboardContent path={path} role={routeRole} incidents={incidents} setIncidents={setIncidents} rawIncidents={rawIncidents} onRefresh={loadIncidents} />)}
        </div>
      </main>
      <nav aria-label="Mobile navigation" className={`fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden ${isCitizen || isResponder ? "grid-cols-4" : "grid-cols-3"} ${!isCitizen && !isResponder ? "grid-rows-2" : "grid-rows-1"}`}>
        {(isCitizen
          ? sections.CITIZEN.links
          : isResponder
            ? sections.RESPONDER.links
            : sections.COMMAND.links).map(({ href, label, icon: Icon }) => (<Link key={href} to={href} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[0.62rem] ${path === href ? "text-signal" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{label}</span>
            </Link>))}
      </nav>
    </div>
  </div>);
}
