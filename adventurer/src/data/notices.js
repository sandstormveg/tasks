// The Android shell's Notices bridge (a Capacitor plugin): auth for its background
// checker, notification permission, and local notifications. On the web this is
// null and every call quietly does nothing.

function notices(scope = globalThis) {
  const win = scope.window || scope;
  const cap = win.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  return cap.Plugins?.Notices || null;
}

export async function setNoticesAuth(token, owner, repo) {
  try { await notices()?.setAuth({ token, owner, repo }); } catch {}
}

export async function clearNoticesAuth() {
  try { await notices()?.clearAuth(); } catch {}
}

/** {granted} or null without the plugin. */
export async function requestNotify() {
  try { return (await notices()?.requestNotify()) || null; } catch { return null; }
}

export async function notify({ id, title, body }) {
  try { await notices()?.notify({ id, title, body }); } catch {}
}
