// ALL-CAPS text of a photo (posters, banners, slide titles) for the cloud core: a line in capitals is sent in title
// case -- short function words in lower case, acronyms and codes kept (ASDP, HER2, CD34, IHC, FISH, WHO, II), the
// packs' cased glossary terms in their own case (Ki-67, PRAME, pT1a) -- so the model reads words, not codes; its
// Vietnamese is put back in capitals (with the marks: "TÔI THAM DỰ"). A day range before a month gets an en dash
// ("1–3 tháng 11"). sameText: a translation that only gives the source back (case, spaces, punctuation aside).
// Pure functions, no DOM.

// short words (four letters or fewer) that are English words, not acronyms: title case
const COMMON = new Set(("AM IS ARE WAS BE BEEN DO DOES DID HAS HAD HAVE CAN MAY WILL NOT NO YES ALL ANY ONE TWO SIX "
  + "TEN FOUR FIVE NINE HOW WHAT WHEN WHY THIS THAT THEY THEM WE YOU OUR MY ME HE HIS SHE HER IT ITS SO IF UP OUT OFF "
  + "ALSO ONLY JUST VERY EACH BOTH SUCH SOME MANY MUCH THAN THEN HERE NEW OLD BEST NEXT LAST LATE FULL HALF YEAR DAY "
  + "DAYS WEEK TIME LIFE WORK TEAM CARE RISK RATE DATA TEST ROLE CASE CELL LUNG BONE SKIN GENE TYPE AGE MASS CYST SIZE "
  + "LOW HIGH GOOD POOR MORE MOST LESS LONG PART AREA SITE LEFT OVER JOIN MEET VIEW OPEN FREE LIVE HALL ROOM MAIN HOME "
  + "PLAN GO GET SEE USE MAKE TAKE KEEP HELP SHOW NEED FIND CITY EAST WEST ASIA BODY HEAD NECK DUCT CORE BASE STEM "
  + "ROOT TALK MEN MICE END KEY TOP BIG WAY OWN SAME WELL FACT LINE NOTE BOOK FORM FOOD WORD STEP BACK SIDE FACE HAND "
  + "EYE EYES LIP NOSE EAR ARM LEG FOOT HIP JAW GUT "
  + "JAN FEB MAR APR JUN JUL AUG SEP SEPT OCT NOV DEC MON TUE WED THU FRI SAT SUN").split(" "));
// title-case function words written in lower case inside a title
const SMALL = new Set("A AN THE AND OR NOR BUT OF IN ON AT BY TO FOR WITH FROM AS VS VIA PER INTO ONTO UPON".split(" "));
const ORDINAL = /^(\d+)(ST|ND|RD|TH)$/;
const ROMAN = /^[IVX]{2,}$/;
const WORD = /[\p{L}\p{N}]+/gu;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the text has capitals and no lower-case letter (at least two capitals). */
export function isAllCaps(text) {
  const t = String(text || "");
  return !/\p{Ll}/u.test(t) && (t.match(/\p{Lu}/gu) || []).length >= 2;
}

/** The glossary terms (the classify setup's hits) written with a capital: kept in their own case. */
export function casedTerms(hits) {
  return (hits || []).filter((t) => typeof t === "string" && /\p{Lu}/u.test(t));
}

function caseWord(w, first) {
  if (/\p{N}/u.test(w)) {
    const m = ORDINAL.exec(w);
    return m ? m[1] + m[2].toLowerCase() : w;
  }
  if (w === "I" || ROMAN.test(w)) return w;
  if (SMALL.has(w) && !first) return w.toLowerCase();
  const n = Array.from(w).length;
  if (!SMALL.has(w) && !COMMON.has(w)) {
    if (n <= 4) return w;                        // an acronym: ASDP, IHC, FISH, WHO, BRAF
    if (!/[AEIOUY]/.test(w)) return w;           // no vowel: a code (PTPRC)
  }
  const [head, ...rest] = Array.from(w);
  return head + rest.join("").toLowerCase();
}

/** The text as the core gets it: unchanged unless ALL-CAPS; then title case (see the module notes). keep: cased
 * terms (casedTerms) written in their own case wherever they occur. */
export function coreCase(text, keep = []) {
  const t = String(text || "");
  if (!isAllCaps(t)) return t;
  const spans = [];  // [start, end, replacement] of the kept terms
  for (const term of [...keep].sort((a, b) => b.length - a.length)) {
    const re = new RegExp("(?<![\\p{L}\\p{N}])" + escapeRe(term) + "(?![\\p{L}\\p{N}])", "giu");
    for (const m of t.matchAll(re)) {
      const s = m.index, e = s + m[0].length;
      if (!spans.some(([a, b]) => s < b && e > a)) spans.push([s, e, term]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let out = "", at = 0, seen = false;
  const firstAt = (pos) => !seen || /[:.!?]\s*$/.test(t.slice(0, pos));
  const words = (part, offset) => part.replace(WORD, (w, k) => {
    const r = caseWord(w, firstAt(offset + k));
    seen = true;
    return r;
  });
  for (const [s, e, term] of spans) {
    out += words(t.slice(at, s), at) + term;
    seen = true;
    at = e;
  }
  return out + words(t.slice(at), at);
}

/** The Vietnamese in capitals when the source was ALL-CAPS. */
export function restoreCaps(vi, source) {
  return isAllCaps(source) ? String(vi || "").toLocaleUpperCase("vi") : String(vi || "");
}

/** "1-3 tháng 11" -> "1–3 tháng 11": a day range right before a month. */
export function dateDash(vi) {
  return String(vi || "").replace(/(\d{1,2})\s*-\s*(\d{1,2})(?=\s+tháng(?![\p{L}]))/giu, "$1–$2");
}

const norm = (s) => String(s || "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** True when two texts are the same after normalisation (case, spaces, punctuation); empty texts never are. */
export function sameText(a, b) {
  return norm(a) !== "" && norm(a) === norm(b);
}
