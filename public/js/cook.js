// Hands-free cooking mode: reads each step aloud, listens for commands, and answers questions out loud.
import { pushLayer, closeTop, $, esc, toast } from './ui.js';
import { speak, stopSpeaking, listenOnce, abortListening, canSpeak, canListen, parseTimer, beep, whenQuiet } from './voice.js';
import { localAnswer } from './engine.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function startCooking(ev, deps) {
  const r = ev.recipe, steps = r.steps, n = steps.length;
  const st = { i: 0, active: true, mute: !deps.settings.speak || !canSpeak, hands: !!deps.settings.handsFree && canListen, timers: [], looping: false, wake: null, tick: null, notifiedAi: false };
  let root;

  const ingredientLine = () => r.ingredients.filter(i => !i.optional || true).map(i => `${i.q ? i.q + ' ' : ''}${i.name}`.trim()).join(', ');
  const textFor = i => (i === 0 ? `Let's make ${r.title}. You'll need: ${ingredientLine()}. Say next when you're ready.` : `Step ${i} of ${n}. ${steps[i - 1]}`);

  async function say(text, { show = true } = {}) {
    if (show) setAnswer(text);
    if (!st.mute && st.active) await speak(text, { rate: deps.settings.rate || 1 });
  }

  function setAnswer(t) { const a = $('#cAnswer', root); if (a) { a.textContent = t; a.classList.toggle('on', !!t); } }

  function paint() {
    const stage = $('#cStage', root);
    if (st.i === 0) {
      stage.innerHTML = `<div class="step-label">Before you start</div><h2 class="step-text">Gather your ingredients</h2>
        <ul class="cook-ings">${r.ingredients.map(i => `<li class="${ev.missing.some(m => m.name === i.name) ? 'miss' : ''}"><b>${esc(i.q)}</b> ${esc(i.name)}${i.optional ? ' <em>(optional)</em>' : ''}${i.swappedFrom ? ` <small>(instead of ${esc(i.swappedFrom)})</small>` : ''}</li>`).join('')}</ul>`;
    } else {
      const mins = (steps[st.i - 1].match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:minutes?|mins?)/i) || []);
      const t = mins[1] ? Math.max(Number(mins[1]), Number(mins[2] || 0)) : 0;
      stage.innerHTML = `<div class="step-label">Step ${st.i} of ${n}</div><p class="step-text">${esc(steps[st.i - 1])}</p>
        ${t ? `<button class="btn soft" data-timer="${t * 60}">⏱ Start ${t}-minute timer</button>` : ''}`;
    }
    $('#cBar', root).style.width = `${(st.i / n) * 100}%`;
    $('#cPrev', root).disabled = st.i === 0;
    const last = st.i === n;
    const next = $('#cNext', root);
    next.innerHTML = last ? '✓ Finished!' : st.i === 0 ? "Let's go ▶" : 'Next ▶';
    next.classList.toggle('done', last);
    stage.scrollTop = 0;
  }

  function paintTimers() {
    const box = $('#cTimers', root);
    if (!box) return;
    box.innerHTML = st.timers.map(t => `<span class="timer-chip ${t.left <= 10 ? 'soon' : ''}">⏲ ${esc(t.label)} · ${fmt(t.left)} <button data-cancel-timer="${t.id}" aria-label="Cancel timer">✕</button></span>`).join('');
  }

  function addTimer(sec, label) {
    const t = { id: Math.random().toString(36).slice(2), left: sec, label: label || fmt(sec) };
    st.timers.push(t); paintTimers();
    return t;
  }

  function tickTimers() {
    let fired = false;
    for (const t of st.timers) { t.left -= 1; if (t.left <= 0) fired = t; }
    st.timers = st.timers.filter(t => t.left > 0);
    paintTimers();
    if (fired) { beep(); say(`Your ${fired.label} timer is done!`); }
  }

  async function goto(k, { speakIt = true } = {}) {
    st.i = Math.max(0, Math.min(n, k));
    paint();
    if (speakIt) await say(textFor(st.i), { show: false });
  }

  async function next() {
    if (st.i >= n) return finish();
    return goto(st.i + 1);
  }

  function finish() {
    stopSpeaking();
    deps.onFinish(ev);
  }

  async function askAi(question) {
    setAnswer('Thinking…');
    try {
      const { answer } = await deps.ask({
        question, step: Math.max(0, st.i - 1),
        recipe: { title: r.title, ingredients: r.ingredients.map(i => `${i.q} ${i.name}`.trim()), steps },
      });
      await say(answer);
    } catch (e) {
      if (!st.notifiedAi && /not_configured|offline|bad_key|access_code/.test(e.code || '')) { st.notifiedAi = true; toast(e.message || 'AI helper unavailable'); }
      await say(localAnswer(question, r, deps.restr));
    }
  }

  const commands = [
    [/\b(cancel|stop|clear) (the )?timers?\b/, async () => { st.timers = []; paintTimers(); await say('Timer cancelled.'); }],
    [/\btimer\b/, async t => {
      const s = parseTimer(t);
      if (!s) return say('For how long? Try saying, set a timer for ten minutes.');
      addTimer(s, s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`);
      await say(`Timer set for ${s >= 60 ? Math.round(s / 60) + ' minutes' : s + ' seconds'}.`);
    }],
    [/^(i m |i am |we re |all )?(done|finished|finish|complete|completed)( cooking| with (this|the) (recipe|dish))?$|\bfinish (the )?(recipe|cooking)\b|\b(mark|made) (it )?(as )?(made|done)\b/, async () => { if (st.i >= n - 0) return finish(); return next(); }],
    [/^(next|next step|continue|go on|go next|okay next|ok next|ready|let s go|lets go|go ahead|keep going)$/, () => next()],
    [/^(back|go back|previous|previous step|last step|one back)$/, () => goto(st.i - 1)],
    [/\b(repeat|again|say that|what was that|pardon|come again)\b/, () => goto(st.i)],
    [/\b(ingredients|what do i need)\b/, async () => { await say(`You'll need: ${ingredientLine()}.`); }],
    [/\b(start over|restart|from the top|beginning)\b/, () => goto(0)],
    [/\b(stop listening|turn off (the )?(mic|microphone|listening)|hands free off)\b/, async () => { setHands(false); await say('Okay, I stopped listening. Tap the mic when you need me.'); }],
    [/^(stop|quiet|be quiet|shush|silence|pause|hush)$/, () => { stopSpeaking(); }],
  ];

  async function handle(raw) {
    const t = raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const heard = $('#cHeard', root); if (heard) heard.textContent = `“${raw}”`;
    for (const [re, fn] of commands) if (re.test(t)) return fn(t);
    return askAi(raw);
  }

  async function loop() {
    if (st.looping) return;
    st.looping = true;
    while (st.active && st.hands) {
      await whenQuiet();
      if (!st.active || !st.hands) break;
      setMic(true);
      let text = '';
      try { text = await listenOnce(); } catch (e) {
        setMic(false);
        if (e.message === 'not-allowed') toast('Microphone is blocked. Allow it in your browser settings, or use the buttons.');
        setHands(false); break;
      }
      setMic(false);
      if (!st.active) break;
      if (text) await handle(text); else await sleep(300);
    }
    st.looping = false;
  }

  function setMic(on) { const m = $('#cMic', root); if (m) m.classList.toggle('listening', on); }
  function setHands(on) {
    st.hands = on && canListen;
    const c = $('#cHands', root); if (c) c.checked = st.hands;
    if (st.hands) loop(); else abortListening();
  }

  async function pushToTalk() {
    if (!canListen) return toast("Voice input isn't supported in this browser. Type your question instead.");
    stopSpeaking();
    if (st.hands) { abortListening(); return; }
    setMic(true);
    try {
      const text = await listenOnce();
      setMic(false);
      if (text) await handle(text); else setAnswer("I didn't catch that. Try again?");
    } catch (e) { setMic(false); toast(e.message === 'not-allowed' ? 'Microphone is blocked in your browser settings.' : 'Could not start the microphone.'); }
  }

  async function wakeLock() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') st.wake = await navigator.wakeLock.request('screen'); } catch { /* optional */ }
  }
  const onVis = () => { if (st.active) wakeLock(); };

  function cleanup() {
    st.active = false;
    stopSpeaking(); abortListening();
    clearInterval(st.tick);
    document.removeEventListener('visibilitychange', onVis);
    try { st.wake && st.wake.release(); } catch { /* noop */ }
    if (deps.onClose) deps.onClose();
  }

  const html = `<div class="cook">
    <div class="cook-top">
      <button class="icon-btn" data-act="close-layer" aria-label="Exit cooking mode">✕</button>
      <div class="cook-title">${esc(r.emoji)} ${esc(r.title)}</div>
      <button class="icon-btn" id="cMute" aria-label="Turn voice on or off">${st.mute ? '🔇' : '🔊'}</button>
    </div>
    <div class="cook-bar"><i id="cBar"></i></div>
    <div class="cook-stage" id="cStage"></div>
    <div class="cook-extra">
      <div id="cTimers" class="timers"></div>
      <div id="cHeard" class="heard"></div>
      <div class="cook-answer" id="cAnswer" aria-live="polite"></div>
    </div>
    <div class="cook-controls">
      <button class="btn big ghost" id="cPrev">◀ Back</button>
      <button class="mic" id="cMic" aria-label="Ask a question or say a command">🎤</button>
      <button class="btn big primary" id="cNext">Next ▶</button>
    </div>
    <form class="cook-ask" id="cAsk" autocomplete="off">
      <input id="cQ" placeholder="Ask anything, e.g. what can I use instead of butter?" aria-label="Ask a question" enterkeyhint="send">
      <button class="btn soft" type="submit">Ask</button>
    </form>
    <label class="cook-hands ${canListen ? '' : 'hide'}"><input type="checkbox" id="cHands" ${st.hands ? 'checked' : ''}> Hands-free: listen for “next”, “repeat”, “set a timer…” or any question</label>
    ${canListen ? '' : '<p class="muted small center">Voice input needs Chrome, Edge or Safari. You can still use the buttons and the question box.</p>'}
  </div>`;

  root = pushLayer(html, {
    cls: 'full cookmode', onClose: cleanup,
    onMount: el => {
      root = el;
      paint();
      $('#cPrev', el).onclick = () => goto(st.i - 1);
      $('#cNext', el).onclick = () => next();
      $('#cMic', el).onclick = pushToTalk;
      $('#cMute', el).onclick = e => {
        st.mute = !st.mute; e.currentTarget.textContent = st.mute ? '🔇' : '🔊';
        if (st.mute) stopSpeaking(); else goto(st.i);
      };
      $('#cHands', el).onchange = e => setHands(e.target.checked);
      $('#cAsk', el).onsubmit = e => { e.preventDefault(); const q = $('#cQ', el); const v = q.value.trim(); q.value = ''; if (v) { stopSpeaking(); handle(v); } };
      el.addEventListener('click', e => {
        const t = e.target.closest('[data-timer]');
        if (t) { const s = Number(t.dataset.timer); addTimer(s, `${Math.round(s / 60)} min`); say(`Timer set for ${Math.round(s / 60)} minutes.`); }
        const c = e.target.closest('[data-cancel-timer]');
        if (c) { st.timers = st.timers.filter(x => x.id !== c.dataset.cancelTimer); paintTimers(); }
      });
      st.tick = setInterval(() => { if (st.timers.length) tickTimers(); }, 1000);
      document.addEventListener('visibilitychange', onVis);
      wakeLock();
      // first utterance, then start listening
      goto(0).then(() => { if (st.hands) loop(); });
    },
  });
}
