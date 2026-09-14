import { getToken, handleSessionExpired } from "./session";

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });

  // A token expires after an hour. Without this the app kept the user "signed in"
  // on a page where every request failed, showing a generic red toast that vanished
  // after 2.5 seconds and never explaining why. Signing out is the honest response.
  //
  // Only 401 (bad or expired credentials) ends the session. A 403 is a working
  // token that simply lacks permission for that action, which the page reports
  // normally.
  if (response.status === 401 && token) {
    handleSessionExpired();
  }

  return response;
}
