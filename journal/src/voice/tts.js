// Listen and reflect: read an entry aloud with the device's own voices
// (free, offline on most phones, Vietnamese voices included on iOS/Android).

const VI_RE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export function ttsSupported() {
  return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

function voiceFor(lang) {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang?.toLowerCase().startsWith(lang)) || null;
}

/** Speak text; returns a controller {stop(), pause(), resume(), done: Promise}. */
export function speak(text, { lang, rate = 1 } = {}) {
  speechSynthesis.cancel();
  const plain = String(text || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/[*_#>`]/g, "").trim();
  const code = lang || (VI_RE.test(plain) ? "vi" : (navigator.language || "en").slice(0, 2));
  // Long texts are chunked by sentence; some engines stop after ~15 seconds otherwise.
  const parts = plain.match(/[^.!?\n]+[.!?\n]*\s*/g) || [plain];
  let stopped = false;
  const done = new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (stopped || i >= parts.length) return resolve();
      const u = new SpeechSynthesisUtterance(parts[i++]);
      const v = voiceFor(code);
      if (v) u.voice = v;
      u.lang = v?.lang || (code === "vi" ? "vi-VN" : code);
      u.rate = rate;
      u.onend = next;
      u.onerror = next;
      speechSynthesis.speak(u);
    };
    next();
  });
  return {
    done,
    stop() { stopped = true; speechSynthesis.cancel(); },
    pause() { speechSynthesis.pause(); },
    resume() { speechSynthesis.resume(); },
  };
}
