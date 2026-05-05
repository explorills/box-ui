/* App entry — wires Tweaks panel + carousel */

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
  "ringRadius": 230,
  "idleSpeed": 8,
  "sparkCount": 18,
  "openCrossfade": 450,
  "shakeIntensity": 45,
  "mapDefaultOpen": false
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

  return (
    <>
      <OneBox tweaks={tweaks} />
      <TweaksPanel title="one BOX · Tweaks">
        <TweakSection label="Theme">
          <TweakColor
            label="Accent"
            value={tweaks.accent}
            onChange={(v) => setTweak('accent', v)}
          />
        </TweakSection>

        <TweakSection label="User & role">
          <TweakToggle
            label="Connected"
            value={tweaks.connected}
            onChange={(v) => setTweak('connected', v)}
          />
          <TweakText
            label="Username"
            value={tweaks.username}
            placeholder="EXPLORER"
            onChange={(v) => setTweak('username', v)}
          />
          <TweakSelect
            label="Role"
            value={tweaks.role}
            options={ROLE_OPTIONS}
            onChange={(v) => setTweak('role', v)}
          />
        </TweakSection>

        <TweakSection label="Letter progress">
          <TweakSlider
            label="Collected"
            value={tweaks.collectedCount}
            min={0} max={9} step={1}
            onChange={(v) => setTweak('collectedCount', v)}
          />
          <TweakSlider
            label="Last revealed idx"
            value={tweaks.lastRevealedIdx}
            min={-1} max={9} step={1}
            onChange={(v) => setTweak('lastRevealedIdx', v)}
          />
        </TweakSection>

        <TweakSection label="Force scenario">
          <TweakSelect
            label="Spin outcome"
            value={tweaks.spinOutcome}
            options={OUTCOME_OPTIONS}
            onChange={(v) => setTweak('spinOutcome', v)}
          />
          <TweakSelect
            label="Phase override"
            value={tweaks.phaseOverride}
            options={PHASE_OPTIONS}
            onChange={(v) => setTweak('phaseOverride', v)}
          />
        </TweakSection>

        <TweakSection label="Cooldown">
          <TweakSlider
            label="Days"
            value={tweaks.cooldownDays}
            min={0} max={7} step={1} unit="d"
            onChange={(v) => setTweak('cooldownDays', v)}
          />
          <TweakSlider
            label="Hours"
            value={tweaks.cooldownHours}
            min={0} max={23} step={1} unit="h"
            onChange={(v) => setTweak('cooldownHours', v)}
          />
          <TweakSlider
            label="Minutes"
            value={tweaks.cooldownMinutes}
            min={0} max={59} step={1} unit="m"
            onChange={(v) => setTweak('cooldownMinutes', v)}
          />
        </TweakSection>

        <TweakSection label="Carousel">
          <TweakSlider
            label="Ring radius"
            value={tweaks.ringRadius}
            min={140} max={360} step={5} unit="px"
            onChange={(v) => setTweak('ringRadius', v)}
          />
          <TweakSlider
            label="Idle speed"
            value={tweaks.idleSpeed}
            min={0} max={30} step={1} unit="°/s"
            onChange={(v) => setTweak('idleSpeed', v)}
          />
        </TweakSection>

        <TweakSection label="Effects">
          <TweakSlider
            label="Sparks"
            value={tweaks.sparkCount}
            min={0} max={48} step={2}
            onChange={(v) => setTweak('sparkCount', v)}
          />
          <TweakSlider
            label="Open crossfade"
            value={tweaks.openCrossfade}
            min={200} max={900} step={25} unit="ms"
            onChange={(v) => setTweak('openCrossfade', v)}
          />
          <TweakSlider
            label="Shake intensity"
            value={tweaks.shakeIntensity}
            min={20} max={60} step={1} unit="°"
            onChange={(v) => setTweak('shakeIntensity', v)}
          />
        </TweakSection>

        <TweakSection label="Map">
          <TweakToggle
            label="Open by default"
            value={tweaks.mapDefaultOpen}
            onChange={(v) => setTweak('mapDefaultOpen', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
