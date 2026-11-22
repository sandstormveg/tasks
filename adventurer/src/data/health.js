// The Android shell's Health Connect bridge (a Capacitor plugin). On the plain
// web there is no plugin, so health() is null and the app behaves as before.
// Only the Train tab ever calls these; nothing reads health data elsewhere.

/** The HealthSteps plugin when this page is inside the native shell, else null. */
export function health(scope = globalThis) {
  const win = scope.window || scope;
  const cap = win.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  return cap.Plugins?.HealthSteps || null;
}

/** Steps and distance between two ISO instants, from the plugin. Distance may be null. */
export async function readDelta(plugin, start, end) {
  const [s, d] = await Promise.all([
    plugin.readSteps({ start, end }),
    Promise.resolve()
      .then(() => plugin.readDistance({ start, end }))
      .catch(() => null),
  ]);
  const meters = Number(d?.meters);
  return {
    steps: Math.max(0, Math.round(Number(s?.steps) || 0)),
    meters: Number.isFinite(meters) ? meters : null,
  };
}
