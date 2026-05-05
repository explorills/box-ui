/* one BOX — 3D carousel + role-gated open / lock / claim flow */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const ROLES = [
  { id: 'GUEST',                 label: 'GUEST',                   maxIdx: -1, word: null },
  { id: 'EXPLORILLS',            label: 'EXPLORILLS',              maxIdx:  1, word: 'RENDRILLS' },
  { id: 'RENDRILLS',             label: 'RENDRILLS',               maxIdx:  2, word: 'PROMDRILLS' },
  { id: 'PROMDRILLS',            label: 'PROMDRILLS',               maxIdx:  3, word: 'CHRONICLES' },
  { id: 'PROMDRILLS_CHRONICLES', label: 'PROMDRILLS · CHRONICLES', maxIdx:  4, word: null },
];
const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

const CHESTS = [
  { id: 'common',    label: 'COMMON',    imgClosed: 'assets/common.png',    imgOpen: 'assets/common_open.png',    glow: '#22c55e', prize: 'HIDDEN LETTER',          requires: 'EXPLORILLS' },
  { id: 'rare',      label: 'RARE',      imgClosed: 'assets/rare.png',      imgOpen: 'assets/rare_open.png',      glow: '#3b82f6', prize: '1,111 $EXPL',            requires: 'EXPLORILLS' },
  { id: 'epic',      label: 'EPIC',      imgClosed: 'assets/epic.png',      imgOpen: 'assets/epic_open.png',      glow: '#a855f7', prize: 'BLUE MINERAL',           requires: 'RENDRILLS'  },
  { id: 'legendary', label: 'LEGENDARY', imgClosed: 'assets/legendary.png', imgOpen: 'assets/legendary_open.png', glow: '#f59e0b', prize: 'EXPLORILLS GENESIS ART', requires: 'PROMDRILLS' },
  { id: 'mythic',    label: 'MYTHIC',    imgClosed: 'assets/mythic.png',    imgOpen: 'assets/mythic_open.png',    glow: '#ef4444', prize: 'EXPLORILLS GRAND PRIZE', requires: 'PROMDRILLS · CHRONICLES' },
];

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

function OneBox({ tweaks }) {
  const effectiveRoleId = tweaks.connected ? tweaks.role : 'GUEST';
  const role = ROLE_BY_ID[effectiveRoleId] || ROLES[0];
  const userMaxIdx = role.maxIdx;

  const [phase, setPhase] = useState('idle');
  const [winnerIdx, setWinnerIdx] = useState(null);
  const [ringAngle, setRingAngle] = useState(0);
  const [opens, setOpens] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);

  const stateRef = useRef({ angle: 0 });
  const spinTargetRef = useRef(null);
  const pillRef = useRef(null);
  const prizeRef = useRef(null);

  useEffect(() => { if (tweaks.mapDefaultOpen) setMapOpen(true); }, []); // eslint-disable-line

  const SLOT_DEG = 360 / CHESTS.length;
  const idleSpeed = tweaks.idleSpeed ?? 8;
  const ringZ = `${tweaks.ringRadius ?? 230}px`;

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
  }, [tweaks.spinOutcome]);

  const renderWinnerIdx = phaseOverride !== 'AUTO' && phaseOverride !== 'COOLDOWN' && overrideWinnerIdx != null
    ? overrideWinnerIdx
    : winnerIdx;

  const isLockedReveal = renderWinnerIdx != null && renderWinnerIdx > userMaxIdx;

  const cooldownForce = phaseOverride === 'COOLDOWN';
  const cooldownActive = cooldownForce || (
    (tweaks.cooldownDays ?? 0) + (tweaks.cooldownHours ?? 0) + (tweaks.cooldownMinutes ?? 0) > 0
  );

  const isIdleDrift = (phase === 'idle' && phaseOverride === 'AUTO') || phaseOverride === 'IDLE';
  const isSpinTarget = phase === 'spinning' && phaseOverride === 'AUTO';
  const isOverrideSpin = phaseOverride === 'SPINNING';

  useEffect(() => {
    if (!isIdleDrift) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      stateRef.current.angle = (stateRef.current.angle + idleSpeed * dt) % 360;
      setRingAngle(stateRef.current.angle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isIdleDrift, idleSpeed]);

  useEffect(() => {
    if (!isOverrideSpin) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      stateRef.current.angle = (stateRef.current.angle + 280 * dt) % 360;
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
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Backup timer: phase transitions even if RAF stalls (e.g. headless)
    const timer = setTimeout(() => {
      stateRef.current.angle = startAngle + totalDelta;
      setRingAngle(stateRef.current.angle);
      setWinnerIdx(chosen);
      setPhase('stopped');
    }, totalDuration + 30);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isSpinTarget]);

  const spin = useCallback(() => {
    if (phase !== 'idle' || cooldownActive || phaseOverride !== 'AUTO') return;
    setMapOpen(false);
    setWinnerIdx(null);

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
  }, [phase, cooldownActive, phaseOverride, tweaks.spinOutcome, SLOT_DEG]);

  useEffect(() => {
    if (phaseOverride !== 'AUTO') return;
    if (phase === 'stopped') {
      const isLocked = winnerIdx != null && winnerIdx > userMaxIdx;
      const t = setTimeout(() => setPhase(isLocked ? 'shaking-locked' : 'shaking'), 400);
      return () => clearTimeout(t);
    }
    if (phase === 'shaking') {
      const t = setTimeout(() => setPhase('opening'), 700);
      return () => clearTimeout(t);
    }
    if (phase === 'opening') {
      const t = setTimeout(() => setPhase('revealed'), 1100);
      return () => clearTimeout(t);
    }
    if (phase === 'shaking-locked') {
      const t = setTimeout(() => {
        setPhase('idle');
        setWinnerIdx(null);
      }, 1600);
      return () => clearTimeout(t);
    }
    if (phase === 'closing') {
      const t = setTimeout(() => {
        setPhase('idle');
        setWinnerIdx(null);
        setOpens((n) => n + 1);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [phase, phaseOverride, winnerIdx, userMaxIdx]);

  const onClaim = useCallback(() => {
    if (phaseOverride !== 'AUTO') return;
    const pill = pillRef.current;
    const prize = prizeRef.current;
    if (pill && prize) {
      const pr = pill.getBoundingClientRect();
      const zr = prize.getBoundingClientRect();
      const dx = pr.left + pr.width / 2 - (zr.left + zr.width / 2);
      const dy = pr.top + pr.height / 2 - (zr.top + zr.height / 2);
      prize.style.setProperty('--target-x', `${dx}px`);
      prize.style.setProperty('--target-y', `${dy}px`);
    }
    setPhase('claiming');
    const t = setTimeout(() => setPhase('closing'), 700);
    return () => clearTimeout(t);
  }, [phaseOverride]);

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

  const frontIdx = useMemo(() => {
    const a = ((-ringAngle) % 360 + 360) % 360;
    return Math.round(a / SLOT_DEG) % CHESTS.length;
  }, [ringAngle, SLOT_DEG]);

  const sparks = useMemo(() => {
    const out = [];
    const count = tweaks.sparkCount ?? 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 80 + Math.random() * 90;
      out.push({
        x: Math.cos(a) * dist,
        y: Math.sin(a) * dist - 40,
        delay: Math.random() * 250,
        dur: 900 + Math.random() * 500,
        size: 4 + Math.random() * 5,
      });
    }
    return out;
  }, [renderWinnerIdx, opens, tweaks.sparkCount, phaseOverride]);

  const ringClass = [
    'ring',
    (renderPhase === 'spinning' || renderPhase === 'spinning-override') && 'is-spinning',
    renderPhase === 'spinning-override' && 'is-override-spin',
    (['stopped', 'shaking', 'opening', 'revealed', 'claiming', 'shaking-locked', 'closing'].includes(renderPhase)) && 'is-revealing',
    renderPhase === 'shaking' && 'is-shaking',
    (renderPhase === 'opening' || renderPhase === 'revealed' || renderPhase === 'claiming') && 'is-opening',
    renderPhase === 'revealed' && 'is-revealed',
    renderPhase === 'shaking-locked' && 'is-shaking-locked',
    renderPhase === 'claiming' && 'is-claiming',
    renderPhase === 'closing' && 'is-closing',
  ].filter(Boolean).join(' ');

  const winnerChest = renderWinnerIdx != null ? CHESTS[renderWinnerIdx] : null;
  const accentInUse = winnerChest && ['stopped', 'shaking', 'opening', 'revealed', 'claiming', 'shaking-locked'].includes(renderPhase)
    ? winnerChest.glow
    : 'var(--accent)';

  const showPrize = winnerChest && !isLockedReveal &&
    ['opening', 'revealed', 'claiming', 'closing'].includes(renderPhase);

  const showLockChip = isLockedReveal && winnerChest && renderPhase === 'shaking-locked';

  return (
    <div
      className={`stage ${tweaks.connected ? 'is-connected' : 'is-guest'} ${mapOpen ? 'is-map-open' : ''}`}
      style={{
        '--chest-glow': accentInUse,
        '--open-crossfade': `${tweaks.openCrossfade ?? 450}ms`,
        '--shake-intensity': `${tweaks.shakeIntensity ?? 45}deg`,
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
            const isLockedSlot = isWinner && isLockedReveal && ['stopped', 'shaking-locked'].includes(renderPhase);
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
                  opacity: 0.35 + 0.65 * (Math.cos(((ringAngle + i * SLOT_DEG) * Math.PI) / 180) * 0.5 + 0.5),
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
                  </div>
                  <div className="chest-shadow" />

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

                  <div className="chest-label">{c.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {showPrize && (
          <div
            ref={prizeRef}
            className="prize-reveal"
            style={{ '--gem-color': winnerChest.glow }}
            aria-live="polite"
          >
            <div className="prize-name">{winnerChest.prize}</div>
            <div className="prize-gem" />
          </div>
        )}

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
        />
      </div>
    </div>
  );
}

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

function MainButton({ phase, connected, cooldownActive, cooldownLabel, isLockedReveal, onSpin, onClaim }) {
  if (!connected) {
    return (
      <button className="main-btn is-connect" type="button">
        <span className="label-row">CONNECT</span>
      </button>
    );
  }
  if (cooldownActive) {
    return (
      <button className="main-btn is-cooldown" disabled>
        <span className="label-row">TRY AGAIN IN {cooldownLabel}</span>
      </button>
    );
  }
  if (phase === 'revealed' && !isLockedReveal) {
    return (
      <button className="main-btn is-claim" onClick={onClaim}>
        <span className="label-row">CLAIM</span>
      </button>
    );
  }
  if (phase === 'idle') {
    return (
      <button className="main-btn" onClick={onSpin}>
        <span className="label-row">SPIN &amp; OPEN</span>
      </button>
    );
  }
  let label = '…';
  let spinning = false;
  if (phase === 'spinning' || phase === 'spinning-override') { label = 'SPINNING…'; spinning = true; }
  else if (phase === 'stopped') label = 'LOCKING IN…';
  else if (phase === 'shaking') label = 'HOLD TIGHT…';
  else if (phase === 'shaking-locked') label = 'LOCKED';
  else if (phase === 'opening') label = 'OPENING!';
  else if (phase === 'revealed' && isLockedReveal) label = 'LOCKED';
  else if (phase === 'claiming') label = 'CLAIMING…';
  else if (phase === 'closing') label = 'CLOSING…';
  return (
    <button className="main-btn" disabled>
      <span className="label-row">
        {spinning && <span className="icon-spin" />}
        {label}
      </span>
    </button>
  );
}

window.OneBox = OneBox;
