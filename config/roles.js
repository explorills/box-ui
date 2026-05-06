/* one BOX — role tiers
 *
 * BACKEND POINT: replace this array (or assign window.OneBoxConfig.ROLES
 * before mount) to define your own role hierarchy, unlock-words, and labels.
 *
 * Each role:
 *   id     — internal id (uppercased; used by the Tweaks panel role selector)
 *   label  — display string in the user pill
 *   maxIdx — the highest CHESTS index this role can OPEN. Anything above
 *            triggers the locked-shake path with a frosted lock + "REQUIRES"
 *            overlay. Use -1 for guest (no chests openable).
 *   word   — the unlock word whose unique letters fill the tier-progress bar
 *            and appear as monospace slots above the carousel. Use null for
 *            guest and the top-tier role (no progression beyond).
 *   accent — per-tier display color used for the user pill, tier progress
 *            bar, letter slots, and the prize-merge feedback bubble. Replaces
 *            the global --accent inside the stage when this role is active.
 *   shiny  — top-tier visual flag: the accent gets a shimmer/glow treatment.
 */
window.OneBoxConfig = window.OneBoxConfig || {};
window.OneBoxConfig.ROLES = [
  { id: 'GUEST',                 label: 'GUEST',                   maxIdx: -1, word: null,         accent: '#7c3aed' },
  { id: 'EXPLORILLS',            label: 'EXPLORILLS',              maxIdx:  1, word: 'RENDRILLS',  accent: '#9e6bff' },
  { id: 'RENDRILLS',             label: 'RENDRILLS',               maxIdx:  2, word: 'PROMDRILLS', accent: '#d4843d' },
  { id: 'PROMDRILLS',            label: 'PROMDRILLS',              maxIdx:  3, word: 'CHRONICLES', accent: '#aa3b3b' },
  { id: 'PROMDRILLS_CHRONICLES', label: 'PROMDRILLS · CHRONICLES', maxIdx:  4, word: null,         accent: '#aa3b3b', shiny: true },
];
