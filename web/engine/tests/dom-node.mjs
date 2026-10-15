// Node test setup: the engine parses with the DOMParser the page would have; in Node that is @xmldom/xmldom 0.9.12,
// vendored under vendor/xmldom-0.9.12 (the tests need no `npm ci`). Errors of level "error" / "fatalError" throw, as
// libxml2 / the browser refuse ill-formed XML.
// Line ends follow XML 1.0 (CR LF and lone CR become LF), like libxml2 and the browsers; xmldom's default also folds
// U+0085 / U+2028 / U+2029 (XML 1.1 rules), which would change text the helper keeps.
import xmldom from "./vendor/xmldom-0.9.12/lib/index.js";
import { useDomParser } from "../ooxml/xml.js";

const { DOMParser } = xmldom;

export class StrictParser extends DOMParser {
  constructor() {
    super({
      onError(level, message) { if (level !== "warning") throw new Error("XML " + level + ": " + message); },
      normalizeLineEndings: (text) => text.replace(/\r\n?/g, "\n"),
    });
  }
}

useDomParser(StrictParser);
