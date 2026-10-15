# Mining report -- pathology-hpb 0.1.0 (draft)

Pack: **Giải phẫu bệnh gan mật tụy** (hepatobiliary and pancreatic pathology), parent `pathology`, `draft: true`.
Mined 2026-10-13. Nothing committed to git; only files in `packs/pathology-hpb/` were written.

## Method

1. **Seeds**: the ~60 assigned seed terms. Compound seeds were split into separate English rows because the
   glossary matcher looks up the English key literally (`perihilar / extrahepatic`, `steatohepatitis (MASH / NASH)`,
   `acute pancreatitis / fat necrosis`, `CK7 / CK19`, `autoimmune pancreatitis (IgG4-related)`). 13 extra central terms
   were added (cholangiocarcinoma, Klatskin tumor, combined HCC-CCA, small/large duct type, bridging fibrosis, MASLD,
   liver biopsy, adenomyomatosis, ampulla of Vater, serous cystic neoplasm, microvascular invasion, Edmondson-Steiner
   grade). No seed was dropped. Result: **82 glossary rows**.
2. **Corpus**: Vietnamese full texts (or abstracts where no PDF) were found with web search plus the OJS full-text
   search of the journals, downloaded and converted to text (pdftotext). 121 documents fetched, 2 failed, 4 off-topic
   ones removed (breast, lung, ovary), leaving **116 documents**: 101 "lit" (Tạp chí Y học Việt Nam, Nghiên cứu Y học,
   Y Dược lâm sàng 108, Y học Cộng đồng, Y Dược học Huế, Y học TP.HCM, Y Dược học Phạm Ngọc Thạch, Y Dược học Cần Thơ,
   Y học lâm sàng BV Huế, Điện quang & YHHN, Ung thư học VN, KH&CN Việt Nam, one HVQY doctoral thesis, the Bộ Y tế
   HCC guideline 3129/QĐ-BYT) and 15 "ref" (MSD Manual VN x6, BV Nguyễn Tri Phương x3, Hội Gan mật TP.HCM x3,
   Wikipedia VN, ungthuhoc.vn, BV Tâm Anh).
3. **Counting**: every Vietnamese variant was matched by regex on normalised text (NFC, lower case, old tone placement
   `hoá -> hóa`, legacy-font `ƣ -> ư`). The count is the number of **distinct documents** (lit and ref separately),
   plus total hits. Canonical = most frequent variant in the lit documents, with these tie-breakers: agreement with
   the parent pack, then the pathology-paper form. Full variant tables with up to 3 citations each: `sources.md`.
4. **Consistency**: `packs/pathology/glossary.csv` (read-only) was checked; conflicts are listed below, none is
   silently overridden.
5. No sentence was copied from any paper; only term pairs, counts and citations are stored.

**Searches used: 106** (54 web searches, 4 of them "extended"; 52 OJS full-text search queries on TCNCYH,
TC Y Dược lâm sàng 108, TC Y học Cộng đồng and the VJOL site-wide index; the Tạp chí Y học Việt Nam search endpoint
refused connections, so its articles were taken from web search results and downloaded directly). Plus 10 single-page
fetches.

## Evidence level of the 82 rows (lit documents carrying the canonical variant)

- **>= 3 lit documents: 41 rows** (HCC, cirrhosis, cholangiocarcinoma family, PDAC, SPN, pNET, chronic/acute
  pancreatitis, Whipple, resection margin, portal tract, bile duct, cholestasis, steatosis, steatohepatitis, NASH,
  fibrosis stage, liver biopsy, AIH, Wilson, IgG4, markers...).
- **2 lit documents: 14 rows** -- combined HCC-CCA, small/large duct type, dysplastic nodule, MASLD, ballooning (x2),
  Mallory-Denk bodies, PBC, chronic cholecystitis, adenomyomatosis, MCN, autoimmune pancreatitis, Ki-67 index.
- **1 lit document: 16 rows** -- fibrolamellar, hepatocellular adenoma, lobular inflammation, interface hepatitis /
  piecemeal necrosis, SOS (x2), PSC, ground-glass hepatocytes, gallbladder adenocarcinoma, Rokitansky-Aschoff sinuses,
  serous cystadenoma, serous cystic neoplasm, acinar cell carcinoma, microvascular invasion, Edmondson-Steiner grade.
- **0 lit documents: 11 rows** (see Unresolved).

## Unresolved (built or kept with an English gloss, and why)

| term | draft Vietnamese | why |
| --- | --- | --- |
| ductular reaction | phản ứng tiểu ống mật (ductular reaction) | no Vietnamese source in 106 searches; built term, EN gloss kept |
| biliary intraepithelial neoplasia | tân sinh trong biểu mô đường mật (BilIN) | no VN term; built on the parent pattern CIN = tân sinh trong biểu mô cổ tử cung |
| intraductal papillary neoplasm of the bile duct | u nhú trong ống mật (IPNB) | no VN term; built to mirror IPMN = u nhú nhầy trong ống tụy |
| pancreatic intraepithelial neoplasia | tân sinh trong biểu mô tụy (PanIN) | only Wikipedia-VN; abbreviation kept |
| xanthogranulomatous cholecystitis | viêm túi mật u hạt vàng | no journal hit; "u hạt vàng" (xanthogranuloma) is the established VN dermatology word, BV Tâm Anh lists it among gallbladder lesions |
| pancreatoblastoma | u nguyên bào tụy | Wikipedia-VN; one VMJ list says "ung thư nguyên bào tụy"; chosen to mirror hepatoblastoma = u nguyên bào gan (3 lit) |
| hemosiderosis | nhiễm hemosiderin | MSD-VN page only; "ứ sắt / quá tải sắt" (3 docs) means iron overload, broader |
| alpha-1 antitrypsin deficiency | thiếu hụt alpha-1 antitrypsin | BV Nguyễn Tri Phương + Vinmec; MSD-VN writes "thiếu alpha-1 antitrypsin" |
| fat necrosis | hoại tử mỡ | standard term, seen only on hospital pages, not in the corpus |
| MASH | viêm gan nhiễm mỡ liên quan rối loạn chuyển hóa (MASH) | 2023 nomenclature, MSD-VN only; built to match the MASLD row (2 lit) |
| focal nodular hyperplasia | tăng sản dạng nốt khu trú (FNH) | 4 variants, 1 source each (see decisions) |

## Conflicts with the general pack (`packs/pathology`)

1. **carcinoma (open question)** -- HPB literature: "ung thư biểu mô" in 59 lit docs vs "carcinôm/carcinom" in 6
   (ratio ~10:1). Supports the parent's "ung thư biểu mô". "carcinôm" appears only in a few HCMC papers
   (e.g. "carcinôm tế bào gan", 3 docs vs 33 for "ung thư biểu mô tế bào gan").
2. **lymphoma (open question)** -- not encountered in the HPB corpus; no evidence either way.
3. **perineural invasion** -- parent "xâm lấn quanh thần kinh" **kept**. Evidence against: HPB pathology papers
   (BV K, Bạch Mai iCCA, Bạch Mai PDAC) write "xâm nhập (quanh) thần kinh": 5 lit docs / 39 hits vs "xâm lấn (quanh)
   thần kinh" 4 lit docs / 8 hits. The breast pack already chose "xâm nhập".
4. **vascular / lymphovascular / microvascular invasion** -- parent "xâm lấn" kept ("microvascular invasion =
   xâm lấn vi mạch", 1 lit). Organ-wide "xâm lấn mạch" 22 lit docs vs "xâm nhập mạch" 11, but the 22 are mostly
   surgery/imaging papers about gross invasion of the portal vein / SMV; the histology sections of pathology papers
   use "xâm nhập mạch". Lymphovascular: 3 vs 3 docs (hits 11 "xâm nhập" vs 3 "xâm lấn").
5. **macrovesicular steatosis = "thoái hóa mỡ giọt lớn" (parent)** -- HPB literature uses the root "nhiễm mỡ"
   (23 lit docs) far more than "thoái hóa mỡ" (5). This pack sets steatosis = nhiễm mỡ; a document with
   "macrovesicular steatosis" will get the parent's "thoái hóa mỡ giọt lớn" next to "nhiễm mỡ". Suggest the parent
   switch to "nhiễm mỡ giọt lớn" (human decision; "giọt lớn/nhỏ" itself has almost no evidence).
6. **sclerosing = "xơ hóa" (parent)** -- primary sclerosing cholangitis: "viêm đường mật xơ cứng nguyên phát"
   (1 lit + MSD-VN body) vs "viêm đường mật xơ hóa nguyên phát" (1 lit); MSD-VN title and Vinmec use
   "viêm xơ đường mật tiên phát". Draft follows the majority ("xơ cứng"), flagged.
7. **histologic grading = "phân độ mô bệnh học" (parent, user rule)** -- HPB papers write "độ mô học" (13 lit docs)
   vs "độ mô bệnh học" (1). No row added; the parent rule stands.
8. **acinar pattern = "kiểu túi tuyến" (parent)** -- acinar cell carcinoma: "tế bào chùm nang" (1 lit + Wikipedia)
   vs "tế bào nang tuyến" (MSD-VN); "túi tuyến" not seen for pancreatic acinar cells. Draft "ung thư biểu mô tế bào
   chùm nang", flagged.
9. **expression (IHC) = "bộc lộ", KHÔNG "biểu hiện" (parent)** -- HPB IHC papers write "biểu hiện" + marker
   (e.g. "biểu hiện hóa mô miễn dịch của Ki67", "biểu hiện protein p16"): 7 lit docs / 62 hits vs "bộc lộ" + marker
   1 lit doc / 6 hits. No row added; the parent rule stands (FYI for the parent owner).
10. Consistent with the parent: hepatocellular carcinoma, resection margin = diện cắt (19 lit, "lề cắt" 0),
   adenoma = u tuyến, hyperplasia = tăng sản, dysplasia = loạn sản, fibrosis = xơ hóa.

## Items needing a human decision

1. **Register of carcinoma names** -- the clinical short forms are more frequent: "ung thư đường mật" 19 lit docs vs
   "ung thư biểu mô đường mật" 11; "ung thư bóng Vater" 12 vs "ung thư biểu mô (tuyến) bóng Vater" 2;
   "ung thư đường mật vùng rốn gan" 6 vs "ung thư biểu mô đường mật vùng rốn gan" 1. The draft uses the
   "ung thư biểu mô ..." forms (pathology register, parent carcinoma rule, used by the WHO-2019 pathology papers).
   The cholangiocarcinoma test accepts both forms.
2. **ballooning** -- "thoái hóa nước (ballooning)" (2 papers, one Huế group) vs "tế bào gan dạng bóng / trương to
   dạng bóng" (108 review, BV Nguyễn Tri Phương) vs "phồng to" (1) vs "phình to" (MSD-VN).
3. **interface hepatitis** -- draft "hoại tử mối gặm (interface hepatitis)" (thesis HVQY 2018 + BV Nguyễn Tri
   Phương, piecemeal-necrosis synonym) vs "viêm gan bề mặt" (1, TCNCYH AIH case report).
4. **perineural / vascular invasion: xâm lấn vs xâm nhập** (conflict 3-4).
5. **PSC: xơ cứng vs xơ hóa** (conflict 6).
6. **FNH** -- "tăng sản dạng nốt khu trú" (MSD-VN; BYT 3129 has "tăng sinh dạng nốt khu trú") vs "tăng sản nốt khu
   trú" (108 review) vs "tăng sản thể nốt khu trú" (Bạch Mai case report).
7. **steatosis root** for the parent's macrovesicular row (conflict 5).
8. **Built terms** in the Unresolved table (ductular reaction, BilIN, IPNB, PanIN, XGC, pancreatoblastoma).

### Changes 2026-10-15 18:48 (version 0.1.4)

- chronic viral hepatitis = "viêm gan siêu vi mạn tính" (was "viêm gan virus mạn tính"), following medicine M9 (the
  recommended column he accepted): viral hepatitis = "viêm gan siêu vi" (medicine sources 7 docs, S5, vs "viêm gan
  virus" S2). This pack's own sources for the old value were not Southern. One test added.

## Caveats

- Counts are relative to this corpus (116 documents), not exhaustive journal-wide counts.
- Several Tạp chí Y học Việt Nam PDFs start with the tail of the previous article; one (VMJ 4656) was kept because
  its pancreatic part is the source of the acinar-cell / pancreatoblastoma variants.
- Two Huế papers (2014, 2015) are by the same group; they count as two documents but one usage source.
- rules.json is empty: no clearly wrong variant with strong counter-evidence was seen in this organ literature.
- The draft builds into a registry (`tools/build_registry.py --include-drafts`, scratch output) and the matcher picks
  it (with the parent) for an HPB text but not for a breast text.
