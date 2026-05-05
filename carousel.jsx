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
 *
 * Backend integration points:
 *   • CHESTS  ← window.OneBoxConfig.CHESTS  (config/chests.js)
 *   • ROLES   ← window.OneBoxConfig.ROLES   (config/roles.js)
 *   • Audio   ← window.OneBoxAudio          (audio/audio.js)
 *   • State   ← passed as `tweaks` prop from app.jsx
 *
 * Phase machine:
 *   idle → spinning → stopped → (eligible) shaking → opening → revealed → claiming → closing → idle
 *                              ↘ (locked) shaking-locked → locked-rest → (tap anywhere) → idle
 */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Helpers ────────────────────────────────────────────────────────────────

const sfx = (name) => {
  if (window.OneBoxAudio && !window.OneBoxAudio.isMuted()) window.OneBoxAudio.play(name);
};

function uniqueLetters(word) {
  if (!word) return [];
  const seen = new Set();
  const out = [];
  for (const c of word) if (!seen.has(c)) { seen.add(c); out.push(c); }
  return out;
}

function fmtCooldown(d, h, m) {
  const parts = [];
  if (d) parts.push(`${d}D`);
  if (h || d) parts.push(`${h}H`);
  parts.push(`${m}M`);
  return parts.join(' ');
}

// ─── Hourglass icon ─────────────────────────────────────────────────────────

function HourglassIcon() {
  return <span className="hourglass" aria-hidden="true" />;
}

// ─── Map tier row (drawer content) ──────────────────────────────────────────

function MapTier({ title, subtitle, chests, highlight }) {
  return (
    <div className={`map-tier ${highlight ? 'is-current' : ''}`}>
      <div className="map-tier-head">
        <span className="map-tier-name">{title}</span>
        {subtitle && <span className="map-tier-sub">{subtitle}</span>}
        {highlight && <span className="map-tier-badge">YOU</span>}
      </div>
      <div className="map-tier-body">
        {chests.map((c) => (
          <div className="map-row" key={c.id} style={{ '--c': c.glow }}>
            <span className="map-chest">
              <span className="map-swatch" />
              {c.label}
            </span>
            <span className="map-prize">{c.prize}</span>
          </div>
        ))}
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
          <HourglassIcon />
          TRY AGAIN IN {cooldownLabel}
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
  else if (phase === 'closing') label = 'CLOSING…';
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

function OneBox({ tweaks }) {
  // Resolve backend-injectable data
  const CHESTS = window.OneBoxConfig.CHESTS;
  const ROLES = window.OneBoxConfig.ROLES;
  const ROLE_BY_ID = useMemo(() => Object.fromEntries(ROLES.map((r) => [r.id, r])), [ROLES]);

  // Effective role (Guest if disconnected)
  const effectiveRoleId = tweaks.connected ? tweaks.role : 'GUEST';
  const role = ROLE_BY_ID[effectiveRoleId] || ROLES[0];
  const userMaxIdx = role.maxIdx;

  // ── Local state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('idle');
  const [winnerIdx, setWinnerIdx] = useState(null);
  const [ringAngle, setRingAngle] = useState(0);
  const [opens, setOpens] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);

  const stateRef = useRef({ angle: 0 });
  const spinTargetRef = useRef(null);
  const pillRef = useRef(null);
  const prizeTextRef = useRef(null);
  const lastTickRef = useRef(0);
  const idleStartedAtRef = useRef(0);  // for smooth ramp-up of idle drift

  useEffect(() => { if (tweaks.mapDefaultOpen) setMapOpen(true); }, []); // eslint-disable-line

  // Audio mute sync
  useEffect(() => {
    if (window.OneBoxAudio) window.OneBoxAudio.setMuted(!tweaks.audioEnabled);
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
  const cooldownForce = phaseOverride === 'COOLDOWN';
  const cooldownActive = cooldownForce || (
    (tweaks.cooldownDays ?? 0) + (tweaks.cooldownHours ?? 0) + (tweaks.cooldownMinutes ?? 0) > 0
  );

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
      // Smooth ramp from 0→1 over 1.0s after entering idle
      const elapsed = (now - idleStartedAtRef.current) / 1000;
      const ramp = Math.min(1, elapsed / 1.0);
      const eased = ramp * ramp * (3 - 2 * ramp); // smoothstep
      stateRef.current.angle = (stateRef.current.angle + idleSpeed * eased * dt) % 360;
      setRingAngle(stateRef.current.angle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isIdleDrift, idleSpeed]);

  // Reset ramp timer every time phase enters idle
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

  // Spin-to-target (with setTimeout backup so headless / stalled RAF still finishes)
  useEffect(() => {
    if (!isSpinTarget || !spinTargetRef.current) return;
    const { startAngle, totalDelta, totalDuration, chosen } = spinTargetRef.current;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3.5);
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / totalDuration);
      const a = startAngle + totalDelta * ease(t);
      stateRef.current.angle = a;
      setRingAngle(a);
      const turn = Math.floor(a / 30);
      if (turn !== lastTickRef.current && t < 0.92) {
        lastTickRef.current = turn;
        sfx('tick');
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = setTimeout(() => {
      stateRef.current.angle = startAngle + totalDelta;
      setRingAngle(stateRef.current.angle);
      setWinnerIdx(chosen);
      setPhase('stopped');
      sfx('settle');
    }, totalDuration + 30);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isSpinTarget]);

  // Spin trigger
  const spin = useCallback(() => {
    if (phase !== 'idle' || cooldownActive || phaseOverride !== 'AUTO') return;
    if (window.OneBoxAudio) window.OneBoxAudio.unlock();
    sfx('spinPress');
    setMapOpen(false);
    setWinnerIdx(null);

    // BACKEND POINT: replace this random pick with the real outcome from your
    // server. If `tweaks.spinOutcome` is set (dev mode), it forces an outcome.
    const forced = (tweaks.spinOutcome || 'AUTO').toUpperCase();
    let chosen;
    if (forced !== 'AUTO') {
      chosen = CHESTS.findIndex((c) => c.id.toUpperCase() === forced);
      if (chosen < 0) chosen = Math.floor(Math.random() * CHESTS.length);
    } else {
      chosen = Math.floor(Math.random() * CHESTS.length);
    }

    const baseTarget = ((-chosen * SLOT_DEG) % 360 + 360) % 360;
    const extraSpins = 4 + Math.floor(Math.random() * 3);
    const startAngle = stateRef.current.angle;
    const startMod = ((startAngle % 360) + 360) % 360;
    let delta = baseTarget - startMod;
    if (delta < 0) delta += 360;
    const totalDelta = extraSpins * 360 + delta;
    const totalDuration = 3800 + Math.random() * 600;

    spinTargetRef.current = { startAngle, totalDelta, totalDuration, chosen };
    setPhase('spinning');
  }, [phase, cooldownActive, phaseOverride, tweaks.spinOutcome, SLOT_DEG, CHESTS]);

  // Phase progression (only in AUTO mode)
  useEffect(() => {
    if (phaseOverride !== 'AUTO') return;
    if (phase === 'stopped') {
      const isLocked = winnerIdx != null && winnerIdx > userMaxIdx;
      const t = setTimeout(() => {
        setPhase(isLocked ? 'shaking-locked' : 'shaking');
        sfx(isLocked ? 'lock' : 'spinPress');
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
      // After the lock-shake animation finishes, freeze in 'locked-rest'.
      // No auto-resume — user must tap anywhere on the stage.
      const t = setTimeout(() => setPhase('locked-rest'), 1500);
      return () => clearTimeout(t);
    }
    if (phase === 'closing') {
      const t = setTimeout(() => {
        setPhase('idle');
        setWinnerIdx(null);
        setOpens((n) => n + 1);
        sfx('close');
      }, 700);
      return () => clearTimeout(t);
    }
  }, [phase, phaseOverride, winnerIdx, userMaxIdx]);

  // Tap-anywhere-to-resume from locked-rest
  useEffect(() => {
    if (phase !== 'locked-rest' || phaseOverride !== 'AUTO') return;
    const handler = (e) => {
      // Ignore taps inside the Tweaks panel (dev tooling) so devs can keep
      // editing tweaks without losing the locked state for inspection.
      if (e.target && e.target.closest && e.target.closest('.twk-panel')) return;
      setPhase('idle');
      setWinnerIdx(null);
      sfx('settle');
    };
    // Small delay so the click that landed here doesn't immediately resume
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', handler);
    }, 250);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', handler);
    };
  }, [phase, phaseOverride]);

  // Claim flow
  const onClaim = useCallback(() => {
    if (phaseOverride !== 'AUTO') return;
    sfx('claim');
    const pill = pillRef.current;
    const node = prizeTextRef.current;
    if (node) {
      if (pill) {
        const pr = pill.getBoundingClientRect();
        const zr = node.getBoundingClientRect();
        const dx = pr.left + pr.width / 2 - (zr.left + zr.width / 2);
        const dy = pr.top + pr.height / 2 - (zr.top + zr.height / 2);
        node.style.setProperty('--target-x', `${dx}px`);
        node.style.setProperty('--target-y', `${dy}px`);
      } else {
        node.style.setProperty('--target-x', `0px`);
        node.style.setProperty('--target-y', `-200px`);
      }
    }
    setPhase('claiming');
    setTimeout(() => setPhase('closing'), 700);
  }, [phaseOverride]);

  const onConnect = useCallback(() => {
    // BACKEND POINT: open auth/wallet flow. UI stub only.
    if (window.OneBoxAudio) window.OneBoxAudio.unlock();
    sfx('claim');
  }, []);

  // Letter slots
  const word = role.word;
  const wordUnique = useMemo(() => uniqueLetters(word), [word]);
  const collectedCount = Math.max(0, Math.min(tweaks.collectedCount ?? 0, wordUnique.length));
  const collectedSet = useMemo(() => new Set(wordUnique.slice(0, collectedCount)), [wordUnique, collectedCount]);

  const letterSlots = useMemo(() => {
    if (!word) return [];
    const lastIdx = tweaks.lastRevealedIdx ?? -1;
    return [...word].map((ch, i) => ({
      ch, idx: i,
      collected: collectedSet.has(ch),
      pulsing: i === lastIdx && collectedSet.has(ch),
    }));
  }, [word, collectedSet, tweaks.lastRevealedIdx]);

  const tierProgressPct = wordUnique.length === 0
    ? (role.id === 'PROMDRILLS_CHRONICLES' ? 100 : 0)
    : (collectedCount / wordUnique.length) * 100;

  // Front-of-ring detection (for label highlight, not used now since labels are always on)
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
    (['stopped', 'shaking', 'opening', 'revealed', 'claiming', 'shaking-locked', 'locked-rest', 'closing'].includes(renderPhase)) && 'is-revealing',
    renderPhase === 'shaking' && 'is-shaking',
    renderPhase === 'opening' && 'is-opening',
    (renderPhase === 'revealed' || renderPhase === 'claiming') && 'is-revealed',
    (renderPhase === 'shaking-locked' || renderPhase === 'locked-rest') && 'is-shaking-locked',
    renderPhase === 'locked-rest' && 'is-locked-rest',
    renderPhase === 'claiming' && 'is-claiming',
    renderPhase === 'closing' && 'is-closing',
  ].filter(Boolean).join(' ');

  const winnerChest = renderWinnerIdx != null ? CHESTS[renderWinnerIdx] : null;
  const accentInUse = winnerChest && ['stopped', 'shaking', 'opening', 'revealed', 'claiming', 'shaking-locked', 'locked-rest'].includes(renderPhase)
    ? winnerChest.glow
    : 'var(--accent)';

  const showPrize = winnerChest && !isLockedReveal &&
    ['opening', 'revealed', 'claiming', 'closing'].includes(renderPhase);

  const showLockChip = isLockedReveal && winnerChest && (renderPhase === 'shaking-locked' || renderPhase === 'locked-rest');

  return (
    <div
      className={`stage ${tweaks.connected ? 'is-connected' : 'is-guest'} ${mapOpen ? 'is-map-open' : ''}`}
      style={{
        '--chest-glow': accentInUse,
        '--open-crossfade': `${tweaks.openCrossfade ?? 450}ms`,
        '--shake-intensity': `${tweaks.shakeIntensity ?? 10}deg`,
      }}
    >
      <div className="tier-progress" aria-hidden="true">
        <div className="tier-progress-fill" style={{ width: `${tierProgressPct}%` }} />
      </div>

      <header className="top-bar">
        {tweaks.connected && (
          <div className="user-pill" ref={pillRef}>
            <span className="user-name">@{(tweaks.username || 'EXPLORER').toUpperCase()}</span>
            <span className="user-dot" aria-hidden="true" />
            <span className="user-role">{role.label}</span>
          </div>
        )}
        <button
          className={`map-toggle ${mapOpen ? 'is-open' : ''}`}
          onClick={() => setMapOpen((o) => !o)}
          aria-expanded={mapOpen}
          aria-label="Roles and chests map"
        >
          <span className="caret" aria-hidden="true">▾</span>
          <span>MAP</span>
        </button>
      </header>

      {tweaks.connected && word && (
        <div className="letter-row">
          <div className="letter-eyebrow">{word} · {collectedCount}/{wordUnique.length}</div>
          <div className="letter-slots">
            {letterSlots.map((s, i) => (
              <span
                key={i}
                className={`letter-slot ${s.collected ? 'is-revealed' : ''} ${s.pulsing ? 'is-pulsing' : ''}`}
              >
                {s.collected ? s.ch : '—'}
              </span>
            ))}
          </div>
        </div>
      )}

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
                    /* Prize TEXT placeholder inside the chest mouth (replaces gem).
                       BACKEND can swap this for a real prize image element later;
                       the position + animation are agnostic to content. */
                    <div className="prize-text-mount" ref={prizeTextRef} style={{ '--gem-color': c.glow }}>
                      <div className="prize-text-label">{c.prize}</div>
                    </div>
                  )}

                  {isLockedSlot && (
                    <div className="lock-overlay">
                      <div className="lock-icon" aria-hidden="true">
                        <span className="lock-shackle" />
                        <span className="lock-body" />
                      </div>
                      <div className="lock-label">
                        REQUIRES
                        <b>{c.requires}</b>
                      </div>
                    </div>
                  )}

                  {/* Always-visible gamified label, offset 10px left to align with chest's diagonal look */}
                  <div className="chest-tag" style={{ '--c': c.glow }}>{c.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {showLockChip && (
          <div className="lock-chip">
            <span className="lock-chip-icon" aria-hidden="true" />
            <span>UNLOCKS AT <b>{winnerChest.requires}</b> TIER</span>
          </div>
        )}

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
      </div>

      <div className="controls">
        <MainButton
          phase={renderPhase}
          connected={tweaks.connected}
          cooldownActive={cooldownActive}
          cooldownLabel={fmtCooldown(tweaks.cooldownDays ?? 0, tweaks.cooldownHours ?? 0, tweaks.cooldownMinutes ?? 0)}
          isLockedReveal={isLockedReveal}
          onSpin={spin}
          onClaim={onClaim}
          onConnect={onConnect}
        />
      </div>
    </div>
  );
}

window.OneBox = OneBox;
