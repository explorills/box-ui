# one BOX

Interactive 3D mystery-box reveal flow for the EXPL ONE ecosystem.

Bun + Vite + React 19, consuming `@explorills/one-ecosystem-ui` for shared chrome (navbar, wallet flows, modals) — same consumer wiring pattern other ONE-ecosystem projects use (`one-id`, `one-chat`).

## What it does

- Five-chest 3D carousel: common · rare · epic · legendary · mythic.
- Spin → eligible reveal → chest opens → prize merges into the user badge.
- Spin → locked reveal → glassy "UNLOCKS AT [TIER]" overlay on the chest.
- Letter-collection progression toward the next role tier.
- Live cooldown countdown with seconds.
- Speed bar showing real angular velocity vs theoretical max.

## Running locally

```bash
# PACKAGES_TOKEN must be set so bun can pull @explorills/* from GitHub Packages.
# (set at the explorills org level for CI; for local dev, export it in your shell)
export PACKAGES_TOKEN=ghp_…

bun install
bun run dev          # http://localhost:5173
```

Build for production:

```bash
bun run build        # → dist/
bun run preview      # serve dist/ locally
```

## Architecture

`src/main.tsx` mounts `<App>`. `App.tsx` wires the standard ONE-ecosystem consumer shell:

```tsx
<OneIdProvider projectId={REOWN_PROJECT_ID} platformColor={THEME_COLOR}>
  <EcosystemNavbar logo={logo} projectName="box" themeColor="#7c3aed" currentDomain="box.expl.one" />
  <main><OneBox tweaks={tweaks} /></main>
</OneIdProvider>
```

The carousel itself (`OneBox.tsx`) is the unchanged prototype: phase machine, 3D ring, RAF-driven claim animation. State is owned by `useTweaks` in `Tweaks.tsx`, which doubles as the production state container — the dev panel is just a UI on top of the same hook.

`Tweaks.tsx` has a `PROD_HOSTS` allowlist (`box.expl.one`, `www.box.expl.one`) — on production, the panel renders nothing. Localhost and staging show the full panel for QA scenario injection.

## Backend integration points

| Surface | What to replace |
|---|---|
| `makeLocalSpinPlan` in `OneBox.tsx` | Return `{ accelMs, cruiseMs, decelMs, peakDegPerSec, chosenIdx }` from your server |
| `tweaks.cooldown{Days,Hours,Minutes,Seconds}` | Inject a remaining-time snapshot; UI ticks live from there |
| `tweaks.collectedCount` | Number of UNIQUE letters discovered; UI computes `slots-filled / total-letters` |
| `CHESTS` / `ROLES` in `src/config/` | Replace with backend data at app boot |

The frontend never invents authoritative values. Speed integration, cooldown ticks, and letter math all run from server-supplied snapshots.

## File map

```
index.html               — Vite entry + SEO meta
src/
  main.tsx               — ReactDOM root
  App.tsx                — OneIdProvider + EcosystemNavbar shell + brand constants
  OneBox.tsx             — phase machine, 3D ring, RAF claim
  Tweaks.tsx             — Tweaks panel + useTweaks hook
  audio.ts               — synthesized Web Audio cues
  main.css               — carousel + claim styles
  assets/logo.png        — project logo for the navbar
  config/chests.ts       — chest catalog + per-chest prize/lock coords
  config/roles.ts        — role hierarchy + per-tier accents
  styles/tokens.css      — neutral palette + per-project accents
  vite-env.d.ts          — Vite client types
public/
  assets/                — chest PNGs (closed + open)
  fonts/                 — Space Grotesk variable
  favicon.png, og-image.png, robots.txt, site.webmanifest, sitemap.xml
.github/workflows/       — deploy-staging.yml (bun build → S3 → CloudFront)
package.json, vite.config.ts, tsconfig.json, .npmrc, bunfig.toml
```

`CLAUDE.md` documents the load-bearing architectural details (phase machine, Tweaks triple protocol, per-chest geometry math, prize-fly perspective compensation, audio synthesis, "don't break this" list).

## Deploy

`.github/workflows/deploy-staging.yml` mirrors the workflow used by other ONE-ecosystem consumers: `bun install` → `bun update --latest @explorills/one-ecosystem-ui` → `bun run build` → `aws s3 sync ./dist/ s3://staging-box-expl-one/` → CloudFront invalidation.

Repo secrets required:

- `PACKAGES_TOKEN` — for installing `@explorills/*` from GitHub Packages
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## License

Internal — part of the EXPL ONE ecosystem.
