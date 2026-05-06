# one BOX

Interactive 3D mystery-box reveal flow for the EXPL ONE ecosystem.

A pure-frontend prototype: vendored React + Babel, no build step, no package manager. Open `index.html` (or serve the directory) and it runs.

## What it does

- Five-chest 3D carousel: common · rare · epic · legendary · mythic.
- Spin → eligible reveal → chest opens → prize merges into the user badge.
- Spin → locked reveal → glassy "UNLOCKS AT [TIER]" overlay on the chest.
- Letter-collection progression toward the next role tier.
- Live cooldown countdown with seconds.
- Speed bar showing real angular velocity vs theoretical max.

## Running locally

```bash
python3 -m http.server 8765 --directory .
```

Open http://localhost:8765/ — that's the entire setup. No `npm install`, no bundler.

The dev panel (Tweaks) auto-opens in standalone mode; close it with the ✕ and a small **DEV** button bottom-right reopens it. Inside the panel: presets, scenario injectors (open any box, lock any box, bump role, force cooldowns), spin/visual tuning, and audio toggle.

## Architecture in one paragraph

`index.html` loads vendored React + Babel + sources in order. The UI lives in `carousel.jsx` (phase machine, 3D ring, claim animation). State is owned by `useTweaks` in `tweaks-panel.jsx`, which doubles as the production state container — the dev panel is just a UI on top of the same hook. Backend integration happens through `window.OneBoxConfig` (chest catalog and role hierarchy) and a single `SpinPlan` shape returned by what is currently a local PRNG: replace one function and the whole spin becomes server-authoritative.

## Backend integration

The substantive hooks (all marked `BACKEND POINT:` in source):

| Surface | What to replace |
|---|---|
| `makeLocalSpinPlan(chestCount, forcedIdx)` in `carousel.jsx` | Return `{ accelMs, cruiseMs, decelMs, peakDegPerSec, chosenIdx }` from your server |
| `tweaks.cooldown{Days,Hours,Minutes,Seconds}` | Inject a remaining-time snapshot; UI ticks live from there |
| `tweaks.collectedCount` | Number of UNIQUE letters discovered; UI computes `slots-filled / total-letters` |
| `onConnect` | Wire to your auth/wallet flow |
| `window.OneBoxConfig.CHESTS` / `.ROLES` | Override before mount to inject your own chest art and role ladder |

The frontend never invents authoritative values. Speed integration, cooldown ticks, and letter math all run from server-supplied snapshots.

## File map

```
index.html             — entry
app.jsx                — mount + tweak defaults + dev panel UI
carousel.jsx           — phase machine, 3D ring, prize/lock, claim RAF
tweaks-panel.jsx       — Tweaks UI + protocol with embedding host
config/chests.js       — chest catalog + per-chest prize/lock coords
config/roles.js        — role hierarchy with per-tier accents
audio/audio.js         — Web Audio synthesized cues
styles/tokens.css      — neutral palette + per-project accents
app.css                — all carousel/claim/transition styles
assets/                — chest PNGs (closed + open)
fonts/                 — Space Grotesk variable
vendor/                — React, ReactDOM, Babel (vendored, no CDN)
```

`CLAUDE.md` documents the load-bearing architectural details (phase machine, Tweaks panel triple protocol, per-chest geometry math, prize-fly perspective compensation, audio synthesis, "don't break this" list).

## Deploy

`.github/workflows/deploy-staging.yml` syncs `main` to AWS S3 (`staging-box-expl-one`) and invalidates CloudFront. Because there's no build step, the workflow uploads the repo root directly (excluding `.git`, `.github`, `.gitignore`, `CLAUDE.md`, `README.md`).

Repository secrets required:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

If this prototype is ever wrapped in a bundler (Bun/Vite/etc.), restore the `bun install` + `bun run build` + `./dist/` pipeline from [one-box's deploy-staging.yml](https://github.com/explorills/one-box/blob/main/.github/workflows/deploy-staging.yml).

## License

Internal prototype — part of the EXPL ONE ecosystem.
