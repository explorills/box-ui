/* one BOX — chest catalog
 *
 * BACKEND POINT: replace this array (or assign window.OneBoxConfig.CHESTS
 * before mount) to inject your own chest images, prizes, and tier requirements.
 *
 * Each chest:
 *   id            — slug, must be unique
 *   label         — text shown on the gamified chest label
 *   imgClosed     — closed-state PNG path (transparent bg)
 *   imgOpen       — open-state PNG path (transparent bg)
 *   glow          — accent color (label, glow, prize border)
 *   prize         — text shown inside the chest when opened
 *   requires      — role name shown on the lock overlay
 *   prizeLeftPct  — prize label center, X as % of slot width (slot is square,
 *                   slot width = chest image rendered width). Equals the
 *                   center of the user-supplied open-image x-rectangle.
 *   prizeTopPct   — prize label center, Y as % of slot HEIGHT. Computed from
 *                   the user-supplied open-image y-rectangle, mapped through
 *                   the open chest's aspect ratio AND its position inside the
 *                   slot (open image is anchored to the bottom of the stack
 *                   whose height is set by the closed image, so each chest
 *                   needs its own value).
 *   lockTopPct    — lock badge center, Y as % of slot height. Same x as
 *                   prizeLeftPct. Y is the same image-percent applied to the
 *                   CLOSED chest's bounds — keeps the badge centered on the
 *                   closed chest at the matching vertical fraction.
 *
 * To recompute these values after changing chest art, see the formulas at
 * the bottom of this file.
 *
 * Access logic uses the role's `maxIdx` against the chest index. Order = ring sequence.
 */
window.OneBoxConfig = window.OneBoxConfig || {};
window.OneBoxConfig.CHESTS = [
  { id: 'common',    label: 'COMMON',    imgClosed: 'assets/common.png',    imgOpen: 'assets/common_open.png',    glow: '#22c55e', prize: 'HIDDEN LETTER',          requires: 'EXPLORILLS',
    prizeLeftPct: 46.11, prizeTopPct: 21.00, lockLeftPct: 46.52, lockTopPct: 46.41 },
  { id: 'rare',      label: 'RARE',      imgClosed: 'assets/rare.png',      imgOpen: 'assets/rare_open.png',      glow: '#3b82f6', prize: '1,111 $EXPL',            requires: 'EXPLORILLS',
    prizeLeftPct: 43.76, prizeTopPct: 20.25, lockLeftPct: 44.42, lockTopPct: 47.37 },
  { id: 'epic',      label: 'EPIC',      imgClosed: 'assets/epic.png',      imgOpen: 'assets/epic_open.png',      glow: '#a855f7', prize: 'BLUE MINERAL',           requires: 'RENDRILLS',
    prizeLeftPct: 42.52, prizeTopPct: 20.71, lockLeftPct: 43.31, lockTopPct: 45.00 },
  { id: 'legendary', label: 'LEGENDARY', imgClosed: 'assets/legendary.png', imgOpen: 'assets/legendary_open.png', glow: '#f59e0b', prize: 'EXPLORILLS GENESIS ART', requires: 'PROMDRILLS',
    prizeLeftPct: 44.47, prizeTopPct: 21.10, lockLeftPct: 45.06, lockTopPct: 44.12 },
  { id: 'mythic',    label: 'MYTHIC',    imgClosed: 'assets/mythic.png',    imgOpen: 'assets/mythic_open.png',    glow: '#ef4444', prize: 'EXPLORILLS GRAND PRIZE', requires: 'PROMDRILLS · CHRONICLES',
    prizeLeftPct: 46.13, prizeTopPct: 24.27, lockLeftPct: 46.54, lockTopPct: 46.64 },
];

/* Recomputation cheatsheet — accounts for the fact that prize/lock sit
 * OUTSIDE chest-stack but the chest is transformed when they're shown:
 *   • Prize is shown during 'opening'/'revealed'/'claiming' — chest-stack
 *     is at scale 1.32 and translateY(-6%) of its own height.
 *   • Lock is shown during 'shaking-locked'/'locked-rest' — chest-stack
 *     is at scale 1.18 (no translate).
 *
 * Per-chest geometry (closed and open image natural pixel sizes):
 *   closedRatio = closedH / closedW
 *   openRatio   = openH   / openW
 *   cxPct       = (rectangle horizontal-center px) / openW
 *   cyPct       = (rectangle vertical-center px)   / openH
 *
 * Prize (chest-stack at scale 1.32, translateY -6%):
 *   stackH_v   = 1.32 * closedRatio
 *   stackBot_v = (1 - closedRatio)/2 + closedRatio - 0.06*closedRatio
 *              = (1 + closedRatio)/2 - 0.06*closedRatio
 *   stackTop_v = stackBot_v - stackH_v
 *   openH_v    = 1.32 * openRatio
 *   openTop_v  = stackBot_v - openH_v
 *   prizeTopPct = 100 * (openTop_v + cyPct * openH_v)
 *   prizeLeftPct = 100 * (-0.16 + cxPct * 1.32)
 *
 * Lock (chest-stack at scale 1.18, no translate):
 *   stackH_v   = 1.18 * closedRatio
 *   stackBot_v = (1 + closedRatio)/2
 *   stackTop_v = stackBot_v - stackH_v
 *   lockTopPct  = 100 * (stackTop_v + cyPct * stackH_v)
 *   lockLeftPct = 100 * (-0.09 + cxPct * 1.18)
 */

