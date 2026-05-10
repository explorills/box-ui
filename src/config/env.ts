// Centralized env reader. All `import.meta.env.VITE_*` access goes
// through this file so we have one typed source of truth and no
// scattered `import.meta.env` references to grep for later.
//
// Box-ui only talks to:
//   - one-box backend (project-specific data)  → ONE_BOX_API_URL
//   - one-id, one-loot, one-notification, one-chat  → resolved internally
//     by @explorills/one-ecosystem-ui via window.location.hostname
//
// So the only URL we need to expose to consumers is one-box.

const ONE_BOX_API_URL =
  import.meta.env.VITE_ONE_BOX_API_URL ?? "http://localhost:3090";

export const env = {
  oneBoxApiUrl: ONE_BOX_API_URL,
} as const;
