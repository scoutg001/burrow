// Typed fetch wrapper, after arm-web's api.ts: same-origin requests to the
// burrow daemon that serves this page.

import type { GraphModel } from "./types.js";

async function req<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) {
    let detail = r.statusText;
    try {
      const body = (await r.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(`${path}: ${r.status} ${detail}`);
  }
  return (await r.json()) as T;
}

export function fetchGraph(): Promise<GraphModel> {
  return req<GraphModel>("/graph");
}
