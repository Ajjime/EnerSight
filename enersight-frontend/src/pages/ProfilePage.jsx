import React, { useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  IdCard,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import StatCard from "../components/StatCard";
import { clearSavedLogin } from "../utils/session";

const roleAccess = {
  Admin: [
    "Manage user accounts",
    "Approve or reject account requests",
    "Manage buildings and meters",
    "Add, verify, and delete readings",
    "View GIS map, reports, and analytics",
    "Access system settings",
  ],
  Manager: [
    "View dashboard",
    "View GIS building map",
    "View reports",
    "View analytics",
    "Monitor building energy consumption",
  ],
  Staff: [
    "View dashboard",
    "View GIS building map",
    "Add meter readings",
    "Upload meter photo reference",
    "View basic records",
  ],
};

function getStoredUser() {
  const storedUser = localStorage.getItem("user");

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    return null;
  }
}

function getInitials(name, username) {
  const source = name || username || "User";
  const words = source.trim().split(" ").filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getRoleTone(role) {
  if (role === "Admin") {
    return {
      badge: "border-purple-100 bg-purple-50 text-purple-700",
      icon: "bg-purple-600 text-white",
    };
  }

  if (role === "Manager") {
    return {
      badge: "border-blue-100 bg-blue-50 text-blue-700",
      icon: "bg-blue-600 text-white",
    };
  }

  return {
    badge: "border-emerald-100 bg-emerald-50 text-emerald-700",
    icon: "bg-emerald-700 text-white",
  };
}

function getStatusStyle(status) {
  if (status === "Active") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "Pending") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status === "Rejected" || status === "Inactive") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
}

function InfoCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <Icon size={19} />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>

          <p className="mt-1 break-words text-lg font-semibold text-slate-950">
            {value || "Not available"}
          </p>
        </div>
      </div>
    </div>
  );
}

const ProfilePage = ({ user, role, onLogout, setCurrentPage }) => {
  const storedUser = getStoredUser();
  const currentUser = user || storedUser || {};
  const currentRole = role || currentUser?.role || "Staff";
  const currentStatus = currentUser?.status || "Active";
  const accessList = roleAccess[currentRole] || roleAccess.Staff;
  const tone = getRoleTone(currentRole);

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const accountInitials = useMemo(() => {
    return getInitials(currentUser?.full_name, currentUser?.username);
  }, [currentUser?.full_name, currentUser?.username]);

  function handleSignOut() {
    // This used to remove only "token" and "user", leaving a stale role and
    // fullName behind after sign-out.
    clearSavedLogin();

    if (typeof onLogout === "function") {
      onLogout();
      return;
    }

    window.location.reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="User Profile"
        title={currentUser?.full_name || "System User"}
        subtitle="View account details, role, and permissions."
        icon={User}
        status={`Status: ${currentStatus}`}
      >
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium leading-none text-slate-600">
          Role: {currentRole}
        </span>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Account"
          value={currentUser?.username || "User"}
          description="Signed-in account username"
          icon={User}
          compactValue
        />

        <StatCard
          title="Role"
          value={currentRole}
          description="Assigned system access level"
          icon={ShieldCheck}
          tone={
            currentRole === "Admin"
              ? "purple"
              : currentRole === "Manager"
              ? "blue"
              : "green"
          }
          compactValue
        />

        <StatCard
          title="Status"
          value={currentStatus}
          description="Current account approval state"
          icon={CheckCircle2}
          tone={
            currentStatus === "Active"
              ? "green"
              : currentStatus === "Pending"
              ? "amber"
              : "dark"
          }
          compactValue
        />

        <StatCard
          title="Permissions"
          value={accessList.length}
          description="Available role permissions"
          icon={BadgeCheck}
          tone="blue"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-lime-400 text-xl font-semibold text-white shadow-md">
              {accountInitials}
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950">
                Account Information
              </h2>
              <p className="mt-1 text-sm font-normal text-slate-500">
                Basic profile details stored in the system.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <InfoCard
              label="Full Name"
              value={currentUser?.full_name}
              icon={User}
            />

            <InfoCard
              label="Username"
              value={currentUser?.username}
              icon={Mail}
            />

            <InfoCard
              label="User ID"
              value={
                currentUser?.user_id ? `#${currentUser.user_id}` : "Not available"
              }
              icon={IdCard}
            />

            <InfoCard label="Role" value={currentRole} icon={ShieldCheck} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className={`grid h-12 w-12 place-items-center rounded-2xl ${tone.icon}`}>
              <ShieldCheck size={24} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Role Permissions
              </h2>
              <p className="mt-1 text-sm font-normal text-slate-500">
                Available pages and actions for this account.
              </p>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.badge}`}>
              {currentRole}
            </span>

            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusStyle(currentStatus)}`}>
              {currentStatus}
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {accessList.length} permissions
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {accessList.map((access) => (
              <div
                key={access}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={18} />
                </div>

                <p className="text-sm font-semibold text-slate-700">{access}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <KeyRound size={23} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Account Security
              </h2>

              {/* This card used to say password update "can be connected to the
                  backend later". It was already connected: PUT /auth/me verifies
                  the current password and accepts a new one for any signed-in
                  user. The only problem was that the page holding that form was
                  Admin-only, so Managers and Staff could never reach it. */}
              <p className="mt-1 text-sm font-normal leading-6 text-slate-500">
                Change your name, username, or password from Settings. You will
                need your current password to set a new one.
              </p>

              {typeof setCurrentPage === "function" && (
                <button
                  type="button"
                  onClick={() => setCurrentPage("settings")}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <KeyRound size={17} />
                  Open account settings
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSignOutModal(true)}
          className="group flex items-center justify-between gap-4 rounded-2xl border border-red-100 bg-white p-6 text-left shadow-sm transition hover:border-red-200 hover:bg-red-50"
        >
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-600 text-white transition group-hover:bg-red-700">
              <LogOut size={23} />
            </div>

            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-slate-950 group-hover:text-red-900">
                Sign Out
              </h2>

              <p className="mt-1 text-sm font-normal text-slate-500 group-hover:text-red-700">
                End current session.
              </p>
            </div>
          </div>

          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-950 text-white transition group-hover:bg-red-700">
            <LogOut size={17} />
          </div>
        </button>
      </section>

      <ConfirmationModal
        isOpen={showSignOutModal}
        variant="danger"
        title="Sign Out"
        message="Are you sure you want to sign out? Any unsaved changes will be lost."
        confirmText="Sign Out"
        cancelText="Stay"
        onCancel={() => setShowSignOutModal(false)}
        onConfirm={() => { setShowSignOutModal(false); handleSignOut(); }}
      />
    </div>
  );
};

export default ProfilePage;
