// Production dependencies of the API handlers (functions/_lib/api.js): the pack bundle that tools/bundle_packs.py
// generates at deploy time (functions/_generated/packs.json, git-ignored), the platform's fetch (Turnstile
// siteverify) and clock. Tests pass their own deps instead of importing this module.
import bundle from "../_generated/packs.json";

export const deps = { bundle, fetch: (url, init) => fetch(url, init), now: () => Date.now() };
