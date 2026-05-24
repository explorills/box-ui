/* one BOX — 3D carousel + role-gated open / lock / claim flow
 *
 * This file is the entire UI surface. It is intentionally PURE UI:
 *   • No backend calls, persistence, or auth
 *   • No real cooldown countdown — the cooldown values come from props/tweaks
 *   • No real spin RNG — the random index is for prototype preview only;
 *     a backend can override the chosen index via the "Spin outcome" tweak
 *     (or by calling props.onSpin and resolving with a fixed index later)
 *   • No real letter award — `collectedCount` is the only signal; backend
 *     advances it by however much it wants
 *   • No real spin physics — the accel/cruise/decel curve is generated
 *     locally from a seed for preview only. The shape of `SpinPlan` (below)
 *     IS the contract: the backend produces one of these, signs it, and
 *     hands it to the UI. The frontend never invents speed values that
 *     would be authoritative.
 *
 * Backend integration points:
 *   • CHESTS  ← imported from './config/chests'
 *   • ROLES   ← imported from './config/roles'
 *   • Audio   ← imported from './audio'
 *   • State   ← passed as `tweaks` prop from app.jsx
 *
 * Phase machine:
 *   idle → spinning → stopped → (eligible) shaking → opening → revealed → claiming → closing → idle
 *                              ↘ (locked) shaking-locked → locked-rest → (tap anywhere) → idle
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CHESTS } from './config/chests';
import { ROLES } from './config/roles';
import { OneBoxAudio } from './audio';

// ─── Helpers ────────────────────────────────────────────────────────────────

const sfx = (name: string) => {
  if (!OneBoxAudio.isMuted()) OneBoxAudio.play(name);
};

function uniqueLetters(word) {
  if (!word) return [];
  const seen = new Set();
  const out = [];
  for (const c of word) if (!seen.has(c)) { seen.add(c); out.push(c); }
  return out;
}

// Render a remaining-time number-of-seconds as a punchy "6D 12H 30M 45S"
// string, omitting leading zero units but always showing seconds (since the
// timer ticks visibly at 1Hz). Backend supplies the initial value; the UI
// integrates the remaining time locally.
function fmtCooldown(totalSec) {
  const t = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const parts = [];
  if (d) parts.push(`${d}D`);
  if (h || d) parts.push(`${h}H`);
  if (m || h || d) parts.push(`${m}M`);
  parts.push(`${s}S`);
  return parts.join(' ');
}

// ─── Spin physics constants ─────────────────────────────────────────────────
// MAX_SPEED_DEG_PER_SEC is the absolute ceiling for the angular velocity bar.
// Per-spin peak speeds (random or backend-supplied) are visualized as a
// fraction of this ceiling — that's what gives the bar a meaningful right
// edge. Spins normally peak well below max so the bar never fills; that
// headroom is reserved for future "boost" mechanics that push closer to MAX.
const MAX_SPEED_DEG_PER_SEC = 2100;

// ─── Spin plan ──────────────────────────────────────────────────────────────
// BACKEND CONTRACT: the server returns a SpinPlan describing the entire spin.
// Acceleration, cruise, deceleration, peak speed and final winner are all
// authoritative server values. The frontend integrates them deterministically
// — it never invents speeds. To keep this prototype interactive, we generate
// a plan locally; replace `makeLocalSpinPlan()` with a fetch().
//
//   accelMs    — milliseconds of acceleration (0 → peakDegPerSec)
//   cruiseMs   — milliseconds at peak speed
//   decelMs    — milliseconds of deceleration (peak → 0)
//   peakDegPerSec — angular velocity at the top of the curve
//   chosenIdx  — final winner index in CHESTS
//
// The integral of the velocity curve gives the total angle swept; we add a
// rotation correction so we still land on `chosenIdx` even though duration
// and peak vary per spin.
function makeLocalSpinPlan(chestCount, forcedIdx) {
  const accelMs  = 1100 + Math.random() * 700;     // 1.1 – 1.8s ramp up
  const cruiseMs =  900 + Math.random() * 900;     // 0.9 – 1.8s top speed
  const decelMs  = 2200 + Math.random() * 1200;    // 2.2 – 3.4s glide down
  const peak     = 720  + Math.random() * 360;     // 720 – 1080 deg/s
  const chosenIdx = forcedIdx != null && forcedIdx >= 0
    ? forcedIdx
    : Math.floor(Math.random() * chestCount);
  return { accelMs, cruiseMs, decelMs, peakDegPerSec: peak, chosenIdx };
}

// Velocity at time t (ms), normalized to peak=1. Smoothstep easing so accel
// and decel feel mechanical rather than linear.
function spinVelocityAt(t, plan) {
  const { accelMs, cruiseMs, decelMs } = plan;
  if (t <= 0) return 0;
  if (t < accelMs) {
    const r = t / accelMs;
    return r * r * (3 - 2 * r);                    // smoothstep
  }
  if (t < accelMs + cruiseMs) return 1;
  const tail = t - accelMs - cruiseMs;
  if (tail >= decelMs) return 0;
  const r = 1 - tail / decelMs;
  return r * r * (3 - 2 * r);
}

// Total integral of velocity*peak over the whole spin in degrees.
function spinTotalDegrees(plan) {
  // smoothstep integral over [0,1] is 0.5 → halves of accel and decel.
  const cruiseDeg = plan.cruiseMs * plan.peakDegPerSec / 1000;
  const accelDeg  = plan.accelMs  * plan.peakDegPerSec / 1000 * 0.5;
  const decelDeg  = plan.decelMs  * plan.peakDegPerSec / 1000 * 0.5;
  return accelDeg + cruiseDeg + decelDeg;
}

// ─── Hourglass icon ─────────────────────────────────────────────────────────

function HourglassIcon() {
  return <span className="hourglass" aria-hidden="true" />;
}

// ─── Gamified letter glyph ──────────────────────────────────────────────────
// Renders a letter as a stylized SVG token. Each letter gets a deterministic
// hue derived from its char code so the alphabet feels colorful but stable.
// Replace `accent` to override.
function LetterGlyph({ ch, revealed, pulsing, accent }) {
  const code = (ch || '?').toUpperCase().charCodeAt(0);
  const hue = (code * 47) % 360;
  const fillA = accent || `hsl(${hue}, 70%, 62%)`;
  const fillB = accent
    ? `color-mix(in oklab, ${accent} 35%, black)`
    : `hsl(${(hue + 24) % 360}, 65%, 38%)`;
  const empty = !revealed;
  return (
    <span className={`letter-tile ${revealed ? 'is-revealed' : ''} ${pulsing ? 'is-pulsing' : ''}`}>
      <svg viewBox="0 0 36 40" aria-hidden="true">
        <defs>
          <linearGradient id={`lg-${code}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={fillA} />
            <stop offset="1" stopColor={fillB} />
          </linearGradient>
          <filter id={`lf-${code}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>
        <polygon
          points="3,6 33,6 30,36 6,36"
          fill={empty ? 'transparent' : `url(#lg-${code})`}
          stroke={empty ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <polygon
          points="3,6 33,6 30,36 6,36"
          fill="none"
          stroke={empty ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)'}
          strokeWidth="0.6"
          transform="translate(0,2) scale(1,0.92)"
        />
        {!empty && (
          <text
            x="18" y="27"
            textAnchor="middle"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            fontWeight="800"
            fontSize="20"
            fill="white"
            filter={`url(#lf-${code})`}
            style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 0.8 }}
          >
            {ch}
          </text>
        )}
        {empty && (
          <line x1="12" y1="22" x2="24" y2="22" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

// ─── Map tier row (drawer content) ──────────────────────────────────────────

function MapTier({ title, subtitle, chests, highlight }) {
  return (
    <div className={`map-tier ${highlight ? 'is-current' : ''}`}>
      <div className="map-tier-head">
        {highlight && <span className="map-tier-badge">YOU</span>}
        <span className="map-tier-name">{title}</span>
        {subtitle && <span className="map-tier-sub">{subtitle}</span>}
      </div>
      <div className="map-tier-body">
        {chests.map((c) => {
          // Inside the map, "HIDDEN LETTER" is too vague — call out the
          // actual progression payoff instead.
          const prizeText = /HIDDEN\s+LETTER/i.test(c.prize)
            ? 'LETTER TO UNLOCK NEXT TIER!'
            : c.prize;
          return (
            <div className="map-row" key={c.id} style={{ '--c': c.glow }}>
              <span className="map-chest">
                <span className="map-swatch" />
                {c.label}
              </span>
              <span className="map-prize">{prizeText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Speed bar ──────────────────────────────────────────────────────────────
// Real-speed visualization, locked to a single root value: every frame the
// ring's angular velocity (deg/s) is the SAME number that drives the bar's
// fill width and the numeric readout. With MAX_SPEED as the right edge, the
// bar fills only as much as this spin's actual speed reaches it — typical
// random spins peak around 700-1100°/s and so fill 33-52%. The peak marker
// sticks at the highest fraction reached and stays there during decel.
function SpeedBar({ current, peak, max, active }) {
  const peakKnown = peak > 0;
  const fillRatio = Math.min(1, current / max);
  const peakRatio = Math.min(1, peak / max);
  return (
    <div className={`speed-bar ${active || peakKnown ? 'is-active' : ''}`} aria-hidden="true">
      <div className="speed-bar-track">
        <div className="speed-bar-fill" style={{ width: `${fillRatio * 100}%` }} />
        {peakKnown && (
          <div className="speed-bar-peak" style={{ left: `${peakRatio * 100}%` }} />
        )}
      </div>
      <div className="speed-bar-label">
        <span>
          <span className="speed-bar-key">SPEED</span>{' '}
          <span className="speed-bar-val">{Math.round(current)}</span>
          <span className="speed-bar-unit">°/s</span>
        </span>
        <span>
          <span className="speed-bar-key">MAX</span>{' '}
          <span className="speed-bar-peak-val">{max}</span>
          <span className="speed-bar-unit">°/s</span>
        </span>
      </div>
    </div>
  );
}

// ─── Main button ────────────────────────────────────────────────────────────
// Single button that owns every bottom-row state.
// `cooldownActive` overrides everything (except disconnected); shows TRY AGAIN
// IN <X> with an animated hourglass inline.

function MainButton({ phase, connected, cooldownActive, cooldownLabel, isLockedReveal, onSpin, onClaim, onConnect }) {
  if (!connected) {
    return (
      <button className="main-btn is-connect" onClick={onConnect} type="button">
        <span className="label-row">CONNECT</span>
      </button>
    );
  }
  if (cooldownActive) {
    return (
      <button className="main-btn is-cooldown" disabled type="button">
        <span className="label-row">
          TRY AGAIN IN {cooldownLabel}
          <HourglassIcon />
        </span>
      </button>
    );
  }
  if (phase === 'revealed' && !isLockedReveal) {
    return (
      <button className="main-btn is-claim" onClick={onClaim} type="button">
        <span className="label-row">CLAIM</span>
      </button>
    );
  }
  if (phase === 'idle') {
    return (
      <button className="main-btn" onClick={onSpin} type="button">
        <span className="label-row">1 ACTIVE SPIN</span>
      </button>
    );
  }
  // Mid-flow / disabled states
  let label = '…';
  let spinning = false;
  if (phase === 'spinning' || phase === 'spinning-override') { label = 'SPINNING…'; spinning = true; }
  else if (phase === 'stopped') label = 'LOCKING IN…';
  else if (phase === 'shaking') label = 'HOLD TIGHT…';
  else if (phase === 'shaking-locked' || phase === 'locked-rest') label = 'LOCKED · TAP TO CONTINUE';
  else if (phase === 'opening') label = 'OPENING!';
  else if (phase === 'revealed' && isLockedReveal) label = 'LOCKED';
  else if (phase === 'claiming') label = 'CLAIMING…';
  return (
    <button className="main-btn" disabled type="button">
      <span className="label-row">
        {spinning && <span className="icon-spin" />}
        {label}
      </span>
    </button>
  );
}

// ─── Main OneBox component ──────────────────────────────────────────────────

function OneBox({ tweaks }: { tweaks: any }) {
  // Backend-injectable data is now ESM imports — replace the imports above
  // with backend-fetched arrays at app boot if you need to hydrate from a
  // server.
  const ROLE_BY_ID = useMemo(() => Object.fromEntries(ROLES.map((r) => [r.id, r])), []);

  // Effective role (Guest if disconnected)
  const effectiveRoleId = tweaks.connected ? tweaks.role : 'GUEST';
  const role = ROLE_BY_ID[effectiveRoleId] || ROLES[0];
  const userMaxIdx = role.maxIdx;
  const roleAccent = role.accent || tweaks.accent;

  // ── Local state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('idle');
  const [winnerIdx, setWinnerIdx] = useState(null);
  const [ringAngle, setRingAngle] = useState(0);
  const [opens, setOpens] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  // Real angular speed of the ring during spin: deg/s. `peak` is the maximum
  // value seen so far this spin — the bar's "right edge" as it grows. The bar
  // visualization uses current/peak so the right edge is always the latest peak.
  const [speed, setSpeed] = useState({ current: 0, peak: 0 });
  const [pillPulse, setPillPulse] = useState(0);    // bumps to retrigger pill bubble

  const stateRef = useRef({ angle: 0 });
  const spinPlanRef = useRef(null);
  const pillRef = useRef(null);
  const prizeTextRef = useRef(null);
  const lastTickRef = useRef(0);
  const idleStartedAtRef = useRef(0);

  useEffect(() => { if (tweaks.mapDefaultOpen) setMapOpen(true); }, []); // eslint-disable-line

  // Audio mute sync
  useEffect(() => {
    OneBoxAudio.setMuted(!tweaks.audioEnabled);
  }, [tweaks.audioEnabled]);

  // ── Constants from tweaks ──────────────────────────────────────────────
  const SLOT_DEG = 360 / CHESTS.length;
  const idleSpeed = tweaks.idleSpeed ?? 22;
  const ringZ = `${tweaks.ringRadius ?? 290}px`;

  // ── Phase override (Tweaks-driven snapshot — DEV ONLY) ─────────────────
  const phaseOverride = tweaks.phaseOverride || 'AUTO';
  const overrideToPhase = {
    IDLE: 'idle',
    SPINNING: 'spinning-override',
    REVEALED: 'revealed',
    'LOCKED-SHAKE': 'shaking-locked',
    CLAIMED: 'claiming',
  };
  const renderPhase = phaseOverride === 'AUTO' || phaseOverride === 'COOLDOWN'
    ? phase
    : (overrideToPhase[phaseOverride] || phase);

  const overrideWinnerIdx = useMemo(() => {
    const o = (tweaks.spinOutcome || 'AUTO').toUpperCase();
    if (o === 'AUTO') return null;
    const i = CHESTS.findIndex((c) => c.id.toUpperCase() === o);
    return i >= 0 ? i : null;
  }, [tweaks.spinOutcome, CHESTS]);

  const renderWinnerIdx = phaseOverride !== 'AUTO' && phaseOverride !== 'COOLDOWN' && overrideWinnerIdx != null
    ? overrideWinnerIdx
    : winnerIdx;

  const isLockedReveal = renderWinnerIdx != null && renderWinnerIdx > userMaxIdx;

  // ── Cooldown ───────────────────────────────────────────────────────────
  // Backend injects the remaining-time SNAPSHOT (D/H/M/S). The UI converts
  // it to total-seconds at activation time and ticks live from there. Stays
  // active visually until 0 or until the backend re-injects a new state.
  const cooldownInitialSec = (tweaks.cooldownDays ?? 0) * 86400
                           + (tweaks.cooldownHours ?? 0) * 3600
                           + (tweaks.cooldownMinutes ?? 0) * 60
                           + (tweaks.cooldownSeconds ?? 0);
  const cooldownForce = phaseOverride === 'COOLDOWN';
  const cooldownActive = cooldownForce || cooldownInitialSec > 0;
  const [cooldownRemaining, setCooldownRemaining] = useState(cooldownInitialSec);

  useEffect(() => {
    if (!cooldownActive) { setCooldownRemaining(0); return; }
    const start = Date.now();
    const init = cooldownInitialSec;
    setCooldownRemaining(init);
    const iv = setInterval(() => {
      const remaining = init - (Date.now() - start) / 1000;
      if (remaining <= 0) {
        setCooldownRemaining(0);
        clearInterval(iv);
      } else {
        setCooldownRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [cooldownActive, cooldownInitialSec]);

  // ── Drive modes ────────────────────────────────────────────────────────
  const isIdleDrift = (phase === 'idle' && phaseOverride === 'AUTO') || phaseOverride === 'IDLE';
  const isSpinTarget = phase === 'spinning' && phaseOverride === 'AUTO';
  const isOverrideSpin = phaseOverride === 'SPINNING';

  // Idle drift with smooth ramp-up
  useEffect(() => {
    if (!isIdleDrift) return;
    let raf;
    let last = performance.now();
    if (!idleStartedAtRef.current) idleStartedAtRef.current = last;
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      const elapsed = (now - idleStartedAtRef.current) / 1000;
      const ramp = Math.min(1, elapsed / 1.0);
      const eased = ramp * ramp * (3 - 2 * ramp);
      stateRef.current.angle = (stateRef.current.angle + idleSpeed * eased * dt) % 360;
      setRingAngle(stateRef.current.angle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isIdleDrift, idleSpeed]);

  useEffect(() => {
    if (phase === 'idle') idleStartedAtRef.current = performance.now();
  }, [phase]);

  // Override spin (visual-only fast rotation)
  useEffect(() => {
    if (!isOverrideSpin) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      stateRef.current.angle = (stateRef.current.angle + 320 * dt) % 360;
      setRingAngle(stateRef.current.angle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOverrideSpin]);

  // Snap ring to bring override-winner to front for static overrides
  useEffect(() => {
    if (phaseOverride === 'AUTO' || phaseOverride === 'IDLE' || phaseOverride === 'SPINNING' || phaseOverride === 'COOLDOWN') return;
    if (overrideWinnerIdx == null) return;
    const target = ((-overrideWinnerIdx * SLOT_DEG) % 360 + 360) % 360;
    stateRef.current.angle = target;
    setRingAngle(target);
  }, [phaseOverride, overrideWinnerIdx, SLOT_DEG]);

  // Spin-to-target driven by SpinPlan (accel → cruise → decel)
  useEffect(() => {
    if (!isSpinTarget || !spinPlanRef.current) return;
    const { plan, startAngle, totalAngle, totalMs, chosen } = spinPlanRef.current;
    const t0 = performance.now();
    let raf;
    let lastIntegralDeg = 0;
    let lastT = 0;
    const tick = (now) => {
      const t = Math.min(totalMs, now - t0);
      // Integrate velocity from lastT to t to advance the angle.
      const steps = 4;
      const dt = (t - lastT) / steps;
      let dDeg = 0;
      for (let i = 0; i < steps; i++) {
        const ti = lastT + dt * (i + 0.5);
        dDeg += spinVelocityAt(ti, plan) * plan.peakDegPerSec * (dt / 1000);
      }
      lastIntegralDeg += dDeg;
      lastT = t;
      // Scale so we land exactly on `totalAngle` regardless of integration drift.
      const totalIntegral = spinTotalDegrees(plan);
      const scale = totalAngle / totalIntegral;
      const angle = startAngle + lastIntegralDeg * scale;
      stateRef.current.angle = angle;
      setRingAngle(angle);
      const v = spinVelocityAt(t, plan);
      // `realSpeed` matches the angular velocity actually being applied to
      // the ring after the integration-correction `scale` factor — so the
      // number on screen is 1:1 with the visible rotation.
      const realSpeed = v * plan.peakDegPerSec * scale;
      setSpeed((prev) => ({
        current: realSpeed,
        peak: Math.max(prev.peak, realSpeed),
      }));
      const turn = Math.floor(angle / 30);
      if (turn !== lastTickRef.current && t < totalMs * 0.92) {
        lastTickRef.current = turn;
        sfx('tick');
      }
      if (t < totalMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setTimeout(() => {
      stateRef.current.angle = startAngle + totalAngle;
      setRingAngle(stateRef.current.angle);
      // Keep the peak visible; current drops to 0 so the bar shows the
      // peak-marker at the right edge with empty fill — what we just spun at.
      setSpeed((prev) => ({ current: 0, peak: prev.peak }));
      setWinnerIdx(chosen);
      setPhase('stopped');
      // No sound here. Per spec, "no extra blip when the spin finishes" —
      // the next dedicated cue (win or lock) is the single sound for that
      // action. The tick stream stops naturally because t > totalMs * 0.92.
    }, totalMs + 30);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isSpinTarget]);

  // Spin trigger
  const spin = useCallback(() => {
    if (phase !== 'idle' || cooldownActive || phaseOverride !== 'AUTO') return;
    OneBoxAudio.unlock();
    sfx('spinPress');
    setMapOpen(false);
    setWinnerIdx(null);
    // Reset both peak and current — a fresh spin starts the bar empty and
    // the right-edge peak marker grows from zero.
    setSpeed({ current: 0, peak: 0 });

    // BACKEND POINT: replace makeLocalSpinPlan with a server fetch. The plan
    // is authoritative — speed, duration, winner are all server-decided.
    const forced = (tweaks.spinOutcome || 'AUTO').toUpperCase();
    const forcedIdx = forced === 'AUTO' ? null : CHESTS.findIndex((c) => c.id.toUpperCase() === forced);
    const plan = makeLocalSpinPlan(CHESTS.length, forcedIdx);
    const chosen = plan.chosenIdx;

    const baseTarget = ((-chosen * SLOT_DEG) % 360 + 360) % 360;
    const startAngle = stateRef.current.angle;
    const startMod = ((startAngle % 360) + 360) % 360;
    let landing = baseTarget - startMod;
    if (landing < 0) landing += 360;
    // total angle = enough full turns so the integrated curve roughly matches,
    // then add the remaining `landing` so we end exactly on the winner.
    const naturalDeg = spinTotalDegrees(plan);
    const fullTurns = Math.max(2, Math.round((naturalDeg - landing) / 360));
    const totalAngle = fullTurns * 360 + landing;
    const totalMs = plan.accelMs + plan.cruiseMs + plan.decelMs;

    spinPlanRef.current = { plan, startAngle, totalAngle, totalMs, chosen };
    setPhase('spinning');
  }, [phase, cooldownActive, phaseOverride, tweaks.spinOutcome, SLOT_DEG, CHESTS]);

  // Phase progression (only in AUTO mode)
  useEffect(() => {
    if (phaseOverride !== 'AUTO') return;
    if (phase === 'stopped') {
      const isLocked = winnerIdx != null && winnerIdx > userMaxIdx;
      const t = setTimeout(() => {
        setPhase(isLocked ? 'shaking-locked' : 'shaking');
        // Locked path gets its dedicated 'lock' cue here; the eligible path
        // stays silent and the 'win' cue fires alone when the chest opens.
        // One sound per action, no overlap with the prior spin-tick stream.
        if (isLocked) sfx('lock');
      }, 350);
      return () => clearTimeout(t);
    }
    if (phase === 'shaking') {
      const t = setTimeout(() => {
        setPhase('opening');
        sfx('win');
      }, 600);
      return () => clearTimeout(t);
    }
    if (phase === 'opening') {
      const t = setTimeout(() => setPhase('revealed'), 1100);
      return () => clearTimeout(t);
    }
    if (phase === 'shaking-locked') {
      // 25% of the previous duration — vibration is fast/alive, not a long tilt
      const t = setTimeout(() => setPhase('locked-rest'), 375);
      return () => clearTimeout(t);
    }
  }, [phase, phaseOverride, winnerIdx, userMaxIdx]);

  // Tap-anywhere-to-resume from locked-rest
  useEffect(() => {
    if (phase !== 'locked-rest' || phaseOverride !== 'AUTO') return;
    const handler = (e) => {
      if (e.target && e.target.closest && e.target.closest('.twk-panel')) return;
      setPhase('idle');
      setWinnerIdx(null);
      sfx('settle');
    };
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', handler);
    }, 250);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', handler);
    };
  }, [phase, phaseOverride]);

  // Claim flow — JS-driven RAF for the prize fly so motion, collision,
  // disappear, sound, and bump all happen in the SAME frame.
  //
  // The "collision line" is the user pill's BOTTOM edge. Each frame the RAF
  // moves the prize toward that line; on the frame where the prize's center
  // crosses the line, we simultaneously: hide the prize, fire the bump on
  // the pill, and play the merge SFX. There's no setTimeout in this path —
  // setTimeout drift was what caused the prior "go past the badge" feel.
  //
  // The chest's lid-close and winner-recede continue as CSS animations
  // bound to .ring.is-claiming, in parallel with the JS prize fly.
  const PRIZE_FLY_MS = 600;
  const CLAIM_MS = PRIZE_FLY_MS + 140; // tail so chest finishes receding
  const claimRafRef = useRef(0);

  const onClaim = useCallback(() => {
    if (phaseOverride !== 'AUTO') return;
    sfx('claim');
    const pill = pillRef.current;
    const node = prizeTextRef.current;

    setPhase('claiming');

    // Schedule the chest-close / return-to-idle tail unconditionally —
    // even if the prize node is somehow missing, we still want the carousel
    // to recover. Stored on a ref so cleanup can cancel if needed.
    const tailTimer = setTimeout(() => {
      // No 'close' sfx here — it would fire ~140ms after the merge cue and
      // smear into a perceived double sound. Merge is the only audio for
      // the whole claim → merge → chest-recede sequence.
      setPhase('idle');
      setWinnerIdx(null);
      setOpens((n) => n + 1);
    }, CLAIM_MS);

    if (!node || !pill) {
      // No nodes to fly between — just fire merge feedback once.
      setTimeout(() => {
        setPillPulse((n) => n + 1);
        sfx('merge');
      }, PRIZE_FLY_MS);
      return;
    }

    // Capture geometry at click time. RAF interpolates between origin and
    // target each frame; the target's Y is the pill's BOTTOM edge (the
    // "collision line"). When the prize's CENTER reaches that line we treat
    // it as a hit — fired by per-frame screen-coord collision detection so
    // motion, hide, bump and SFX all land on the SAME frame.
    const oRect = node.getBoundingClientRect();
    const pRect = pill.getBoundingClientRect();
    const oCx = oRect.left + oRect.width / 2;
    const oCy = oRect.top  + oRect.height / 2;
    const tCx = pRect.left + pRect.width / 2;
    const tCy = pRect.bottom; // collision line
    const dxScreen = tCx - oCx;
    const dyScreen = tCy - oCy;

    // PERSPECTIVE COMPENSATION
    // The prize lives inside `.slot`, which sits at translateZ(~290–360px)
    // beneath `.arena { perspective: 1100px }`. CSS `translate(Npx)` on the
    // prize is in the slot's LOCAL coord space; on screen that displacement
    // is multiplied by the perspective scale ~ 1100 / (1100 - z) ≈ 1.36–1.49.
    // We measure the actual scale once (width-based, immune to the ring's
    // rotateX which only compresses Y) and divide our local translates by it
    // so the prize moves dxScreen / dyScreen pixels on screen, exactly.
    const slotEl = node.closest('.slot');
    let persp = 1;
    if (slotEl) {
      const sRect = slotEl.getBoundingClientRect();
      const sW = slotEl.offsetWidth;
      if (sW > 0 && sRect.width > 0) persp = sRect.width / sW;
    }
    if (!isFinite(persp) || persp <= 0) persp = 1;
    const dx = dxScreen / persp;
    const dy = dyScreen / persp;

    const startTs = performance.now();
    let merged = false;

    const fireMerge = () => {
      if (merged) return;
      merged = true;
      // All three on the same frame:
      // 1) prize disappears
      node.style.opacity = '0';
      // 2) pill bumps
      setPillPulse((n) => n + 1);
      // 3) merge sound
      sfx('merge');
      cancelAnimationFrame(claimRafRef.current);
    };

    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / PRIZE_FLY_MS);
      // Ease-out cubic — fast departure, gentle landing into the pill.
      const eased = 1 - Math.pow(1 - t, 3);
      const x = eased * dx;
      const y = eased * dy;
      const scale = 1 - eased * 0.6;             // 1 → 0.4
      const skew = -6 + eased * 6;               // -6° → 0°

      // Inline transform overrides the resting CSS transform during
      // 'claiming'. BOTH axes need the -50% centering offset preserved —
      // dropping the Y centering was the bug that made the prize "jump
      // away / disappear" on the first frame of claim.
      node.style.transform =
        `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) skewX(${skew}deg) scale(${scale})`;

      // Per-frame screen-coord collision: read the prize's live bounding
      // rect and compare its CENTER-Y to the pill's bottom line. As soon as
      // the center crosses the line we fire merge — guarantees pixel-precise
      // arrival even if perspective math is off by a sliver.
      const liveRect = node.getBoundingClientRect();
      const liveCy = liveRect.top + liveRect.height / 2;
      if (liveCy <= tCy) {
        fireMerge();
        return; // stop RAF — same frame as collision
      }

      if (t < 1) {
        claimRafRef.current = requestAnimationFrame(tick);
      } else {
        fireMerge(); // safety net — fly window elapsed without a crossing
      }
    };
    claimRafRef.current = requestAnimationFrame(tick);
  }, [phaseOverride]);

  const onConnect = useCallback(() => {
    OneBoxAudio.unlock();
    sfx('claim');
  }, []);

  // Letter slots. The backend tracks how many UNIQUE letters the user has
  // discovered (`collectedCount`); finding one unique letter fills every
  // slot in the word that holds that letter. The progress display uses the
  // TOTAL slot count (word.length) — so a 9-letter word with 5 unique
  // letters discovered, where those 5 cover 7 of the 9 slots, reads "7/9".
  const word = role.word;
  const wordUnique = useMemo(() => uniqueLetters(word), [word]);
  const uniqueCollected = Math.max(0, Math.min(tweaks.collectedCount ?? 0, wordUnique.length));
  const collectedSet = useMemo(() => new Set(wordUnique.slice(0, uniqueCollected)), [wordUnique, uniqueCollected]);

  const letterSlots = useMemo(() => {
    if (!word) return [];
    const lastIdx = tweaks.lastRevealedIdx ?? -1;
    return [...word].map((ch, i) => ({
      ch, idx: i,
      collected: collectedSet.has(ch),
      pulsing: i === lastIdx && collectedSet.has(ch),
    }));
  }, [word, collectedSet, tweaks.lastRevealedIdx]);

  const totalLetters = word ? word.length : 0;
  const slotsFilled = useMemo(
    () => (word ? [...word].filter((c) => collectedSet.has(c)).length : 0),
    [word, collectedSet]
  );
  const tierProgressPct = totalLetters === 0
    ? (role.id === 'PROMDRILLS_CHRONICLES' ? 100 : 0)
    : (slotsFilled / totalLetters) * 100;

  // Front-of-ring detection
  const frontIdx = useMemo(() => {
    const a = ((-ringAngle) % 360 + 360) % 360;
    return Math.round(a / SLOT_DEG) % CHESTS.length;
  }, [ringAngle, SLOT_DEG, CHESTS.length]);

  // Sparks
  const sparks = useMemo(() => {
    const out = [];
    const count = tweaks.sparkCount ?? 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 90 + Math.random() * 110;
      out.push({
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist - 50,
        delay: Math.random() * 280,
        dur: 950 + Math.random() * 600,
        size: 4 + Math.random() * 6,
      });
    }
    return out;
  }, [renderWinnerIdx, opens, tweaks.sparkCount, phaseOverride]);

  // Class assembly
  const ringClass = [
    'ring',
    (renderPhase === 'spinning' || renderPhase === 'spinning-override') && 'is-spinning',
    renderPhase === 'spinning-override' && 'is-override-spin',
    (['stopped', 'shaking', 'opening', 'revealed', 'claiming', 'shaking-locked', 'locked-rest'].includes(renderPhase)) && 'is-revealing',
    renderPhase === 'shaking' && 'is-shaking',
    renderPhase === 'opening' && 'is-opening',
    (renderPhase === 'revealed' || renderPhase === 'claiming') && 'is-revealed',
    (renderPhase === 'shaking-locked' || renderPhase === 'locked-rest') && 'is-shaking-locked',
    renderPhase === 'locked-rest' && 'is-locked-rest',
    renderPhase === 'claiming' && 'is-claiming',
  ].filter(Boolean).join(' ');

  const winnerChest = renderWinnerIdx != null ? CHESTS[renderWinnerIdx] : null;
  const accentInUse = winnerChest && ['stopped', 'shaking', 'opening', 'revealed', 'claiming', 'shaking-locked', 'locked-rest'].includes(renderPhase)
    ? winnerChest.glow
    : roleAccent;

  const showPrize = winnerChest && !isLockedReveal &&
    ['opening', 'revealed', 'claiming'].includes(renderPhase);

  const isHiddenLetter = winnerChest && /HIDDEN\s+LETTER/i.test(winnerChest.prize || '');
  // Pick the first uncollected letter as the "freshly awarded" letter for the
  // prize panel; if all letters are collected (or there's no word), fall back
  // to a random letter from the word for visual flair.
  const awardedLetter = useMemo(() => {
    if (!isHiddenLetter || !word) return null;
    const remaining = wordUnique.filter((c) => !collectedSet.has(c));
    if (remaining.length) return remaining[0];
    return wordUnique[Math.floor(Math.random() * wordUnique.length)] || null;
  }, [isHiddenLetter, word, wordUnique, collectedSet]);

  const isSpinningPhase = renderPhase === 'spinning' || renderPhase === 'spinning-override';

  return (
    <div
      className={`stage ${tweaks.connected ? 'is-connected' : 'is-guest'} ${mapOpen ? 'is-map-open' : ''} ${role.shiny ? 'is-shiny-role' : ''}`}
      style={{
        '--accent': roleAccent,
        '--role-accent': roleAccent,
        '--chest-glow': accentInUse,
        '--open-crossfade': `${tweaks.openCrossfade ?? 450}ms`,
        '--shake-intensity': `${tweaks.shakeIntensity ?? 10}deg`,
      }}
    >
      <div className="tier-progress" aria-hidden="true">
        <div className="tier-progress-fill" style={{ width: `${tierProgressPct}%` }}>
          <div className="tier-progress-shimmer" />
        </div>
        <div className="tier-progress-label">
          {role.id === 'PROMDRILLS_CHRONICLES' ? (
            <span className="tier-progress-max">MAX TIER ACHIEVED — TRY TO OPEN MYTHIC CHEST!</span>
          ) : (
            <>
              <span>TIER PROGRESS</span>
              {totalLetters > 0 && (
                <span className="tier-progress-count">{slotsFilled}/{totalLetters}</span>
              )}
            </>
          )}
        </div>
      </div>

      <header className="top-bar">
        {/* Beta notice — overlaid in the top-bar's top band so it reads as
            "below the tier bar, above the user pill" WITHOUT joining the grid
            flow (position:absolute), so the 1fr arena keeps its full height.
            pointer-events:none so it never intercepts the pill / map toggle. */}
        <div className="box-beta-note" role="status">
          <svg
            className="box-beta-note-icon"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 2v6.5L4.7 17.4A2 2 0 0 0 6.4 20.5h11.2a2 2 0 0 0 1.7-3.1L14 8.5V2" />
            <path d="M8.5 2h7" />
            <path d="M7 15h10" />
          </svg>
          <span>BETA · under active development — EXPL points &amp; accounts aren&apos;t live yet</span>
        </div>
        {tweaks.connected && (
          <button
            type="button"
            className={`user-pill ${pillPulse > 0 ? 'is-bubble' : ''} ${mapOpen ? 'is-map-open' : ''}`}
            ref={pillRef}
            key={pillPulse}
            onClick={() => setMapOpen((o) => !o)}
            aria-expanded={mapOpen}
            aria-label="Open roles and chests map"
          >
            <span className="user-pill-glow" aria-hidden="true" />
            <span className="user-pill-name">{(tweaks.username || 'EXPLORER').toUpperCase()}</span>
            <span className="user-pill-role">@{role.label}</span>
          </button>
        )}
      </header>

      {tweaks.connected && word && (
        <div className="letter-row">
          <div className="letter-eyebrow">NEXT TIER · {word}</div>
          <div className="letter-slots">
            {letterSlots.map((s, i) => (
              <LetterGlyph key={i} ch={s.ch} revealed={s.collected} pulsing={s.pulsing} accent={roleAccent} />
            ))}
          </div>
        </div>
      )}

      {!tweaks.connected || !word ? (
        <div className="letter-row letter-row-empty">
          {/* Guest mode (no user pill) keeps the MAP button as a discoverable
              entry point. Connected users get the same map by clicking their
              user pill — no redundant button. */}
          <button
            className={`map-toggle ${mapOpen ? 'is-open' : ''}`}
            onClick={() => setMapOpen((o) => !o)}
            aria-expanded={mapOpen}
            aria-label="Roles and chests map"
          >
            <span className="map-toggle-dot" aria-hidden="true" />
            MAP
          </button>
        </div>
      ) : null}

      <div className="arena">
        <div className={ringClass} style={{ '--ring-angle': `${ringAngle}deg`, '--ring-z': ringZ }}>
          {CHESTS.map((c, i) => {
            const isWinner = i === renderWinnerIdx;
            const isFront = i === frontIdx;
            const isLockedSlot = isWinner && isLockedReveal && ['stopped', 'shaking-locked', 'locked-rest'].includes(renderPhase);
            const showWinnerPrize = isWinner && showPrize;
            return (
              <div
                key={c.id}
                className={[
                  'slot',
                  isWinner && 'is-winner',
                  isFront && 'is-front',
                  isLockedSlot && 'is-locked',
                ].filter(Boolean).join(' ')}
                style={{
                  '--slot-angle': i * SLOT_DEG,
                  '--chest-glow': c.glow,
                  '--prize-left': `${c.prizeLeftPct ?? 50}%`,
                  '--prize-top':  `${c.prizeTopPct  ?? 21}%`,
                  '--lock-left':  `${c.lockLeftPct  ?? c.prizeLeftPct ?? 50}%`,
                  '--lock-top':   `${c.lockTopPct   ?? 50}%`,
                  zIndex: isWinner ? 50 : Math.round(100 + Math.cos(((ringAngle + i * SLOT_DEG) * Math.PI) / 180) * 10),
                  opacity: 0.40 + 0.60 * (Math.cos(((ringAngle + i * SLOT_DEG) * Math.PI) / 180) * 0.5 + 0.5),
                }}
              >
                <div className="chest-billboard">
                  {isWinner && !isLockedReveal && (
                    <>
                      <div className="floor-flash" />
                      <div className="light-beam" />
                      {sparks.map((s, k) => (
                        <span key={k} className="spark" style={{
                          '--spark-x': `${s.x}px`,
                          '--spark-y': `${s.y}px`,
                          '--spark-delay': `${s.delay}ms`,
                          '--spark-dur': `${s.dur}ms`,
                          width: `${s.size}px`,
                          height: `${s.size}px`,
                        }} />
                      ))}
                    </>
                  )}

                  <div className="chest-stack">
                    <img className="chest chest-closed" src={c.imgClosed} alt={c.label} draggable={false} />
                    <img className="chest chest-open" src={c.imgOpen} alt="" draggable={false} />
                    <div className="open-flash" aria-hidden="true" />
                  </div>

                  {showWinnerPrize && (
                    <div className="prize-text-mount" ref={prizeTextRef} style={{ '--gem-color': c.glow }}>
                      <div className="prize-text-label">
                        {isHiddenLetter && awardedLetter ? (
                          <>
                            <span className="prize-text-tag">LETTER</span>
                            <span className="prize-letter-glyph">
                              <LetterGlyph ch={awardedLetter} revealed accent={c.glow} />
                            </span>
                          </>
                        ) : (
                          <span className="prize-text-tag">{c.prize}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {isLockedSlot && (
                    <div className="lock-overlay">
                      <div className="lock-icon" aria-hidden="true">
                        <span className="lock-shackle" />
                        <span className="lock-body" />
                      </div>
                      <div className="lock-label">
                        <span className="lock-label-top">UNLOCKS AT</span>
                        <span className="lock-label-mid">{c.requires}</span>
                        <span className="lock-label-bot">TIER</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Stage-level overlay so it covers ARENA + CONTROLS (the bottom main
          button), not just the arena. On small viewports the previous
          arena-scoped overlay left the bottom button uncovered and the map
          card was forced into a tiny window. Now the overlay fills the
          entire box-ui surface and the card can scroll inside. */}
      {mapOpen && (
        <div className="map-overlay" onClick={() => setMapOpen(false)}>
          <div className="map-card" onClick={(e) => e.stopPropagation()}>
            <div className="map-head">
              <h3>ROLES &amp; CHESTS</h3>
              <button className="map-close" onClick={() => setMapOpen(false)} aria-label="Close map">✕</button>
            </div>
            <div className="map-body">
              <MapTier title="EXPLORILLS" chests={[CHESTS[0], CHESTS[1]]} highlight={role.id === 'EXPLORILLS'} />
              <MapTier title="RENDRILLS" subtitle="(above plus)" chests={[CHESTS[2]]} highlight={role.id === 'RENDRILLS'} />
              <MapTier title="PROMDRILLS" subtitle="(above plus)" chests={[CHESTS[3]]} highlight={role.id === 'PROMDRILLS'} />
              <MapTier title="PROMDRILLS · CHRONICLES" subtitle="(grand prize)" chests={[CHESTS[4]]} highlight={role.id === 'PROMDRILLS_CHRONICLES'} />
            </div>
            <div className="map-foot">EQUAL ODDS · 7-DAY COOLDOWN</div>
          </div>
        </div>
      )}

      <div className="controls">
        <SpeedBar current={speed.current} peak={speed.peak} max={MAX_SPEED_DEG_PER_SEC} active={isSpinningPhase} />
        <MainButton
          phase={renderPhase}
          connected={tweaks.connected}
          cooldownActive={cooldownActive}
          cooldownLabel={fmtCooldown(cooldownRemaining)}
          isLockedReveal={isLockedReveal}
          onSpin={spin}
          onClaim={onClaim}
          onConnect={onConnect}
        />
      </div>
    </div>
  );
}

export default OneBox;
