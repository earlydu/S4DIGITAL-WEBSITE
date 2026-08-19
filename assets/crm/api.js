// Every call to the server goes through here.
// One endpoint, one action, POST only, cookies included. A 401 anywhere means
// the session has gone, so the app is told to show the sign-in screen again.

const listeners = new Set();
export const onSignedOut = fn => listeners.add(fn);

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(action, body = {}) {
  let res;
  try {
    res = await fetch(`/api/crm?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No connection to the server.', 0);
  }

  let data = {};
  try { data = await res.json(); } catch { data = {}; }

  if (res.status === 401 && action !== 'login' && action !== 'unlock' && action !== 'status') {
    listeners.forEach(fn => fn());
  }
  if (!res.ok) throw new ApiError(data.error || `Something went wrong (${res.status}).`, res.status);
  return data;
}

/** Shared client state, so views do not each refetch the same settings. */
export const state = {
  user: null,
  settings: null,
  today: null,
  driver: 'sqlite',
  durable: true,
};

export async function loadSettings(force = false) {
  if (state.settings && !force) return state.settings;
  const out = await api('settings');
  state.settings = out.settings;
  state.meta = out;
  return state.settings;
}
