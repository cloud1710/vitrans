// HTTP layer of the translation API (spec Amendment F): JSON answers that are never cached, request bodies that must
// be JSON text (application/json, strict UTF-8, size-capped before parsing: images, binary and forms are refused),
// same-origin POSTs only (no CORS headers; a server-side caller such as the helper sends no Origin), method checks.
// Privacy: nothing here logs a body or an error message that could quote one.

/** An API error: becomes the JSON answer {code, message} with this status. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function fail(status, code, message, headers = {}) {
  return json(status, { code, message }, headers);
}

const JSON_TYPE = /^application\/json\s*(;|$)/i;

/** The request body as a JSON object. 415 unless the Content-Type is application/json; 413 over maxBytes (by
 * Content-Length before reading, and by the bytes actually read); 400 for bytes that are not UTF-8 text, malformed
 * JSON or a value that is not an object. Error messages never quote the body. */
export async function readJsonBody(request, maxBytes) {
  if (!JSON_TYPE.test(request.headers.get("Content-Type") || "")) {
    throw new ApiError(415, "unsupported_media_type", "The body must be JSON text (Content-Type: application/json).");
  }
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "too_large", "The body is larger than " + maxBytes + " bytes.");
  }
  const bytes = await readCapped(request, maxBytes);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (err) {
    throw new ApiError(400, "bad_request", "The body is not UTF-8 text.");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new ApiError(400, "bad_request", "The body is not valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "bad_request", "The body must be a JSON object.");
  }
  return value;
}

async function readCapped(request, maxBytes) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ApiError(413, "too_large", "The body is larger than " + maxBytes + " bytes.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** 403 bad_origin when a browser sends this request from another origin (scheme + host + port must match). */
export function checkOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin === null) return;
  if (origin !== new URL(request.url).origin) {
    throw new ApiError(403, "bad_origin", "Requests are accepted from this site only.");
  }
}

/** Run one API handler: method check (405 + Allow), origin check for POSTs, ApiError -> its JSON answer, anything
 * else -> 500 server_error (logged by error name only: messages may quote request content). */
export async function handle(ctx, methods, fn) {
  const method = ctx.request.method.toUpperCase();
  if (!methods.includes(method)) {
    return fail(405, "method_not_allowed", "Use " + methods.join(" or ") + ".", { Allow: methods.join(", ") });
  }
  try {
    if (method === "POST") checkOrigin(ctx.request);
    return await fn(ctx);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.status, err.code, err.message);
    console.error("server_error", (err && err.name) || "Error");
    return fail(500, "server_error", "The server could not handle the request.");
  }
}
