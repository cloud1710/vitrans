// POST /api/v1/session {turnstile} -> {session, expires_s, quota} (functions/_lib/api.js)
import { sessionApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => sessionApi(ctx, deps);
