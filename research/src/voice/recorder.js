// Microphone recording with a level meter. Picks a format the browser can
// record (Opus/WebM on Chrome & Firefox, AAC/MP4 on Safari).

export function recordingSupported() {
  return !!(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
}

export function pickMime() {
  const opts = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  for (const m of opts) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
  return "";
}

export async function startRecording({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const startedAt = performance.now();
  let pausedMs = 0, pausedAt = 0;
  rec.start(1000);

  let raf = 0, ac;
  if (onLevel && (globalThis.AudioContext || globalThis.webkitAudioContext)) {
    try {
      ac = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        onLevel(Math.min(1, peak / 64));
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* meter is optional */ }
  }

  const teardown = () => {
    cancelAnimationFrame(raf);
    ac?.close?.().catch(() => {});
    for (const t of stream.getTracks()) t.stop();
  };
  return {
    mimeType: rec.mimeType || mimeType,
    elapsed: () => (performance.now() - startedAt - pausedMs - (pausedAt ? performance.now() - pausedAt : 0)) / 1000,
    pause() { if (rec.state === "recording") { rec.pause(); pausedAt = performance.now(); } },
    resume() { if (rec.state === "paused") { rec.resume(); pausedMs += performance.now() - pausedAt; pausedAt = 0; } },
    get state() { return rec.state; },
    stop() {
      return new Promise((resolve) => {
        const duration = this.elapsed();
        rec.onstop = () => { teardown(); resolve({ blob: new Blob(chunks, { type: (rec.mimeType || mimeType || "audio/webm").split(";")[0] }), duration }); };
        if (rec.state !== "inactive") rec.stop(); else rec.onstop();
      });
    },
    cancel() { try { rec.stop(); } catch { /* already stopped */ } teardown(); },
  };
}
