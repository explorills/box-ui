/* one BOX — chest catalog
 *
 * BACKEND POINT: replace this array (or assign window.OneBoxConfig.CHESTS
 * before mount) to inject your own chest images, prizes, and tier requirements.
 *
 * Each chest:
 *   id         — slug, must be unique
 *   label      — text shown on the always-visible gamified label below the chest
 *   imgClosed  — closed-state PNG path (transparent bg)
 *   imgOpen    — open-state PNG path (transparent bg — bake out the bg first if needed)
 *   glow       — accent color used for the chest's chrome (label, glow, prize border)
 *   prize      — text shown inside the chest when opened (replaces a real prize image)
 *   requires   — role name shown on the lock overlay if the user can't open this chest
 *
 * The `requires` value is purely for the lock overlay copy; access logic is driven
 * by the role's `maxIdx` against the index in this array. Order = ring sequence.
 */
window.OneBoxConfig = window.OneBoxConfig || {};
window.OneBoxConfig.CHESTS = [
  { id: 'common',    label: 'COMMON',    imgClosed: 'assets/common.png',    imgOpen: 'assets/common_open.png',    glow: '#22c55e', prize: 'HIDDEN LETTER',          requires: 'EXPLORILLS' },
  { id: 'rare',      label: 'RARE',      imgClosed: 'assets/rare.png',      imgOpen: 'assets/rare_open.png',      glow: '#3b82f6', prize: '1,111 $EXPL',            requires: 'EXPLORILLS' },
  { id: 'epic',      label: 'EPIC',      imgClosed: 'assets/epic.png',      imgOpen: 'assets/epic_open.png',      glow: '#a855f7', prize: 'BLUE MINERAL',           requires: 'RENDRILLS'  },
  { id: 'legendary', label: 'LEGENDARY', imgClosed: 'assets/legendary.png', imgOpen: 'assets/legendary_open.png', glow: '#f59e0b', prize: 'EXPLORILLS GENESIS ART', requires: 'PROMDRILLS' },
  { id: 'mythic',    label: 'MYTHIC',    imgClosed: 'assets/mythic.png',    imgOpen: 'assets/mythic_open.png',    glow: '#ef4444', prize: 'EXPLORILLS GRAND PRIZE', requires: 'PROMDRILLS · CHRONICLES' },
];
