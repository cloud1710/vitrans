// deviceClass decides whether the main page shows the phone / tablet note and how the lab rates models.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceClass } from "../core.js";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15",
  androidPhone: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

test("phones and tablets are told apart from desktops", () => {
  assert.equal(deviceClass(UA.iphone, 5), "iPhone");
  assert.equal(deviceClass(UA.ipadDesktopMode, 5), "iPad");
  assert.equal(deviceClass(UA.androidPhone, 5), "Android phone");
  assert.equal(deviceClass(UA.androidTablet, 10), "Android tablet");
  assert.equal(deviceClass(UA.windows, 0), "desktop");
  assert.equal(deviceClass(UA.ipadDesktopMode, 0), "desktop");  // a real Mac has no touch points
  assert.equal(deviceClass("", 0), "desktop");
});
