// GET /api/v1/status -> {ok, model, budget_left_today} (functions/_lib/api.js)
import { statusApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => statusApi(ctx, deps);
