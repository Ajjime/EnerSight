// Single source of truth for the stored login.
//
// The saved session lives across four localStorage keys, and it used to be cleared
// by three separate copies of this logic that had already drifted apart (ProfilePage
// removed only two of the four). Everything clears through here now so no key is
// left behind.

export const SESSION_EXPIRED_EVENT = "enersight:session-expired";

const SESSION_KEYS = ["token", "user", "role", "fullName"];

export function clearSavedLogin() {
  SESSION_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Private mode or blocked site data. Nothing useful to do here.
    }
  });
}

export function getSavedUser() {
  try {
    const savedUser = localStorage.getItem("user");

    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

// Several requests usually fail together when a token expires (pages fetch
// buildings, meters and readings in parallel). Without this guard each one would
// fire its own event and the sign-out would run three or four times.
let hasNotifiedExpiry = false;

export function handleSessionExpired() {
  if (hasNotifiedExpiry) {
    return;
  }

  hasNotifiedExpiry = true;
  clearSavedLogin();
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

// Call on a successful sign-in so the next expiry is announced again.
export function resetSessionExpiryGuard() {
  hasNotifiedExpiry = false;
}
