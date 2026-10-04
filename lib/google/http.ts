// Shared bits for the server-side Google clients. Keys are sent in a header, never in the URL,
// so they can't leak into logs.
export type FetchLike = typeof fetch;

export interface GoogleClientOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 8000;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly googleStatus: string | null,
  ) {
    super(message);
  }
}

/** Reads Google's error envelope ({ error: { code, message, status } }) without throwing. */
export async function readGoogleError(res: Response): Promise<{ status: string | null; message: string }> {
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string } };
    return { status: body.error?.status ?? null, message: body.error?.message ?? res.statusText };
  } catch {
    return { status: null, message: res.statusText };
  }
}

export function requireServerKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.GOOGLE_SERVER_API_KEY;
  if (!key) throw new GoogleApiError("GOOGLE_SERVER_API_KEY is not set", null, null);
  return key;
}
