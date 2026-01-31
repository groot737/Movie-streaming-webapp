import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

const fetchApiJson = async (path, options = {}) => {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data;
};

function InviteListPage({ code = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [acceptMessage, setAcceptMessage] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("signin");

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (data?.user) {
          setCurrentUser(data.user);
        }
      } catch (err) {
        // Ignore session errors.
      }
    };
    fetchSession();
  }, []);

  useEffect(() => {
    const normalized = (code || "").trim();
    if (!normalized) {
      setError("Missing invite code.");
      setLoading(false);
      return;
    }
    let active = true;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_BASE}/api/lists/share/${encodeURIComponent(normalized)}`
        );
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setError(data?.message || "Unable to load invite.");
          setList(null);
          setItems([]);
          return;
        }
        setList(data?.list || null);
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (!active) return;
        setError("Network error. Please try again.");
        setList(null);
        setItems([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [code]);

  const handleAccept = async () => {
    setAcceptError("");
    setAcceptMessage("");
    if (!currentUser) {
      setAuthMode("signin");
      setShowAuthModal(true);
      return;
    }
    setAcceptLoading(true);
    try {
      const data = await fetchApiJson("/api/lists/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareCode: (code || "").trim().toUpperCase() }),
      });
      if (data?.ok) {
        setAcceptMessage("Invite accepted. The list is now in your account.");
        setAcceptError("");
        setTimeout(() => {
          window.location.hash = "#account?tab=lists";
        }, 800);
      }
    } catch (err) {
      setAcceptError(err.message || "Unable to accept invite.");
    } finally {
      setAcceptLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/30">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-900/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-slate-800/10 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              G
            </div>
            <span className="font-semibold tracking-tight text-slate-100">Giostream</span>
          </div>
          <a
            href="#browse"
            className="group flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800 text-sm font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-all active:scale-95"
          >
            <span>Back to Browse</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </header>

      <main className="relative z-10 pt-24 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-2xl shadow-black/40">
            {loading ? (
              <div className="text-sm text-slate-400">Loading invite...</div>
            ) : error ? (
              <div className="text-sm text-rose-300">{error}</div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Invite to collaborate
                  </div>
                  <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight">
                    {list?.name || "Shared list"}
                  </h1>
                  <div className="mt-4 flex items-center gap-3 text-sm text-slate-400">
                    <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                      {list?.owner?.avatar ? (
                        <img
                          src={list.owner.avatar}
                          alt={`${list?.owner?.username || "User"} avatar`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-slate-300">
                          {list?.owner?.username?.slice(0, 2).toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      Invited by{" "}
                      <span className="text-slate-200 font-medium">
                        {list?.owner?.username || "Unknown"}
                      </span>
                    </div>
                    <span className="text-slate-700">•</span>
                    <div>{items.length} titles</div>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-3">
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={acceptLoading}
                    className="px-5 py-3 rounded-xl bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition disabled:opacity-60"
                  >
                    {acceptLoading ? "Accepting..." : "Accept invite"}
                  </button>
                  {acceptMessage && (
                    <div className="text-xs text-emerald-300">{acceptMessage}</div>
                  )}
                  {acceptError && (
                    <div className="text-xs text-rose-300">{acceptError}</div>
                  )}
                </div>
              </div>
            )}
          </section>

          {!loading && !error && (
            <section className="mt-8">
              {items.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                  {items.map((movie) => (
                    <div
                      key={`${movie.mediaType || "movie"}-${movie.id}`}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden"
                    >
                      <div className="aspect-[2/3] bg-slate-800">
                        {movie.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                            alt={movie.title || "Shared item"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                            No poster
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                          {movie.title || "Untitled"}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {(movie.release_date || "----").toString().slice(0, 4)} •{" "}
                          {movie.mediaType === "tv" ? "Series" : "Movie"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  This list does not have any titles yet.
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            mode={authMode}
            onClose={() => setShowAuthModal(false)}
            onAuthSuccess={(user) => setCurrentUser(user)}
            onToggleMode={() =>
              setAuthMode((prev) => (prev === "signin" ? "register" : "signin"))
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AuthModal({ mode, onClose, onToggleMode, onAuthSuccess }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const closeButtonRef = useRef(null);
  const isSignIn = mode === "signin";

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setFormError("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setIsSubmitting(false);
    setShowRecovery(false);
    setRecoveryEmail("");
    setRecoveryError("");
    setRecoveryMessage("");
    setIsRecovering(false);
  }, [mode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (showRecovery) {
      return;
    }
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const passwordHasLetter = /[A-Za-z]/.test(password);
    const passwordHasNumber = /[0-9]/.test(password);
    const passwordStrong = password.length >= 8 && passwordHasLetter && passwordHasNumber;

    if (!isSignIn && !trimmedUsername) {
      setFormError("Username is required!");
      return;
    }
    if (!isSignIn && trimmedUsername.length < 3) {
      setFormError("Username must be at least 3 characters.");
      return;
    }
    if (!isSignIn && trimmedUsername.length > 32) {
      setFormError("Username must be 32 characters or less.");
      return;
    }
    if (!trimmedEmail) {
      setFormError("Email is required.");
      return;
    }
    if (!password) {
      setFormError("Password is required.");
      return;
    }
    if (!isSignIn && !passwordStrong) {
      setFormError("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (!isSignIn && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    setFormError("");
    setIsSubmitting(true);
    try {
      const endpoint = isSignIn ? "/api/auth/signin" : "/api/auth/signup";
      const body = isSignIn
        ? { email: trimmedEmail, password }
        : { email: trimmedEmail, username: trimmedUsername, password, confirmPassword };
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(data?.message || "Unable to authenticate. Please try again.");
        return;
      }
      if (data?.user) {
        onAuthSuccess?.(data.user);
      }
      onClose();
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecovery = async (event) => {
    event.preventDefault();
    const trimmedEmail = recoveryEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedEmail) {
      setRecoveryError("Email is required.");
      setRecoveryMessage("");
      return;
    }
    if (!emailPattern.test(trimmedEmail)) {
      setRecoveryError("Enter a valid email address.");
      setRecoveryMessage("");
      return;
    }

    setRecoveryError("");
    setRecoveryMessage("");
    setIsRecovering(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRecoveryError(
          data?.message || "Unable to start password recovery. Please try again."
        );
        return;
      }
      setRecoveryMessage(
        data?.message || "Recovery email sent. Please check your inbox."
      );
    } catch (err) {
      setRecoveryError("Network error. Please try again.");
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">
              {showRecovery ? "Recover password" : isSignIn ? "Sign in" : "Create account"}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {showRecovery
                ? "We will email you a recovery link."
                : isSignIn
                  ? "Welcome back! Sign in to continue."
                  : "Join GioStream and start building lists."}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-slate-800 flex items-center justify-center hover:border-slate-600 transition"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={showRecovery ? handleRecovery : handleSubmit} className="space-y-4">
          {!showRecovery && !isSignIn && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="auth-username">
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setFormError("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="Your username"
              />
            </div>
          )}
          {!showRecovery && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFormError("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="you@example.com"
              />
            </div>
          )}
          {showRecovery && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="auth-recover">
                Recovery email
              </label>
              <input
                id="auth-recover"
                type="email"
                autoComplete="email"
                required
                value={recoveryEmail}
                onChange={(event) => {
                  setRecoveryEmail(event.target.value);
                  setRecoveryError("");
                  setRecoveryMessage("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="you@example.com"
              />
            </div>
          )}
          {!showRecovery && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isSignIn ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFormError("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="••••••••"
              />
            </div>
          )}
          {!showRecovery && isSignIn && (
            <button
              type="button"
              onClick={() => {
                setShowRecovery(true);
                setRecoveryEmail(email);
                setRecoveryError("");
                setRecoveryMessage("");
              }}
              className="text-xs text-cyan-300 hover:text-cyan-200 transition text-left"
            >
              Forgot password?
            </button>
          )}
          {!showRecovery && !isSignIn && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400" htmlFor="auth-confirm">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setFormError("");
                }}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
                placeholder="••••••••"
              />
            </div>
          )}
          {!showRecovery && !isSignIn && (
            <div className="text-xs text-slate-500">
              Password must be 8+ characters and include a letter and a number.
            </div>
          )}
          {formError && <div className="text-xs text-rose-300">{formError}</div>}
          {recoveryError && <div className="text-xs text-rose-300">{recoveryError}</div>}
          {recoveryMessage && <div className="text-xs text-emerald-300">{recoveryMessage}</div>}
          {showRecovery ? (
            <button
              type="submit"
              disabled={isRecovering}
              className="w-full px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              {isRecovering ? "Sending..." : "Send recovery email"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition"
            >
              {isSubmitting
                ? isSignIn
                  ? "Signing in..."
                  : "Creating account..."
                : isSignIn
                  ? "Sign in"
                  : "Create account"}
            </button>
          )}
          {showRecovery ? (
            <button
              type="button"
              onClick={() => {
                setShowRecovery(false);
                setRecoveryError("");
                setRecoveryMessage("");
              }}
              className="w-full text-xs text-slate-400 hover:text-slate-200 transition"
            >
              Back to sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleMode}
              className="w-full text-xs text-slate-400 hover:text-slate-200 transition"
            >
              {isSignIn
                ? "New here? Create an account"
                : "Already have an account? Sign in"}
            </button>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}

export default InviteListPage;
