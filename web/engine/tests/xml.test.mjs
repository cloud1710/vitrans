// Parsing (DOMParser: native in the page, xmldom in Node) and the engine's own serializer, which writes what
// lxml writes for the helper: same declaration, escaping and empty-element form, so changed parts are byte-identical.
import { StrictParser } from "./dom-node.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXml, serializeXml, decodeXml, XmlParseError, useDomParser } from "../ooxml/xml.js";

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

test("serialized like lxml: declaration, top-level nodes, escaping, empty elements", () => {
  const src = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\r\n<!-- keep -->\r\n<?pi data?>\n" +
    "<a:p xmlns:a=\"urn:a\" xmlns:r=\"urn:r\" b=\"x&#10;y&#13;z&#9;q&gt;&apos;\" c=\"&lt;&quot;\">" +
    "<a:r r:id=\"1\">t&#13;u &gt; ' \" <![CDATA[cd<]]>\u{e9}</a:r>\r\n  <a:t>  sp </a:t><a:e></a:e></a:p>\r\n<!-- after -->";
  const want = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n<!-- keep --><?pi data?>" +
    "<a:p xmlns:a=\"urn:a\" xmlns:r=\"urn:r\" b=\"x&#10;y&#13;z&#9;q&gt;'\" c=\"&lt;&quot;\">" +
    "<a:r r:id=\"1\">t&#13;u &gt; ' \" cd&lt;\u{e9}</a:r>\n  <a:t>  sp </a:t><a:e/></a:p><!-- after -->";
  assert.equal(dec(serializeXml(parseXml(enc(src)))), want);
});

test("created nodes get declarations only when their prefix is not in scope", () => {
  const doc = parseXml("<a:p xmlns:a=\"urn:a\" xmlns:r=\"urn:r\"><a:r/></a:p>");
  const root = doc.documentElement;
  const r = doc.createElementNS("urn:a", "a:r");
  r.setAttributeNS("urn:r", "r:id", "5");
  r.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  root.appendChild(r);
  const x = doc.createElementNS("urn:new", "n:x");
  x.setAttributeNS("urn:other", "o:k", "v");
  root.appendChild(x);
  const text = dec(serializeXml(doc));
  assert.ok(text.endsWith("<a:r/><a:r r:id=\"5\" xml:space=\"preserve\"/>" +
    "<n:x xmlns:n=\"urn:new\" xmlns:o=\"urn:other\" o:k=\"v\"/></a:p>"), text);
});

test("text content is escaped like libxml2 and attribute values keep tabs / newlines", () => {
  const doc = parseXml("<w xmlns=\"urn:w\"><t/></w>");
  const t = doc.documentElement.firstChild;
  t.appendChild(doc.createTextNode("a\tb\nc\rd>e\"f'g&"));
  t.setAttribute("z", "1\t2\n3\r4'5\"6<7>8&9");
  assert.equal(dec(serializeXml(doc)), "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n" +
    "<w xmlns=\"urn:w\"><t z=\"1&#9;2&#10;3&#13;4'5&quot;6&lt;7&gt;8&amp;9\">a\tb\nc&#13;d&gt;e\"f'g&amp;</t></w>");
});

test("a default namespace is declared for a created element that needs it", () => {
  const doc = parseXml("<p:x xmlns:p=\"urn:p\"/>");
  doc.documentElement.appendChild(doc.createElementNS("urn:d", "d"));
  assert.ok(dec(serializeXml(doc)).endsWith("<p:x xmlns:p=\"urn:p\"><d xmlns=\"urn:d\"/></p:x>"));
});

test("decoding: UTF-8 with or without BOM, UTF-16 with BOM", () => {
  assert.equal(decodeXml(Uint8Array.of(0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e)), "<a/>");
  assert.equal(decodeXml(Uint8Array.of(0xff, 0xfe, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e, 0)), "<a/>");
  assert.equal(decodeXml(Uint8Array.of(0xfe, 0xff, 0, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e)), "<a/>");
  assert.equal(parseXml(Uint8Array.of(0xff, 0xfe, 0x3c, 0, 0x61, 0, 0x2f, 0, 0x3e, 0)).documentElement.nodeName, "a");
});

// lxml raises XMLSyntaxError for each of these; the engine raises XmlParseError, whatever the DOMParser does
const ILL_FORMED = {
  mismatched_tag: "<w:p xmlns:w=\"urn:w\"><w:r><w:t>x</w:t></w:p>",
  truncated: "<w:document xmlns:w=\"urn:w\"><w:body><w:p><w:r><w:t>Hel",
  undefined_entity: "<r><t>a &nbsp; b</t></r>",
  no_root: "<?xml version=\"1.0\"?>\n<!-- only a comment -->",
  empty: "",
  two_roots: "<a/><b/>",
  bad_attribute: "<a b=\"1\" b=\"2\"/>",
};

test("ill-formed XML throws XmlParseError (xmldom path)", () => {
  for (const [name, xml] of Object.entries(ILL_FORMED)) {
    assert.throws(() => parseXml(xml), (err) => err instanceof XmlParseError, name);
  }
});

// What Chrome / WebKit return for ill-formed XML: no exception, a document with an XHTML <parsererror> inside the
// partly parsed root. Firefox: a root <parsererror> in its own namespace.
function fakeParser(kind) {
  return class {
    parseFromString() {
      if (kind === "firefox") {
        return new StrictParser().parseFromString("<parsererror xmlns=\"http://www.mozilla.org/newlayout/xml/" +
          "parsererror.xml\">XML Parsing Error: mismatched tag</parsererror>", "application/xml");
      }
      return new StrictParser().parseFromString("<w:p xmlns:w=\"urn:w\"><parsererror xmlns=\"http://www.w3.org/1999/" +
        "xhtml\" style=\"display: block\"><h3>This page contains the following errors:</h3><div>error on line 1 at " +
        "column 30: Opening and ending tag mismatch</div></parsererror><w:r><w:t>x</w:t></w:r></w:p>", "application/xml");
    }
  };
}

for (const kind of ["chrome", "firefox"]) {
  test("a " + kind + "-style parsererror document is an XmlParseError", () => {
    useDomParser(fakeParser(kind));
    try {
      assert.throws(() => parseXml("<w:p xmlns:w=\"urn:w\"><w:r><w:t>x</w:t></w:p>"), (err) => err instanceof XmlParseError);
    } finally {
      useDomParser(StrictParser);
    }
  });
}

test("the XML declaration never becomes a node", () => {
  const doc = parseXml("<?xml version=\"1.0\"?>\n<a/>");
  assert.deepEqual(Array.from(doc.childNodes).filter((n) => n.nodeType !== 3).map((n) => n.nodeName), ["a"]);
});
