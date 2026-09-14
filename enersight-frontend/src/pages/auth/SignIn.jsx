import API_BASE_URL from "../../config";
import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  User,
  UserPlus,
} from "lucide-react";
import AuthShell from "../../components/ui/AuthShell";
import { FormField } from "../../components/ui/EnergyUI";
import { clearSavedLogin, resetSessionExpiryGuard } from "../../utils/session";

const SignIn = ({ onLogin, onSignUp, onForgot, notice = "" }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();

    clearSavedLogin();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      });

      // A proxy error or a crash returns HTML, not JSON. Parsing that throws and the
      // real status would be lost in the catch below as "cannot connect to server".
      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        clearSavedLogin();
        setErrorMessage(
          data?.detail ||
            `Sign in failed (${response.status}). Please try again.`
        );
        return;
      }

      // The backend now rejects Pending, Rejected and Inactive accounts at login
      // with a specific reason, so !response.ok above already covers those.
      resetSessionExpiryGuard();

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("role", data.user.role);
      localStorage.setItem("fullName", data.user.full_name);

      onLogin(data.user);
    } catch (error) {
      console.error("Login error:", error);
      clearSavedLogin();
      setErrorMessage(
        "Cannot connect to server. Please make sure FastAPI is running."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to your EnerSight dashboard."
    >
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Set by App when a token expires mid-session, so the user is told why they
          were signed out instead of silently landing back on this screen. */}
      {!errorMessage && notice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-3">
        <FormField label="Username">
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-white text-emerald-700">
              <User size={18} />
            </div>

            <input
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />
          </div>
        </FormField>

        <FormField label="Password">
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-white text-emerald-700">
              <LockKeyhole size={18} />
            </div>

            <input
              required
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 pr-14 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>
        </FormField>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onForgot}
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <KeyRound size={16} />
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={onSignUp}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700"
      >
        <UserPlus size={18} />
        Create account
      </button>
    </AuthShell>
  );
};

export default SignIn;