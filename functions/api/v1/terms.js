// POST /api/v1/terms {session, job_id, setup, setup_id?, items: [{id, src, vi}]} -> {terms: [{en, vi, count, ids}],
// usage} (functions/_lib/api.js, functions/_lib/terms.js; spec Amendment G)
import { termsApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => termsApi(ctx, deps);
