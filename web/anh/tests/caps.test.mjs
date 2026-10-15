// ALL-CAPS photo text for the cloud core (web/anh/caps.js): sent in normal case with acronyms, codes and the packs'
// cased terms kept, the Vietnamese put back in capitals; date ranges with an en dash; "unchanged" after normalisation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllCaps, coreCase, casedTerms, restoreCaps, dateDash, sameText } from "../caps.js";

test("ALL-CAPS: letters, none lower case, at least two capitals", () => {
  for (const t of ["I AM ATTENDING ASDP 2026", "1-3 NOVEMBER 2026", "SINGAPORE", "HER2 3+", "ĐẠI HỘI"]) assert.equal(isAllCaps(t), true, t);
  for (const t of ["Results", "2026", "I", "x", "", "Ki-67 IN TUMOUR", "pT1a"]) assert.equal(isAllCaps(t), false, t);
});

test("normal case for the core: title case, short function words lower, acronyms and codes kept", () => {
  assert.equal(coreCase("I AM ATTENDING ASDP 2026"), "I Am Attending ASDP 2026");
  assert.equal(coreCase("3RD ANNUAL CONGRESS OF ASIAN SOCIETY OF DIGITAL PATHOLOGY"),
    "3rd Annual Congress of Asian Society of Digital Pathology");
  assert.equal(coreCase("INTELLIGENCE IN EVERY PIXEL: POWERING NEXT GENERATION PATHOLOGY"),
    "Intelligence in Every Pixel: Powering Next Generation Pathology");
  assert.equal(coreCase("1-3 NOVEMBER 2026"), "1-3 November 2026");
  assert.equal(coreCase("ACADEMIA, SINGAPORE GENERAL HOSPITAL"), "Academia, Singapore General Hospital");
  assert.equal(coreCase("SINGAPORE"), "Singapore");
  assert.equal(coreCase("THE ROLE OF IHC AND FISH IN WHO GRADE II TUMOURS"), "The Role of IHC and FISH in WHO Grade II Tumours");
  assert.equal(coreCase("HER2, CD34 AND KI-67 IN BREAST CANCER"), "HER2, CD34 and KI-67 in Breast Cancer");
  assert.equal(coreCase("BRAF NRAS KRAS"), "BRAF NRAS KRAS");
  assert.equal(coreCase("ER PR HER2 STATUS"), "ER PR HER2 Status");
  // the first word and the word after a colon start with a capital even when they are function words
  assert.equal(coreCase("OF MICE AND MEN: THE END"), "Of Mice and Men: The End");
});

test("the packs' cased terms keep their own case (Ki-67, PRAME, pT1a); text that is not ALL-CAPS is left alone", () => {
  const keep = casedTerms(["Ki-67", "PRAME", "pT1a", "biopsy", "spindle cell"]);
  assert.deepEqual(keep, ["Ki-67", "PRAME", "pT1a"]);
  assert.equal(coreCase("KI-67 AND PRAME STAINING", keep), "Ki-67 and PRAME Staining");
  assert.equal(coreCase("STAGE PT1A TUMOUR", keep), "Stage pT1a Tumour");
  assert.equal(coreCase("Results of the study", keep), "Results of the study");
  assert.equal(coreCase("HER2 3+", keep), "HER2 3+");
});

test("the Vietnamese goes back to capitals with its marks when the source was ALL-CAPS", () => {
  assert.equal(restoreCaps("Tôi tham dự ASDP 2026", "I AM ATTENDING ASDP 2026"), "TÔI THAM DỰ ASDP 2026");
  assert.equal(restoreCaps("đại hội thường niên lần thứ 3", "3RD ANNUAL CONGRESS"), "ĐẠI HỘI THƯỜNG NIÊN LẦN THỨ 3");
  assert.equal(restoreCaps("Kết quả nghiên cứu", "Results of the study"), "Kết quả nghiên cứu");
});

test("a day range before a month gets an en dash; other hyphens stay", () => {
  assert.equal(dateDash("1-3 tháng 11 năm 2026"), "1–3 tháng 11 năm 2026");
  assert.equal(dateDash("1 - 3 THÁNG 11 NĂM 2026"), "1–3 THÁNG 11 NĂM 2026");
  assert.equal(dateDash("Ki-67 1-3%"), "Ki-67 1-3%");
  assert.equal(dateDash("Điện thoại 6222-1234"), "Điện thoại 6222-1234");
});

test("unchanged after normalisation: case, spaces, punctuation and marks of form do not count", () => {
  assert.equal(sameText("Singapore", "SINGAPORE"), true);
  assert.equal(sameText("ASDP  2026.", "ASDP 2026"), true);
  assert.equal(sameText("TÔI THAM DỰ ASDP 2026", "I AM ATTENDING ASDP 2026"), false);
  assert.equal(sameText("", ""), false);
});
