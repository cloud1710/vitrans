// POST /admin/api/decide {key, decision: approved | rejected} -> {ok, key, status} (functions/_lib/api.js; spec
// Amendment G). Under /admin/, which Cloudflare Access protects; functions/_lib/access.js checks the Access JWT as well.
import { adminDecideApi } from "../../_lib/api.js";
import { deps } from "../../_lib/deps.js";

export const onRequest = (ctx) => adminDecideApi(ctx, deps);
