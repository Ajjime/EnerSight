import API_BASE_URL from "../../config";
import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ScanLine,
  Send,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldHalf,
  User,
  UserPlus,
} from "lucide-react";

function getPasswordStrength(pwd) {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { level: 0, label: "Weak", color: "bg-red-500", text: "text-red-600", segments: 1 };
  if (score === 2) return { level: 1, label: "Fair", color: "bg-amber-400", text: "text-amber-600", segments: 2 };
  if (score === 3) return { level: 2, label: "Good", color: "bg-lime-500", text: "text-lime-600", segments: 3 };
  return { level: 3, label: "Strong", color: "bg-emerald-600", text: "text-emerald-700", segments: 4 };
}

function PasswordMeter({ password }) {
  const strength = getPasswordStrength(password);
  if (!strength) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i < strength.segments ? strength.color : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className={`text-[11px] font-black ${strength.text}`}>
        {strength.label} password
        {strength.level === 0 && " — add uppercase, numbers, or symbols"}
        {strength.level === 1 && " — try adding numbers or symbols"}
        {strength.level === 2 && " — add a special character to strengthen"}
        {strength.level === 3 && " — great password!"}
      </p>
    </div>
  );
}
import AuthShell from "../../components/ui/AuthShell";
import { FormField } from "../../components/ui/EnergyUI";

const roleOptions = [
  {
    value: "Manager",
    label: "Manager",
    description: "Can view reports, analytics, dashboard, and GIS map.",
    icon: BarChart3,
  },
  {
    value: "Staff",
    label: "Staff",
    description: "Can add meter readings and view basic records.",
    icon: ScanLine,
  },
];

const SignUpRole = ({ onBack }) => {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState("Staff");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function clearSavedLogin() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("fullName");
  }

  async function handleSignUp(event) {
    event.preventDefault();

    clearSavedLogin();
    setErrorMessage("");
    setSuccessMessage("");

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!username.trim()) {
      setErrorMessage("Please enter a username.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter a password.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/users/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          username: username,
          password: password,
          role: role,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.detail || "Could not create account.");
        return;
      }

      clearSavedLogin();

      setSuccessMessage(
        "Account request submitted. Please wait for admin approval."
      );

      setFullName("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setRole("Staff");
      setShowPassword(false);
      setShowConfirmPassword(false);
    } catch (error) {
      console.error("Sign up error:", error);
      setErrorMessage(
        "Cannot connect to server. Please make sure FastAPI is running."
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoToLogin() {
    clearSavedLogin();
    onBack();
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Request access to EnerSight. Admin approval is required before login."
    >
      <button
        type="button"
        onClick={handleGoToLogin}
        className="mb-5 inline-flex items-center gap-2 text-sm font-black text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft size={18} />
        Back to login
      </button>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
          <AlertTriangle size={19} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <p>{successMessage}</p>
          </div>

          <button
            type="button"
            onClick={handleGoToLogin}
            className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800"
          >
            Go to login
          </button>
        </div>
      )}

      <form onSubmit={handleSignUp} className="space-y-4">
        <FormField label="Full Name">
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-white text-emerald-700">
              <UserPlus size={18} />
            </div>

            <input
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter full name"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />
          </div>
        </FormField>

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
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />
          </div>
        </FormField>

        <FormField label="Role">
          <div className="grid gap-3 sm:grid-cols-2">
            {roleOptions.map((item) => {
              const Icon = item.icon;
              const isActive = role === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRole(item.value)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    isActive
                      ? "border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-900/5"
                      : "border-slate-200 bg-slate-50 hover:border-emerald-100 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-xl ${
                        isActive
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-slate-500"
                      }`}
                    >
                      <Icon size={17} />
                    </div>

                    {isActive && (
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    )}
                  </div>

                  <p className="mt-2 text-sm font-black text-slate-950">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[11px] font-bold leading-4 text-slate-500">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-black text-slate-500">
            <ShieldCheck size={14} />
            Admin accounts are created only by the system owner.
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
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 pr-14 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <PasswordMeter password={password} />
        </FormField>

        <FormField label="Confirm Password">
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-white text-emerald-700">
              <LockKeyhole size={18} />
            </div>

            <input
              required
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 pr-14 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />

            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700"
              aria-label={
                showConfirmPassword
                  ? "Hide confirm password"
                  : "Show confirm password"
              }
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {confirmPassword && password !== confirmPassword && (
            <p className="mt-1.5 text-[11px] font-black text-red-600">Passwords do not match</p>
          )}
          {confirmPassword && password === confirmPassword && (
            <p className="mt-1.5 text-[11px] font-black text-emerald-700">Passwords match</p>
          )}
        </FormField>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Submitting request...
            </>
          ) : (
            <>
              Submit Account Request
              <Send size={18} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
};

export default SignUpRole;