// POST /api/v1/feedback {session, items: [{en, vi_used, vi_user, pack, kind}]} -> {ok: true, stored}
// (functions/_lib/api.js, functions/_lib/feedback.js; spec Amendment G)
import { feedbackApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => feedbackApi(ctx, deps);
