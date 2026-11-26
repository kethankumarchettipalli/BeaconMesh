import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, Bell, CircleHelp, Compass, Cross, Flame, HeartPulse, Home, LifeBuoy, Map, MapPin, Moon, Network, Radio, Search, Settings, Shield, Sun, Users, Waves, X, LogOut, ShieldAlert, Clock, CheckCircle2, UserCheck, UserX, AlertCircle, RefreshCw, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import beaconIcon from "@/assets/beacon-network-icon.png.asset.json";
import beaconWordmark from "@/assets/beaconmesh-wordmark.png.asset.json";
import heroImage from "@/assets/beaconmesh-hero.jpg";
import { useAuth, evaluateRoleAuthorization } from "@/lib/auth-context";
import { LoginForm, SignupForm, VerifyEmailForm, ForgotPasswordForm } from "./auth-forms";
import { RegistrationWizard } from "./registration-wizard";
import { HeroCinematicAnimation } from "./hero-cinematic-animation";
import { WORKSPACE_ROUTES } from "@/lib/auth-types";
import { createEmergencyReport, getUserIncidents, getAllIncidents, updateIncidentStatus, assignIncidentToResponder, subscribeToIncidents, } from "@/lib/services/incident-service";
import { createAndVerifySafeZone, subscribeToSafeZones, } from "@/lib/services/safezone-service";
import { getResponderProfile, setResponderAvailability, } from "@/lib/services/responder-service";
import { computeIncidentAggregates, getOperationalUserDirectory, fetchPendingResponderApplications, approveResponderApplication, rejectResponderApplication, } from "@/lib/services/command-service";
import { initAutoSync } from "@/lib/services/sync-service";
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
    assignedResponderIds: rec.assignedResponderIds || [],
    syncStatus: rec.syncStatus,
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
  const statusTone = incident.status === "Acknowledged" || incident.status === "Resolved"
    ? "good"
    : incident.status === "Waiting for connection"
      ? "warn"
      : "signal";
  return (<button type="button" onClick={() => onOpen(incident)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-4 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-signal">{incident.id}</span>
        <Pill tone={incident.priority === "Critical" ? "warn" : "neutral"}>
          {incident.priority}
        </Pill>
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
  const [selected, setSelected] = useState(null);
  const [available, setAvailable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationLabel, setLocationLabel] = useState("Location coordinates unconfirmed");
  const [manualAddress, setManualAddress] = useState("");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [safeZones, setSafeZones] = useState([]);
  const [operationalUsers, setOperationalUsers] = useState([]);
  const [pendingApplications, setPendingApplications] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [usersTab, setUsersTab] = useState("directory");
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
      const [users, apps] = await Promise.all([
        getOperationalUserDirectory(),
        fetchPendingResponderApplications(),
      ]);
      if (users && users.length > 0)
        setOperationalUsers(users);
      setPendingApplications(apps || []);
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
    getOperationalUserDirectory()
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
    if (user?.uid) {
      getResponderProfile(user.uid)
        .then((resp) => {
          if (mounted && resp)
            setAvailable(resp.isAvailable);
        })
        .catch((err) => console.warn("Responder profile load failed:", err));
    }
    return () => {
      mounted = false;
      if (typeof unsubSafeZones === "function") {
        unsubSafeZones();
      }
    };
  }, [user?.uid]);
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
    if (!description.trim()) {
      setMessage("Please enter a short description of what happened.");
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
      const syncStatusText = record.syncStatus === "SYNCED"
        ? "synced to Cloud"
        : record.syncStatus === "PENDING_SYNC"
          ? "queued for Cloud sync"
          : "stored locally on device (offline)";
      setMessage(`Report ${record.id} registered (${syncStatusText}).`);
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
  const setStatus = async (status) => {
    if (!selected)
      return;
    let canonicalStatus = "Waiting for connection";
    if (status.includes("Acknowledged"))
      canonicalStatus = "Acknowledged";
    else if (status.includes("progress"))
      canonicalStatus = "In progress";
    else if (status.includes("Resolved"))
      canonicalStatus = "Resolved";
    else if (status.includes("Saved"))
      canonicalStatus = "Saved on device";
    try {
      await updateIncidentStatus(selected.id, canonicalStatus, undefined, user?.uid || "operator");
      setIncidents(incidents.map((item) => (item.id === selected.id ? { ...item, status } : item)));
      setSelected({ ...selected, status });
      setMessage(`${selected.id} updated to ${status}.`);
      if (onRefresh)
        onRefresh();
    }
    catch {
      setIncidents(incidents.map((item) => (item.id === selected.id ? { ...item, status } : item)));
      setSelected({ ...selected, status });
      setMessage(`${selected.id} updated locally.`);
    }
  };
  const handleAssignResponder = async (responderId, responderName) => {
    if (!selected)
      return;
    try {
      await assignIncidentToResponder(selected.id, responderId, responderName, user?.uid || "command-coordinator");
      setIncidents(incidents.map((item) => item.id === selected.id
        ? { ...item, status: "Acknowledged", assignedResponderIds: [responderId] }
        : item));
      setSelected({
        ...selected,
        status: "Acknowledged",
        assignedResponderIds: [responderId],
      });
      setMessage(`Assigned ${selected.id} to ${responderName}.`);
      if (onRefresh)
        onRefresh();
    }
    catch (err) {
      setMessage(`Failed to assign responder: ${err.message}`);
    }
  };
  const toggleAvailability = async () => {
    const nextVal = !available;
    setAvailable(nextVal);
    if (user?.uid) {
      try {
        await setResponderAvailability(user.uid, nextVal);
      }
      catch (e) {
        console.warn("Failed to sync responder availability:", e);
      }
    }
    setMessage(`Responder availability set to ${nextVal ? "Available" : "Unavailable"}.`);
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
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} responders={operationalUsers} isCommand={command} />)}
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
              <option>Acknowledged</option>
              <option>In progress</option>
              <option>Waiting for connection</option>
              <option>Resolved</option>
              <option>Saved on device</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mt-2">
        {visibleIncidents.length ? (visibleIncidents.map((incident) => (<IncidentRow key={incident.id} incident={incident} onOpen={setSelected} />))) : (<p className="py-10 text-center text-sm text-muted-foreground">No matching reports found.</p>)}
      </div>
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} responders={operationalUsers} isCommand={command} />)}
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
  if (path.endsWith("/status"))
    return (<div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div>
            <p className="text-sm text-muted-foreground">Availability</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              {available ? "Available for assignments" : "Unavailable"}
            </h2>
          </div>
          <Button variant={available ? "outline" : "default"} onClick={toggleAvailability}>
            {available ? "Set unavailable" : "Set available"}
          </Button>
        </div>
        {[
          "Travelling to incident",
          "Arrived at scene",
          "Assistance in progress",
          "Resolved / completed",
        ].map((status, i) => (<button key={status} onClick={() => setMessage(`Status set to “${status}”.`)} className="flex w-full items-center gap-4 border-b border-border py-5 text-left">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${i === 0 ? "bg-signal/15 text-signal" : "bg-muted text-muted-foreground"}`}>
            {i + 1}
          </span>
          <span className="text-sm font-semibold">{status}</span>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>))}
        <Textarea placeholder="Add an operation note…" className="mt-5" />
        <Button className="mt-3" onClick={() => setMessage("Field note added to operation timeline.")}>
          Add field note
        </Button>
        <p role="status" className="mt-3 text-sm text-safe">
          {message}
        </p>
      </section>
      <div className="border-l border-border pl-5">
        <p className="section-kicker">STATUS HISTORY</p>
        <p className="mt-4 text-sm">{available ? "Available" : "Unavailable"} · Updated</p>
        <p className="mt-2 text-xs text-muted-foreground">Operation activity · Vijayawada Sector</p>
      </div>
    </div>);
  if (path.endsWith("/simulation"))
    return (<div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pill tone="signal">
          <Network /> SIMULATION
        </Pill>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Choose simulation scenario" value={activeScenario} onChange={(e) => {
            setActiveScenario(e.target.value);
            setPlaying(false);
          }} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {[
              "Normal connectivity",
              "Internet unavailable",
              "Dense network",
              "Network partition",
              "Data Mule",
              "Duplicate messages",
            ].map((s) => (<option key={s}>{s}</option>))}
          </select>
          <Button variant="outline" onClick={() => setPlaying(!playing)}>
            {playing ? "Pause" : "Play"}
          </Button>
          <Button variant="outline" onClick={() => setMessage("Simulation advanced one step.")}>
            Step
          </Button>
          <Button variant="ghost" onClick={() => {
            setPlaying(false);
            setMessage("Simulation reset.");
          }}>
            Reset
          </Button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="simulation-board relative min-h-[420px] overflow-hidden border border-border">
          <div className="absolute inset-0 simulation-grid" />
          {[
            { x: "15%", y: "27%", t: "Citizen", i: LifeBuoy },
            { x: "38%", y: "54%", t: "Relay", i: Network },
            { x: "62%", y: "25%", t: "Data mule", i: Compass },
            { x: "81%", y: "61%", t: "Gateway", i: Radio },
            { x: "27%", y: "78%", t: "Relay", i: Network },
          ].map(({ x, y, t, i: Icon }) => (<div key={`${x}${y}`} className={`node ${playing ? "node-active" : ""}`} style={{ left: x, top: y }}>
            <span className="node-dot">
              <Icon />
            </span>
            <span className="node-label">{t}</span>
          </div>))}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 15 27 L 38 54 L 62 25 L 81 61 M 15 27 L 27 78 L 38 54" className="network-line" />
          </svg>
          <span className="absolute bottom-3 left-3 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">
            Scenario: {activeScenario}
          </span>
        </div>
        <aside>
          <p className="section-kicker">NODE TYPES</p>
          <div className="mt-2 space-y-1">
            {["Citizen node", "Relay node", "Data mule node", "Gateway node"].map((t) => (<p key={t} className="border-b border-border py-3 text-sm">
              {t}
            </p>))}
          </div>
          <div className="mt-6">
            <p className="section-kicker">EVENT LOG</p>
            <p className="mt-3 text-sm">{message || "Awaiting simulation events…"}</p>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              MSG-SIM-014 · 2 hops · TTL 18
            </p>
          </div>
          <Button className="mt-5 w-full" onClick={() => setMessage("Simulation message injected: MSG-SIM-015.")}>
            Inject simulation message
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Educational visual demo only. No Bluetooth, radio, satellite, or drone connection is
            implemented.
          </p>
        </aside>
      </div>
    </div>);
  if (path.endsWith("/messages"))
    return (<section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <Pill tone="signal">
            <Network /> SIMULATION
          </Pill>
          <h2 className="mt-3 font-display text-2xl font-semibold">Simulated message activity</h2>
        </div>
        <label>
          <span className="sr-only">Filter messages</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option>All</option>
            <option>Delivered</option>
            <option>Forwarded</option>
            <option>Expired</option>
          </select>
        </label>
      </div>
      <div className="mt-3">
        {[
          {
            id: "MSG-SIM-014",
            from: "CIT-04",
            to: "Gateway A",
            state: "Delivered",
            hops: "2 hops",
          },
          {
            id: "MSG-SIM-012",
            from: "CIT-02",
            to: "Relay 03",
            state: "Forwarded",
            hops: "1 hop",
          },
          { id: "MSG-SIM-009", from: "CIT-01", to: "Expired", state: "Expired", hops: "5 hops" },
        ]
          .filter((m) => filter === "All" || m.state === filter)
          .map((m) => (<div key={m.id} className="grid grid-cols-2 gap-2 border-b border-border py-4 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
            <span className="font-mono text-xs text-signal">{m.id}</span>
            <span className="text-sm">
              {m.from} → {m.to}
            </span>
            <span className="text-sm text-muted-foreground">{m.hops}</span>
            <Pill tone={m.state === "Delivered" ? "good" : "neutral"}>
              SIMULATION · {m.state}
            </Pill>
          </div>))}
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        Simulation messages and gateway deliveries are separate from citizen incident records.
      </p>
    </section>);
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
      <div className="flex border-b border-border" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={usersTab === "directory"}
          onClick={() => setUsersTab("directory")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${usersTab === "directory"
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${usersTab === "applications"
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
            {(operationalUsers.length > 0
              ? operationalUsers
              : [
                {
                  uid: "u-1",
                  displayName: "Citizen User",
                  role: "CITIZEN",
                  status: "ACTIVE",
                },
                {
                  uid: "u-2",
                  displayName: "NTR District First Responder",
                  role: "RESPONDER",
                  responderSubtype: "PROFESSIONAL",
                  status: "ACTIVE",
                },
                {
                  uid: "u-3",
                  displayName: "AP Volunteer Rescue",
                  role: "RESPONDER",
                  responderSubtype: "VOLUNTEER",
                  status: "ACTIVE",
                },
                {
                  uid: "u-4",
                  displayName: "VMC Incident Coordinator",
                  role: "COORDINATOR",
                  status: "ACTIVE",
                },
                {
                  uid: "u-5",
                  displayName: "State Disaster Admin",
                  role: "ADMINISTRATOR",
                  status: "ACTIVE",
                },
              ]).map((u) => (
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
                  <Pill tone={u.status === "ACTIVE" ? "good" : "warn"}>{u.status}</Pill>
                  {role === "ADMINISTRATOR" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMessage(`${u.displayName} account controls opened.`)}
                    >
                      Manage
                    </Button>
                  ) : (
                    <span className="hidden text-xs text-muted-foreground sm:block">Read-only</span>
                  )}
                </div>
              ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Coordinator view is read-only. Administrator has authorization to manage roles and assignments.
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

      <p role="status" className="mt-2 text-sm text-safe">
        {message}
      </p>
    </section>);
  if (role === "RESPONDER") {
    const assignedToMe = (rawIncidents || []).filter((i) => (user?.uid && (i.assignedResponderIds?.includes(user.uid) || i.assignedResponderId === user.uid)));
    const displayQueue = assignedToMe.length > 0 ? assignedToMe.map(toDisplayIncident) : incidents;
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
          <Button className="mt-4" onClick={async () => {
            if (displayQueue[0]) {
              await setStatus("In progress");
              setMessage(`Travelling status confirmed for ${displayQueue[0].id}.`);
            }
            else {
              setMessage("Travelling status logged in local operation log.");
            }
          }}>
            Mark travelling
          </Button>
          {message && (<p role="status" className="mt-3 text-sm text-safe">
            {message}
          </p>)}
        </div>
      </div>
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} responders={operationalUsers} isCommand={false} />)}
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
      {selected && (<IncidentDialog incident={selected} onClose={() => setSelected(null)} onStatus={setStatus} onAssign={handleAssignResponder} responders={operationalUsers} isCommand={true} />)}
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
function IncidentDialog({ incident, onClose, onStatus, onAssign, responders = [], isCommand = false, }) {
  const [selectedResponder, setSelectedResponder] = useState("");
  return (<div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(e) => {
    if (e.target === e.currentTarget)
      onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="incident-title" className="w-full max-w-xl border border-border bg-background p-5 shadow-xl sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="signal">{incident.priority} PRIORITY</Pill>
            {incident.syncStatus && (<Pill tone={incident.syncStatus === "SYNCED" ? "good" : "neutral"}>
              {incident.syncStatus}
            </Pill>)}
          </div>
          <h2 id="incident-title" className="mt-3 font-display text-xl font-semibold">
            {incident.id} · {incident.type}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {incident.place} · {incident.time}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close incident details" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="my-5 border-y border-border py-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Incident details & timeline</p>
        {incident.description && (<p className="mt-2 text-sm italic text-foreground">"{incident.description}"</p>)}
        <p className="mt-3 text-sm">Report created · {incident.time}</p>
        <p className="mt-1 text-sm">Current status · <span className="font-semibold">{incident.status}</span></p>
        {incident.assignedResponderIds && incident.assignedResponderIds.length > 0 && (<p className="mt-1 text-xs text-muted-foreground">
          Assigned units: {incident.assignedResponderIds.join(", ")}
        </p>)}
      </div>

      {isCommand && responders.length > 0 && (<div className="mb-5 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Assign Field Unit</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Select responder to assign" value={selectedResponder} onChange={(e) => setSelectedResponder(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs flex-1 min-w-[200px]">
            <option value="">-- Choose Field Responder --</option>
            {responders
              .filter((r) => r.role.toLowerCase().includes("responder"))
              .map((r) => (<option key={r.uid} value={r.uid}>
                {r.displayName} ({r.role})
              </option>))}
          </select>
          <Button size="sm" disabled={!selectedResponder} onClick={() => {
            const target = responders.find((r) => r.uid === selectedResponder);
            if (target && onAssign)
              onAssign(target.uid, target.displayName);
          }}>
            Dispatch Unit
          </Button>
        </div>
      </div>)}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onStatus("Acknowledged")}>
          Acknowledge
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("In progress")}>
          Mark in progress
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("Resolved")}>
          Resolve
        </Button>
      </div>
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
  const { user, profile, status, loading: authLoading, signOut } = useAuth();
  const [role, setRole] = useState("CITIZEN");
  const [incidents, setIncidents] = useState(initialIncidents);
  const [rawIncidents, setRawIncidents] = useState([]);
  const [incidentsReady, setIncidentsReady] = useState(false);
  const [responderType, setResponderType] = useState("PROFESSIONAL");
  const [demoPreviewActive, setDemoPreviewActive] = useState(false);
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
    const activeRole = profile?.role ||
      (path.startsWith("/command") ? "COMMAND" : path.startsWith("/responder") ? "RESPONDER" : "CITIZEN");
    const unsubscribe = subscribeToIncidents({
      role: activeRole,
      userId: user?.uid,
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
              <Button variant="ghost" size="icon" aria-label="Notifications" title="Notifications" onClick={() => window.alert("No new preview notifications.")}>
                <Bell />
              </Button>
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
