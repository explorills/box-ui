// Thin typed client for the one-box backend (the project-specific
// service at api-box.expl.one / localhost:3090).
//
// Why a dedicated client module instead of inline `fetch()` in
// components: as features land we'll be hitting one-box from many
// places (spin endpoint, prize claim, cooldown poll, admin views).
// Centralizing the URL composition, auth header, and error parsing
// here means features add one method to this file instead of
// reinventing the wrapper each time.
//
// Auth model: every user-bound request takes a Bearer token from ONE
// ID (sourced via the package's `useOneId().token`). The package
// owns auth; this module just forwards the token. Internal-service
// calls (one-id → one-box, etc.) happen on the SERVER side, never
// from the browser, so this client doesn't carry an internal-token
// path.
//
// Error shape: one-box returns the ecosystem-standard envelope
// `{ error: { code, message, details? } }` on non-2xx. Callers should
// handle ApiError by .code (machine-readable) — never by .message.

import { env } from "@/config/env";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  env: string;
  uptime: number;
}

export interface OneIdUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface MeResponse {
  user: OneIdUser;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.oneBoxApiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.ok) {
    return (await res.json()) as T;
  }

  // Try to parse the structured error envelope; fall back to a
  // synthetic INTERNAL if the body is empty or non-JSON.
  let code = "INTERNAL";
  let message = res.statusText || `HTTP ${res.status}`;
  let details: Record<string, unknown> | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    // body wasn't JSON; keep defaults
  }
  throw new ApiError(res.status, code, message, details);
}

function withAuth(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export const oneBoxApi = {
  /** GET /health — liveness probe; no auth. */
  getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>("/health");
  },

  /** GET /me — proves the user's session via ONE ID. Requires Bearer token. */
  getMe(token: string): Promise<MeResponse> {
    return request<MeResponse>("/me", withAuth(token));
  },
};
