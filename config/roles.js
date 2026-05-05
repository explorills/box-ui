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
 */
window.OneBoxConfig = window.OneBoxConfig || {};
window.OneBoxConfig.ROLES = [
  { id: 'GUEST',                 label: 'GUEST',                   maxIdx: -1, word: null },
  { id: 'EXPLORILLS',            label: 'EXPLORILLS',              maxIdx:  1, word: 'RENDRILLS' },
  { id: 'RENDRILLS',             label: 'RENDRILLS',               maxIdx:  2, word: 'PROMDRILLS' },
  { id: 'PROMDRILLS',            label: 'PROMDRILLS',              maxIdx:  3, word: 'CHRONICLES' },
  { id: 'PROMDRILLS_CHRONICLES', label: 'PROMDRILLS · CHRONICLES', maxIdx:  4, word: null },
];
