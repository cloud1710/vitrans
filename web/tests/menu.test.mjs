// The ⋮ menu of the tab bar (web/shell.js createMenu): the button opens and closes its panel (aria-expanded follows),
// focus moves into the panel; Esc closes it and gives focus back to the button; a click outside closes it (focus back
// to the button unless the click went to a field or another control); Tab out of the panel closes it. A tiny fake
// DOM: elements with listeners, contains() and focus().
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMenu } from "../shell.js";

class El {
  constructor(doc, tag, parent) {
    this.doc = doc;
    this.tag = tag;
    this.parent = parent || null;
    this.hidden = false;
    this.attrs = {};
    this.listeners = {};
    if (parent) (parent.kids || (parent.kids = [])).push(this);
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
  focus() { this.doc.activeElement = this; }
  closest(sel) {
    for (let n = this; n && n !== this.doc; n = n.parent) {
      if (sel.split(",").map((s) => s.trim()).includes(n.tag)) return n;
    }
    return null;
  }
  querySelector(sel) {
    const all = [];
    const walk = (n) => { for (const k of n.kids || []) { all.push(k); walk(k); } };
    walk(this);
    if (sel === "input:checked") return all.find((k) => k.tag === "input" && k.checked) || null;
    if (sel === "input, button") return all.find((k) => k.tag === "input" || k.tag === "button") || null;
    return null;
  }
}

function fakeDoc() {
  const doc = { activeElement: null, listeners: {} };
  doc.addEventListener = (type, fn) => { (doc.listeners[type] || (doc.listeners[type] = [])).push(fn); };
  doc.removeEventListener = (type, fn) => { doc.listeners[type] = (doc.listeners[type] || []).filter((f) => f !== fn); };
  const body = new El(doc, "body", null);
  doc.body = body;
  doc.activeElement = body;
  return doc;
}

function fire(target, type, props) {
  const ev = Object.assign({ type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } },
    props || {});
  // bubble: target -> ancestors -> document
  for (let n = target; n; n = n.parent) for (const fn of (n.listeners[type] || []).slice()) fn(ev);
  for (const fn of (target.doc.listeners[type] || []).slice()) fn(ev);
  return ev;
}

function setup() {
  const doc = fakeDoc();
  const bar = new El(doc, "div", doc.body);
  const button = new El(doc, "button", bar);
  const panel = new El(doc, "div", bar);
  panel.hidden = true;
  const radioA = new El(doc, "input", panel);
  const radioB = new El(doc, "input", panel);
  radioB.checked = true;
  const field = new El(doc, "textarea", doc.body);
  const card = new El(doc, "section", doc.body);
  const events = [];
  const menu = createMenu({ button, panel, doc, onToggle: (open) => events.push(open) });
  return { doc, button, panel, radioA, radioB, field, card, menu, events };
}

test("the button opens and closes the panel; aria-expanded follows; focus goes to the checked choice", () => {
  const s = setup();
  assert.equal(s.button.getAttribute("aria-expanded"), "false");
  s.button.focus();
  fire(s.button, "click");
  assert.equal(s.panel.hidden, false);
  assert.equal(s.button.getAttribute("aria-expanded"), "true");
  assert.equal(s.doc.activeElement, s.radioB);
  fire(s.button, "click");
  assert.equal(s.panel.hidden, true);
  assert.equal(s.button.getAttribute("aria-expanded"), "false");
  assert.deepEqual(s.events, [true, false]);
});

test("Esc closes it and gives focus back to the button; Esc while closed does nothing", () => {
  const s = setup();
  fire(s.button, "click");
  const ev = fire(s.radioB, "keydown", { key: "Escape" });
  assert.equal(s.panel.hidden, true);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(s.doc.activeElement, s.button);
  const again = fire(s.field, "keydown", { key: "Escape" });
  assert.equal(again.defaultPrevented, false);  // other Esc handlers (the live stage's focus view) still work
});

test("a click outside closes it: focus back to the button, unless the click went to a field", async () => {
  const s = setup();
  fire(s.button, "click");
  fire(s.radioA, "pointerdown");  // inside: stays open
  assert.equal(s.panel.hidden, false);
  fire(s.card, "pointerdown");
  assert.equal(s.panel.hidden, true);
  s.doc.activeElement = s.doc.body;  // the press itself blurs (plain text is not focusable) ...
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.doc.activeElement, s.button);  // ... then the button gets the focus back
  fire(s.button, "click");
  fire(s.field, "pointerdown");
  s.field.focus();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(s.panel.hidden, true);
  assert.notEqual(s.doc.activeElement, s.button);  // the textarea gets the focus the click gives it
  fire(s.button, "click");
  fire(s.button, "pointerdown");  // the button itself: its click toggles, the outside rule does not close first
  assert.equal(s.panel.hidden, false);
});

test("Tab out of the panel closes it; the keyboard opens it from the button (a native button click)", () => {
  const s = setup();
  fire(s.button, "click");
  fire(s.radioB, "focusout", { relatedTarget: s.field });
  assert.equal(s.panel.hidden, true);
  fire(s.button, "click");
  fire(s.radioB, "focusout", { relatedTarget: s.radioA });  // moving inside the panel
  assert.equal(s.panel.hidden, false);
  s.menu.close();
  assert.equal(s.panel.hidden, true);
  s.menu.open();
  assert.equal(s.menu.isOpen(), true);
});
