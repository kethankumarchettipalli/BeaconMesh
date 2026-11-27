import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  startEmailVerificationRegistration,
  resendVerificationEmailForCurrentUser,
  confirmVerifiedEmailAndRefreshToken,
  applyVerificationOobCode,
  resetPassword,
  setUserPassword,
  checkUserRegistrationStatus,
  formatAuthError,
  logOut,
} from "@/lib/auth-service";
import { createInitialUserProfile } from "@/lib/user-service";
import { fetchInvitationForInvitee, claimInvitationAndCreateProfile } from "@/lib/services/command-service";
import { WORKSPACE_ROUTES, PENDING_RESPONDER_ROUTE } from "@/lib/auth-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Mail,
  Lock,
  User,
  Phone,
  Shield,
  LifeBuoy,
  Radio,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Check,
  Building2,
  MapPin,
  Briefcase,
  Award,
  Clock,
  RefreshCw,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "Email Verification" },
  { id: 2, label: "Profile & Role" },
  { id: 3, label: "Password Setup" },
  { id: 4, label: "Complete Registration" },
];

export function RegistrationWizard() {
  const navigate = useNavigate();
  const { user: currentUser, profile: currentProfile, refreshProfile, isConfigured } = useAuth();
  const searchParams = useRouterState({
    select: (s) => new URLSearchParams(s.location.search),
  });

  const inviteIdParam = searchParams.get("invite");
  const inviteEmailParam = searchParams.get("email");
  const [activeInvitation, setActiveInvitation] = useState(null);
  const [invitationError, setInvitationError] = useState(null);

  // Step indicator state
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Email Verification States
  const [email, setEmail] = useState(() => inviteEmailParam || "");
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifyingLink, setVerifyingLink] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [recoveryOffer, setRecoveryOffer] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  // Step 2: Personal Details & Role States
  const [selectedRole, setSelectedRole] = useState("CITIZEN");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [region, setRegion] = useState("Andhra Pradesh");
  const [district, setDistrict] = useState("Krishna");
  const [city, setCity] = useState("Vijayawada");
  const [responderSubtype, setResponderSubtype] = useState("VOLUNTEER");
  const [requestedUnit, setRequestedUnit] = useState("GENERAL");
  const [organization, setOrganization] = useState("");
  const [designation, setDesignation] = useState("");
  const [experienceYears, setExperienceYears] = useState("1");
  const [credentialsSummary, setCredentialsSummary] = useState("");

  // Step 3: Password States (Ephemeral in memory ONLY)
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 4: Review & Finalize States
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // General Status & Feedback
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [alreadyRegisteredUser, setAlreadyRegisteredUser] = useState(null);

  // Load / Save non-sensitive draft for Step 2
  const draftKey = currentUser?.email
    ? `beaconmesh_registration_draft_${currentUser.email}`
    : null;

  // Restore draft if available
  useEffect(() => {
    if (!draftKey || typeof window === "undefined" || !window.sessionStorage) return;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.fullName) setFullName(draft.fullName);
        if (draft.phoneNumber) setPhoneNumber(draft.phoneNumber);
        if (draft.selectedRole) setSelectedRole(draft.selectedRole);
        if (draft.region) setRegion(draft.region);
        if (draft.district) setDistrict(draft.district);
        if (draft.city) setCity(draft.city);
        if (draft.responderSubtype) setResponderSubtype(draft.responderSubtype);
        if (draft.requestedUnit) setRequestedUnit(draft.requestedUnit);
        if (draft.organization) setOrganization(draft.organization);
        if (draft.designation) setDesignation(draft.designation);
        if (draft.experienceYears) setExperienceYears(draft.experienceYears);
        if (draft.credentialsSummary) setCredentialsSummary(draft.credentialsSummary);
      }
    } catch (e) {
      console.warn("Failed to parse registration draft:", e);
    }
  }, [draftKey]);

  // Persist non-sensitive draft on changes
  useEffect(() => {
    if (!draftKey || typeof window === "undefined" || !window.sessionStorage) return;
    try {
      const draft = {
        fullName,
        phoneNumber,
        selectedRole,
        region,
        district,
        city,
        responderSubtype,
        requestedUnit,
        organization,
        designation,
        experienceYears,
        credentialsSummary,
      };
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
      console.warn("Failed to save registration draft:", e);
    }
  }, [
    draftKey,
    fullName,
    phoneNumber,
    selectedRole,
    region,
    district,
    city,
    responderSubtype,
    requestedUnit,
    organization,
    designation,
    experienceYears,
    credentialsSummary,
  ]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Process incoming Firebase verifyEmail OOB action code if present in URL
  const processedRef = useRef(false);
  useEffect(() => {
    if (processedRef.current) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const oobCode = params.get("oobCode");

    if (mode === "verifyEmail" && oobCode) {
      processedRef.current = true;
      setVerifyingLink(true);
      setError(null);

      applyVerificationOobCode(oobCode)
        .then(async (result) => {
          if (result?.verified && result.user) {
            setSuccessMessage("Email ownership successfully confirmed.");
            const { isRegistered, profile } = await checkUserRegistrationStatus(result.user.uid);
            if (isRegistered && profile) {
              if (profile.accountStatus === "SUSPENDED") {
                await logOut();
                setError("Your account is currently suspended. Please contact operations administration.");
                return;
              }
              setAlreadyRegisteredUser({ user: result.user, profile });
            } else {
              setEmail(result.user.email || "");
              setCurrentStep(2);
            }
          } else {
            setLinkSent(true);
            setError("Email verified, but your active session could not be confirmed. Please click 'I've Verified My Email' or sign in to continue.");
          }
        })
        .catch((err) => {
          console.error("Email verification action code error:", err);
          setError(formatAuthError(err));
        })
        .finally(() => {
          setVerifyingLink(false);
        });
    }
  }, []);

  // Synchronize with Firebase Auth session: resume unverified Step 1 or verified Step 2
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    if (!currentUser.emailVerified) {
      if (currentUser.email && !email) {
        setEmail(currentUser.email);
      }
      setLinkSent(true);
      return;
    }

    confirmVerifiedEmailAndRefreshToken()
      .then(async (result) => {
        if (cancelled) return;
        if (!result.verified || !result.user) {
          setLinkSent(true);
          return;
        }
        const { isRegistered, profile } = await checkUserRegistrationStatus(result.user.uid);
        if (cancelled) return;
        if (isRegistered && profile) {
          if (profile.accountStatus === "SUSPENDED") {
            await logOut();
            setError("Your account is currently suspended. Please contact operations administration.");
            return;
          }
          setAlreadyRegisteredUser({ user: result.user, profile });
        } else if (currentStep === 1) {
          if (result.user.email) setEmail(result.user.email);
          setCurrentStep(2);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("Verification status check failed:", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, currentStep]);

  // Step 1: Create temporary Auth account and send standard verification email
  const handleSendLink = async (e) => {
    e?.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setRecoveryOffer(false);
    setRecoverySent(false);

    if (!isConfigured) {
      setError("Firebase is not configured. Please check your environment variables.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    // Prevent repeated account-creation attempts when an Auth session already exists
    if (auth?.currentUser) {
      if (auth.currentUser.email?.toLowerCase() === trimmedEmail.toLowerCase()) {
        await handleResendVerification();
        return;
      }
      setError("An incomplete registration session is already active. Please restart to use a different email address.");
      return;
    }

    setSendingEmail(true);
    try {
      const result = await startEmailVerificationRegistration(trimmedEmail);
      setLinkSent(true);
      if (result.emailSent) {
        setCooldown(60);
        setSuccessMessage(`Verification email dispatched to ${trimmedEmail}. Please check your inbox.`);
      } else {
        setError(
          "Your verification session was created, but we could not send the email right now. Please click 'Resend verification email' below."
        );
      }
    } catch (err) {
      if (err?.code === "auth/email-already-in-use") {
        setRecoveryOffer(true);
        setError(
          "We could not start a new registration with this email. If you already have an account or started registration earlier, sign in or recover your account below."
        );
      } else {
        setError(formatAuthError(err));
      }
    } finally {
      setSendingEmail(false);
    }
  };

  // Step 1: Explicit Resend Verification Email (cooldown-gated)
  const handleResendVerification = async () => {
    if (cooldown > 0) return;
    setError(null);
    setSuccessMessage(null);
    setSendingEmail(true);
    try {
      await resendVerificationEmailForCurrentUser();
      setLinkSent(true);
      setCooldown(60);
      setSuccessMessage(`Verification email resent to ${auth?.currentUser?.email || email}.`);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSendingEmail(false);
    }
  };

  // Step 1: Confirm email verification via fresh reload() + getIdTokenResult(true)
  const handleCheckVerificationStatus = async () => {
    setError(null);
    setSuccessMessage(null);
    setCheckingStatus(true);
    try {
      const result = await confirmVerifiedEmailAndRefreshToken();
      if (!result.verified || !result.user) {
        setError("Email is not verified yet. Please click the verification link in your inbox, then try again.");
        return;
      }
      const { isRegistered, profile } = await checkUserRegistrationStatus(result.user.uid);
      if (isRegistered && profile) {
        if (profile.accountStatus === "SUSPENDED") {
          await logOut();
          setError("Your account is currently suspended. Please contact operations administration.");
          return;
        }
        setAlreadyRegisteredUser({ user: result.user, profile });
        return;
      }
      setSuccessMessage("Email ownership confirmed.");
      setCurrentStep(2);
    } catch (err) {
      setError(formatAuthError(err) || "Unable to verify email status. Please try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  // Step 1: Deliberate user-triggered password reset recovery for abandoned/existing accounts
  const handleSendRecoveryReset = async () => {
    setError(null);
    setSuccessMessage(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setSendingEmail(true);
    try {
      await resetPassword(trimmedEmail);
      setRecoverySent(true);
      setSuccessMessage(
        "If an account exists for this email, a password reset link has been sent. Reset your password, then sign in to continue."
      );
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSendingEmail(false);
    }
  };

  // When verified & inviteIdParam is present, fetch and validate the invitation
  useEffect(() => {
    if (!inviteIdParam || !currentUser || !currentUser.emailVerified || activeInvitation) return;
    let cancelled = false;
    fetchInvitationForInvitee(inviteIdParam)
      .then((inv) => {
        if (cancelled) return;
        setActiveInvitation(inv);
        setInvitationError(null);
        if (inv.fullName && !fullName) setFullName(inv.fullName);
        if (inv.targetRole === "COMMAND") {
          setSelectedRole("COMMAND");
        } else if (inv.targetRole === "RESPONDER") {
          setSelectedRole("RESPONDER");
          if (inv.targetResponderSubtype) setResponderSubtype(inv.targetResponderSubtype);
          if (inv.targetUnit) setRequestedUnit(inv.targetUnit);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInvitationError(err?.message || "Unable to validate invitation.");
          setError(err?.message || "Unable to validate invitation.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteIdParam, currentUser, activeInvitation]);

  // Step 2: Validate Personal Details & Advance to Step 3
  const handleStep2Submit = (e) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Please provide your full legal name.");
      return;
    }

    if (activeInvitation) {
      if (activeInvitation.targetRole === "RESPONDER") {
        if (!phoneNumber.trim()) {
          setError("A valid operational phone number is required for emergency responder personnel.");
          return;
        }
        if (activeInvitation.targetResponderSubtype === "PROFESSIONAL") {
          if (!organization.trim()) {
            setError("Please specify your emergency response agency or organization.");
            return;
          }
          if (!designation.trim()) {
            setError("Please specify your professional designation or title.");
            return;
          }
        }
      }
      setCurrentStep(3);
      return;
    }

    if (selectedRole === "RESPONDER") {
      if (!phoneNumber.trim()) {
        setError("A valid operational phone number is required for emergency responder applications.");
        return;
      }
      if (!organization.trim()) {
        setError("Please specify your emergency response agency or volunteer organization.");
        return;
      }
      if (!designation.trim()) {
        setError("Please specify your operational role or designation.");
        return;
      }
    }

    setCurrentStep(3);
  };

  // Step 3: Validate Password & Advance to Step 4
  const handleStep3Submit = (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify both fields.");
      return;
    }

    setCurrentStep(4);
  };

  // Step 4: Finalize Registration Commit
  const handleFinalizeSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError("You must agree to the BeaconMesh network prototype terms and privacy policy.");
      return;
    }

    if (!fullName.trim()) {
      setError("Please provide your full legal name.");
      setCurrentStep(2);
      return;
    }

    if (password.length < 8 || password !== confirmPassword) {
      setError("Please set a valid permanent password (at least 8 characters, matching confirmation).");
      setCurrentStep(3);
      return;
    }

    if (!auth || !auth.currentUser) {
      setError("Your authentication session has expired. Please verify your email again.");
      setCurrentStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Confirm fresh Firebase verification state + refreshed JWT claim
      const verification = await confirmVerifiedEmailAndRefreshToken();
      if (!verification.verified || !verification.user) {
        setError("Email verification could not be confirmed. Please complete email verification first.");
        setCurrentStep(1);
        return;
      }

      // 2. Set permanent password on Firebase Auth user account (fail-closed: abort before profile creation)
      try {
        await setUserPassword(password);
      } catch (pwdErr) {
        if (pwdErr?.code === "auth/requires-recent-login") {
          setError(
            "Your registration session needs to be refreshed before setting a permanent password. Please use 'Recover account' on Step 1 or sign in to refresh your session."
          );
          setRecoveryOffer(true);
          return;
        }
        throw pwdErr;
      }

      // 3. Set displayName on Firebase Auth user
      try {
        await updateProfile(verification.user, {
          displayName: fullName.trim(),
        });
      } catch (nameErr) {
        console.warn("Could not set displayName on Auth user:", nameErr);
      }

      // 4. Create initial profile in Cloud Firestore (atomic invitation claim if invited)
      const createdProfile = activeInvitation
        ? await claimInvitationAndCreateProfile(verification.user, activeInvitation, {
            fullName: fullName.trim(),
            phoneNumber: phoneNumber.trim() || undefined,
            region: region.trim(),
            district: district.trim(),
            city: city.trim(),
            organization: organization.trim() || undefined,
            designation: designation.trim() || undefined,
            experienceYears: activeInvitation.targetRole === "RESPONDER" ? Number(experienceYears) || 0 : undefined,
            credentialsSummary: activeInvitation.targetRole === "RESPONDER" ? credentialsSummary.trim() || undefined : undefined,
          })
        : await createInitialUserProfile(verification.user, {
            fullName: fullName.trim(),
            phoneNumber: phoneNumber.trim() || undefined,
            role: selectedRole,
            responderSubtype: selectedRole === "RESPONDER" ? responderSubtype : undefined,
            region: region.trim(),
            district: district.trim(),
            city: city.trim(),
            organization: selectedRole === "RESPONDER" ? organization.trim() : undefined,
            requestedUnit: selectedRole === "RESPONDER" ? requestedUnit : undefined,
            designation: selectedRole === "RESPONDER" ? designation.trim() : undefined,
            experienceYears: selectedRole === "RESPONDER" ? Number(experienceYears) || 0 : undefined,
            credentialsSummary: selectedRole === "RESPONDER" ? credentialsSummary.trim() : undefined,
          });

      if (!createdProfile) {
        throw new Error("Profile creation could not be confirmed.");
      }

      // 5. Clean up session draft & ephemeral password state
      if (draftKey && typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(draftKey);
      }
      setPassword("");
      setConfirmPassword("");

      // 6. Refresh Auth Context and confirm profile before navigating
      await refreshProfile();

      // 7. Clean routing based on created profile
      if (activeInvitation?.targetRole === "COMMAND") {
        void navigate({ to: WORKSPACE_ROUTES.COMMAND || "/command/overview" });
      }
      else if (activeInvitation?.targetRole === "RESPONDER") {
        void navigate({ to: WORKSPACE_ROUTES.RESPONDER || "/responder/overview" });
      }
      else if (selectedRole === "RESPONDER") {
        void navigate({ to: PENDING_RESPONDER_ROUTE });
      } else {
        void navigate({ to: WORKSPACE_ROUTES.CITIZEN || "/citizen/home" });
      }
    } catch (err) {
      console.error("Registration commit failed:", err);
      setError(formatAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign out and restart
  const handleRestart = async () => {
    if (draftKey && typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(draftKey);
    }
    await logOut();
    setCurrentStep(1);
    setLinkSent(false);
    setCooldown(0);
    setRecoveryOffer(false);
    setRecoverySent(false);
    setPassword("");
    setConfirmPassword("");
    setAlreadyRegisteredUser(null);
    setError(null);
    setSuccessMessage(null);
  };

  // Render Already Registered Banner
  if (alreadyRegisteredUser) {
    const userRole = alreadyRegisteredUser.profile?.role || "CITIZEN";
    const dest = WORKSPACE_ROUTES[userRole] || "/citizen/home";
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-safe/30 bg-safe/10 p-6 text-center space-y-4 shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-safe" />
          <div className="space-y-1">
            <h3 className="font-display text-xl font-semibold text-foreground">
              Account Already Registered
            </h3>
            <p className="text-sm text-muted-foreground">
              You are signed in as{" "}
              <strong>{alreadyRegisteredUser.user.email}</strong>. Your profile is already
              established.
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
            <Button type="button" variant="outline" className="w-full" onClick={handleRestart}>
              Sign out to register a new account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progressive Step Indicator */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            return (
              <div key={step.id} className="flex flex-1 items-center">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                      isDone
                        ? "bg-safe text-white"
                        : isCurrent
                        ? "bg-signal text-white ring-4 ring-signal/20"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : step.id}
                  </div>
                  <span
                    className={`mt-1.5 text-[0.68rem] text-center font-medium line-clamp-1 ${
                      isCurrent
                        ? "text-foreground font-semibold"
                        : isDone
                        ? "text-safe"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {step.id < STEPS.length && (
                  <div
                    className={`h-0.5 flex-1 transition-all ${
                      currentStep > step.id ? "bg-safe" : "bg-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-urgent/30 bg-urgent/10 p-3 text-xs text-urgent"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-md border border-safe/30 bg-safe/10 p-3 text-xs text-safe"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 1: EMAIL VERIFICATION */}
      {/* ======================================================== */}
      {currentStep === 1 && (
        <div className="space-y-5">
          {verifyingLink ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-signal" />
              <h3 className="font-display text-lg font-semibold">Validating Verification Link...</h3>
              <p className="text-xs text-muted-foreground">
                Confirming email ownership with Firebase Authentication.
              </p>
            </div>
          ) : !linkSent ? (
            <form onSubmit={handleSendLink} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Email Verification</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  BeaconMesh requires email verification before account configuration to maintain network
                  trust and prevent fraudulent responder applications.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Email address
                  <div className="relative mt-2">
                    <Input
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (recoveryOffer) setRecoveryOffer(false);
                      }}
                      disabled={sendingEmail}
                      className="pl-9"
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </label>
              </div>

              <Button type="submit" disabled={sendingEmail} className="w-full bg-signal hover:bg-signal/90 text-white font-medium">
                {sendingEmail ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending verification email...
                  </>
                ) : (
                  <>
                    Send Verification Email <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>

              {recoveryOffer && (
                <div className="rounded-md border border-border bg-muted/40 p-3.5 space-y-2.5 text-xs">
                  <p className="font-medium text-foreground">Account Recovery &amp; Sign In</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Choose an option to continue with this email address:
                  </p>
                  <div className="flex flex-col gap-2">
                    <Link to="/login" className="w-full">
                      <Button type="button" variant="outline" className="w-full">
                        Sign in to existing account
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSendRecoveryReset}
                      disabled={sendingEmail || recoverySent}
                      className="w-full"
                    >
                      {recoverySent ? "Recovery email sent" : "Recover account (Send password reset email)"}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border border-signal/30 bg-signal/10 p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-signal" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">Check your inbox</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      We sent a standard verification email to:
                    </p>
                    <p className="font-mono text-xs font-semibold text-signal break-all">{email || currentUser?.email}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Next step</p>
                <p className="leading-relaxed">
                  Click the verification link in your email, then click{" "}
                  <strong>I&apos;ve Verified My Email</strong> below to unlock Step 2.
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <Button
                  type="button"
                  onClick={handleCheckVerificationStatus}
                  disabled={checkingStatus || sendingEmail}
                  className="w-full bg-signal hover:bg-signal/90 text-white font-medium"
                >
                  {checkingStatus ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking verification status...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      I&apos;ve Verified My Email
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={cooldown > 0 || sendingEmail}
                  className="w-full"
                >
                  {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend verification email"}
                </Button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    Use a different email address
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 2: PROFILE DETAILS & ROLE SELECTION */}
      {/* ======================================================== */}
      {currentStep === 2 && (
        <form onSubmit={handleStep2Submit} className="space-y-5">
          {/* Verified Email Banner */}
          <div className="flex items-center justify-between rounded-md border border-safe/30 bg-safe/10 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-safe shrink-0" />
              <span className="text-foreground">
                Verified: <strong>{currentUser?.email || email}</strong>
              </span>
            </div>
            <span className="rounded bg-safe/20 px-2 py-0.5 text-[0.65rem] font-semibold text-safe uppercase tracking-wider">
              Verified
            </span>
          </div>

          {/* Account Category Selector (Locked when accepting an Admin Invitation) */}
          {activeInvitation ? (
            <div className="rounded-md border border-signal/30 bg-signal/10 p-3.5 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">Administrator-Authorized Invitation</span>
                <span className="rounded bg-signal/20 px-2 py-0.5 text-[0.65rem] font-semibold text-signal uppercase">
                  {activeInvitation.targetRole === "COMMAND"
                    ? "Command Operations · Coordinator"
                    : `Responder · ${activeInvitation.targetResponderSubtype}`}
                </span>
              </div>
              {activeInvitation.targetRole === "RESPONDER" && (
                <p className="text-muted-foreground">
                  Assigned Operational Unit: <strong className="text-foreground">{activeInvitation.targetUnit}</strong> (locked by Administrator)
                </p>
              )}
              <p className="text-muted-foreground">
                Complete your personal and professional persona details below to activate your account.
              </p>
            </div>
          ) : (
            <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Account Category
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                { role: "CITIZEN", label: "Citizen", icon: LifeBuoy, disabled: false },
                { role: "RESPONDER", label: "Responder", icon: Shield, disabled: false },
                { role: "COMMAND", label: "Command", icon: Radio, disabled: true },
              ].map(({ role, label, icon: Icon, disabled }) => (
                <button
                  key={role}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selectedRole === role}
                  onClick={() => {
                    if (!disabled) {
                      setSelectedRole(role);
                      setError(null);
                    }
                  }}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition-all ${
                    disabled
                      ? "border-border/50 bg-muted/20 text-muted-foreground/50 cursor-not-allowed opacity-60"
                      : selectedRole === role
                      ? "border-signal bg-signal/15 text-foreground shadow-sm ring-1 ring-signal/30"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${disabled ? "text-muted-foreground/40" : "text-signal"}`} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Account Category Notice */}
            <div className="mt-2 rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              {selectedRole === "CITIZEN" && (
                <p>
                  <strong>Citizen Account:</strong> Immediate activation upon completion. Submit distress
                  reports, locate nearby shelters and medical safe zones, and receive regional broadcasts.
                </p>
              )}
              {selectedRole === "RESPONDER" && (
                <p>
                  <strong>Responder Application:</strong> Submits an operational application for vetting.
                  Your account will have restricted capabilities (<code className="font-mono text-[0.7rem]">[]</code>) until
                  reviewed and approved by Operations Command.
                </p>
              )}
            </div>
          </fieldset>
          )}

          {/* Common Personal Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium">
                Full name
                <div className="relative mt-1.5">
                  <Input
                    required
                    autoComplete="name"
                    placeholder="Alex Morgan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-9"
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium">
                Phone number{" "}
                <span className="text-xs text-muted-foreground">
                  {selectedRole === "RESPONDER" ? "(Required for operational dispatch)" : "(Optional)"}
                </span>
                <div className="relative mt-1.5">
                  <Input
                    type="tel"
                    required={selectedRole === "RESPONDER"}
                    placeholder="+91 98765 43210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="pl-9"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </label>
            </div>

            {/* Geographic Coverage */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  State / Region
                  <Input
                    required
                    placeholder="Andhra Pradesh"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  District
                  <Input
                    required
                    placeholder="Krishna"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground">
                  City / Area
                  <Input
                    required
                    placeholder="Vijayawada"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Command Operations Persona Designation (Invitation Mode) */}
          {activeInvitation?.targetRole === "COMMAND" && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <h4 className="text-xs font-semibold text-foreground">Command Operations Persona</h4>
              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Command Designation (Optional)
                  <Input
                    placeholder="e.g., District Operations Coordinator"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="mt-1"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Additional Responder Specific Fields */}
          {selectedRole === "RESPONDER" && (
            <div className="space-y-4 rounded-md border border-signal/30 bg-signal/5 p-4">
              <div className="flex items-center gap-2 border-b border-signal/20 pb-2">
                <Shield className="h-4 w-4 text-signal" />
                <h4 className="text-xs font-semibold text-foreground">Operational Specialization</h4>
              </div>

              {!activeInvitation && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    Responder Subtype
                    <select
                      value={responderSubtype}
                      onChange={(e) => setResponderSubtype(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
                    >
                      <option value="VOLUNTEER">Community Volunteer Responder</option>
                      <option value="PROFESSIONAL">Professional First Responder</option>
                    </select>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    Operational Unit
                    <select
                      value={requestedUnit}
                      onChange={(e) => setRequestedUnit(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
                    >
                      <option value="GENERAL">General Emergency Response</option>
                      <option value="MEDICAL">Emergency Medical Services (EMS)</option>
                      <option value="SEARCH_AND_RESCUE">Search & Rescue (SAR)</option>
                      <option value="FIRE_HAZARD">Fire & Hazardous Materials</option>
                      <option value="LOGISTICS">Evacuation & Supply Logistics</option>
                    </select>
                  </label>
                </div>
              </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    {responderSubtype === "VOLUNTEER" ? "Organization / Community Group (Optional)" : "Agency / Organization Name"}
                    <Input
                      required={responderSubtype !== "VOLUNTEER"}
                      placeholder="e.g. SDRF, Red Cross, Civil Defense"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    {responderSubtype === "VOLUNTEER" ? "Volunteer Designation / Role (Optional)" : "Designation / Title"}
                    <Input
                      required={responderSubtype !== "VOLUNTEER"}
                      placeholder="e.g. Paramedic, Team Lead, Driver"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-foreground">
                    Years of Field Experience
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground">
                  Credentials & Training Summary
                  <textarea
                    rows={2}
                    placeholder="Briefly state certifications (CPR, First Aid, HAZMAT, etc.) or relevant training."
                    value={credentialsSummary}
                    onChange={(e) => setCredentialsSummary(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs text-foreground"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRestart}
              className="text-xs"
            >
              Cancel & Sign Out
            </Button>
            <Button type="submit" className="bg-signal hover:bg-signal/90 text-white font-medium">
              Continue to Password Setup <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* STEP 3: PASSWORD SETUP */}
      {/* ======================================================== */}
      {currentStep === 3 && (
        <form onSubmit={handleStep3Submit} className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Set Account Password</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Create a secure password for your verified BeaconMesh account. This will allow standard
              sign-in across all emergency network consoles.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium">
                New password
                <div className="relative mt-1.5">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 pl-9"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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

              {/* Password Strength Indicator */}
              {(() => {
                const hasMinLen = password.length >= 8;
                const hasUpper = /[A-Z]/.test(password);
                const hasLower = /[a-z]/.test(password);
                const hasNumber = /\d/.test(password);
                const hasSpecial = /[^A-Za-z0-9]/.test(password);
                const score =
                  (hasMinLen ? 1 : 0) +
                  (hasUpper ? 1 : 0) +
                  (hasLower ? 1 : 0) +
                  (hasNumber ? 1 : 0) +
                  (hasSpecial ? 1 : 0);
                const activeBars =
                  password.length === 0 ? 0 : score <= 2 ? 1 : score === 3 ? 2 : score === 4 ? 3 : 4;
                const strengthMeta =
                  password.length === 0
                    ? { label: "Enter a password", textClass: "text-muted-foreground", barClass: "bg-muted" }
                    : score <= 2
                    ? { label: "Weak", textClass: "text-urgent", barClass: "bg-urgent" }
                    : score === 3
                    ? { label: "Fair", textClass: "text-amber-600 dark:text-amber-400", barClass: "bg-amber-500" }
                    : score === 4
                    ? { label: "Good", textClass: "text-signal", barClass: "bg-signal" }
                    : { label: "Strong", textClass: "text-safe", barClass: "bg-safe" };

                return (
                  <div className="mt-2.5 space-y-2" aria-live="polite">
                    <div className="flex items-center justify-between text-[0.7rem]">
                      <span className="text-muted-foreground">Password strength</span>
                      <span className={`font-semibold ${strengthMeta.textClass}`}>
                        {strengthMeta.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5" role="progressbar" aria-valuenow={activeBars} aria-valuemin={0} aria-valuemax={4} aria-label="Password strength">
                      {[1, 2, 3, 4].map((idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full transition-colors ${
                            idx <= activeBars ? strengthMeta.barClass : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-[0.68rem]">
                      {[
                        { ok: hasMinLen, label: "8+ characters" },
                        { ok: hasUpper && hasLower, label: "Upper & lowercase" },
                        { ok: hasNumber, label: "At least 1 number" },
                        { ok: hasSpecial, label: "Special character" },
                      ].map((rule) => (
                        <li
                          key={rule.label}
                          className={`flex items-center gap-1.5 ${
                            rule.ok ? "text-safe font-medium" : "text-muted-foreground"
                          }`}
                        >
                          <Check className={`h-3 w-3 shrink-0 ${rule.ok ? "opacity-100" : "opacity-30"}`} />
                          <span>{rule.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium">
                Confirm password
                <div className="relative mt-1.5">
                  <Input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </label>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="mt-1 text-[0.7rem] text-urgent">Passwords do not match.</p>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-[0.72rem] text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Security Note</p>
            <p>
              Your password remains ephemeral in local memory during this registration process. It is
              never stored in drafts, browser storage, or unencrypted transmissions.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep(2)}
              className="text-xs"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Details
            </Button>
            <Button type="submit" className="bg-signal hover:bg-signal/90 text-white font-medium">
              Review & Finalize <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* STEP 4: REVIEW & FINALIZE */}
      {/* ======================================================== */}
      {currentStep === 4 && (
        <form onSubmit={handleFinalizeSubmit} className="space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Review Registration</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verify your information before creating your official BeaconMesh account.
            </p>
          </div>

          {/* Summary Card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-muted-foreground">Account Type:</span>
              <span className="font-semibold text-foreground">
                {selectedRole === "RESPONDER" ? "Responder Application" : "Citizen"}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-mono text-foreground">{currentUser?.email || email}</span>
            </div>

            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-muted-foreground">Full Name:</span>
              <span className="font-medium text-foreground">{fullName}</span>
            </div>

            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-muted-foreground">Phone:</span>
              <span className="text-foreground">{phoneNumber || "Not provided"}</span>
            </div>

            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="text-muted-foreground">Jurisdiction:</span>
              <span className="text-foreground">{`${city}, ${district}, ${region}`}</span>
            </div>

            {selectedRole === "RESPONDER" && (
              <>
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <span className="text-muted-foreground">Unit & Agency:</span>
                  <span className="text-foreground">{`${requestedUnit} — ${organization}`}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <span className="text-muted-foreground">Operational Standing:</span>
                  <span className="rounded bg-urgent/15 px-2 py-0.5 text-[0.65rem] font-semibold text-urgent uppercase">
                    Pending Command Vetting
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Terms Acceptance */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
              <input
                required
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 rounded border-border"
              />
              <span>
                I agree to the BeaconMesh prototype terms of use, privacy notice, and acknowledge
                that this is an educational demonstration network.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setCurrentStep(3)}
              className="text-xs"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Edit Password
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || !termsAccepted}
              className="bg-signal hover:bg-signal/90 text-white font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : selectedRole === "RESPONDER" ? (
                <>
                  Submit Responder Application <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Complete Registration <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
