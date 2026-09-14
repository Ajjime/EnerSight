import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Save,
  Settings,
  ShieldCheck,
  User,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
import { getPasswordError } from "../utils/password";
import { DEFAULT_RATE_PER_KWH, formatPeso } from "../utils/currency";

const AUTO_REFRESH_MS = 60000;

const defaultProfile = {
  user_id: "",
  username: "",
  full_name: "",
  role: "User",
  status: "Active",
};

function getSavedUser() {
  const savedUser = localStorage.getItem("user");

  if (!savedUser) {
    return defaultProfile;
  }

  try {
    const parsedUser = JSON.parse(savedUser);

    return {
      user_id: parsedUser.user_id || parsedUser.id || "",
      username: parsedUser.username || "",
      full_name: parsedUser.full_name || parsedUser.name || "",
      role: parsedUser.role || "User",
      status: parsedUser.status || "Active",
    };
  } catch {
    return defaultProfile;
  }
}

function ToastMessage({ message, type = "success", onClose }) {
  if (!message) {
    return null;
  }

  const isError = type === "error";

  return (
    <div className="fixed right-5 top-28 z-[60000] w-[calc(100%-2.5rem)] max-w-md">
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl ${
          isError
            ? "border-red-100 bg-red-50 text-red-800"
            : "border-emerald-100 bg-emerald-50 text-emerald-800"
        }`}
      >
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
            isError ? "bg-red-600 text-white" : "bg-emerald-700 text-white"
          }`}
        >
          {isError ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {isError ? "Something went wrong" : "Success"}
          </p>
          <p className="mt-1 text-sm font-normal leading-5 opacity-80">
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 opacity-70 transition hover:bg-white/70 hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, helper }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>

      {children}

      {helper && (
        <p className="mt-2 text-xs font-normal leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </label>
  );
}

function InfoCard({ icon: Icon, title, value, description, tone = "dark" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : tone === "blue"
      ? "border-blue-100 bg-blue-50 text-blue-700"
      : tone === "purple"
      ? "border-purple-100 bg-purple-50 text-purple-700"
      : "border-slate-200 bg-white text-slate-950";

  const iconClass =
    tone === "green"
      ? "bg-emerald-700 text-white"
      : tone === "blue"
      ? "bg-blue-600 text-white"
      : tone === "purple"
      ? "bg-purple-600 text-white"
      : "bg-slate-950 text-lime-300";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold opacity-80">{title}</p>
          <p className="mt-2 break-words text-2xl font-bold leading-tight">
            {value || "Not set"}
          </p>
        </div>

        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
          <Icon size={23} />
        </div>
      </div>

      <p className="text-xs font-normal leading-5 opacity-75">{description}</p>
    </div>
  );
}

const SettingsPage = ({ role = "Staff" }) => {
  // PUT /settings/rate requires Admin or Manager, so Staff sees the page (for
  // their own account and password) but not the system-wide rate control.
  const canEditRate = role === "Admin" || role === "Manager";

  const [profile, setProfile] = useState(defaultProfile);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [rateInput, setRateInput] = useState(String(DEFAULT_RATE_PER_KWH));
  const [savedRate, setSavedRate] = useState(DEFAULT_RATE_PER_KWH);
  const [isSavingRate, setIsSavingRate] = useState(false);

  function showToast(message, type = "success") {
    setToast({ message, type });
  }

  function hideToast() {
    setToast({ message: "", type: "success" });
  }

  useEffect(() => {
    if (!toast.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      hideToast();
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toast.message]);

  useEffect(() => {
    let isActive = true;

    async function fetchRate() {
      try {
        const response = await apiFetch(`${API_BASE_URL}/settings/rate`);
        const data = await response.json();

        if (!response.ok || !isActive) {
          return;
        }

        const rate = Number(data.rate_per_kwh);

        if (!Number.isNaN(rate)) {
          setSavedRate(rate);
          setRateInput(String(rate));
        }
      } catch (error) {
        console.error("Fetch rate error:", error);
      }
    }

    fetchRate();

    return () => {
      isActive = false;
    };
  }, []);

  async function saveRate() {
    const rate = Number(rateInput);

    if (rateInput.trim() === "" || Number.isNaN(rate) || rate < 0) {
      showToast("Please enter a valid electricity rate.", "error");
      return;
    }

    setIsSavingRate(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/settings/rate`, {
        method: "PUT",
        body: JSON.stringify({ rate_per_kwh: rate }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save electricity rate.", "error");
        return;
      }

      setSavedRate(Number(data.rate_per_kwh));
      setRateInput(String(data.rate_per_kwh));
      showToast("Electricity rate updated successfully.", "success");
    } catch (error) {
      console.error("Save rate error:", error);
      showToast("Could not save electricity rate.", "error");
    } finally {
      setIsSavingRate(false);
    }
  }

  function syncLocalSettings() {
    setIsSyncing(true);

    setProfile(getSavedUser());

    window.setTimeout(() => {
      setIsSyncing(false);
    }, 250);
  }

  // syncLocalSettings replaces profile and preferences wholesale from localStorage.
  // Letting it run mid-edit silently discards whatever the user is typing, so pause
  // the refresh while there are unsaved changes or a save is in flight.
  const hasUnsavedChanges = useMemo(() => {
    const savedProfile = getSavedUser();

    const profileChanged =
      profile.full_name !== savedProfile.full_name ||
      profile.username !== savedProfile.username ||
      profile.username !== savedProfile.username;

    const passwordInProgress = Boolean(
      passwordForm.currentPassword ||
        passwordForm.newPassword ||
        passwordForm.confirmPassword
    );

    return profileChanged || passwordInProgress;
  }, [profile, passwordForm]);

  const isSavingAnything =
    isSavingProfile || isUpdatingPassword || isSavingRate;

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(syncLocalSettings, {
    intervalMs: AUTO_REFRESH_MS,
    enabled: !hasUnsavedChanges && !isSavingAnything,
    runOnMount: true,
  });

  const accountInitials = useMemo(() => {
    const fullName = profile.full_name || profile.username || "User";

    return fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  }, [profile.full_name, profile.username]);

  async function saveProfile() {
    if (!profile.username.trim()) {
      showToast("Username is required.", "error");
      return;
    }

    if (!profile.full_name.trim()) {
      showToast("Full name is required.", "error");
      return;
    }

    setIsSavingProfile(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/auth/me`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: profile.full_name.trim(),
          username: profile.username.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save profile.", "error");
        return;
      }

      const currentUser = getSavedUser();
      localStorage.setItem("user", JSON.stringify({ ...currentUser, ...data }));
      showToast("Profile updated successfully.", "success");
    } catch (error) {
      console.error("Save profile error:", error);
      showToast("Could not save profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function updatePassword() {
    if (!passwordForm.currentPassword.trim()) {
      showToast("Enter your current password.", "error");
      return;
    }

    // Shared with sign-up and mirrored by validate_password on the backend, so all
    // three no longer disagree about what a valid password is.
    const passwordError = getPasswordError(passwordForm.newPassword);

    if (passwordError) {
      showToast(passwordError, "error");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/auth/me`, {
        method: "PUT",
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not update password.", "error");
        return;
      }

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast("Password updated successfully.", "success");
    } catch (error) {
      console.error("Update password error:", error);
      showToast("Could not update password.", "error");
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <PageHeader
        eyebrow="Account Settings"
        title="Settings"
        subtitle="Update your account details and password."
        icon={Settings}
        status={isSyncing ? "Syncing settings" : `Role: ${profile.role || "Staff"}`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isSyncing}
        intervalMs={AUTO_REFRESH_MS}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          icon={User}
          title="Signed-in User"
          value={profile.full_name || profile.username || "User"}
          description="Current local user profile"
        />

        <InfoCard
          icon={ShieldCheck}
          title="Access Role"
          value={profile.role || "User"}
          description="Determines available system pages"
          tone="purple"
        />

        <InfoCard
          icon={CheckCircle2}
          title="Status"
          value={profile.status || "Active"}
          description="Current account state"
          tone="green"
        />
      </section>

      {canEditRate && (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
            <Zap size={23} />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Electricity Rate
            </h2>
            <p className="mt-1 text-sm font-normal text-slate-500">
              Rate used to convert energy (kWh) into estimated cost (₱).
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr] md:items-end">
          <Field
            label="Rate per kWh (₱)"
            helper="Set this to your electric utility's current rate."
          >
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 focus-within:border-emerald-600 focus-within:bg-white">
              <span className="mr-2 text-sm font-semibold text-slate-400">₱</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rateInput}
                onChange={(event) => setRateInput(event.target.value)}
                placeholder="12.00"
                className="w-full bg-transparent text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400"
              />
              <span className="ml-2 whitespace-nowrap text-xs font-medium text-slate-400">
                / kWh
              </span>
            </div>
          </Field>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Example estimate
            </p>
            <p className="mt-2 text-sm font-normal leading-5 text-emerald-800">
              100 kWh × {formatPeso(rateInput || 0)} ={" "}
              <span className="font-semibold">
                {formatPeso((Number(rateInput) || 0) * 100)}
              </span>{" "}
              per month.
            </p>
            <p className="mt-1 text-xs font-normal text-emerald-700">
              Currently saved: {formatPeso(savedRate)} / kWh
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={saveRate}
            disabled={isSavingRate}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={18} />
            {isSavingRate ? "Saving..." : "Save Rate"}
          </button>
        </div>
      </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-lime-400 text-xl font-semibold text-white shadow-md">
              {accountInitials}
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950">
                Account Profile
              </h2>
              <p className="mt-1 text-sm font-normal text-slate-500">
                Update local account details.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Username">
              <input
                value={profile.username}
                onChange={(event) =>
                  setProfile({ ...profile, username: event.target.value })
                }
                placeholder="Username"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
              />
            </Field>

            <Field label="Full Name">
              <input
                value={profile.full_name}
                onChange={(event) =>
                  setProfile({ ...profile, full_name: event.target.value })
                }
                placeholder="Full name"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
              />
            </Field>

            <Field label="Role">
              <input
                value={profile.role}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-normal text-slate-500 outline-none"
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={saveProfile}
              disabled={isSavingProfile}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={18} />
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Lock size={23} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Password
              </h2>
              <p className="mt-1 text-sm font-normal text-slate-500">
                Prepare account password update.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <Field label="Current Password">
              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 focus-within:border-emerald-600 focus-within:bg-white">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: event.target.value,
                    })
                  }
                  placeholder="Current password"
                  className="w-full bg-transparent text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="ml-3 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="New Password">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: event.target.value,
                    })
                  }
                  placeholder="New password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
                />
              </Field>

              <Field label="Confirm Password">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: event.target.value,
                    })
                  }
                  placeholder="Confirm password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={updatePassword}
              disabled={isUpdatingPassword}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Lock size={18} />
              {isUpdatingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </section>

      {/* The "System Preferences" and "Accent Style" cards were removed.
          Notifications, Report Reminder, Auto Refresh, Compact Mode and the four
          accent swatches all wrote to localStorage and were read by nothing:
          - Auto Refresh could not turn auto-refresh off; it is hardcoded on in
            every page that polls.
          - Compact Mode had no CSS hook anywhere.
          - Report Reminder had no reminder feature to control.
          - Notifications did not gate the toasts, which fired regardless.
          - The accent card carried its own disclaimer that the header colour
            never changes.
          Recover them from git history if any of these are actually built. */}
    </div>
  );
};

export default SettingsPage;
