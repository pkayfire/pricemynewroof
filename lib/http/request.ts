// Small request helpers shared by the API routes. Edge- and Node-safe (no Node imports).

export const noStore = { "cache-control": "no-store" } as const;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...headers } });

/** Parses a Cookie header into a map. Malformed pairs are skipped. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const rawPart of header.split(";")) {
    const part = rawPart.trim();
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

/**
 * The client IP. On Vercel the platform sets x-forwarded-for (first entry is the client) and
 * x-real-ip; elsewhere these headers can be spoofed, so treat the value as best effort.
 */
export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip = first || request.headers.get("x-real-ip")?.trim() || null;
  return ip && ip.length <= 64 ? ip : null;
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; status: 400 | 413; message: string };

/** Reads a JSON body, refusing anything over maxBytes (by Content-Length and by actual size). */
export async function readJson(request: Request, maxBytes: number): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, status: 413, message: `Body must be at most ${maxBytes} bytes.` };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, message: "Body could not be read." };
  }
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, status: 413, message: `Body must be at most ${maxBytes} bytes.` };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, message: "Body must be JSON." };
  }
}

/** A zod error as the API's invalid_request body. */
export function invalidRequest(issues: { path: PropertyKey[]; message: string }[]) {
  const first = issues[0];
  const field = first?.path.map(String).join(".") || undefined;
  return { error: "invalid_request" as const, message: `${field ?? "body"}: ${first?.message ?? "invalid"}`, ...(field ? { field } : {}) };
}
