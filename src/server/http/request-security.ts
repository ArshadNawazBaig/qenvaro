import "server-only";
import { env } from "@/config/env";

const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

export class RequestPayloadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = "RequestPayloadError";
  }
}

export function hasTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return new Set([
    new URL(request.url).origin,
    new URL(env.NEXT_PUBLIC_APP_URL).origin,
  ]).has(origin);
}

export async function readBoundedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes)
    throw new RequestPayloadError("The request body is too large.", 413);
  if (!request.body)
    throw new RequestPayloadError("A JSON request body is required.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestPayloadError("The request body is too large.", 413);
    }
    chunks.push(value);
  }
  if (totalBytes === 0)
    throw new RequestPayloadError("A JSON request body is required.", 400);

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestPayloadError("The request body must be valid JSON.", 400);
  }
}
