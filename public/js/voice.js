// Browser-built-in speech: SpeechSynthesis (read aloud) and SpeechRecognition (voice input). No keys, no servers.
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canListen = !!Recognition;

let speaking = Promise.resolve();
let currentRec = null;

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const lang = (navigator.language || 'en-US').toLowerCase();
  return voices.find(v => v.lang.toLowerCase() === lang && /natural|google|samantha|premium|enhanced/i.test(v.name))
    || voices.find(v => v.lang.toLowerCase() === lang)
    || voices.find(v => v.lang.toLowerCase().startsWith('en'));
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}

/** Speak text; resolves when finished (or if speech is unavailable). */
export function speak(text, { rate = 1 } = {}) {
  if (!canSpeak || !text) return Promise.resolve();
  abortListening();
  speechSynthesis.cancel();
  const p = new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = 1;
    const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
    const guard = setTimeout(finish, Math.max(4000, text.length * 120)); // some browsers never fire onend
    u.onend = finish; u.onerror = finish;
    speechSynthesis.speak(u);
  });
  speaking = p;
  return p;
}

export const whenQuiet = () => speaking;

export function abortListening() {
  if (currentRec) { try { currentRec.abort(); } catch { /* already stopped */ } currentRec = null; }
}

/** Listen for one utterance. Resolves with the transcript or '' (silence). Rejects with Error('not-allowed') if mic is blocked. */
export function listenOnce({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(new Error('unsupported'));
    abortListening();
    const rec = new Recognition();
    currentRec = rec;
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    let text = '', settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(t); if (currentRec === rec) currentRec = null; fn(v); } };
    const t = setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, timeout);
    rec.onresult = e => { text = Array.from(e.results).map(r => r[0].transcript).join(' ').trim(); };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') done(reject, new Error('not-allowed'));
      else done(resolve, '');
    };
    rec.onend = () => done(resolve, text);
    try { rec.start(); } catch { done(resolve, ''); }
  });
}

// "set a timer for ten minutes" -> seconds
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, sixty: 60, half: 0.5 };
export function parseTimer(t) {
  const m = t.match(/(\d+(?:\.\d+)?|a half|half|forty five|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|sixty)\s*(?:and a half\s*)?(seconds?|minutes?|mins?|hours?)/);
  if (!m) return null;
  const n = isNaN(m[1]) ? NUM_WORDS[m[1].replace('a half', 'half')] : Number(m[1]);
  if (!n) return null;
  const unit = m[2][0];
  return Math.round(n * (unit === 's' ? 1 : unit === 'h' ? 3600 : 60) * (/and a half/.test(t) ? 1.5 : 1));
}

let audioCtx;
export function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(d => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d + 0.2);
      o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.22);
    });
  } catch { /* audio blocked */ }
}
