import React, { useMemo, useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

function ResetPasswordPage({ token }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasToken = useMemo(() => Boolean(token && token.trim()), [token]);
  const passwordHasLetter = /[A-Za-z]/.test(password);
  const passwordHasNumber = /[0-9]/.test(password);
  const passwordStrong = password.length >= 8 && passwordHasLetter && passwordHasNumber;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasToken) {
      setError("Recovery link is invalid or missing.");
      return;
    }
    if (!password) {
      setError("New password is required.");
      return;
    }
    if (!passwordStrong) {
      setError("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token,
          newPassword: password,
          confirmPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.message || "Unable to reset password.");
        return;
      }
      setMessage("Password updated. You can sign in now.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
            GioStream
          </div>
          <h1 className="text-lg font-semibold">Reset your password</h1>
        </div>
        <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit}>
          {!hasToken && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              Recovery link is invalid or missing. Request a new one.
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {message}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs text-slate-400" htmlFor="reset-password">
              New password
            </label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              placeholder="********"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400" htmlFor="reset-confirm">
              Confirm password
            </label>
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError("");
              }}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
              placeholder="********"
            />
          </div>
          <div className="text-xs text-slate-500">
            Password must be 8+ characters and include a letter and a number.
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !hasToken}
            className="w-full px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-medium hover:bg-cyan-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Updating..." : "Update password"}
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.hash = "#";
            }}
            className="w-full text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Back to browse
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
