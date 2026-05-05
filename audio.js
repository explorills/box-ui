/* one BOX — synthesized audio + haptics
 * Lazy-init on first user gesture; no external assets.
 */
(function () {
  let ctx = null;
  let master = null;
  let muted = false;

  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const env = (gain, attack, peak, release, t0) => {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
  };

  // One-shot tone with optional pitch glide
  const tone = (opts) => {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + (opts.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.f, t0);
    if (opts.fEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(opts.fEnd, 1), t0 + opts.dur);
    }
    osc.connect(g).connect(master);
    env(g, opts.attack ?? 0.005, opts.peak ?? 0.18, opts.dur, t0);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  };

  // White-noise burst (for clicks, whooshes, sparkles)
  const noise = (opts) => {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + (opts.delay || 0);
    const buf = c.createBuffer(1, c.sampleRate * opts.dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.value = opts.f || 1200;
    filter.Q.value = opts.q || 1.5;
    const g = c.createGain();
    src.connect(filter).connect(g).connect(master);
    env(g, 0.002, opts.peak ?? 0.12, opts.dur, t0);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  };

  const vibrate = (pattern) => {
    if (muted) return;
    if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {}
  };

  const SFX = {
    spinPress: () => {
      // mechanical click + rising whoosh
      tone({ f: 320, fEnd: 580, dur: 0.18, type: 'square', peak: 0.12 });
      noise({ f: 800, q: 1.4, dur: 0.5, peak: 0.07, filter: 'bandpass' });
      tone({ f: 110, fEnd: 280, dur: 0.6, type: 'sawtooth', peak: 0.05, delay: 0.05 });
      vibrate(20);
    },
    tick: () => {
      // soft click for spin "passing" — keep volume tiny
      tone({ f: 880, dur: 0.025, type: 'square', peak: 0.04 });
    },
    win: () => {
      // ascending major arpeggio + sparkle
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
      notes.forEach((f, i) =>
        tone({ f, dur: 0.35, type: 'sine', peak: 0.14, delay: i * 0.07 })
      );
      // shimmer
      noise({ f: 5000, q: 6, dur: 0.6, peak: 0.05, filter: 'highpass', delay: 0.12 });
      vibrate([20, 30, 60]);
    },
    lock: () => {
      // dud / clunk
      tone({ f: 110, fEnd: 50, dur: 0.28, type: 'sine', peak: 0.18 });
      tone({ f: 220, fEnd: 90, dur: 0.18, type: 'square', peak: 0.07, delay: 0.02 });
      vibrate([60, 40, 60]);
    },
    claim: () => {
      // sparkle pop + ascending fizz
      tone({ f: 1200, fEnd: 2200, dur: 0.18, type: 'sine', peak: 0.12 });
      tone({ f: 1600, fEnd: 2600, dur: 0.16, type: 'sine', peak: 0.10, delay: 0.08 });
      noise({ f: 6000, q: 4, dur: 0.4, peak: 0.06, filter: 'highpass', delay: 0.04 });
      vibrate(15);
    },
    close: () => {
      // soft drop, slight thud
      tone({ f: 280, fEnd: 140, dur: 0.18, type: 'sine', peak: 0.12 });
      tone({ f: 90, dur: 0.12, type: 'sine', peak: 0.10, delay: 0.08 });
      vibrate(10);
    },
    settle: () => {
      // brief landing tone right after spin stops
      tone({ f: 440, fEnd: 360, dur: 0.12, type: 'triangle', peak: 0.10 });
    },
  };

  window.OneBoxAudio = {
    play: (name) => {
      const fn = SFX[name];
      if (fn) fn();
    },
    setMuted: (m) => { muted = !!m; },
    isMuted: () => muted,
    // Re-use the lazy ctx so the first gesture unlocks audio on iOS
    unlock: () => ensure(),
  };
})();
