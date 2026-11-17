import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Mail,
  Shield,
  LifeBuoy,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  resetPassword,
  resendVerificationEmail,
  completeEmailVerification,
  formatAuthError,
} from "@/lib/auth-service";
import { getUserProfile, createFallbackProfile } from "@/lib/user-service";
import { useAuth } from "@/lib/auth-context";
import {
  type UserRole,
  type ResponderSubtype,
  type UserProfile,
  WORKSPACE_ROUTES,
} from "@/lib/auth-types";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

// ==========================================
// 1. LOGIN FORM
// ==========================================
export function LoginForm() {
  const navigate = useNavigate();
  const { isConfigured, refreshProfile, user: currentUser, profile: currentProfile, signOut } = useAuth();

  const searchParams = useRouterState({
    select: (s) => new URLSearchParams(s.location.search),
  });
  const redirectParam = searchParams.get("redirect");

  // Track if user was already signed in when the page mounted
  const [initialUser] = useState(() => Boolean(currentUser));
  const [loginState, setLoginState] = useState<
    "idle" | "authenticating" | "loading-profile" | "redirecting" | "error"
  >("idle");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [intendedWorkspace, setIntendedWorkspace] = useState<UserRole>("CITIZEN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleMismatch, setRoleMismatch] = useState<{
    actualRole: UserRole;
    profile: UserProfile;
  } | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // ONLY render the "Already Signed In" screen if the user manually navigated to /login
  // with an existing session (NOT during an in-flight login action)
  if (initialUser && currentUser && loginState === "idle") {
    const userRole = currentProfile?.role || "CITIZEN";
    const dest = WORKSPACE_ROUTES[userRole];
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-4 shadow-sm">
          <CheckCircle2 className="mx-auto h-10 w-10 text-safe" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Already Signed In
            </h3>
            <p className="text-xs text-muted-foreground">
              You are currently signed in as <strong>{currentUser.email || currentProfile?.displayName || "User"}</strong> ({userRole}).
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              className="w-full bg-signal hover:bg-signal/90 text-white font-medium"
              onClick={() => void navigate({ to: dest })}
            >
              Continue to {userRole} Workspace <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign out / Use another account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setRoleMismatch(null);
    setUnverifiedEmail(null);

    if (!isConfigured) {
      setError(
        "Firebase is not configured yet. Please add your VITE_FIREBASE_* credentials to .env.local.",
      );
      return;
    }

    setLoginState("authenticating");
    setLoading(true);

    try {
      const user = await loginWithEmail(email, password);

      // Check email verification for email/password credentials
      if (!user.emailVerified) {
        setUnverifiedEmail(user.email || email);
        setLoading(false);
        setLoginState("idle");
        return;
      }

      setLoginState("loading-profile");

      // Retrieve actual profile from Firestore to verify assigned role
      let profile = await getUserProfile(user.uid);

      if (!profile) {
        profile = createFallbackProfile(user);
      }

      if (profile.accountStatus === "SUSPENDED") {
        setError(
          "Your account is currently suspended. Please contact your coordinator or operations command.",
        );
        setLoading(false);
        setLoginState("error");
        return;
      }

      await refreshProfile();

      // Verify intended workspace against the assigned role
      if (profile.role !== intendedWorkspace) {
        setRoleMismatch({
          actualRole: profile.role,
          profile,
        });
        setLoading(false);
        setLoginState("idle");
        return;
      }

      // Check operational responder approval
      if (profile.role === "RESPONDER" && profile.approvalStatus === "PENDING") {
        setLoginState("redirecting");
        void navigate({ to: "/responder/overview" });
        return;
      }

      // Role and workspace matched! Navigate to workspace destination
      let destination = WORKSPACE_ROUTES[profile.role];
      if (redirectParam && redirectParam.startsWith(`/${profile.role.toLowerCase()}`)) {
        destination = redirectParam;
      }
      setLoginState("redirecting");
      void navigate({ to: destination });
    } catch (err) {
      setError(formatAuthError(err));
      setLoginState("error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setRoleMismatch(null);
    setUnverifiedEmail(null);

    if (!isConfigured) {
      setError(
        "Firebase is not configured. Please add your VITE_FIREBASE_* credentials to .env.local.",
      );
      return;
    }

    setLoginState("authenticating");
    setLoading(true);
    try {
      const { profile } = await loginWithGoogle();

      if (profile.accountStatus === "SUSPENDED") {
        setError("Your account is suspended. Contact operations administration.");
        setLoading(false);
        setLoginState("error");
        return;
      }

      setLoginState("loading-profile");
      await refreshProfile();

      // Check role mismatch against chosen workspace
      if (profile.role !== intendedWorkspace) {
        setRoleMismatch({
          actualRole: profile.role,
          profile,
        });
        setLoading(false);
        setLoginState("idle");
        return;
      }

      let destination = WORKSPACE_ROUTES[profile.role];
      if (redirectParam && redirectParam.startsWith(`/${profile.role.toLowerCase()}`)) {
        destination = redirectParam;
      }
      setLoginState("redirecting");
      void navigate({ to: destination });
    } catch (err) {
      setError(formatAuthError(err));
      setLoginState("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intended Workspace Selector */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Intended Destination Workspace
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { role: "CITIZEN", label: "Citizen", icon: LifeBuoy },
              { role: "RESPONDER", label: "Responder", icon: Shield },
              { role: "COMMAND", label: "Command", icon: Radio },
            ] as const
          ).map(({ role, label, icon: Icon }) => (
            <button
              key={role}
              type="button"
              aria-pressed={intendedWorkspace === role}
              onClick={() => {
                setIntendedWorkspace(role);
                setRoleMismatch(null);
              }}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-all ${
                intendedWorkspace === role
                  ? "border-signal bg-signal/15 text-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-signal" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <p className="text-[0.72rem] text-muted-foreground">
          Authorization is strictly derived from your account profile, not this selection.
        </p>
      </fieldset>

      {/* Role Mismatch Notice */}
      {roleMismatch && (
        <div
          role="alert"
          className="rounded-md border border-urgent/30 bg-urgent/10 p-4 text-xs text-foreground"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-urgent" />
            <div className="space-y-2">
              <p className="font-semibold text-urgent">Workspace Authorization Mismatch</p>
              <p className="leading-relaxed">
                You selected the <strong>{intendedWorkspace}</strong> workspace, but your
                authenticated account is assigned to <strong>{roleMismatch.actualRole}</strong>.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const dest = WORKSPACE_ROUTES[roleMismatch.actualRole];
                  void navigate({ to: dest });
                }}
                className="mt-2"
              >
                Go to {roleMismatch.actualRole} workspace{" "}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unverified Email Warning */}
      {unverifiedEmail && (
        <div
          role="alert"
          className="rounded-md border border-signal/40 bg-signal/10 p-4 text-xs text-foreground"
        >
          <div className="flex items-start gap-2.5">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
            <div className="space-y-2">
              <p className="font-semibold text-signal">Email Verification Required</p>
              <p className="leading-relaxed">
                Your email address (<strong>{unverifiedEmail}</strong>) has not been verified yet.
                Protected workspaces require email verification.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/verify",
                    search: { email: unverifiedEmail },
                  })
                }
              >
                Verify email now <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Error Display */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-urgent/30 bg-urgent/10 p-3 text-xs text-urgent"
        >
          {error}
        </div>
      )}

      {/* Main Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">
            Email address
            <Input
              required
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="mt-2"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Password</label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-2">
            <Input
              required
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || (loginState !== "idle" && loginState !== "error")}
          className="w-full bg-signal hover:bg-signal/90 text-white font-medium"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loginState === "loading-profile"
                ? "Loading profile..."
                : loginState === "redirecting"
                  ? "Accessing workspace..."
                  : "Signing in..."}
            </>
          ) : (
            <>
              Sign in to {intendedWorkspace.toLowerCase()} <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative flex items-center justify-center py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative bg-background px-3 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          or continue with
        </span>
      </div>

      {/* Google Sign In */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5"
      >
        {loading && loginState === "authenticating" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            <GoogleIcon />
            <span>Continue with Google</span>
          </>
        )}
      </Button>
    </div>
  );
}

// ==========================================
// 2. SIGNUP FORM
// ==========================================
export function SignupForm() {
  const navigate = useNavigate();
  const { isConfigured, refreshProfile, user: currentUser, profile: currentProfile, signOut } = useAuth();

  const [initialUser] = useState(() => Boolean(currentUser));
  const [signupState, setSignupState] = useState<
    "idle" | "submitting" | "redirecting" | "error"
  >("idle");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("CITIZEN");
  const [responderSubtype, setResponderSubtype] = useState<ResponderSubtype>("VOLUNTEER");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ONLY show already signed in screen if user was already logged in on initial visit
  if (initialUser && currentUser && signupState === "idle") {
    const userRole = currentProfile?.role || "CITIZEN";
    const dest = WORKSPACE_ROUTES[userRole];
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-4 shadow-sm">
          <CheckCircle2 className="mx-auto h-10 w-10 text-safe" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Already Signed In
            </h3>
            <p className="text-xs text-muted-foreground">
              You are signed in as <strong>{currentUser.email || currentProfile?.displayName || "User"}</strong> ({userRole}).
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              className="w-full bg-signal hover:bg-signal/90 text-white font-medium"
              onClick={() => void navigate({ to: dest })}
            >
              Continue to {userRole} Workspace <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign out to register a new account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isConfigured) {
      setError(
        "Firebase is not configured. Please add your VITE_FIREBASE_* credentials to .env.local.",
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    if (!termsAccepted) {
      setError("You must agree to the prototype terms and privacy notice.");
      return;
    }

    if (selectedRole === "COMMAND") {
      setError(
        "Command accounts cannot be created publicly. They must be provisioned by an administrator.",
      );
      return;
    }

    setSignupState("submitting");
    setLoading(true);

    try {
      await registerWithEmail({
        fullName,
        email,
        password,
        phoneNumber: phoneNumber || undefined,
        role: selectedRole,
        responderSubtype: selectedRole === "RESPONDER" ? responderSubtype : undefined,
      });

      setSignupState("redirecting");
      // Direct navigation to verification page without flashing intermediate screens
      void navigate({
        to: "/verify",
        search: { email },
      });
    } catch (err) {
      setError(formatAuthError(err));
      setSignupState("error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    if (!isConfigured) {
      setError("Firebase is not configured.");
      return;
    }

    setSignupState("submitting");
    setLoading(true);
    try {
      const { profile } = await loginWithGoogle();
      await refreshProfile();
      setSignupState("redirecting");
      void navigate({ to: WORKSPACE_ROUTES[profile.role] });
    } catch (err) {
      setError(formatAuthError(err));
      setSignupState("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Type Selector */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Select Account Category
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { role: "CITIZEN", label: "Citizen", icon: LifeBuoy },
              { role: "RESPONDER", label: "Responder", icon: Shield },
              { role: "COMMAND", label: "Command", icon: Radio },
            ] as const
          ).map(({ role, label, icon: Icon }) => (
            <button
              key={role}
              type="button"
              aria-pressed={selectedRole === role}
              onClick={() => {
                setSelectedRole(role);
                setError(null);
              }}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-all ${
                selectedRole === role
                  ? "border-signal bg-signal/15 text-foreground shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-signal" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Dynamic Category Description */}
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          {selectedRole === "CITIZEN" && (
            <p>
              <strong>Citizen:</strong> Open registration. Submit distress reports, view local safe
              zones, and track emergency updates.
            </p>
          )}
          {selectedRole === "RESPONDER" && (
            <div className="space-y-2">
              <p>
                <strong>Responder Application:</strong> Registration submits an application for
                operational vetting. Pending administrative review, access remains restricted.
              </p>
              <div className="pt-1">
                <label className="block text-xs font-semibold text-foreground">
                  Responder Subtype
                  <select
                    value={responderSubtype || "VOLUNTEER"}
                    onChange={(e) => setResponderSubtype(e.target.value as ResponderSubtype)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
                  >
                    <option value="PROFESSIONAL">Professional First Responder</option>
                    <option value="VOLUNTEER">Community Volunteer Responder</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          {selectedRole === "COMMAND" && (
            <div className="space-y-2 text-urgent">
              <p className="font-semibold">Notice: Restricted Account Category</p>
              <p>
                Command access cannot be self-registered. Command accounts are provisioned
                exclusively by authorized operations coordinators.
              </p>
            </div>
          )}
        </div>
      </fieldset>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-urgent/30 bg-urgent/10 p-3 text-xs text-urgent"
        >
          {error}
        </div>
      )}

      {/* Signup Form */}
      {selectedRole !== "COMMAND" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">
              Full name
              <Input
                required
                autoComplete="name"
                placeholder="Alex Morgan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                className="mt-2"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium">
              Email address
              <Input
                required
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="mt-2"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">
                Password
                <div className="relative mt-2">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium">
                Confirm password
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="mt-2"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">
              Phone number <span className="text-xs text-muted-foreground">(Optional)</span>
              <Input
                type="tel"
                placeholder="+1 (555) 012-3456"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading}
                className="mt-2"
              />
            </label>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Optional contact information. Phone verification is not active.
            </p>
          </div>

          <div>
            <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input
                required
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <span>
                I agree to the BeaconMesh prototype terms of use, privacy policy, and acknowledge
                this is an educational demonstration network.
              </span>
            </label>
          </div>

          <Button
            type="submit"
            disabled={loading || (signupState !== "idle" && signupState !== "error")}
            className="w-full bg-signal hover:bg-signal/90 text-white font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {signupState === "redirecting" ? "Preparing verification..." : "Creating account..."}
              </>
            ) : selectedRole === "RESPONDER" ? (
              <>
                Submit responder application <ArrowRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Create citizen account <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      ) : (
        <div className="space-y-4 rounded-md border border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">
            If you represent an emergency response agency and require Command credentials, please
            contact your regional coordinator.
          </p>
          <Button asChild variant="outline">
            <Link to="/login">Return to Sign In</Link>
          </Button>
        </div>
      )}

      {/* Divider */}
      <div className="relative flex items-center justify-center py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative bg-background px-3 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          or continue with
        </span>
      </div>

      {/* Google Sign In */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5"
      >
        {loading && signupState === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            <GoogleIcon />
            <span>Continue with Google</span>
          </>
        )}
      </Button>
    </div>
  );
}

// ==========================================
// 3. VERIFY EMAIL FORM
// ==========================================
export function VerifyEmailForm() {
  const navigate = useNavigate();
  const { user, reloadUser, profile, isConfigured, signOut } = useAuth();
  const searchParams = useRouterState({
    select: (s) => new URLSearchParams(s.location.search),
  });

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");
  const emailParam = searchParams.get("email");

  const [verifyingLink, setVerifyingLink] = useState(Boolean(mode === "verifyEmail" && oobCode));
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);

  const displayEmail = emailParam || user?.email || "your registered email address";

  // Handle Action Code if present in URL
  useEffect(() => {
    if (mode === "verifyEmail" && oobCode) {
      let isMounted = true;
      setVerifyingLink(true);
      completeEmailVerification(oobCode)
        .then(() => {
          if (isMounted) {
            setVerificationSuccess(true);
            setVerifyingLink(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(formatAuthError(err));
            setVerifyingLink(false);
          }
        });
      return () => {
        isMounted = false;
      };
    }
  }, [mode, oobCode]);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setResendStatus(null);
    try {
      await resendVerificationEmail();
      setResendStatus("A fresh verification email has been sent. Please check your inbox.");
      setCooldown(60);
    } catch (err) {
      setError(formatAuthError(err));
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    setError(null);
    try {
      const isVerified = await reloadUser();
      if (isVerified) {
        setVerificationSuccess(true);
      } else {
        setError(
          "Your email address has not yet been verified. Please open the verification link sent to your inbox first, then click Check verification status.",
        );
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setChecking(false);
    }
  };

  if (verifyingLink) {
    return (
      <div className="space-y-4 py-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-signal" />
        <h2 className="font-display text-xl font-semibold">Validating Verification Link...</h2>
        <p className="text-sm text-muted-foreground">
          Confirming your email with Firebase Authentication security servers.
        </p>
      </div>
    );
  }

  if (verificationSuccess) {
    const destination = profile ? WORKSPACE_ROUTES[profile.role] : "/citizen/home";
    return (
      <div className="space-y-5 py-4">
        <div className="rounded-lg border border-safe/30 bg-safe/10 p-6 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-12 w-12 text-safe" />
          <h2 className="font-display text-xl font-semibold text-safe">
            Email Verified Successfully!
          </h2>
          <p className="text-sm text-foreground leading-relaxed">
            Your BeaconMesh account is now verified and active. You have full access to your designated workspace.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => {
            void navigate({ to: destination });
          }}
          className="w-full bg-signal hover:bg-signal/90 text-white font-medium"
        >
          Continue to workspace <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-signal/30 bg-signal/10 p-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-signal" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Check your inbox</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We sent a verification link to:
            </p>
            <p className="font-mono text-xs font-semibold text-signal break-all">{displayEmail}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed sm:text-sm">
        Please check your email and click the verification link. Once verified, click the button
        below to enter your workspace.
      </p>

      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Can't find the email?</p>
        <p className="leading-relaxed">
          Be sure to check your <strong>spam or junk folder</strong>. If you still don't see it,
          you can request a new link using the button below.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-urgent/30 bg-urgent/10 p-3 text-xs text-urgent"
        >
          {error}
        </div>
      )}

      {resendStatus && (
        <div
          role="status"
          className="rounded-md border border-safe/30 bg-safe/10 p-3 text-xs text-safe"
        >
          {resendStatus}
        </div>
      )}

      <div className="space-y-3 pt-1">
        <Button
          type="button"
          onClick={handleCheckVerified}
          disabled={checking}
          className="w-full justify-center bg-signal hover:bg-signal/90 text-white font-medium"
        >
          {checking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking verification...
            </>
          ) : (
            <>
              Check verification status <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="w-full"
        >
          {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend verification email"}
        </Button>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={async () => {
              await signOut();
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Need to change email? Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. FORGOT PASSWORD FORM
// ==========================================
export function ForgotPasswordForm() {
  const { isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isConfigured) {
      setError("Firebase is not configured.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email);
      // Privacy-conscious: always show success message, avoiding account enumeration
      setSubmitted(true);
    } catch (err) {
      // Firebase throws if email format is invalid
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-5">
        <div className="rounded-md border border-safe/30 bg-safe/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-safe" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-safe">Password Reset Email Dispatched</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If an account exists for <strong>{email}</strong>, password reset instructions have
                been sent. Follow the link in the message to select a new password.
              </p>
            </div>
          </div>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Return to Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-urgent/30 bg-urgent/10 p-3 text-xs text-urgent"
        >
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium">
          Email address
          <Input
            required
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="mt-2"
          />
        </label>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending instructions...
          </>
        ) : (
          <>
            Send reset instructions <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
