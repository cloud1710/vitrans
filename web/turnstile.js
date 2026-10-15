// The browser check -> session flow of the cloud engine for the tool pages (the main page's app.js, the image tool
// anh.js and the live tool live.js, all in one shell page): Cloudflare Turnstile (explicit, appearance
// interaction-only) gives a single-use token that opens a session through web/cloud.js (POST /api/v1/session); a
// session is reused while valid. One check at a time for the whole page (his report 2026-10-15: Turnstile asked again
// and again): the tools' flows share a hub (pageChecks()), the check is shown in the box of the tool that asked last
// (a tool asking while another's check runs joins it, and the widget moves to its box), and its session serves every
// tool (the shared store of cloud.js). No automatic retries (retry "never"): a failed check rejects with
// "bad_turnstile" and leaves a note with Turnstile's error code and a "Thử lại" button in the box, one reset per click.
// The site's widget key (vitrans.pages.dev, managed; public) everywhere but on 127.0.0.1 / localhost, where
// Cloudflare's always-pass test key keeps local runs offline. The box must not have the id "turnstile" (an element
// with that id shadows window.turnstile).
export const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_TEST_KEY = "1x00000000000000000000AA";
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFWpPjhZYuN91QqX";

export function turnstileSiteKey(hostname) {
  return ["127.0.0.1", "localhost"].includes(hostname) ? TURNSTILE_TEST_KEY : TURNSTILE_SITE_KEY;
}

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

// the Turnstile API from its script (added once)
function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return; }
    const s = document.createElement("script");
    s.src = TURNSTILE_URL;
    s.async = true;
    s.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile)
      : reject(Object.assign(new Error("Turnstile API missing"), { code: "turnstile" }))));
    s.addEventListener("error", () => reject(Object.assign(new Error("Turnstile script not loaded"), { code: "turnstile" })));
    document.head.appendChild(s);
  });
}

// the promise as this caller sees it: its own abort rejects it (the shared check itself goes on)
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); });
  });
}

/**
 * The page's checks: one Turnstile check at a time, shared by the flows given this hub. opts: { loadApi (tests) }.
 * check(flow) starts the check (token -> POST /session) or joins the one running; retry(flow) is the "Thử lại" click.
 */
export function createCheckHub(opts) {
  const o = opts || {};
  const load = o.loadApi || loadScript;
  let ready = null;
  let ts = null;              // the Turnstile API once loaded
  const widgets = new Map();  // flow -> { id }: at most one widget on the page
  let waiter = null;          // { resolve, reject } of the token being waited for
  let asker = null;           // the flow whose box shows the check
  let checking = null;        // the check in progress
  let note = null;            // the failure note's element

  function api() {
    if (!ready) {
      ready = Promise.resolve().then(load).then((t) => { ts = t; return t; });
      ready.catch(() => { ready = null; });  // a later attempt loads it again
    }
    return ready;
  }

  function prompt(on) {
    if (asker && asker.onPrompt) { try { asker.onPrompt(on); } catch (e) { /* the tool's problem */ } }
  }

  function clearNote() {
    if (note) { note.remove(); note = null; }
  }

  // the failure note in the asking tool's box: the error code and "Thử lại" (one reset per click)
  function showNote(flow, code) {
    clearNote();
    const box = flow.box();
    const doc = box && box.ownerDocument;
    if (!doc || typeof box.append !== "function") return;
    const p = doc.createElement("p");
    p.className = "turnstile-note";
    const text = doc.createElement("span");
    text.textContent = "Xác minh trình duyệt không thành công" + (code ? " (mã " + code + ")" : "") + ". ";
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = "Thử lại";
    b.addEventListener("click", () => { retry(flow).catch(() => {}); });
    p.append(text, b);
    box.append(p);
    note = p;
  }

  function settle(err, token) {
    const w = waiter;
    waiter = null;
    prompt(false);
    if (!w) return;
    if (err) w.reject(err); else w.resolve(token);
  }

  // the widget in the asker's box: rendered there once, reset for a new check; a widget elsewhere is removed
  function show() {
    const flow = asker;
    const box = flow.box();
    clearNote();
    for (const [f, w] of widgets) {
      if (f !== flow) {
        try { ts.remove(w.id); } catch (e) { /* gone already */ }
        widgets.delete(f);
      }
    }
    const mine = widgets.get(flow);
    if (mine) { ts.reset(mine.id); return; }
    const id = ts.render(box, {
      sitekey: turnstileSiteKey(flow.hostname || (typeof location !== "undefined" ? location.hostname : "")),
      action: "session", appearance: "interaction-only", retry: "never", "refresh-expired": "auto",
      callback: (t) => settle(null, t),
      "error-callback": (code) => {
        settle(Object.assign(new Error("Turnstile error " + code), { code: "bad_turnstile", turnstileCode: String(code) }));
        return true;
      },
      "before-interactive-callback": () => prompt(true),
      "after-interactive-callback": () => prompt(false),
    });
    widgets.set(flow, { id });
  }

  async function token() {
    await api();
    return new Promise((resolve, reject) => {
      waiter = { resolve, reject };
      show();
    });
  }

  async function run(flow) {
    flow.cloud.dropSession();
    flow.log("Xác minh trình duyệt…");
    try {
      const s = await flow.cloud.openSession(await token());
      const left = s.quota && Number.isFinite(s.quota.segments_left_today) ? s.quota.segments_left_today : null;
      asker.log("Đã xác minh" + (left !== null ? " · hôm nay còn " + left + " đoạn" : ""));
    } catch (e) {
      // the check failed (not the server's answer to a good token, which the tool reports)
      if (e && (e.code === "bad_turnstile" || e.code === "turnstile")) showNote(asker, e.turnstileCode || "");
      throw e;
    }
  }

  function check(flow) {
    if (!checking) {
      asker = flow;
      checking = run(flow).finally(() => { checking = null; });
    } else if (asker !== flow) {
      prompt(false);
      asker = flow;
      if (waiter && ts) show();  // waiting for the user: the check moves to this tool's box
    }
    return checking;
  }

  function retry(flow) {
    clearNote();
    const p = check(flow);
    p.then(() => { if (flow.onRetried) flow.onRetried(null); }, (e) => { if (flow.onRetried) flow.onRetried(e); });
    return p;
  }

  return { check, retry, get busy() { return !!checking; } };
}

let pageHub = null;

/** The page's one hub, shared by every tool's flow (app.js, anh.js, live.js). */
export function pageChecks() {
  if (!pageHub) pageHub = createCheckHub();
  return pageHub;
}

/**
 * { ensure(signal), renew(signal, used) } for a cloud client (createCloud()). opts: { cloud, box () -> the widget's
 * container element, log (line) (optional), hostname (default location.hostname), hub (default: a hub of its own;
 * the pages pass pageChecks()), loadApi (tests, with no hub), onPrompt (shown) (Turnstile shows its checkbox / no
 * more), onRetried (error | null) (a check started by "Thử lại" ended) }.
 * ensure: a valid session, or the page's check -> POST /session (joined when one runs); renew: a new session (a 401 in
 * a job), unless the session is no longer the `used` one (another tool renewed it meanwhile). Errors: code
 * "bad_turnstile" (the widget failed; turnstileCode = Turnstile's code), "turnstile" (its script did not load), the
 * API's codes; an abort of the caller is an AbortError (the check itself goes on and its session is kept).
 */
export function createSessionFlow(opts) {
  const o = opts || {};
  const hub = o.hub || createCheckHub({ loadApi: o.loadApi });
  const flow = { cloud: o.cloud, box: o.box, hostname: o.hostname, log: o.log || (() => {}), onPrompt: o.onPrompt,
    onRetried: o.onRetried };

  async function ensure(signal) {
    if (!hub.busy && o.cloud.hasSession()) return;
    await abortable(hub.check(flow), signal);
  }

  return {
    ensure,
    async renew(signal, used) {
      const s = o.cloud.session;
      if (used !== undefined && s && s.token !== used && o.cloud.hasSession()) return;
      if (!hub.busy) o.cloud.dropSession();
      await ensure(signal);
    },
  };
}
