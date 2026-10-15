// One engine adapter for the five tools (the menu's "Dịch bằng", web/prefs.js): "Máy chủ" = the cloud API on this
// origin (web/cloud.js) after the page's browser check; "Trên máy" = the same API (classify / translate, the same JSON
// without the session) on the ViTranslate helper on this computer (web/helper.js; helper/vitranslate/sentence_api.py).
// A tool asks ready() before a job and gets { kind, client (the cloud client's methods), renew (cloud only), endpoint
// (path) -> {url, local} for a tool with its own client (the live tool) }; it changes nothing else. Trên máy NEVER
// falls back to the cloud: without a helper ready() throws helper_not_found (the page then offers "Mở ViTranslate"),
// and a helper that stops answering fails the call with helper_not_found too (looked for again next time). Every API
// call is one log line (web/log.js): tool, engine, operation, segments, latency, code -- never any text.
import { createCloud } from "./cloud.js";

const coded = (code, message) => Object.assign(new Error(message || code), { code });

/** createCloud's onCall for a tool (tool () -> its id now) and an engine -> one log line per request. */
export function callLogger(tool, engine, log) {
  return (c) => log.add({ tool: tool(), engine: c.engine || engine, op: c.op, segments: c.segments, ms: c.ms,
    status: c.status, code: c.code });
}

/** opts: { cloud (createCloud), flow (turnstile.js session flow), prefs, helper (createHelperLink), log, fetch,
 * tool () -> the tool id for the log }. */
export function createAdapter(opts) {
  const o = opts;
  const local = (base) => {
    const client = createCloud({ base: base + "/api/v1/", sessionless: true, fetch: o.fetch,
      offlineCode: "helper_not_found", onCall: (c) => {
        if (c.code === "helper_not_found") o.helper.forget();
        callLogger(o.tool, "local", o.log)(c);
      } });
    return { kind: "local", client, renew: null,
      endpoint: (path) => ({ url: base + "/api/v1/" + path, local: true }) };
  };

  return {
    kind: () => o.prefs.engine(),
    /** The engine of the next job, ready: cloud -> after the browser check; local -> the helper found. */
    async ready(signal) {
      if (o.prefs.engine() !== "local") {
        await o.flow.ensure(signal);
        return { kind: "cloud", client: o.cloud, renew: () => o.flow.renew(signal),
          endpoint: (path) => ({ url: "/api/v1/" + path, local: false }) };
      }
      if (o.helper.base === null) await o.helper.find();
      if (o.helper.base === null) throw coded("helper_not_found", "ViTranslate is not running on this computer.");
      return local(o.helper.base);
    },
  };
}
