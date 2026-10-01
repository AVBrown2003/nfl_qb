/* Optional sound, off by default. A speaker button in the nav turns it on (the choice is remembered
   in this browser). Every sound is synthesized with the Web Audio API, so there are no audio files:
   a crowd cheer when the career explorer lands on a QB's best season, boos on his worst. */

const Sound = (() => {
  const KEY = "qb-sound";
  let on = false, ctx = null, master = null;
  try { on = localStorage.getItem(KEY) === "on"; } catch (e) { /* storage blocked: stay off */ }

  // the audio context has to start from a click, which the toggle provides
  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function noise(c, secs) {
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * secs), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  // gain envelope: silent → peak by `rise`, hold until `hold`, fade out by `end` (seconds from t)
  function env(g, t, peak, rise, hold, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + rise);
    g.gain.setValueAtTime(peak, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + end);
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  function cheer() {
    if (!on) return;
    const c = audio(), t = c.currentTime + 0.02, dur = 2.8;
    // the roar: band-passed noise that swells and fades
    const roar = c.createBufferSource(); roar.buffer = noise(c, dur);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.6;
    bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1400, t + 0.7);
    const rg = c.createGain(); env(rg, t, 0.5, 0.45, 1.3, dur);
    roar.connect(bp).connect(rg).connect(master); roar.start(t); roar.stop(t + dur);
    // "woo"s: a handful of voices gliding upward
    for (let k = 0; k < 7; k++) {
      const s = t + rand(0.1, 0.9), f = rand(380, 720), o = c.createOscillator(), g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * rand(1.3, 1.6), s + 0.5);
      env(g, s, 0.05, 0.08, 0.45, 0.9);
      o.connect(g).connect(master); o.start(s); o.stop(s + 1);
    }
    // claps: short, bright noise bursts
    for (let k = 0; k < 30; k++) {
      const s = t + rand(0.2, 2.2), b = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      b.buffer = noise(c, 0.05); hp.type = "highpass"; hp.frequency.value = 1500;
      env(g, s, rand(0.08, 0.18), 0.003, 0.01, 0.05);
      b.connect(hp).connect(g).connect(master); b.start(s); b.stop(s + 0.06);
    }
  }

  function boo() {
    if (!on) return;
    const c = audio(), t = c.currentTime + 0.02, dur = 2.5;
    // a dark "oo" vowel: low voices through a low-pass filter
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 1.2;
    const vg = c.createGain(); env(vg, t, 0.5, 0.35, 1.4, dur);
    lp.connect(vg).connect(master);
    for (let k = 0; k < 12; k++) {
      const s = t + rand(0, 0.35), f = rand(95, 175), o = c.createOscillator(), g = c.createGain();
      const wob = c.createOscillator(), wg = c.createGain();   // a little vibrato so it sounds like people
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, s); o.frequency.linearRampToValueAtTime(f * 0.88, t + dur);
      wob.frequency.value = rand(4, 6.5); wg.gain.value = f * 0.02;
      wob.connect(wg).connect(o.frequency);
      g.gain.value = 0.07;
      o.connect(g).connect(lp); o.start(s); o.stop(t + dur); wob.start(s); wob.stop(t + dur);
    }
    // crowd rumble underneath
    const r = c.createBufferSource(), rl = c.createBiquadFilter(), rg = c.createGain();
    r.buffer = noise(c, dur); rl.type = "lowpass"; rl.frequency.value = 400;
    env(rg, t, 0.18, 0.4, 1.4, dur);
    r.connect(rl).connect(rg).connect(master); r.start(t); r.stop(t + dur);
  }

  // a soft click to confirm sound is on
  function blip() {
    const c = audio(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; env(g, t, 0.08, 0.01, 0.03, 0.12);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.15);
  }

  // the nav toggle (on both pages)
  const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const links = document.querySelector(".nav-links");
  if (links) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sound-toggle";
    const paint = () => {
      btn.innerHTML = on ? ICON_ON : ICON_OFF;
      btn.setAttribute("aria-pressed", on);
      btn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
      btn.title = on ? "Sound on: the crowd reacts to best and worst seasons in the career explorer" : "Turn sound on";
    };
    btn.addEventListener("click", () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* not saved, still works this visit */ }
      paint();
      if (on) blip();
    });
    paint();
    links.appendChild(btn);
  }

  return { cheer, boo };
})();
