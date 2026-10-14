// Screen size -> candidate iPhone / iPad models, and the 8 GB decision (no question unless the candidates straddle
// the line). No network, no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APPLE_DEVICES, SCREENS, screenCandidates, screenDecision, groupLabel, iosMajor, MIN_RAM_GB }
  from "../lab/core.js";

const labels = (cands) => cands.map((c) => c.label).sort();
const decide = (cls, w, h, dpr) => screenDecision(screenCandidates(cls, w, h, dpr));

test("every screen row names a device of the RAM table, portrait, @2 or @3", () => {
  const names = new Set(APPLE_DEVICES.map((d) => d.name));
  const seen = new Set();
  for (const s of SCREENS) {
    assert.ok(names.has(s.device), s.label + " -> " + s.device);
    assert.ok(s.w < s.h && (s.dpr === 2 || s.dpr === 3), s.label);
    assert.ok(!seen.has(s.label), "duplicate " + s.label);
    seen.add(s.label);
    if (s.zoom) assert.ok(s.zoom[0] < s.zoom[1] && s.zoom[0] < s.w, s.label);
  }
  // every RAM-table device can be found from some screen size
  for (const d of APPLE_DEVICES) assert.ok(SCREENS.some((s) => s.device === d.name), d.name);
});

test("sizes from the published tables give the expected models", () => {
  assert.deepEqual(labels(screenCandidates("iPhone", 375, 667, 2)), ["iPhone SE (thế hệ 2)", "iPhone SE (thế hệ 3)"]);
  assert.deepEqual(labels(screenCandidates("iPhone", 402, 874, 3)),
    ["iPhone 16 Pro", "iPhone 17", "iPhone 17 Pro", "iPhone 18 Pro"]);
  assert.deepEqual(labels(screenCandidates("iPhone", 420, 912, 3)), ["iPhone Air"]);
  // landscape is normalised to portrait
  assert.deepEqual(labels(screenCandidates("iPhone", 912, 420, 3)), ["iPhone Air"]);
  // the iPhone 11 is the only @2 phone of its size
  assert.deepEqual(labels(screenCandidates("iPhone", 414, 896, 2)), ["iPhone 11"]);
  // iPads only for an iPad, iPhones only for an iPhone
  assert.deepEqual(labels(screenCandidates("iPad", 834, 1210, 2)), ["iPad Pro 11 inch (M4)", "iPad Pro 11 inch (M5)"]);
  assert.deepEqual(screenCandidates("iPhone", 834, 1210, 2), []);
  assert.deepEqual(screenCandidates("desktop", 390, 844, 3), []);
});

test("one side of the 8 GB line decides without a question", () => {
  assert.equal(decide("iPhone", 402, 874, 3).state, "ok");    // 16 Pro, 17, 17 Pro, 18 Pro
  assert.equal(decide("iPhone", 440, 956, 3).state, "ok");    // 16 / 17 / 18 Pro Max
  assert.equal(decide("iPhone", 420, 912, 3).state, "ok");    // Air
  assert.equal(decide("iPhone", 428, 926, 3).state, "below"); // 12 / 13 Pro Max, 14 Plus
  assert.equal(decide("iPhone", 375, 667, 2).state, "below"); // SE 2 / 3
  assert.equal(decide("iPhone", 414, 896, 2).state, "below"); // 11
  assert.equal(decide("iPad", 834, 1210, 2).state, "ok");     // Pro M4 / M5 11 inch
  assert.equal(decide("iPad", 1032, 1376, 2).state, "ok");    // Pro M4 / M5 13 inch
  assert.equal(decide("iPad", 810, 1080, 2).state, "below");  // iPad 8 / 9
  assert.equal(decide("iPad", 768, 1024, 2).state, "below");  // mini 5
  const ok = decide("iPhone", 402, 874, 3);
  assert.ok(ok.ok.every((c) => c.ram >= MIN_RAM_GB) && ok.below.length === 0);
});

test("candidates on both sides of the line ask one two-way question with only those candidates", () => {
  const d = decide("iPhone", 390, 844, 3);
  assert.equal(d.state, "ask");
  assert.deepEqual(labels(d.ok), ["iPhone 16e", "iPhone 17e"]);
  assert.deepEqual(labels(d.below), ["iPhone 12", "iPhone 12 Pro", "iPhone 13", "iPhone 13 Pro", "iPhone 14"]);
  const pro = decide("iPhone", 393, 852, 3);
  assert.equal(pro.state, "ask");
  assert.deepEqual(labels(pro.ok), ["iPhone 15 Pro", "iPhone 16"]);
  assert.deepEqual(labels(pro.below), ["iPhone 14 Pro", "iPhone 15"]);
  assert.equal(decide("iPhone", 430, 932, 3).state, "ask");  // 14 Pro Max, 15 Plus vs 15 Pro Max, 16 Plus
  assert.equal(decide("iPad", 744, 1133, 2).state, "ask");   // mini 6 vs mini A17 Pro
  assert.equal(decide("iPad", 834, 1194, 2).state, "ask");   // Pro 11 inch 2018 / 2020 vs M1 / M2
  assert.equal(decide("iPad", 820, 1180, 2).state, "ask");   // iPad 10, A16, Air 4 vs Air M1-M4
  assert.equal(decide("iPad", 1024, 1366, 2).state, "ask");  // Pro 12.9 inch 2018 / 2020 vs M1 / M2, Air 13 inch
});

test("Display Zoom and fingerprinting buckets add the larger models that can report a size", () => {
  // a zoomed 12 / 13 Pro Max or 14 Plus reports 375x812 @3, still all under 8 GB
  const zoomed = screenCandidates("iPhone", 375, 812, 3);
  assert.ok(labels(zoomed).includes("iPhone 13 Pro Max") && labels(zoomed).includes("iPhone 12 mini"));
  assert.equal(screenDecision(zoomed).state, "below");
  // Safari's fingerprinting protection reports 414x896 for every phone wider than 390 points: ask, never "below"
  const bucket = decide("iPhone", 414, 896, 3);
  assert.equal(bucket.state, "ask");
  assert.ok(labels(bucket.ok).includes("iPhone 16 Pro") && labels(bucket.below).includes("iPhone 11 Pro Max"));
});

test("unknown sizes give no decision", () => {
  assert.equal(decide("iPhone", 360, 740, 3).state, "unknown");
  assert.equal(decide("iPad", 1180, 1590, 2).state, "unknown");  // "More Space" on an iPad Pro
  assert.equal(decide("iPhone", 0, 0, 3).state, "unknown");
});

test("group labels are short", () => {
  const d = decide("iPhone", 390, 844, 3);
  assert.equal(groupLabel(d.ok), "iPhone 16e / 17e");
  assert.equal(groupLabel(d.below), "iPhone 12 / 12 Pro / 13 / 13 Pro / …");
  assert.equal(groupLabel(decide("iPad", 744, 1133, 2).ok), "iPad mini (A17 Pro)");
});

test("the iOS version comes from Safari's Version/ (the OS part of the user agent is frozen since iOS 26)", () => {
  const frozen = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1";
  assert.equal(iosMajor(frozen), 26);
  const old = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  assert.equal(iosMajor(old), 17);
  const chrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_3_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1";
  assert.equal(iosMajor(chrome), 26);
  const ipadDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15";
  assert.equal(iosMajor(ipadDesktop), 26);
  assert.equal(iosMajor(""), null);
});
