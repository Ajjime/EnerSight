import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";

// Pages are split per route. They previously all sat in one 1.07 MB chunk that the
// browser had to download in full before it could even render the sign-in form,
// which matters on a phone over campus wifi. Each page and its heavy dependencies
// (Leaflet for the map, Recharts for the charts) now load when first opened.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BuildingMap = lazy(() => import("./pages/BuildingMap"));
const BuildingsList = lazy(() => import("./pages/BuildingsList"));
const MetersPage = lazy(() => import("./pages/MetersPage"));
const UploadOCR = lazy(() => import("./pages/UploadOCR"));
const Reports = lazy(() => import("./pages/Reports"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SignIn = lazy(() => import("./pages/auth/SignIn"));
const SignUpRole = lazy(() => import("./pages/auth/SignUpRole"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
import logo from "./assets/logo/EnerSight Logo.png";
import ConfirmationModal from "./components/ConfirmationModal";
import {
  SESSION_EXPIRED_EVENT,
  clearSavedLogin,
  getSavedUser,
  getToken,
  resetSessionExpiryGuard,
} from "./utils/session";

import {
  AlertTriangle,
  BarChart3,
  Building2,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Upload,
  User,
  UserCog,
  X,
} from "lucide-react";

// Shown while a lazily-loaded page chunk downloads. Deliberately quiet: on a fast
// connection it flashes for a few milliseconds, so a spinner would be noisier than
// the wait it describes.
function PageFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] items-center justify-center text-sm font-medium text-slate-400"
    >
      Loading...
    </div>
  );
}

const SYSTEM_NAME = "EnerSight";
const SYSTEM_TAGLINE = "See energy clearly, manage buildings wisely.";

// Sidebar section order. A group disappears entirely when the signed-in role
// can't reach any of its pages (Staff never sees Records or Administration).
const NAV_GROUP_ORDER = [
  "Overview",
  "Records",
  "Insights",
  "Administration",
  "Account",
];

const nav = [
  {
    id: "dashboard",
    group: "Overview",
    label: "Dashboard",
    hint: "Home overview",
    icon: LayoutDashboard,
    roles: ["Admin", "Manager", "Staff"],
  },
  {
    id: "map",
    group: "Overview",
    label: "GIS Map",
    hint: "Building map",
    icon: MapIcon,
    roles: ["Admin", "Manager", "Staff"],
  },
  {
    id: "buildings",
    group: "Records",
    label: "Buildings",
    hint: "Building records",
    icon: Building2,
    roles: ["Admin", "Manager"],
  },
  {
    id: "meters",
    group: "Records",
    label: "Meters",
    hint: "Meter records",
    icon: Gauge,
    roles: ["Admin", "Manager"],
  },
  {
    id: "ocr",
    group: "Records",
    label: "Add Meter Reading",
    hint: "Save readings",
    icon: Upload,
    roles: ["Admin", "Staff"],
  },
  {
    id: "reports",
    group: "Insights",
    label: "Reports",
    hint: "View reports",
    icon: FileText,
    roles: ["Admin", "Manager"],
  },
  {
    id: "analytics",
    group: "Insights",
    label: "Analytics",
    hint: "Trends",
    icon: BarChart3,
    roles: ["Admin", "Manager"],
  },
  {
    id: "users",
    group: "Administration",
    label: "Users",
    hint: "Manage users",
    icon: UserCog,
    roles: ["Admin"],
  },
  {
    id: "profile",
    group: "Account",
    label: "Profile",
    hint: "My account",
    icon: User,
    roles: ["Admin", "Manager", "Staff"],
  },
  {
    id: "settings",
    // Open to every role: this is where a user changes their own name and
    // password, and PUT /auth/me has always allowed that for anyone. While the
    // page was Admin-only, Managers and Staff had no way to change their own
    // password at all. The system-wide electricity rate inside it is still gated.
    group: "Account",
    label: "Settings",
    hint: "Account and system setup",
    icon: Settings,
    roles: ["Admin", "Manager", "Staff"],
  },
];

const pageDescriptions = {
  dashboard: "Quick view of building energy use, readings, alerts, and reports.",
  map: "See each building on the GIS map and check its energy status.",
  buildings:
    "View and manage building details, type, floor area, and map coordinates.",
  meters: "View and manage meters connected to each building.",
  ocr: "Upload and crop a meter photo — the reading is detected automatically.",
  reports: "Generate and view saved energy records and report summaries.",
  analytics: "Analyze trends, compare buildings, and review OCR quality.",
  users: "Add and manage people who can use the system.",
  profile: "View your account information and role permissions.",
  settings: "Update your account details and password. Admins also set the electricity rate.",
};

const roleHomePage = {
  Admin: "dashboard",
  Manager: "dashboard",
  Staff: "dashboard",
};

function getInitialAuthState() {
  const savedToken = getToken();
  const savedUser = getSavedUser();

  if (!savedToken || !savedUser) {
    clearSavedLogin();

    return {
      isAuthenticated: false,
      user: null,
      role: "Staff",
    };
  }

  if (savedUser.status !== "Active") {
    clearSavedLogin();

    return {
      isAuthenticated: false,
      user: null,
      role: "Staff",
    };
  }

  return {
    isAuthenticated: true,
    user: savedUser,
    role: savedUser.role || "Staff",
  };
}

function getInitials(name, username) {
  const source = name || username || "User";
  const words = source.trim().split(" ").filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function App() {
  const initialAuth = getInitialAuthState();

  const [isAuthenticated, setIsAuthenticated] = useState(
    initialAuth.isAuthenticated
  );
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [role, setRole] = useState(initialAuth.role);
  const [user, setUser] = useState(initialAuth.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerNotice, setHeaderNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // apiFetch raises this when the backend rejects our token, which in practice means
  // it expired mid-session. Signing the user out here is the only way to recover:
  // pages have no way to reach this state on their own, so before this they simply
  // kept failing while the user still appeared to be logged in.
  useEffect(() => {
    function handleSessionExpiry() {
      clearSavedLogin();

      setUser(null);
      setRole("Staff");
      setIsAuthenticated(false);
      setCurrentPage("signIn");
      setHeaderNotice("");
      setSidebarOpen(false);
      setAuthNotice("Your session has expired. Please sign in again.");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry);

    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry);
  }, []);

  useEffect(() => {
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen, isMobile]);

  const navItems = useMemo(() => {
    return nav.filter((item) => item.roles.includes(role));
  }, [role]);

  // Grouped view of the same items. navItems stays flat because search, the
  // active-page lookup and the mobile bottom bar all index into it directly.
  const navGroups = useMemo(() => {
    return NAV_GROUP_ORDER.map((title) => ({
      title,
      items: navItems.filter((item) => item.group === title),
    })).filter((group) => group.items.length > 0);
  }, [navItems]);

  const active = navItems.find((item) => item.id === currentPage) || navItems[0];

  const searchablePages = useMemo(() => {
    return navItems.filter((item) => {
      const searchValue = searchQuery.toLowerCase().trim();

      if (!searchValue) {
        return false;
      }

      return (
        item.label.toLowerCase().includes(searchValue) ||
        item.hint.toLowerCase().includes(searchValue) ||
        pageDescriptions[item.id]?.toLowerCase().includes(searchValue)
      );
    });
  }, [navItems, searchQuery]);

  function canAccess(pageId) {
    return nav.some((item) => item.id === pageId && item.roles.includes(role));
  }

  function getFallbackPage() {
    return roleHomePage[role] || "dashboard";
  }

  function goToPage(pageId) {
    if (!canAccess(pageId)) {
      setHeaderNotice("Your current role does not have access to that page.");
      setCurrentPage(getFallbackPage());
      setSidebarOpen(false);
      return;
    }

    setHeaderNotice("");
    setCurrentPage(pageId);
    setSearchQuery("");
    setSidebarOpen(false);
  }

  function login(loggedInUser) {
    if (!loggedInUser || loggedInUser.status !== "Active") {
      clearSavedLogin();

      setUser(null);
      setRole("Staff");
      setIsAuthenticated(false);
      setCurrentPage("signIn");
      return;
    }

    const userRole = loggedInUser.role || "Staff";

    // Arm the expiry announcement again for this new session.
    resetSessionExpiryGuard();

    setUser(loggedInUser);
    setRole(userRole);
    setIsAuthenticated(true);
    setCurrentPage("dashboard");
    setHeaderNotice("");
    setAuthNotice("");
  }

  function logout() {
    clearSavedLogin();
    resetSessionExpiryGuard();

    setUser(null);
    setRole("Staff");
    setIsAuthenticated(false);
    setCurrentPage("signIn");
    setHeaderNotice("");
    setAuthNotice("");
  }

  function goToSignUp() {
    clearSavedLogin();

    setUser(null);
    setRole("Staff");
    setIsAuthenticated(false);
    setCurrentPage("signUp");
  }

  function goToLogin() {
    clearSavedLogin();

    setUser(null);
    setRole("Staff");
    setIsAuthenticated(false);
    setCurrentPage("signIn");
  }

  function renderPage() {
    const hasAccess = canAccess(currentPage);

    if (!hasAccess) {
      return <Dashboard role={role} setCurrentPage={goToPage} />;
    }

    if (currentPage === "dashboard") {
      return <Dashboard role={role} setCurrentPage={goToPage} />;
    }

    if (currentPage === "map") {
      return <BuildingMap />;
    }

    // Both pages are open to Manager and Admin, but deletion is Admin-only on the
    // backend. Passing the role lets them hide the actions a Manager would only
    // get a 403 from.
    if (currentPage === "buildings") {
      return <BuildingsList role={role} />;
    }

    if (currentPage === "meters") {
      return <MetersPage role={role} />;
    }

    if (currentPage === "ocr") {
      return <UploadOCR />;
    }

    if (currentPage === "reports") {
      return <Reports />;
    }

    if (currentPage === "analytics") {
      return <Analytics />;
    }

    if (currentPage === "users") {
      return <AdminUsers />;
    }

    if (currentPage === "profile") {
      return (
        <ProfilePage
          user={user}
          role={role}
          onLogout={logout}
          setCurrentPage={goToPage}
        />
      );
    }

    if (currentPage === "settings") {
      return <SettingsPage role={role} />;
    }

    return <Dashboard role={role} setCurrentPage={goToPage} />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageFallback />}>
        {currentPage === "signUp" ? (
          <SignUpRole onBack={goToLogin} />
        ) : currentPage === "forgotPassword" ? (
          <ForgotPassword onBack={() => setCurrentPage("signIn")} />
        ) : (
          <SignIn
            onLogin={login}
            onSignUp={goToSignUp}
            onForgot={() => setCurrentPage("forgotPassword")}
            notice={authNotice}
          />
        )}
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className={`fixed left-4 top-4 z-[10001] rounded-2xl bg-emerald-700 p-3 text-white shadow-xl lg:hidden transition-opacity duration-200 ${sidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <Menu size={20} />
      </button>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-[10000] bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-[10002] flex flex-col border-r border-white/10 bg-slate-950 px-4 py-5 text-white shadow-xl lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "lg:w-[68px] lg:px-2" : "w-[296px]"}`}
        style={{ transition: "width 300ms ease-in-out, transform 300ms ease-in-out", willChange: "transform" }}
      >
        {/* Collapsed desktop: stack logo + toggle vertically, centered */}
        <div
          className={`mb-6 flex px-2 ${
            sidebarCollapsed
              ? "lg:flex-col lg:items-center lg:gap-2 lg:px-0"
              : "items-center justify-between"
          }`}
        >
          {/* Logo row */}
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-md transition-[width,height] duration-300 ease-in-out ${
                sidebarCollapsed ? "h-14 w-14 lg:h-10 lg:w-10" : "h-14 w-14"
              }`}
            >
              <img
                src={logo}
                alt={SYSTEM_NAME}
                className="h-full w-full object-cover"
              />
            </div>

            <div
              className={`min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out ${
                sidebarCollapsed
                  ? "max-w-0 opacity-0"
                  : "max-w-[185px] opacity-100"
              }`}
            >
              <h1 className="truncate text-xl font-bold leading-none text-white">
                {SYSTEM_NAME}
              </h1>
              <p className="mt-1 truncate text-[10px] font-semibold uppercase leading-4 tracking-[0.13em] text-lime-300">
                {SYSTEM_TAGLINE}
              </p>
            </div>
          </div>

          {/* Mobile: close button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <X size={18} />
          </button>

          {/* Desktop: collapse / expand toggle */}
          <button
            type="button"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="hidden shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white lg:flex"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              {sidebarCollapsed ? (
                <div className="mx-auto h-px w-6 bg-white/10 lg:my-2" />
              ) : (
                <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {group.title}
                </p>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const activeItem = currentPage === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    // The hint used to be a second line under every label; it
                    // mostly restated the label, so it lives in the tooltip now.
                    title={sidebarCollapsed ? item.label : item.hint}
                    onClick={() => goToPage(item.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition ${
                      activeItem
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    } ${sidebarCollapsed ? "lg:justify-center lg:px-2" : ""}`}
                  >
                    <Icon
                      size={19}
                      className={`shrink-0 ${
                        activeItem ? "text-lime-300" : "text-slate-400"
                      }`}
                    />

                    <span
                      className={`min-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width,opacity] duration-300 ease-in-out ${
                        sidebarCollapsed
                          ? "max-w-0 opacity-0 lg:hidden"
                          : "max-w-[200px] opacity-100"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          title={sidebarCollapsed ? "Sign out" : undefined}
          onClick={() => setShowLogoutModal(true)}
          className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-500 ${
            sidebarCollapsed ? "lg:justify-center lg:px-2" : ""
          }`}
        >
          <LogOut size={14} className="shrink-0" />
          <span
            className={`overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out ${
              sidebarCollapsed ? "max-w-0 opacity-0 lg:hidden" : "max-w-[200px] opacity-100"
            }`}
          >
            Sign out
          </span>
        </button>
      </aside>

      <ConfirmationModal
        isOpen={showLogoutModal}
        variant="danger"
        title="Sign Out"
        message="Are you sure you want to sign out? Any unsaved changes will be lost."
        confirmText="Sign Out"
        cancelText="Stay"
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={() => { setShowLogoutModal(false); logout(); }}
      />

      <main
        className={`min-h-screen ${
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-[296px]"
        }`}
        style={{ transition: "padding-left 300ms ease-in-out" }}
      >
        <header className="sticky top-0 z-[9999] border-b border-slate-200/80 bg-white">
          <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 md:px-8">
            <div className="ml-14 min-w-0 lg:ml-0">
              <h2 className="truncate text-sm font-semibold text-slate-700">
                {active?.label || "Dashboard"}
              </h2>
            </div>

            <div className="relative hidden max-w-md flex-1 xl:block">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-400">
                <Search size={18} />

                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search pages..."
                  className="w-full bg-transparent text-sm font-bold text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>

              {searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-[58px] z-[10000] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  {searchablePages.length === 0 ? (
                    <div className="p-4 text-sm font-medium text-slate-400">
                      No page found for your role.
                    </div>
                  ) : (
                    searchablePages.map((item) => {
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => goToPage(item.id)}
                          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                        >
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                            <Icon size={17} />
                          </div>

                          <span>
                            <span className="block text-sm font-semibold text-slate-950">
                              {item.label}
                            </span>
                            <span className="block text-xs font-bold text-slate-500">
                              {item.hint}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* The notification bell was removed. Clicking it only produced a
                banner saying a notification centre was "prepared for alerts", and
                its unread dot was a hardcoded red circle that never changed.
                Alerts live on the Dashboard, Analytics and GIS Map instead. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage("profile")}
                className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:bg-slate-50 md:flex"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                  {getInitials(user?.full_name, user?.username)}
                </div>

                <div className="text-left">
                  <p className="max-w-[140px] truncate text-sm font-semibold text-slate-950">
                    {user?.full_name || "User"}
                  </p>
                  <p className="text-xs font-bold text-emerald-700">{role}</p>
                </div>
              </button>
            </div>
          </div>

          {headerNotice && (
            <div className="border-t border-amber-100 bg-amber-50 px-5 py-2 md:px-8">
              <div className="flex items-start gap-2 text-xs font-medium text-amber-800">
                <AlertTriangle
                  size={15}
                  className="mt-0.5 shrink-0 text-amber-600"
                />

                <span>{headerNotice}</span>
              </div>
            </div>
          )}
        </header>

        <div className={`p-5 md:p-8 ${isMobile ? "pb-24" : ""}`}>
          <Suspense fallback={<PageFallback />}>{renderPage()}</Suspense>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-[10003] border-t border-slate-200 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-stretch">
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToPage(item.id)}
                  className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-center transition-all duration-200 ${
                    isActive ? "text-emerald-700" : "text-slate-400"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-emerald-700" />
                  )}
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-emerald-700" : "text-slate-400"}`}>
                    {item.label === "Add Meter Reading" ? "Capture" : item.label}
                  </span>
                </button>
              );
            })}

            {/* More button — opens sidebar */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-slate-400 transition-all duration-200"
            >
              <Menu size={20} strokeWidth={1.8} />
              <span className="text-[10px] font-semibold leading-none text-slate-400">More</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;