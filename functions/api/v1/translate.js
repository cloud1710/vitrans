// POST /api/v1/translate {session, job_id, setup, setup_id?, segments} -> {results, usage, quota}
// (functions/_lib/api.js)
import { translateApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => translateApi(ctx, deps);
