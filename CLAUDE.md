# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

This is now a **Bun + Vite + React 19** project, mirroring the wiring pattern other ONE-ecosystem consumers use (`one-id`, `one-chat`, the archived `one-box`). There IS a build step.

```bash
bun install         # PACKAGES_TOKEN env var required for @explorills scope
bun run dev         # local dev server with HMR
bun run build       # → dist/ for production
bun run preview     # serve the production build locally
bun run type-check  # tsc --noEmit
```

The package `@explorills/one-ecosystem-ui` is hosted on GitHub Packages. `.npmrc` and `bunfig.toml` route the `@explorills` scope to `https://npm.pkg.github.com` and authenticate via the `PACKAGES_TOKEN` env var. The token is set at the explorills GitHub org level; for local installs, export it from your shell.

## Top-level wiring

`index.html` is a normal Vite entry: it loads `/src/main.tsx`, which renders `<App />`. Everything is ES modules — no `window.*` globals.

```
src/
├── main.tsx          — ReactDOM root; imports './main.css'
├── App.tsx           — wraps content in OneIdProvider + EcosystemNavbar; mounts <OneBox> + <TweaksPanel>
├── OneBox.tsx        — phase machine, 3D ring, prize/lock UI, RAF claim animation
├── Tweaks.tsx        — Tweaks panel + production state container (useTweaks)
├── audio.ts          — synthesized Web Audio cues
├── config/chests.ts  — chest catalog with per-chest prize/lock geometry
├── config/roles.ts   — role hierarchy with per-tier accents
├── styles/tokens.css — neutral palette + per-project accents
├── main.css          — all carousel/claim/transition styles
├── assets/logo.png   — the consumer's project logo passed to EcosystemNavbar
└── vite-env.d.ts     — Vite client + asset module declarations
```

`public/` holds untransformed static assets served at the URL root: chest PNGs at `/assets/`, font at `/fonts/`, plus `favicon.png`, `og-image.png`, `robots.txt`, `site.webmanifest`, `sitemap.xml`.

## ONE-ecosystem consumer wiring

`App.tsx` follows the standard ONE-ecosystem consumer shell:

```tsx
<OneIdProvider projectId={REOWN_PROJECT_ID} platformColor="#7c3aed">
  <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>
    <EcosystemNavbar logo={logo} projectName="box" themeColor="#7c3aed" currentDomain="box.expl.one" />
    <main style={{ flex:1, position:'relative', overflow:'hidden' }}>
      <OneBox tweaks={tweaks} />
    </main>
  </div>
  <TweaksPanel>…</TweaksPanel>
</OneIdProvider>
```

The brand constants (`PROJECT_NAME`, `THEME_COLOR`, `CURRENT_DOMAIN`, `REOWN_PROJECT_ID`) live at the top of `App.tsx` and match the values from the archived one-box repo. The carousel sits in a `flex: 1` `<main>` below the navbar — `.stage` was changed from `position: fixed` to `position: absolute` so it fills its parent instead of the viewport.

**Important:** the consumer wiring is intentionally minimal. Wallet flows, profile pages, ecosystem navigation — all of that comes "for free" from `@explorills/one-ecosystem-ui`. Don't reimplement them inside box-ui.

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
