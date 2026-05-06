/* App entry — wires the ONE-ecosystem consumer chrome around the OneBox
 * carousel. Same wiring pattern other consumers (one-id, one-chat, the
 * archived one-box) use: an OneIdProvider context wraps an EcosystemNavbar
 * (with the project's logo, name, theme color, and domain) and the page
 * content. The carousel itself is unchanged from the prototype.
 *
 * Backend integration points (unchanged from the prototype):
 *   • src/config/chests.ts — replace CHESTS array (or fetch at boot)
 *   • src/config/roles.ts  — replace ROLES array
 *   • TWEAK_DEFAULTS below — initial UI state (overridable from the
 *     embedded host's Tweaks panel via __edit_mode_set_keys)
 *
 * The Tweaks panel is gated to staging + localhost only — see Tweaks.tsx
 * PROD_HOSTS allowlist. On box.expl.one, the panel renders nothing.
 */
import React from 'react';
import { OneIdProvider, EcosystemNavbar } from '@explorills/one-ecosystem-ui';
import logo from './assets/logo.png';
import OneBox from './OneBox';
import {
  useTweaks, TweaksPanel, TweakSection,
  TweakSlider, TweakToggle, TweakSelect, TweakText, TweakColor, TweakButton,
} from './Tweaks';

// EXPL ONE shared brand values — match other ecosystem consumers.
const REOWN_PROJECT_ID = '1fe344d4623291d85ad7369cbc6d9ec8';
const PROJECT_NAME = 'box';
const THEME_COLOR = '#7c3aed';
const CURRENT_DOMAIN = 'box.expl.one';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#7c3aed",
  "connected": true,
  "username": "EXPLORER",
  "role": "EXPLORILLS",
  "collectedCount": 3,
  "lastRevealedIdx": -1,
  "spinOutcome": "AUTO",
  "phaseOverride": "AUTO",
  "cooldownDays": 0,
  "cooldownHours": 0,
  "cooldownMinutes": 0,
  "cooldownSeconds": 0,
  "ringRadius": 360,
  "idleSpeed": 22,
  "sparkCount": 48,
  "openCrossfade": 200,
  "shakeIntensity": 10,
  "mapDefaultOpen": false,
  "audioEnabled": true
}/*EDITMODE-END*/;

const ROLE_OPTIONS = [
  { value: 'GUEST', label: 'GUEST' },
  { value: 'EXPLORILLS', label: 'EXPLORILLS' },
  { value: 'RENDRILLS', label: 'RENDRILLS' },
  { value: 'PROMDRILLS', label: 'PROMDRILLS' },
  { value: 'PROMDRILLS_CHRONICLES', label: '+CHRONICLES' },
];

const OUTCOME_OPTIONS = [
  { value: 'AUTO',      label: 'AUTO' },
  { value: 'COMMON',    label: 'COMMON' },
  { value: 'RARE',      label: 'RARE' },
  { value: 'EPIC',      label: 'EPIC' },
  { value: 'LEGENDARY', label: 'LEGEND.' },
  { value: 'MYTHIC',    label: 'MYTHIC' },
];

const PHASE_OPTIONS = [
  { value: 'AUTO',         label: 'AUTO' },
  { value: 'IDLE',         label: 'Idle' },
  { value: 'SPINNING',     label: 'Spinning' },
  { value: 'REVEALED',     label: 'Revealed' },
  { value: 'LOCKED-SHAKE', label: 'Locked' },
  { value: 'COOLDOWN',     label: 'Cooldown' },
  { value: 'CLAIMED',      label: 'Claimed' },
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', tweaks.accent);
  }, [tweaks.accent]);

  // ── Dev scenario presets ─────────────────────────────────────────────
  const ROLE_LADDER = ['GUEST', 'EXPLORILLS', 'RENDRILLS', 'PROMDRILLS', 'PROMDRILLS_CHRONICLES'];
  const CHEST_IDS   = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

  const bumpRole = (delta) => {
    const i = Math.max(0, ROLE_LADDER.indexOf(tweaks.role));
    const next = ROLE_LADDER[Math.max(0, Math.min(ROLE_LADDER.length - 1, i + delta))];
    setTweak({ role: next, connected: next !== 'GUEST' });
  };

  const openAnyBox = (chestId) => setTweak({
    phaseOverride: 'REVEALED', spinOutcome: chestId,
    cooldownDays: 0, cooldownHours: 0, cooldownMinutes: 0,
    connected: true,
  });

  const lockAnyBox = (chestId) => setTweak({
    phaseOverride: 'LOCKED-SHAKE', spinOutcome: chestId,
    cooldownDays: 0, cooldownHours: 0, cooldownMinutes: 0,
    connected: true,
  });

  const reset = () => setTweak({
    phaseOverride: 'AUTO', spinOutcome: 'AUTO',
    cooldownDays: 0, cooldownHours: 0, cooldownMinutes: 0,
    connected: true,
  });

  const scenarios = {
    'Reset': reset,
    'Spinning': () => setTweak({ phaseOverride: 'SPINNING' }),
    'Cooldown 6d 12h 30m': () => setTweak({
      phaseOverride: 'COOLDOWN', cooldownDays: 6, cooldownHours: 12, cooldownMinutes: 30,
    }),
    'Cooldown 0d 2h 14m': () => setTweak({
      phaseOverride: 'COOLDOWN', cooldownDays: 0, cooldownHours: 2, cooldownMinutes: 14,
    }),
    'Disconnected': () => setTweak({
      connected: false, phaseOverride: 'AUTO', spinOutcome: 'AUTO',
      cooldownDays: 0, cooldownHours: 0, cooldownMinutes: 0,
    }),
  };

  return (
    <OneIdProvider projectId={REOWN_PROJECT_ID} profilePath="/profile" platformColor={THEME_COLOR}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
        <EcosystemNavbar
          logo={logo}
          projectName={PROJECT_NAME}
          themeColor={THEME_COLOR}
          currentDomain={CURRENT_DOMAIN}
        />
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <OneBox tweaks={tweaks} />
        </main>
      </div>
      <TweaksPanel title="one BOX · Tweaks">
        <TweakSection label="Dev presets">
          {Object.entries(scenarios).map(([label, fn]) => (
            <TweakButton key={label} label={label} onClick={fn} secondary />
          ))}
        </TweakSection>

        <TweakSection label="Inject: open box">
          {CHEST_IDS.map((id) => (
            <TweakButton key={`o-${id}`} label={`Open ${id}`} onClick={() => openAnyBox(id)} secondary />
          ))}
        </TweakSection>

        <TweakSection label="Inject: lock box">
          {CHEST_IDS.map((id) => (
            <TweakButton key={`l-${id}`} label={`Lock ${id}`} onClick={() => lockAnyBox(id)} secondary />
          ))}
        </TweakSection>

        <TweakSection label="Inject: bump role">
          <TweakButton label="Role -1" onClick={() => bumpRole(-1)} secondary />
          <TweakButton label="Role +1 (promote)" onClick={() => bumpRole(+1)} secondary />
          <TweakButton label="Top tier (CHRONICLES)" onClick={() => setTweak({ role: 'PROMDRILLS_CHRONICLES', connected: true })} secondary />
        </TweakSection>

        <TweakSection label="Theme">
          <TweakColor label="Accent" value={tweaks.accent} onChange={(v) => setTweak('accent', v)} />
        </TweakSection>

        <TweakSection label="User & role">
          <TweakToggle label="Connected" value={tweaks.connected} onChange={(v) => setTweak('connected', v)} />
          <TweakText label="Username" value={tweaks.username} placeholder="EXPLORER" onChange={(v) => setTweak('username', v)} />
          <TweakSelect label="Role" value={tweaks.role} options={ROLE_OPTIONS} onChange={(v) => setTweak('role', v)} />
        </TweakSection>

        <TweakSection label="Letter progress">
          <TweakSlider label="Collected" value={tweaks.collectedCount} min={0} max={9} step={1} onChange={(v) => setTweak('collectedCount', v)} />
          <TweakSlider label="Last revealed idx" value={tweaks.lastRevealedIdx} min={-1} max={9} step={1} onChange={(v) => setTweak('lastRevealedIdx', v)} />
        </TweakSection>

        <TweakSection label="Force scenario (DEV)">
          <TweakSelect label="Spin outcome" value={tweaks.spinOutcome} options={OUTCOME_OPTIONS} onChange={(v) => setTweak('spinOutcome', v)} />
          <TweakSelect label="Phase override" value={tweaks.phaseOverride} options={PHASE_OPTIONS} onChange={(v) => setTweak('phaseOverride', v)} />
        </TweakSection>

        <TweakSection label="Cooldown">
          <TweakSlider label="Days" value={tweaks.cooldownDays} min={0} max={7} step={1} unit="d" onChange={(v) => setTweak('cooldownDays', v)} />
          <TweakSlider label="Hours" value={tweaks.cooldownHours} min={0} max={23} step={1} unit="h" onChange={(v) => setTweak('cooldownHours', v)} />
          <TweakSlider label="Minutes" value={tweaks.cooldownMinutes} min={0} max={59} step={1} unit="m" onChange={(v) => setTweak('cooldownMinutes', v)} />
          <TweakSlider label="Seconds" value={tweaks.cooldownSeconds} min={0} max={59} step={1} unit="s" onChange={(v) => setTweak('cooldownSeconds', v)} />
        </TweakSection>

        <TweakSection label="Carousel">
          <TweakSlider label="Ring radius" value={tweaks.ringRadius} min={140} max={360} step={5} unit="px" onChange={(v) => setTweak('ringRadius', v)} />
          <TweakSlider label="Idle speed" value={tweaks.idleSpeed} min={0} max={50} step={1} unit="°/s" onChange={(v) => setTweak('idleSpeed', v)} />
        </TweakSection>

        <TweakSection label="Effects">
          <TweakSlider label="Sparks" value={tweaks.sparkCount} min={0} max={48} step={2} onChange={(v) => setTweak('sparkCount', v)} />
          <TweakSlider label="Open crossfade" value={tweaks.openCrossfade} min={200} max={900} step={25} unit="ms" onChange={(v) => setTweak('openCrossfade', v)} />
          <TweakSlider label="Lock tilt" value={tweaks.shakeIntensity} min={2} max={45} step={1} unit="°" onChange={(v) => setTweak('shakeIntensity', v)} />
        </TweakSection>

        <TweakSection label="Audio">
          <TweakToggle label="Sound + haptics" value={tweaks.audioEnabled} onChange={(v) => setTweak('audioEnabled', v)} />
        </TweakSection>

        <TweakSection label="Map">
          <TweakToggle label="Open by default" value={tweaks.mapDefaultOpen} onChange={(v) => setTweak('mapDefaultOpen', v)} />
        </TweakSection>
      </TweaksPanel>
    </OneIdProvider>
  );
}

export default App;
