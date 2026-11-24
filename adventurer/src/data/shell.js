// The Android shell's own bridges: Sign in with GitHub (device flow, done natively
// because github.com's OAuth endpoints refuse browser requests) and updates for the
// shell itself. On the web both are null and the page falls back to pasting a token.

function plugin(name, scope = globalThis) {
  const win = scope.window || scope;
  const cap = win.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  return cap.Plugins?.[name] || null;
}

export const canSignIn = () => !!plugin("GitHubAuth");

/** Starts sign-in: {userCode, uri, deviceCode, interval, expiresIn}; opens GitHub's page. Throws if offline. */
export async function startSignIn() {
  const p = plugin("GitHubAuth");
  if (!p) throw new Error("Sign-in needs the Adventurer app");
  return p.start({ open: true });
}

/** {token} once approved, or {error: "denied"|"expired"|"cancelled"}. */
export async function awaitSignIn(code) {
  return plugin("GitHubAuth").await({ deviceCode: code.deviceCode, interval: code.interval, expiresIn: code.expiresIn });
}

export async function cancelSignIn() {
  try { await plugin("GitHubAuth")?.cancel(); } catch {}
}

/** {current, currentName, latest, latestName, notes, url, available} or null on the web. */
export async function checkUpdate() {
  try { return (await plugin("Updater")?.check()) || null; } catch { return null; }
}

/** {started} or {needsPermission}; throws if the download fails. */
export async function installUpdate(url) {
  return plugin("Updater").install({ url });
}
