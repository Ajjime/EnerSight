import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MonitorCog,
  Palette,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  User,
  X,
  XCircle,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";

const AUTO_REFRESH_MS = 60000;

const defaultProfile = {
  user_id: "",
  username: "",
  email: "",
  full_name: "",
  role: "User",
  status: "Active",
};

const defaultPreferences = {
  compactMode: false,
  notifications: true,
  reportReminder: true,
  autoRefresh: true,
  themeAccent: "Emerald",
};

const accentOptions = ["Emerald", "Lime", "Blue", "Slate"];

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
      email: parsedUser.email || "",
      full_name: parsedUser.full_name || parsedUser.name || "",
      role: parsedUser.role || "User",
      status: parsedUser.status || "Active",
    };
  } catch {
    return defaultProfile;
  }
}

function getSavedPreferences() {
  const savedPreferences = localStorage.getItem("enersight_preferences");

  if (!savedPreferences) {
    return defaultPreferences;
  }

  try {
    return {
      ...defaultPreferences,
      ...JSON.parse(savedPreferences),
    };
  } catch {
    return defaultPreferences;
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
        className={`flex items-start gap-3 rounded-3xl border p-4 shadow-2xl shadow-slate-950/10 ${
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
          <p className="text-sm font-black">
            {isError ? "Something went wrong" : "Success"}
          </p>
          <p className="mt-1 text-sm font-bold leading-5 opacity-80">
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
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>

      {children}

      {helper && (
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </label>
  );
}

function SettingToggle({ icon: Icon, title, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex min-w-0 gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <Icon size={20} />
        </div>

        <div className="min-w-0">
          <p className="font-black text-slate-950">{title}</p>
          <p className="mt-1 text-sm font-bold leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-700" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
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
    <div className={`rounded-[1.7rem] border p-5 shadow-sm ${toneClass}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black opacity-80">{title}</p>
          <p className="mt-2 break-words text-2xl font-black leading-tight">
            {value || "Not set"}
          </p>
        </div>

        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
          <Icon size={23} />
        </div>
      </div>

      <p className="text-xs font-bold leading-5 opacity-75">{description}</p>
    </div>
  );
}

const SettingsPage = () => {
  const [profile, setProfile] = useState(defaultProfile);
  const [preferences, setPreferences] = useState(defaultPreferences);
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
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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

  function syncLocalSettings() {
    setIsSyncing(true);

    setProfile(getSavedUser());
    setPreferences(getSavedPreferences());

    window.setTimeout(() => {
      setIsSyncing(false);
    }, 250);
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(syncLocalSettings, {
    intervalMs: AUTO_REFRESH_MS,
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

  function updatePreference(key, value) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

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
      localStorage.setItem("user", JSON.stringify({ ...currentUser, email: profile.email, ...data }));
      showToast("Profile updated successfully.", "success");
    } catch (error) {
      console.error("Save profile error:", error);
      showToast("Could not save profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  }

  function savePreferences() {
    setIsSavingPreferences(true);

    try {
      localStorage.setItem(
        "enersight_preferences",
        JSON.stringify(preferences)
      );
      showToast("System preferences saved.", "success");
    } catch (error) {
      console.error("Save preferences error:", error);
      showToast("Could not save preferences.", "error");
    } finally {
      setIsSavingPreferences(false);
    }
  }

  async function updatePassword() {
    if (!passwordForm.currentPassword.trim()) {
      showToast("Enter your current password.", "error");
      return;
    }

    if (!passwordForm.newPassword.trim()) {
      showToast("Enter your new password.", "error");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      showToast("New password must be at least 6 characters.", "error");
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

  function resetPreferences() {
    setPreferences(defaultPreferences);
    localStorage.setItem(
      "enersight_preferences",
      JSON.stringify(defaultPreferences)
    );
    showToast("Preferences reset to default.", "success");
  }

  return (
    <div className="space-y-6 font-[Nunito]">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <PageHeader
        eyebrow="System Preferences"
        title="Settings"
        subtitle="Manage your account and system preferences."
        icon={Settings}
        status={isSyncing ? "Syncing settings" : `Role: ${profile.role || "User"}`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isSyncing}
        intervalMs={AUTO_REFRESH_MS}
        actions={
          <button
            type="button"
            onClick={resetPreferences}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white/25"
          >
            <RotateCcw size={15} />
            Reset Defaults
          </button>
        }
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
          icon={Mail}
          title="Email"
          value={profile.email || "Not set"}
          description="Used for account identification"
          tone="blue"
        />

        <InfoCard
          icon={CheckCircle2}
          title="Status"
          value={profile.status || "Active"}
          description="Current account state"
          tone="green"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[1.4rem] bg-gradient-to-br from-emerald-700 to-lime-400 text-xl font-black text-white shadow-lg shadow-emerald-900/20">
              {accountInitials}
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-950">
                Account Profile
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
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
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
              />
            </Field>

            <Field label="Full Name">
              <input
                value={profile.full_name}
                onChange={(event) =>
                  setProfile({ ...profile, full_name: event.target.value })
                }
                placeholder="Full name"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={profile.email}
                onChange={(event) =>
                  setProfile({ ...profile, email: event.target.value })
                }
                placeholder="email@example.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
              />
            </Field>

            <Field label="Role">
              <input
                value={profile.role}
                disabled
                className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-5 py-3.5 text-sm font-bold text-slate-500 outline-none"
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={saveProfile}
              disabled={isSavingProfile}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={18} />
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Lock size={23} />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-950">
                Password
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
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
                  className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={updatePassword}
              disabled={isUpdatingPassword}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Lock size={18} />
              {isUpdatingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
              <MonitorCog size={23} />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-950">
                System Preferences
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Control local UI and workflow settings.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <SettingToggle
              icon={Bell}
              title="Notifications"
              description="Show success and error notifications during system use."
              checked={preferences.notifications}
              onChange={(value) => updatePreference("notifications", value)}
            />

            <SettingToggle
              icon={FilePreferenceIcon}
              title="Report Reminder"
              description="Keep reminders for report review and audit preparation enabled."
              checked={preferences.reportReminder}
              onChange={(value) => updatePreference("reportReminder", value)}
            />

            <SettingToggle
              icon={MonitorCog}
              title="Auto Refresh"
              description="Keep dashboard and monitoring pages updated automatically."
              checked={preferences.autoRefresh}
              onChange={(value) => updatePreference("autoRefresh", value)}
            />

            <SettingToggle
              icon={Palette}
              title="Compact Mode"
              description="Use denser content layout for data-heavy pages."
              checked={preferences.compactMode}
              onChange={(value) => updatePreference("compactMode", value)}
            />
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={savePreferences}
              disabled={isSavingPreferences}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={18} />
              {isSavingPreferences ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Palette size={23} />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-950">
                Accent Style
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Select your preferred local accent label.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {accentOptions.map((accent) => {
              const isSelected = preferences.themeAccent === accent;

              return (
                <button
                  key={accent}
                  type="button"
                  onClick={() => updatePreference("themeAccent", accent)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-black text-slate-950">{accent}</span>
                    {isSelected && (
                      <CheckCircle2 size={18} className="text-emerald-700" />
                    )}
                  </div>

                  <div
                    className={`h-3 rounded-full ${
                      accent === "Emerald"
                        ? "bg-emerald-700"
                        : accent === "Lime"
                        ? "bg-lime-400"
                        : accent === "Blue"
                        ? "bg-blue-600"
                        : "bg-slate-800"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-800">
              Current accent: {preferences.themeAccent}
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-emerald-700">
              Main system header remains dark emerald/lime for consistent branding.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

function FilePreferenceIcon(props) {
  return <Settings {...props} />;
}

export default SettingsPage;
