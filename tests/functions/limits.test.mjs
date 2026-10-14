// Daily and monthly limits in KV (counters only, never content): segments per session and per client IP hash, one
// neuron budget for all users per UTC day, billed neurons per UTC month (above the daily free allocation; the user's
// cap of $20 a month incl. the $5 Workers Paid base leaves $15 = 1,363,000 billed neurons), and live captions
// limited to a share of the daily budget. Read-then-write counters are approximate (concurrent requests can lose an
// increment; KV reads may lag up to 60 s across locations) -- documented in the README.
import { test } from "node:test";
import assert from "node:assert/strict";
import { utcDay, utcMonth, readLimits, enforce, record, KEY_TTL_S, MONTH_TTL_S } from "../../functions/_lib/limits.js";
import { loadConfig } from "../../functions/_lib/config.js";
import { ApiError } from "../../functions/_lib/http.js";
import { FakeKV, withConsoleSpy } from "./helpers.mjs";

const NOW = Date.UTC(2026, 9, 14, 23, 59, 30);
const SID = "S".repeat(22);
const IPH = "I".repeat(22);
const cfg = loadConfig({ DAILY_NEURON_BUDGET: "1000", SESSION_SEGMENTS_PER_DAY: "30", IP_SEGMENTS_PER_DAY: "50",
  FREE_NEURONS_PER_DAY: "100", MONTHLY_BILLED_NEURON_CAP: "5000" });

test("the day is the UTC date, the month the UTC year-month", () => {
  assert.equal(utcDay(NOW), "2026-10-14");
  assert.equal(utcDay(NOW + 31_000), "2026-10-15");
  assert.equal(utcMonth(NOW), "2026-10");
  assert.equal(utcMonth(Date.UTC(2026, 9, 31, 23, 59, 59) + 1000), "2026-11");
});

test("an empty KV means nothing used: segments left = the smaller cap, the whole budget left, nothing spent", async () => {
  const s = await readLimits(new FakeKV(), cfg, { now: NOW, sid: SID, iph: IPH });
  assert.deepEqual(s, { day: "2026-10-14", month: "2026-10", budgetUsed: 0, liveUsed: 0, monthBilled: 0, sessionUsed: 0,
    ipUsed: 0, segmentsLeft: 30, budgetLeft: 1, monthSpentUsd: 0 });
  const noSession = await readLimits(new FakeKV(), cfg, { now: NOW, sid: null, iph: IPH });
  assert.equal(noSession.segmentsLeft, 30, "a new session: its own cap or what the IP has left");
});

test("record adds segments to the session and IP counters and neurons to the day's budget, with an expiry", async () => {
  const kv = new FakeKV();
  await record(kv, cfg, { now: NOW, sid: SID, iph: IPH, segments: 12, neurons: 101.23456 });
  await record(kv, cfg, { now: NOW, sid: SID, iph: IPH, segments: 8, neurons: 0.5 });
  const s = await readLimits(kv, cfg, { now: NOW, sid: SID, iph: IPH });
  assert.equal(s.sessionUsed, 20);
  assert.equal(s.ipUsed, 20);
  assert.ok(Math.abs(s.budgetUsed - 101.735) < 1e-9, String(s.budgetUsed));
  assert.equal(s.segmentsLeft, 10);
  assert.ok(Math.abs(s.budgetLeft - 0.898) < 1e-9, String(s.budgetLeft));
  const dayPuts = kv.puts.filter((p) => !p.key.startsWith("v1:m:"));
  assert.ok(KEY_TTL_S >= 86400 && dayPuts.every((p) => p.opts.expirationTtl === KEY_TTL_S));
  assert.deepEqual([...kv.map.keys()].sort(), ["v1:b:2026-10-14", "v1:i:2026-10-14:" + IPH, "v1:m:2026-10",
    "v1:s:2026-10-14:" + SID]);
  // a new UTC day starts from zero
  const next = await readLimits(kv, cfg, { now: NOW + 60_000, sid: SID, iph: IPH });
  assert.equal(next.sessionUsed + next.ipUsed + next.budgetUsed, 0);
});

test("the month counts only billed neurons: what each day uses above its free allocation", async () => {
  const kv = new FakeKV();
  await record(kv, cfg, { now: NOW, neurons: 90 }); // day 90 of 100 free: nothing billed
  assert.equal((await readLimits(kv, cfg, { now: NOW })).monthBilled, 0);
  await record(kv, cfg, { now: NOW, neurons: 30 }); // day 120: 20 billed
  await record(kv, cfg, { now: NOW, neurons: 50 }); // day 170: 70 billed
  let s = await readLimits(kv, cfg, { now: NOW });
  assert.equal(s.monthBilled, 70);
  await record(kv, cfg, { now: NOW + 60_000, neurons: 150 }); // the next day (same month): 50 billed
  s = await readLimits(kv, cfg, { now: NOW + 60_000 });
  assert.equal(s.monthBilled, 120);
  assert.equal(s.monthSpentUsd, Math.round(120 * 0.011 / 1000 * 100) / 100);
  const monthPut = kv.puts.find((p) => p.key === "v1:m:2026-10");
  assert.ok(MONTH_TTL_S >= 31 * 86400 && monthPut.opts.expirationTtl === MONTH_TTL_S);
  const big = new FakeKV();
  await big.put("v1:m:2026-10", "1000000");
  assert.equal((await readLimits(big, loadConfig({}), { now: NOW })).monthSpentUsd, 11);
});

test("budget: the day's budget or the month's billed cap used up -> 429 budget_exhausted (checked first)", () => {
  const base = { day: "d", month: "m", budgetUsed: 0, liveUsed: 0, monthBilled: 0, sessionUsed: 0, ipUsed: 0,
    segmentsLeft: 30, budgetLeft: 1, monthSpentUsd: 0 };
  assert.doesNotThrow(() => enforce(base, cfg));
  const code = (state, profile) => {
    try {
      enforce(state, cfg, profile);
      return null;
    } catch (e) {
      assert.ok(e instanceof ApiError && e.status === 429);
      return e.code;
    }
  };
  assert.equal(code({ ...base, budgetUsed: 1000 }), "budget_exhausted");
  assert.equal(code({ ...base, monthBilled: 5000 }), "budget_exhausted");
  assert.equal(code({ ...base, budgetUsed: 1000, sessionUsed: 30 }), "budget_exhausted");
  assert.equal(code({ ...base, sessionUsed: 30 }), "quota_exceeded");
  assert.equal(code({ ...base, ipUsed: 50 }), "quota_exceeded");
  assert.equal(code({ ...base, sessionUsed: 29, ipUsed: 49 }), null, "one segment left: the request is served");
});

test("live captions may use at most LIVE_BUDGET_SHARE of the day's budget; files and photos the whole budget", async () => {
  assert.equal(cfg.liveShare, 0.5);
  const base = { day: "d", month: "m", budgetUsed: 600, liveUsed: 500, monthBilled: 0, sessionUsed: 0, ipUsed: 0,
    segmentsLeft: 30, budgetLeft: 0.4, monthSpentUsd: 0 };
  assert.throws(() => enforce(base, cfg, "live"), (e) => e.code === "budget_exhausted");
  assert.doesNotThrow(() => enforce(base, cfg, "file"));
  assert.doesNotThrow(() => enforce(base, cfg, "photo"));
  assert.doesNotThrow(() => enforce({ ...base, liveUsed: 499 }, cfg, "live"));
  const kv = new FakeKV();
  await record(kv, cfg, { now: NOW, neurons: 40, profile: "live" });
  await record(kv, cfg, { now: NOW, neurons: 60, profile: "file" });
  const s = await readLimits(kv, cfg, { now: NOW });
  assert.deepEqual([s.liveUsed, s.budgetUsed], [40, 100]);
  assert.ok(kv.map.has("v1:l:2026-10-14"));
});

test("a failed counter write does not fail the request and logs no key, id or IP hash", async () => {
  const kv = new FakeKV();
  kv.failPuts = true;
  const [, lines] = await withConsoleSpy(() => record(kv, cfg, { now: NOW, sid: SID, iph: IPH, segments: 3,
    neurons: 900 }));
  assert.ok(lines.length >= 1);
  assert.ok(lines.every((l) => !l.includes(SID) && !l.includes(IPH) && !l.includes("v1:")), JSON.stringify(lines));
});

test("garbage or negative counter values read as zero", async () => {
  const kv = new FakeKV();
  kv.map.set("v1:b:2026-10-14", { value: "lots", opts: {} });
  kv.map.set("v1:s:2026-10-14:" + SID, { value: "-5", opts: {} });
  const s = await readLimits(kv, cfg, { now: NOW, sid: SID, iph: IPH });
  assert.equal(s.budgetUsed, 0);
  assert.equal(s.sessionUsed, 0);
});
