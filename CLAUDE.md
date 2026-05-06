# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is **no build step, no package manager, no tests, no lint**. React, ReactDOM, and Babel are vendored under `vendor/` and `<script type="text/babel">` compiles JSX in the browser.

To preview, serve the directory statically (e.g. `python3 -m http.server 8765 --directory .`) and open the served URL — opening `index.html` from the file:// scheme works for most things but breaks audio (Web Audio context can be hostile under file://).

After any edit, hard-reload the browser. There is no source map; JSX errors surface as cryptic runtime exceptions, so check the console first when something silently breaks.

## Top-level wiring

`index.html` loads, in order: vendored React, `config/chests.js`, `config/roles.js`, `audio/audio.js`, `tweaks-panel.jsx`, `carousel.jsx`, `app.jsx`. There are no modules — everything communicates through a small set of `window.*` globals that double as the backend integration surface:

- `window.OneBoxConfig.CHESTS` / `window.OneBoxConfig.ROLES` — overridable data, set in `config/`.
- `window.OneBoxAudio` — synthesized SFX, exposes `play(name)` / `setMuted` / `unlock`.
- `window.OneBox` — the React component (mounted by `app.jsx`).
- `window.useTweaks`, `window.Tweak*` — control-panel primitives.

A host that embeds this prototype can override any of these (especially `OneBoxConfig`) *before* the scripts run.

## Phase machine (`carousel.jsx`)

The entire user flow is one state machine inside `OneBox`:

```
idle → spinning → stopped → (eligible)  shaking        → opening → revealed → claiming → idle
                          ↘ (locked)    shaking-locked → locked-rest → (tap stage) → idle
```

Notes that catch new sessions out:
- There is **no separate `closing` phase**. The chest's lid-close, winner-recede (scale 1.32 → 1.0), and non-winner fade-back-in all run as CSS animations bound to `.ring.is-claiming`, in parallel with the JS-driven prize fly. After `CLAIM_MS`, the phase goes straight to `idle`.
- Locked reveals never run `winner-rise`; instead the chest scales to 1.18 and runs `chest-lock-vibrate` (translate + small rotation, ~50ms cycle, ~7 cycles over 375ms).
- `phaseOverride !== 'AUTO'` is **DEV ONLY** — it freezes the carousel into a snapshot of any phase regardless of real state. Backends must never set it.

## Backend integration contracts

All "backend hooks" are commented `BACKEND POINT:` in source. The substantive ones:

### SpinPlan (`makeLocalSpinPlan`)
The ONE handoff between frontend and backend for the spin. Shape:
```
{ accelMs, cruiseMs, decelMs, peakDegPerSec, chosenIdx }
```
The frontend integrates `spinVelocityAt(t, plan) * peakDegPerSec` deterministically; **it never invents speed values that would be authoritative**. Replace `makeLocalSpinPlan` with a `fetch()` and that's the entire spin contract. `MAX_SPEED_DEG_PER_SEC = 2100` is the visualization ceiling — per-spin peaks live well below this so the bar doesn't fill, leaving headroom for future "boost" mechanics.

### Cooldown countdown
Backend supplies a SNAPSHOT (`cooldownDays`/`Hours`/`Minutes`/`Seconds`); the UI captures `Date.now()` at activation and ticks live every second from there. When the backend re-injects values, the `useEffect` restarts cleanly. The UI never falls below 0; the backend re-syncs separately.

### Prize / letter award
The backend just advances `tweaks.collectedCount` (number of UNIQUE letters discovered). The UI computes `slotsFilled = total occurrences of collected letters in the word` and displays `slotsFilled / word.length` — find R in RENDRILLS → 2/9.

### Connect, Claim
`onConnect` is a stub for the auth/wallet flow. `onClaim` is local UI; the backend does not need to call it.

## Tweaks panel — dual role (`tweaks-panel.jsx`)

The panel is **not just a dev tool**; `useTweaks(defaults)` is the production state container the entire UI reads from. In production the panel never opens (nothing visible) but the same hook still holds state.

Three protocols are load-bearing here:

1. **Host postMessage**: `TweaksPanel` registers a `message` listener for `__activate_edit_mode` / `__deactivate_edit_mode`, then posts `__edit_mode_available`. **The listener must exist before the announce**, or the host's activate can land first and the toolbar toggle silently no-ops. Closing posts `__edit_mode_dismissed`; the host echoes back `__deactivate_edit_mode`, which is what actually unmounts the panel.

2. **EDITMODE-BEGIN / EDITMODE-END**: the `TWEAK_DEFAULTS` block in `app.jsx` is wrapped in `/*EDITMODE-BEGIN*/ … /*EDITMODE-END*/`. When a tweak changes, `setTweak` posts `__edit_mode_set_keys` and the host **rewrites that JSON block on disk**. Do not move, rename, split, or introduce computed values inside it — the host parses it as JSON.

3. **Standalone auto-open + DEV FAB**: when `window.parent === window` (no embedding host), the panel auto-opens. After the user dismisses it, a small `DEV` floating button appears in the bottom-right to reopen. Embedded hosts have their own toolbar and don't get the FAB.

`spinOutcome` and `phaseOverride` are DEV-ONLY tweaks. The panel exposes generous **Inject** sections for QA: open any box, lock any box, bump role, force cooldowns.

## Per-chest geometry — `config/chests.js`

The chest catalog stores not just art and prize text but **four pre-computed slot-relative percentages per chest**: `prizeLeftPct`, `prizeTopPct`, `lockLeftPct`, `lockTopPct`. These position the prize label and lock badge on the right pixel of each chest's PNG, accounting for two things that vary per-chest:

1. **Aspect ratios differ.** Each chest's open and closed PNG has its own width/height (mythic open is 580×450, common open is 475×455, etc.), so the chest images render at different heights inside the square slot. Naive percentage positioning drifts off the chest as art changes.

2. **The chest is scaled when the labels are visible.** Prize is shown during `opening`/`revealed`/`claiming`, when `chest-stack` is at `scale(1.32) translateY(-6%)` (the `winner-rise` end-state). Lock is shown during `shaking-locked`/`locked-rest`, when `chest-stack` is at `scale(1.18)`. The labels live OUTSIDE chest-stack as siblings, so they don't inherit the scale — the percentages compensate by accounting for the chest's scaled visual bounds.

The recomputation cheat-sheet lives at the bottom of `config/chests.js`. If chest art is swapped, recompute these four percentages from the rectangle the designer marks on the OPEN image.

**A coordinate-naming gotcha**: the rectangles the designer originally provided used `y=A;B` for the rectangle's HORIZONTAL edges and `x=A;B` for the VERTICAL edges (inverted from standard math convention). Confirmed by the rectangle proportions matching real chest cavities. Use this mapping when reading their coords.

## Prize fly (claim animation)

The prize-merge animation is **JS-driven RAF, not a CSS keyframe**, because three things have to happen in the SAME frame: prize disappears, pill bumps, merge sfx plays. CSS animation timing + setTimeouts couldn't guarantee that.

The RAF tick (in `onClaim`):

1. **Captures rects at click time**: prize and pill bounding rects → screen-coord delta `(dxScreen, dyScreen)`.
2. **Compensates for perspective scale.** Prize lives inside `.slot`, which sits beneath `.arena { perspective: 1100px }`. CSS `translate(N px)` on the prize is in slot-LOCAL coords; the screen displacement is `N × perspective_scale`, which is `1100/(1100 - ringZ) ≈ 1.36–1.49` for typical ringZ. We measure it live by reading the slot's `getBoundingClientRect().width / offsetWidth`, then divide `dx`/`dy` by that ratio so the prize moves exactly N screen pixels.
3. **Per-frame screen-coord collision check**. Every tick we read `node.getBoundingClientRect()` and compare its center-Y to the pill's bottom Y. The instant the prize center crosses the line, `fireMerge()` runs: opacity → 0, `setPillPulse(n+1)` (triggers the bubble bump), `sfx('merge')`, `cancelAnimationFrame`. All same frame.
4. **Safety net** at `t >= 1` calls `fireMerge()` again — the `merged` guard makes it a no-op if the collision check already fired.

The `.ring.is-claiming .slot.is-winner .prize-text-mount { animation: none; opacity: 1 }` rule is **required**. CSS animations rank above inline styles in the cascade, so the rise animation has to be removed for inline transform to win — and removing the animation drops opacity back to its base `0`, which is why `opacity: 1` is restored explicitly.

The prize merges into the pill, then the pill plays its bubble bump (gradient flash + scale 1.18 → 0.96 → 1). No `close` sfx fires anymore — it landed ~140ms after `merge` and smeared into a perceived double sound.

## Audio (`audio/audio.js`)

Pure Web Audio. Lazy-init on first user gesture (iOS unlock). Each cue is a layered patch — multiple oscillators, optional FM-modulated bell, filtered noise, sub thump — routed through `master gain → soft-knee compressor → destination` so layers stay glued.

Cues used by `carousel.jsx`:
- `spinPress` — claim-button-press click + airhorn sweep
- `tick` — per-30°-rotation blip during spin
- `settle` — descent chime when a tap dismisses locked-rest (NOT spin-end; spin-end is intentionally silent)
- `lock` — locked-chest reveal, heavy clunk + sub bass + metallic ring
- `win` — chest opens, sub thump + ascending C-major-7 arpeggio + sparkle wash
- `claim` — claim button press, ascending sparkle chime
- `merge` — prize lands inside pill, descending pop
- `close` — defined but not currently fired (removed from claim-tail to avoid double sound; left available for future use)

## Layout & 3D notes

- `.arena` provides the 3D perspective (`perspective: 1100px`); `.ring` rotates around Y; each `.slot` sits at `translateZ(--ring-z-applied)` where `--ring-z-applied = min(var(--ring-z), 30vw)` to keep all five chests on-screen on small viewports.
- `.ring` has a `translateY(min(--ring-z, 30vw) × -0.054)` lift derived from `sin(10°)·cos(72°)` so the SIDE chests (the ones cycling at ±72° from front) sit at arena vertical center, not the front chest.
- Prize and lock are **siblings of `.chest-stack`** inside `.chest-billboard` — NOT children of chest-stack. This is intentional so they don't inherit chest-stack's `scale()` animations. The slot-percent positions in `config/chests.js` already account for chest-stack's scaled bounds.
- `--shake-intensity` carries `deg` units (set as `${tweaks.shakeIntensity}deg`). Lock-vibrate keyframes use it as `calc(var(--shake-intensity) / -5)` so default 10° → ±2° wobble. Don't try to multiply this var into `px` — units don't compose in `calc`.

## Don't-break-this list

- **`CHESTS` array order = ring sequence AND role-unlock ladder** (`role.maxIdx` indexes into it). Reordering chests reorders the unlock progression.
- **`requires` strings on chests are display-only**; the gate is `winnerIdx > role.maxIdx`. Keep both in sync if you edit either.
- **Scale-aware prize/lock percentages**: if you ever change the `winner-rise` (1.32) or shaking-locked (1.18) scale factors, the percentages in `config/chests.js` need to be recomputed — the math at the bottom of that file shows how.
- **Inline `style.transform` during claim**: must keep `translate(calc(-50% + x), calc(-50% + y))` with `-50%` on BOTH axes. Dropping either reverts to non-centered positioning and the prize jumps off-screen on frame 0.
- **`MAX_SPEED_DEG_PER_SEC = 2100`** is referenced in code only inside `carousel.jsx`. Bump it cautiously — the speed bar normalizes against it.
- **Tap-anywhere-to-resume from `locked-rest`** has an explicit `.twk-panel`-ignore so devs can edit tweaks while inspecting locked state. Don't break that escape hatch.
- **No hot reload**, no source maps. When something silently breaks, the browser console is your only signal. Most failures are JSX parse errors that show as garbled error text from Babel-in-browser.
