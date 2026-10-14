// The device picker: the user names the iPhone / iPad and the page compares its RAM with the 8 GB minimum,
// with no download and no memory probe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { APPLE_DEVICES, MIN_RAM_GB, deviceVerdict } from "../core.js";

const byName = (name) => APPLE_DEVICES.find((d) => d.name === name);

test("the table covers iPhones and iPads with unique names and RAM in GB", () => {
  const names = APPLE_DEVICES.map((d) => d.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(APPLE_DEVICES.some((d) => d.group === "iPhone") && APPLE_DEVICES.some((d) => d.group === "iPad"));
  for (const d of APPLE_DEVICES) {
    assert.ok(Array.isArray(d.ram) && d.ram.length >= 1, d.name);
    for (const r of d.ram) assert.ok(Number.isFinite(r) && r >= 2 && r <= 32, d.name);
  }
  assert.equal(MIN_RAM_GB, 8);
});

test("8 GB or more meets the minimum, less does not, measured classes say so", () => {
  assert.equal(deviceVerdict(byName("iPhone 15 Pro")).ok, true);
  assert.equal(deviceVerdict(byName("iPhone 17 Pro / 17 Pro Max")).ok, true);
  assert.equal(deviceVerdict(byName("iPhone 15 / 15 Plus")).ok, false);
  assert.equal(deviceVerdict(byName("iPhone 13 / 13 mini")).ok, false);
  assert.equal(deviceVerdict(byName("iPad Air (M1, 2022)")).ok, true);
  assert.equal(deviceVerdict(byName("iPad mini (A17 Pro, 2024)")).ok, true);
  assert.equal(deviceVerdict(byName("iPad mini (thế hệ 6, 2021)")).ok, false);
  // 4-6 GB iPhones were measured: the 2B model crashed the tab
  assert.equal(deviceVerdict(byName("iPhone 13 Pro / 13 Pro Max")).measured, true);
  assert.equal(deviceVerdict(byName("iPhone 16 / 16 Plus")).measured, false);
});

test("a model sold with several RAM sizes counts its smallest one", () => {
  const pro2018 = byName("iPad Pro (2018)");
  assert.deepEqual(pro2018.ram, [4, 6]);
  assert.equal(deviceVerdict(pro2018).ok, false);
  const m4 = byName("iPad Pro (M4, 2024)");
  assert.equal(deviceVerdict(m4).ok, true);
  assert.equal(deviceVerdict(m4).ramText, "8-16 GB");
});

test("an unknown or missing device gives no verdict", () => {
  assert.equal(deviceVerdict(null), null);
  assert.equal(deviceVerdict(undefined), null);
});
