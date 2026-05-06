/* one BOX — synthesized audio + haptics
 *
 * Pure Web Audio. Lazy-init on first user gesture (iOS unlock). Each cue is a
 * layered patch — multiple oscillators, filtered noise, optional sub thump —
 * routed through a master gain → soft-knee compressor → destination so the
 * output stays glued and consistent across phases instead of clicky one-shots.
 *
 * Cue contract — names referenced by carousel.jsx:
 *   spinPress  — pressing the SPIN button (mechanical clack + airhorn sweep)
 *   tick       — passing-chest blip during a spin
 *   settle     — short three-note descent when the spin lands
 *   lock       — heavy metallic clunk + sub-bass when a locked chest reveals
 *   win        — full fanfare when the chest opens (major7 arpeggio + sparkle)
 *   claim      — pressing the CLAIM button (ascending sparkle chime)
 *   merge      — soft pop when the prize lands inside the user pill
 *   close      — chest closing back into the cycle (low thud + woosh)
 */
(function () {
  let ctx = null;
  let master = null;
  let comp = null;
  let muted = false;

  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.55;

      // Soft-knee compressor: keeps overlapping layers from clipping and
      // gives each cue a more "produced" presence rather than a raw mix.
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 28;
      comp.ratio.value = 5;
      comp.attack.value = 0.005;
      comp.release.value = 0.22;

      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const env = (gain, attack, peak, release, t0) => {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
  };

  // One-shot tone with optional pitch glide and detune layer.
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
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
    osc.connect(g).connect(master);
    env(g, opts.attack ?? 0.005, opts.peak ?? 0.18, opts.dur, t0);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  };

  // White-noise burst with biquad filter — clicks, sparkles, whooshes.
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
    filter.frequency.setValueAtTime(opts.f || 1200, t0);
    if (opts.fEnd != null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(opts.fEnd, 1), t0 + opts.dur);
    }
    filter.Q.value = opts.q || 1.5;
    const g = c.createGain();
    src.connect(filter).connect(g).connect(master);
    env(g, opts.attack ?? 0.002, opts.peak ?? 0.12, opts.dur, t0);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  };

  // FM-modulated tone — bell-like overtones for the win fanfare. Carrier is
  // modulated by a second oscillator to introduce harmonics without samples.
  const bell = (opts) => {
    if (muted) return;
    const c = ensure();
    const t0 = c.currentTime + (opts.delay || 0);
    const carrier = c.createOscillator();
    const mod = c.createOscillator();
    const modGain = c.createGain();
    const g = c.createGain();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(opts.f, t0);
    mod.type = 'sine';
    mod.frequency.setValueAtTime(opts.f * (opts.modRatio || 3.5), t0);
    modGain.gain.setValueAtTime(opts.modIndex || 200, t0);
    modGain.gain.exponentialRampToValueAtTime(0.01, t0 + opts.dur);
    mod.connect(modGain).connect(carrier.frequency);
    carrier.connect(g).connect(master);
    env(g, 0.003, opts.peak ?? 0.14, opts.dur, t0);
    mod.start(t0); carrier.start(t0);
    mod.stop(t0 + opts.dur + 0.05); carrier.stop(t0 + opts.dur + 0.05);
  };

  const vibrate = (pattern) => {
    if (muted) return;
    if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {}
  };

  const SFX = {
    // Pressing SPIN — mechanical clack on top of an airhorn-style upward sweep.
    spinPress: () => {
      tone({ f: 90,  fEnd: 60,  dur: 0.14, type: 'square',   peak: 0.18 });
      tone({ f: 320, fEnd: 580, dur: 0.18, type: 'square',   peak: 0.10 });
      noise({ f: 1200, fEnd: 600, q: 1.2, dur: 0.4, peak: 0.07, filter: 'bandpass' });
      tone({ f: 110, fEnd: 280, dur: 0.55, type: 'sawtooth', peak: 0.05, delay: 0.04 });
      tone({ f: 220, fEnd: 660, dur: 0.5,  type: 'triangle', peak: 0.06, delay: 0.06 });
      vibrate(20);
    },

    // Per-tick during the spin — soft wood click. Peak intentionally tiny.
    tick: () => {
      tone({ f: 1100, dur: 0.022, type: 'square',   peak: 0.045 });
      noise({ f: 4500, q: 8, dur: 0.022, peak: 0.025, filter: 'bandpass' });
    },

    // Spin lands — short downward chime + air shimmer.
    settle: () => {
      tone({ f: 660, fEnd: 520, dur: 0.18, type: 'triangle', peak: 0.10 });
      tone({ f: 880, fEnd: 700, dur: 0.16, type: 'sine',     peak: 0.06, delay: 0.04 });
      noise({ f: 6000, q: 6, dur: 0.22, peak: 0.04, filter: 'highpass', delay: 0.02 });
    },

    // LOCKED chest revealed — heavy clunk under metallic ring.
    lock: () => {
      tone({ f: 70,  fEnd: 45,  dur: 0.55, type: 'sine',     peak: 0.22 });
      tone({ f: 140, fEnd: 70,  dur: 0.35, type: 'square',   peak: 0.10 });
      tone({ f: 280, fEnd: 90,  dur: 0.25, type: 'sawtooth', peak: 0.08, delay: 0.02 });
      noise({ f: 220, q: 0.7,   dur: 0.5,  peak: 0.08, filter: 'lowpass',  delay: 0.04 });
      // Metallic high partials
      bell({ f: 1850, dur: 0.45, peak: 0.05, delay: 0.06, modRatio: 3.7, modIndex: 240 });
      bell({ f: 2700, dur: 0.35, peak: 0.04, delay: 0.08, modRatio: 4.1, modIndex: 200 });
      vibrate([60, 40, 60]);
    },

    // Chest opens — sub thump under an ascending major7 arpeggio + sparkle wash.
    win: () => {
      tone({ f: 100, fEnd: 60,  dur: 0.45, type: 'sine', peak: 0.16 });
      const notes = [523.25, 659.25, 783.99, 987.77, 1318.51]; // C5 E5 G5 B5 E6
      notes.forEach((f, i) => {
        bell({ f, dur: 0.55, peak: 0.12, delay: i * 0.06, modRatio: 2.0, modIndex: 80 });
        tone({ f: f * 1.005, dur: 0.5, type: 'sine', peak: 0.06, delay: i * 0.06 }); // detune layer
      });
      // Pad sustain underneath
      tone({ f: 261.63, dur: 0.7, type: 'sawtooth', peak: 0.04, delay: 0.05 });
      // Sparkle shimmer
      noise({ f: 6000,  q: 8,  dur: 0.7, peak: 0.06, filter: 'highpass', delay: 0.10 });
      noise({ f: 9000,  q: 10, dur: 0.5, peak: 0.05, filter: 'highpass', delay: 0.20 });
      vibrate([20, 30, 60]);
    },

    // Pressing CLAIM — ascending sparkle chime + sub for body.
    claim: () => {
      tone({ f: 880,  fEnd: 1320, dur: 0.18, type: 'sine',     peak: 0.13 });
      tone({ f: 1320, fEnd: 1980, dur: 0.16, type: 'triangle', peak: 0.10, delay: 0.07 });
      tone({ f: 1980, fEnd: 2640, dur: 0.14, type: 'sine',     peak: 0.08, delay: 0.14 });
      bell({ f: 1320, dur: 0.35, peak: 0.07, delay: 0.04, modRatio: 2.2, modIndex: 90 });
      noise({ f: 6500, q: 5, dur: 0.4, peak: 0.06, filter: 'highpass', delay: 0.04 });
      tone({ f: 196, dur: 0.18, type: 'sine', peak: 0.06 }); // sub
      vibrate(15);
    },

    // Prize merging into the user pill — soft pop + descending shimmer.
    merge: () => {
      tone({ f: 1320, fEnd: 880, dur: 0.18, type: 'sine',     peak: 0.12 });
      tone({ f: 1980, fEnd: 1320, dur: 0.14, type: 'triangle', peak: 0.08, delay: 0.04 });
      noise({ f: 5500, q: 4, dur: 0.28, peak: 0.05, filter: 'highpass' });
      bell({ f: 880, dur: 0.3, peak: 0.06, modRatio: 2.5, modIndex: 100 });
      vibrate(25);
    },

    // Chest closes back into cycle — soft drop, low thud, woosh tail.
    close: () => {
      tone({ f: 380, fEnd: 180, dur: 0.18, type: 'sine',     peak: 0.10 });
      tone({ f: 110, dur: 0.18, type: 'triangle',           peak: 0.10, delay: 0.04 });
      noise({ f: 1500, fEnd: 600, q: 1.0, dur: 0.32, peak: 0.05, filter: 'lowpass' });
      tone({ f: 60, fEnd: 40, dur: 0.22, type: 'sine',     peak: 0.06, delay: 0.06 });
      vibrate(10);
    },
  };

  window.OneBoxAudio = {
    play: (name) => {
      const fn = SFX[name];
      if (fn) fn();
    },
    setMuted: (m) => { muted = !!m; },
    isMuted: () => muted,
    unlock: () => ensure(),
  };
})();
