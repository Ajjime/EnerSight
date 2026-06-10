import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserX,
  Users,
  X,
  XCircle,
} from "lucide-react";

import PageHeader from "../components/PageHeader";
import ConfirmationModal from "../components/ConfirmationModal";
import HeaderActionButton from "../components/HeaderActionButton";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import ToastMessage from "../components/ToastMessage";

import API_BASE_URL from "../config";
import { apiFetch } from "../utils/apiFetch";
const AUTO_REFRESH_MS = 60000;

const emptyForm = {
  username: "",
  email: "",
  full_name: "",
  password: "",
  role: "Staff",
  status: "Active",
};

const roleOptions = ["Admin", "Manager", "Staff"];
const statusOptions = ["Active", "Inactive", "Pending"];

function normalizeUser(user) {
  return {
    user_id: user.user_id ?? user.id,
    username: user.username || "",
    email: user.email || "",
    full_name: user.full_name || user.name || "",
    role: user.role || "Staff",
    status: user.status || "Active",
  };
}

function getRoleStyle(role) {
  if (role === "Admin") {
    return "border-purple-100 bg-purple-50 text-purple-700";
  }

  if (role === "Manager") {
    return "border-blue-100 bg-blue-50 text-blue-700";
  }

  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function getStatusStyle(status) {
  if (status === "Active") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  if (status === "Pending") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (status === "Inactive") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  return "border-slate-100 bg-slate-50 text-slate-600";
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

function UserModal({ modal, form, setForm, onClose, onSave, isSaving }) {
  if (!modal) {
    return null;
  }

  const isView = modal.mode === "view";
  const isEdit = modal.mode === "edit";

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
              User Account
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {modal.mode === "add"
                ? "Add User"
                : modal.mode === "edit"
                ? "Edit User"
                : "User Details"}
            </h2>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Manage role access and account status.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 transition hover:bg-slate-50 hover:text-red-600"
          >
            <X size={19} />
          </button>
        </div>

        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Username">
              <input
                disabled={isView}
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                placeholder="Example: admin01"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field label="Email">
              <input
                disabled={isView}
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="user@example.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field label="Full Name">
              <input
                disabled={isView}
                value={form.full_name}
                onChange={(event) =>
                  setForm({ ...form, full_name: event.target.value })
                }
                placeholder="Example: Juan Dela Cruz"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field
              label="Password"
              helper={
                isEdit ? "Leave blank to keep current password." : "Required for new users."
              }
            >
              <input
                disabled={isView}
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                placeholder={isEdit ? "Optional new password" : "Enter password"}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Field>

            <Field label="Role">
              <select
                disabled={isView}
                value={form.role}
                onChange={(event) =>
                  setForm({ ...form, role: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Account Status">
              <select
                disabled={isView}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-sm font-black text-emerald-800">Role Guide</p>
            <p className="mt-1 text-sm font-bold leading-6 text-emerald-700">
              Admin manages users and settings. Manager reviews reports and analytics.
              Staff handles readings and records.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-100 bg-white p-6 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            {isView ? "Close" : "Cancel"}
          </button>

          {!isView && (
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save User"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [modal, setModal] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState({
    message: "",
    type: "success",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

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

  async function fetchUsers(showSuccessToast = false) {
    setIsLoading(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/users/`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not load users.");
      }

      setUsers(Array.isArray(data) ? data.map(normalizeUser) : []);

      if (showSuccessToast) {
        showToast("User data refreshed successfully.", "success");
      }
    } catch (error) {
      console.error("Fetch users error:", error);
      showToast(
        error.message ||
          "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }

  const { lastUpdated, isAutoRefreshing } = useAutoRefresh(
    () => fetchUsers(false),
    {
      intervalMs: AUTO_REFRESH_MS,
      enabled: !modal && !confirmation,
      runOnMount: true,
    }
  );

  const pendingUsers = useMemo(() => {
    return users.filter((user) => user.status === "Pending");
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchValue = query.toLowerCase();

      const matchesSearch =
        String(user.user_id).includes(searchValue) ||
        user.username.toLowerCase().includes(searchValue) ||
        user.email.toLowerCase().includes(searchValue) ||
        user.full_name.toLowerCase().includes(searchValue) ||
        user.role.toLowerCase().includes(searchValue) ||
        user.status.toLowerCase().includes(searchValue);

      const matchesRole = roleFilter === "All Roles" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "All Status" || user.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  const totalUsers = users.length;
  const adminUsers = users.filter((user) => user.role === "Admin").length;
  const managerUsers = users.filter((user) => user.role === "Manager").length;
  const staffUsers = users.filter((user) => user.role === "Staff").length;
  const activeUsers = users.filter((user) => user.status === "Active").length;

  function openAddModal() {
    setForm(emptyForm);
    setModal({ mode: "add" });
  }

  function openViewModal(user) {
    setForm({ ...normalizeUser(user), password: "" });
    setModal({ mode: "view", userId: user.user_id });
  }

  function openEditModal(user) {
    setForm({ ...normalizeUser(user), password: "" });
    setModal({ mode: "edit", userId: user.user_id });
  }

  function validateForm() {
    if (!form.username.trim()) {
      showToast("Please enter the username.", "error");
      return false;
    }

    if (!form.email.trim()) {
      showToast("Please enter the email address.", "error");
      return false;
    }

    if (!form.full_name.trim()) {
      showToast("Please enter the full name.", "error");
      return false;
    }

    if (modal?.mode === "add" && !form.password.trim()) {
      showToast("Please enter the user password.", "error");
      return false;
    }

    return true;
  }

  function buildPayload() {
    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      role: form.role,
      status: form.status,
    };

    if (form.password.trim()) {
      payload.password = form.password.trim();
    }

    return payload;
  }

  async function saveUser() {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      const isEdit = modal?.mode === "edit";
      const url = isEdit
        ? `${API_BASE_URL}/users/${modal.userId}`
        : `${API_BASE_URL}/users/`;

      const response = await apiFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not save user.", "error");
        return;
      }

      showToast(
        isEdit ? "User updated successfully." : "User added successfully.",
        "success"
      );

      setModal(null);
      setForm(emptyForm);
      await fetchUsers(false);
    } catch (error) {
      console.error("Save user error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsSaving(false);
    }
  }

  function askApproveUser(user) {
    setConfirmation({
      type: "approveUser",
      user,
      title: "Approve account request?",
      message: `This will approve "${user.username}" and activate the account.`,
      note: "The user will be allowed to access the system based on their assigned role.",
      confirmText: "Approve Account",
      variant: "success",
    });
  }

  function askRejectUser(user) {
    setConfirmation({
      type: "rejectUser",
      user,
      title: "Reject account request?",
      message: `This will reject "${user.username}" and remove the pending account request.`,
      note: "This action cannot be automatically undone.",
      confirmText: "Reject Request",
      variant: "danger",
    });
  }

  function askDeleteUser(user) {
    setConfirmation({
      type: "deleteUser",
      user,
      title: "Delete user?",
      message: `You are about to delete user "${user.username}" from the system.`,
      note: "This may affect account access and audit references.",
      confirmText: "Delete User",
      variant: "danger",
    });
  }

  async function approveUser(user) {
    setIsApproving(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/users/${user.user_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          status: "Active",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not approve account request.", "error");
        return;
      }

      showToast(`Account request for ${user.username} approved.`, "success");
      setConfirmation(null);
      await fetchUsers(false);
    } catch (error) {
      console.error("Approve user error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsApproving(false);
    }
  }

  async function deleteUser(user, successMessage = "User deleted successfully.") {
    setIsDeleting(true);

    try {
      const response = await apiFetch(`${API_BASE_URL}/users/${user.user_id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.detail || "Could not delete user.", "error");
        return;
      }

      showToast(data.message || successMessage, "success");
      setConfirmation(null);
      await fetchUsers(false);
    } catch (error) {
      console.error("Delete user error:", error);
      showToast(
        "Cannot connect to server. Please make sure FastAPI is running.",
        "error"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function rejectUser(user) {
    setIsRejecting(true);

    try {
      await deleteUser(user, `Account request for ${user.username} rejected.`);
    } finally {
      setIsRejecting(false);
    }
  }

  function handleConfirmAction() {
    if (confirmation?.type === "approveUser") {
      approveUser(confirmation.user);
      return;
    }

    if (confirmation?.type === "rejectUser") {
      rejectUser(confirmation.user);
      return;
    }

    if (confirmation?.type === "deleteUser") {
      deleteUser(confirmation.user);
    }
  }

  const confirmationProcessing =
    confirmation?.type === "approveUser"
      ? isApproving
      : confirmation?.type === "rejectUser"
      ? isRejecting || isDeleting
      : isDeleting;

  return (
    <div className="space-y-6 font-[Nunito]">
      <ToastMessage
        message={toast.message}
        type={toast.type}
        onClose={hideToast}
      />

      <PageHeader
        eyebrow="Access Control"
        title="User Management"
        subtitle="Manage user accounts, roles, and pending requests."
        icon={UserCog}
        status={isLoading ? "Syncing data" : `${pendingUsers.length} Pending`}
        lastUpdated={lastUpdated}
        isRefreshing={isAutoRefreshing || isLoading}
        intervalMs={AUTO_REFRESH_MS}
        actions={
          <HeaderActionButton icon={Plus} variant="dark" onClick={openAddModal}>
            Add User
          </HeaderActionButton>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-slate-500">Total Users</p>
              <p className="mt-2 text-3xl font-black text-slate-950">
                {totalUsers}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-lime-300">
              <Users size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-slate-400">Registered accounts</p>
        </div>

        <div className="rounded-[1.7rem] border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-amber-700">Pending</p>
              <p className="mt-2 text-3xl font-black text-amber-800">
                {pendingUsers.length}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-white">
              <Clock3 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-amber-700">Needs admin action</p>
        </div>

        <div className="rounded-[1.7rem] border border-purple-100 bg-purple-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-purple-700">Admins</p>
              <p className="mt-2 text-3xl font-black text-purple-800">
                {adminUsers}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-600 text-white">
              <ShieldCheck size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-purple-700">Full system access</p>
        </div>

        <div className="rounded-[1.7rem] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-blue-700">Managers</p>
              <p className="mt-2 text-3xl font-black text-blue-800">
                {managerUsers}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
              <Lock size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-blue-700">Reports access</p>
        </div>

        <div className="rounded-[1.7rem] border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-emerald-700">Active</p>
              <p className="mt-2 text-3xl font-black text-emerald-800">
                {activeUsers}
              </p>
            </div>

            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white">
              <CheckCircle2 size={23} />
            </div>
          </div>

          <p className="text-xs font-bold text-emerald-700">
            {staffUsers} staff accounts
          </p>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">
              Pending Account Requests
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Approve or reject new account requests.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700">
            {pendingUsers.length} pending
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[90px_1.1fr_1.2fr_1.4fr_130px_210px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Username</div>
              <div>Full Name</div>
              <div>Email</div>
              <div>Role</div>
              <div>Decision</div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading requests...
              </div>
            ) : pendingUsers.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                No pending account requests.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className="grid grid-cols-[90px_1.1fr_1.2fr_1.4fr_130px_210px] items-center px-4 py-4 text-sm"
                  >
                    <div className="font-black text-slate-700">
                      #{user.user_id}
                    </div>

                    <div>
                      <p className="font-black text-slate-950">
                        {user.username}
                      </p>
                      <p className="mt-1 text-xs font-bold text-amber-600">
                        Awaiting approval
                      </p>
                    </div>

                    <div className="font-bold text-slate-700">
                      {user.full_name || "No full name"}
                    </div>

                    <div className="font-bold text-slate-600">
                      {user.email || "No email"}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getRoleStyle(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => askApproveUser(user)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-800"
                      >
                        <UserCheck size={15} />
                        Approve
                      </button>

                      <button
                        type="button"
                        onClick={() => askRejectUser(user)}
                        className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100"
                      >
                        <UserX size={15} />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">User List</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Search, filter, view, update, or delete user accounts.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_150px_160px] xl:w-[760px]">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2 lg:col-span-1">
              <Search size={18} className="text-slate-400" />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, username, email, role..."
                className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Roles">All Roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white"
            >
              <option value="All Status">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[90px_1.1fr_1.2fr_1.4fr_130px_130px_170px] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
              <div>ID</div>
              <div>Username</div>
              <div>Full Name</div>
              <div>Email</div>
              <div>Role</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                Loading users...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-sm font-black text-slate-500">
                No user accounts found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className="grid grid-cols-[90px_1.1fr_1.2fr_1.4fr_130px_130px_170px] items-center px-4 py-4 text-sm"
                  >
                    <div className="font-black text-slate-700">
                      #{user.user_id}
                    </div>

                    <div>
                      <p className="font-black text-slate-950">
                        {user.username}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        Account
                      </p>
                    </div>

                    <div className="font-bold text-slate-700">
                      {user.full_name || "No full name"}
                    </div>

                    <div className="font-bold text-slate-600">
                      {user.email || "No email"}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getRoleStyle(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusStyle(
                          user.status
                        )}`}
                      >
                        {user.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openViewModal(user)}
                        className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
                        title="View user"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                        title="Edit user"
                      >
                        <Pencil size={16} />
                      </button>

                      {user.status === "Pending" && (
                        <button
                          type="button"
                          onClick={() => askApproveUser(user)}
                          className="rounded-xl bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
                          title="Approve pending user"
                        >
                          <UserCheck size={16} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => askDeleteUser(user)}
                        className="rounded-xl bg-red-50 p-2 text-red-700 transition hover:bg-red-100"
                        title="Delete user"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <UserModal
        modal={modal}
        form={form}
        setForm={setForm}
        onClose={() => setModal(null)}
        onSave={saveUser}
        isSaving={isSaving}
      />

      <ConfirmationModal
        isOpen={Boolean(confirmation)}
        title={confirmation?.title}
        message={confirmation?.message}
        note={confirmation?.note}
        confirmText={confirmation?.confirmText}
        variant={confirmation?.variant}
        isProcessing={confirmationProcessing}
        onCancel={() => setConfirmation(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
};

export default AdminUsers;