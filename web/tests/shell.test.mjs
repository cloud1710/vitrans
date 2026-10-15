// The app shell's tab router (web/shell.js): five tools, "Văn bản" by default, the selected tool in the URL hash so that
// links open it, the arrow keys moving between tabs. Pure parts only (no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, DEFAULT_TOOL, toolFromHash, hashOf, nextIndex, APP_TOOLS } from "../shell.js";

test("five tools in his order, plain text first and the default", () => {
  assert.deepEqual(TOOLS.map((t) => t.label), ["Văn bản", "Tài liệu", "Ảnh", "Phụ đề", "Dịch đuổi"]);
  assert.deepEqual(TOOLS.map((t) => t.id), ["text", "file", "anh", "sub", "live"]);
  assert.equal(DEFAULT_TOOL, "text");
  // the tools run by the main module (shared upload card, progress, log, term review)
  assert.deepEqual(APP_TOOLS, ["text", "file", "sub"]);
  for (const t of TOOLS) assert.match(t.slug, /^[a-z-]+$/);  // ASCII hashes: links survive any chat app
});

test("the hash names the tool; anything else opens the default", () => {
  assert.equal(toolFromHash(""), "text");
  assert.equal(toolFromHash("#"), "text");
  assert.equal(toolFromHash("#van-ban"), "text");
  assert.equal(toolFromHash("#tai-lieu"), "file");
  assert.equal(toolFromHash("#anh"), "anh");
  assert.equal(toolFromHash("#phu-de"), "sub");
  assert.equal(toolFromHash("#dich-duoi"), "live");
  assert.equal(toolFromHash("#DICH-DUOI"), "live");
  assert.equal(toolFromHash("tai-lieu"), "file");
  assert.equal(toolFromHash("#live"), "live");  // the tool ids work too
  assert.equal(toolFromHash("#nothing"), "text");
  assert.equal(toolFromHash(null), "text");
  for (const t of TOOLS) assert.equal(toolFromHash(hashOf(t.id)), t.id);
  assert.equal(hashOf("sub"), "#phu-de");
});

test("arrow keys move between tabs and wrap; Home / End jump; other keys do nothing", () => {
  assert.equal(nextIndex(0, "ArrowRight", 5), 1);
  assert.equal(nextIndex(4, "ArrowRight", 5), 0);
  assert.equal(nextIndex(0, "ArrowLeft", 5), 4);
  assert.equal(nextIndex(2, "Home", 5), 0);
  assert.equal(nextIndex(2, "End", 5), 4);
  assert.equal(nextIndex(2, "Enter", 5), null);
  // a tab locked while a job runs is skipped
  assert.equal(nextIndex(0, "ArrowRight", 5, (i) => i === 1), 2);
  assert.equal(nextIndex(3, "ArrowLeft", 5, (i) => i === 2 || i === 1), 0);
});
