// Token + base URL persistence in localStorage.
// The PWA gets these from /api/pair/exchange and uses them on every request.

const KEY = "codex-mobile.auth.v1";

export interface AuthState {
  token: string;
  baseUrl: string;
  fingerprint: string;
  deviceId: string;
}

export function loadAuth(): AuthState | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as AuthState;
  } catch {
    return undefined;
  }
}

export function saveAuth(state: AuthState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearAuth(): void {
  localStorage.removeItem(KEY);
}

// Default base URL: same origin as the page (works when the bridge serves the
// PWA itself). Stored value wins so `/pair` can override it in case of relay.
export function effectiveBaseUrl(state: AuthState | undefined): string {
  if (state?.baseUrl) return state.baseUrl;
  return location.origin;
}
