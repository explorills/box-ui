# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is **no build step, no package manager, no tests, no lint**. React, ReactDOM, and Babel are vendored under `vendor/` and `<script type="text/babel">` compiles JSX in the browser. The app is the four files loaded by `index.html`.

To preview, open `index.html` directly or serve the directory statically (e.g. `python3 -m http.server`). Editing any `.jsx`, `.js`, or `.css` file and refreshing reflects changes immediately.

## Architecture

### Top-level wiring (`index.html`)
Loads, in order: vendored React, `config/chests.js`, `config/roles.js`, `audio/audio.js`, `tweaks-panel.jsx`, `carousel.jsx`, `app.jsx`. Globals are the integration surface — there are no modules.

- `window.OneBoxConfig.CHESTS` / `window.OneBoxConfig.ROLES` — backend-replaceable data
- `window.OneBoxAudio` — `play(name)` / `setMuted` / `unlock` (Web Audio synth, lazy-init on first gesture)
- `window.OneBox` — the React component
- `window.useTweaks` + `window.Tweak*` — control-panel primitives

The host that embeds this prototype can override `window.OneBoxConfig` *before* the scripts run to inject real chest/role data without forking the files.

### Phase machine (`carousel.jsx`)
The entire user flow is a single state machine in `OneBox`:

```
idle → spinning → stopped → (eligible)  shaking      → opening → revealed → claiming → closing → idle
                          ↘ (locked)    shaking-locked → locked-rest → (tap stage) → idle
```

Transitions are driven by `setTimeout` chains in the phase-progression `useEffect`. Two RAF loops drive the ring rotation: one for idle drift (with smoothstep ramp-up) and one for the eased spin-to-target. The spin loop has a `setTimeout` backup so the phase still advances if RAF stalls (e.g. tab backgrounded).

Lock-vs-eligible is computed from `winnerIdx > role.maxIdx`. Locked reveals never show the prize text or sparks — they show the frosted lock overlay and a "UNLOCKS AT … TIER" chip, then freeze in `locked-rest` waiting for a tap anywhere on the stage.

### Tweaks panel — dual role
`tweaks-panel.jsx` is **not just a dev panel**. It is also the production state container: `useTweaks(defaults)` returns the `[values, setTweak]` pair that the rest of the app reads from. In production the panel never opens, but the same hook still holds state.

Two protocols matter:

1. **Host messaging** — `TweaksPanel` registers a `message` listener for `__activate_edit_mode` / `__deactivate_edit_mode`, then posts `__edit_mode_available`. The order matters: the listener must exist before the announce or the host's activate can land first and silently no-op. Closing posts `__edit_mode_dismissed`; the host echoes back `__deactivate_edit_mode` which is what actually unmounts the panel.
2. **EDITMODE-BEGIN / EDITMODE-END** — the `TWEAK_DEFAULTS` block in `app.jsx` is wrapped in `/*EDITMODE-BEGIN*/ … /*EDITMODE-END*/`. When the user changes a tweak, `setTweak` posts `__edit_mode_set_keys` and the host **rewrites that JSON block on disk**. Do not move, rename, or split this block, and do not introduce computed values inside it — the host parses it as JSON.

`spinOutcome` and `phaseOverride` are DEV-ONLY tweaks. When `phaseOverride !== 'AUTO'`, the carousel renders a static snapshot of that phase (via `overrideToPhase` and `renderPhase` / `renderWinnerIdx`) and disables the real flow. Backends should never set these.

### Backend integration points
The `carousel.jsx` and `app.jsx` headers mark every backend hook with `BACKEND POINT:` comments. The substantive ones:

- **Spin RNG** — `spin()` picks `chosen` with `Math.random()`. Replace with the server-decided index. The `spinOutcome` tweak forces an outcome for QA.
- **Cooldown** — purely display. The UI does **not** tick down; pass updated `cooldownDays/Hours/Minutes` from the backend.
- **Letter award** — the backend just advances `collectedCount`; the unique-letters slicing is done locally against `role.word`.
- **Connect** — `onConnect` is a stub; wire your auth/wallet flow there.
- **Prize content** — the `.prize-text-mount` shows `chest.prize` text. The animation (claim flies to the user pill) is content-agnostic; swapping in a real prize image element just works.

### Styling
All design tokens live in `styles/tokens.css` and are imported by `app.css`. `--accent` is set per-mount on `<html>` from `tweaks.accent`, and per-chest `--chest-glow` cascades from the `.stage` style prop down to each slot. Per-chest accents come from the chest data, not CSS — `chest.glow` is the source of truth.

The `tokens.css` neutrals (oklch, hue 265, chroma 0.02) are deliberately locked across the wider ONE ecosystem. Per-project accents are listed there but used **minimally** — never as bulk fills. one BOX's accent is `--accent-box: #7c3aed`.

## Things to know before editing

- **Order of `CHESTS` = ring sequence.** `role.maxIdx` is an index into that array, so reordering chests reorders the role unlock ladder.
- **`requires` strings on chests are display copy only** — the actual gate is `winnerIdx > role.maxIdx`. Keep both in sync if you edit either.
- **`role.word` letter slots** show *unique* letters of the word (see `uniqueLetters`). `collectedCount` indexes into the unique list, not the raw word, so duplicate letters reveal together.
- **The Tweaks panel ignores taps inside `.twk-panel`** during `locked-rest` so devs can keep editing tweaks while inspecting the locked state. Don't break that escape hatch.
- **No hot reload, no source maps.** Babel-in-browser means JSX errors surface as cryptic runtime exceptions. When something silently breaks, check the console first.
