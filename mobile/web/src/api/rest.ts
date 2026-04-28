import { effectiveBaseUrl, loadAuth } from "../auth/token";

export class RestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const auth = loadAuth();
  const base = effectiveBaseUrl(auth);
  const headers = new Headers(init.headers);
  if (init.auth !== false && auth?.token) {
    headers.set("Authorization", `Bearer ${auth.token}`);
  }
  if (init.body && !headers.has("content-type") && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? String((body as { error: string }).error)
        : `${res.status} ${res.statusText}`);
    throw new RestError(res.status, msg);
  }
  return body as T;
}

export const rest = {
  health: () => request<{ ok: boolean; childAlive: boolean; version: string }>("/api/health", { auth: false }),

  pairExchange: (pairCode: string, deviceName: string) =>
    request<{ token: string; deviceId: string; fingerprint: string; baseUrl: string }>(
      "/api/pair/exchange",
      {
        method: "POST",
        body: JSON.stringify({ pairCode, deviceName }),
        auth: false,
      },
    ),

  upload: async (file: File): Promise<{ path: string; mime: string; size: number }> => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ path: string; mime: string; size: number }>("/api/upload", {
      method: "POST",
      body: fd,
    });
  },
};
