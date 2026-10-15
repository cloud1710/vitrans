// GET /admin/api/feedback?status=new|approved|rejected|all -> {rows} (functions/_lib/api.js; spec Amendment G). Under
// /admin/, which Cloudflare Access protects; functions/_lib/access.js checks the Access JWT as well.
import { adminFeedbackApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => adminFeedbackApi(ctx, deps);
