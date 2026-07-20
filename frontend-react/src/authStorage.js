// Single 'auth' blob shared by every login flow (admin and consultant
// alike) - persisted to localStorage when "Rester connectée" is checked
// (survives closing the browser) or sessionStorage when it isn't (cleared
// when the tab closes). Never both at once, so switching the checkbox or
// logging out can't leave a stale copy in the other store to resurface
// later. authProvider.js, authHeader.js, dataProvider.js and
// ChatCvScreen.jsx's auto-login all read through here rather than hitting
// localStorage directly, so they agree on where a session might be found.
const KEY = 'auth';

export function readAuth() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeAuth(data, remember = true) {
  const json = JSON.stringify(data);
  if (remember) {
    sessionStorage.removeItem(KEY);
    localStorage.setItem(KEY, json);
  } else {
    localStorage.removeItem(KEY);
    sessionStorage.setItem(KEY, json);
  }
}

export function clearAuth() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}
