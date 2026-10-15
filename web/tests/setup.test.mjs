// The installed helper's first-run setup line (web/setup.js) from GET /api/setup answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupView } from "../setup.js";

test("nothing to show when the helper runs from source, is idle or ready", () => {
  for (const st of [{ state: "off" }, { state: "idle" }, { state: "ready" }, null]) {
    assert.deepEqual(setupView(st), { text: "", error: false, active: false });
  }
});

test("download, unpack and start steps show the library download in percent", () => {
  assert.deepEqual(setupView({ state: "running", step: "download", download: { done: 50, total: 200 } }),
    { text: "Đang tải thư viện… 25%", error: false, active: true });
  assert.equal(setupView({ state: "running", step: "unpack", download: { done: 200, total: 200 } }).text,
    "Đang tải thư viện… 100%");
  assert.equal(setupView({ state: "running", step: "detect", download: null }).text, "Đang tải thư viện…");
});

test("the model pull shows its own percent", () => {
  assert.equal(setupView({ state: "running", step: "model", model: { model: "gemma4:e4b", completed: 1, total: 3 } }).text,
    "Đang tải mô hình gemma4:e4b… 33%");
});

test("waiting for a starting Ollama, and an error with its message", () => {
  assert.equal(setupView({ state: "waiting", reason: "system_ollama_starting" }).text, "Đang chờ Ollama trên máy khởi động");
  assert.deepEqual(setupView({ state: "error", error: "download failed" }),
    { text: "Cài đặt chưa xong: download failed", error: true, active: false });
});
