// POST /api/v1/classify {session, text, domain?} -> classify event + {setup, setup_id} (functions/_lib/api.js)
import { classifyApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => classifyApi(ctx, deps);
