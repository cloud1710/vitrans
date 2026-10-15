# Mining report: medicine (Nội khoa) 0.1.0, draft

Date 2026-10-15. Root pack (no parent), basic internal-medicine layer asked by the owner on 2026-10-15 ("Cào nội khoa,
ngoại khoa, sản khoa, ung thư và chẩn đoán hình ảnh gói cơ bản"); scope from docs/packs/plans/noi_khoa.md: history and
examination, vital signs, routine labs and units, admission / discharge, drug routes / doses / ADR, common syndromes
across organ systems, geriatrics. Oncology terms are left to `medicine-oncology`.

## Result

- 311 glossary rows, 30 detect keywords, 4 term fixes (chronic: "mãn tính" -> "mạn tính"; diabetes mellitus / diabetes:
  "tiểu đường" -> "đái tháo đường"; low-grade fever: "sốt độ thấp" -> "sốt nhẹ"), 15 synthetic tests.
- 305 rows carry a corpus count (sources.md); 6 rows are textbook / guideline forms without a count.
- No key conflicts with the packs in this branch nor with the drafts `nutrition` 0.1.1 and `pathology-hemato` 0.1.1
  (other branches): tools/check_packs.py on all of them together = 0 errors. Three values were changed to the owner
  pack's value (end-stage renal disease, nasogastric tube, dysphagia: see decisions 7-8).

## Method

1. Seed list (~450 English terms) from the plan's medicine scope; British spellings and plurals left out (the matcher
   folds them), then trimmed to rows the model may get wrong or where a Southern / national choice is needed.
2. Vietnamese variants counted in full texts of the shared corpus D:/vitranslate-corpus (253 Vietnamese documents at
   counting time, 21 downloaded for this pack), by document and by region (S / N / H / B = Ministry of Health), after
   NFC and old-style tone folding. Southern form first; national / BYT form when the South has none or ties.
3. Values of keys owned by other packs reused (pathology, pathology-kidney, pathology-hemato, pathology-respiratory,
   pathology-hpb, pathology-endocrine, nutrition).

## Traffic (run pack-2026-10-15-medicine)

| Host | Requests | Note |
|---|---|---|
| tapchiyhoctphcm.vn | 11 | robots.txt allows all; internal medicine / geriatrics / pharmacy articles |
| jmp.huemed-univ.edu.vn | 6 | robots.txt 404 (allowed) |
| who-umc.org | 2 | robots.txt (allows `*`) + BYT Hướng dẫn quốc gia về Cảnh giác dược 2015 |
| benhviendakhoabaria.vn | 2 | robots.txt (allows /sites/, crawl-delay 10 s honoured) + BYT QĐ 5481/2020 |
| total | 21 / 40 | no 429 / 403 / reset |

- tapchi.ctump.edu.vn: robots.txt read once by hand (curl, outside corpus_fetch) because the corpus had no copy of it
  for this check; it disallows article downloads for AI crawlers (GPTBot, ChatGPT-User...), so no new download was
  made there; the 19 Cần Thơ documents already in the corpus were reused.
- WebSearch 6 / 30, WebFetch 0 / 10. tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, hoiyhoctphcm.org.vn
  not contacted.

## Validation

- tools/check_packs.py packs: 0 errors (1 warning in `pathology`, not this pack).
- Selection (registry with drafts, synthetic texts): internal-medicine case -> [medicine] cosine 0.403 (26 terms, 17
  detect hits); geriatrics paragraph -> [medicine] 0.301; breast pathology report -> [pathology] (medicine 0.0);
  glioma report -> [pathology] (medicine 0.0).
- tools/build_lexicon.py run; helper pytest: 1129 passed, 4 skipped.
- tools/eval_pack.py medicine --dir --family with the real model (gemma4:e4b, GPU idle at start, 0-1 %): first run
  14/15 (the model dropped "myocardial" in the anaemia / ischaemia test); rows "ischemia" and "myocardial ischemia"
  added; second run 15/15.

## Unresolved terms (LOW evidence or no count)

hematochezia (tiêu máu, 2 docs, Southern), dysuria (tiểu buốt; "tiểu khó" also means difficult voiding), delirium
(mê sảng 2 vs Southern "sảng" 3), ecchymosis (vết bầm), rhonchi (ran ngáy, 0), nocturia (0), pitting edema (0),
capillary refill time (0), cardiopulmonary resuscitation (hồi sinh tim phổi, 0), comprehensive geriatric assessment
(0), potentially inappropriate medication (0), pressure ulcer (loét do tì đè, 0), polypharmacy (đa thuốc 2),
activities of daily living (1), drug-induced liver injury (0), hepatotoxicity (0), elimination half-life (thời gian
bán thải, Dược thư; corpus "bán hủy" 3), nasal cannula, urinary catheter, admission / discharge diagnosis, discharge
summary (giấy ra viện, official form name, 0), on examination (khi khám), afebrile, paroxysmal nocturnal dyspnea,
palpation / percussion (sờ / gõ).

## Decisions for the owner (recommendation by the 2026-10-14 rule: Southern first)

1. vital signs: "sinh hiệu" (S3) vs "dấu hiệu sinh tồn" (S2, 6 docs nationally). Recommend "sinh hiệu".
2. general condition: "tổng trạng" (S2) vs "thể trạng" (18 docs, partly the body-build sense). Recommend "tổng trạng"
   (same word as pathology's performance status).
3. infection family (infection, sepsis, septic shock, urinary tract infection, upper respiratory tract infection):
   "nhiễm trùng" (S40) vs "nhiễm khuẩn" (S20, BYT). Recommend "nhiễm trùng" (nutrition already uses it).
4. anticoagulant "thuốc kháng đông" (S8) vs "chống đông" (S6, BYT); antiplatelet follows ("kháng kết tập tiểu cầu",
   BYT "chống"). Recommend "kháng".
5. discharge = "xuất viện" (S13) vs "ra viện" (N10); admission = "nhập viện" (48) vs "vào viện" (32). Recommend
   "xuất viện" / "nhập viện"; "lý do vào viện" kept for chief complaint (5 docs).
6. blood glucose family: "đường huyết" (S8) vs BYT "glucose máu" (S5); FPG / OGTT keep the BYT wording ("glucose huyết
   tương lúc đói", "nghiệm pháp dung nạp glucose đường uống"). Recommend as built.
7. end-stage renal disease: pathology-kidney holds "suy thận giai đoạn cuối"; corpus "bệnh thận giai đoạn cuối" 7 docs
   vs 3 (KDIGO wording). Reused the kidney value; recommend switching both packs to "bệnh thận giai đoạn cuối".
8. proteinuria: pathology-kidney "đạm niệu" (S5) vs "protein niệu" (14 docs, S5 N7): tie in the South. Reused; keep.
9. viral hepatitis: pathology-hpb "viêm gan virus" (chronic viral hepatitis) vs Southern "viêm gan siêu vi" (S5 vs S2).
   Reused "viêm gan virus"; by the rule the South form wins: change both if you agree.
10. complete blood count: pathology-hemato "tổng phân tích tế bào máu" (S1 N3) vs "công thức máu" (10 docs, S3).
    Reused; by the rule "công thức máu" wins: change both if you agree.
11. calcium = "canxi" (24 docs) vs Dược thư "calci" (17). Recommend "canxi".
12. Generic words for a shared include (`_shared/clinical_core.csv`), not added here: patient, symptom, sign,
    diagnosis, treatment, complication, mortality, in-hospital mortality, follow-up, length of stay, retrospective /
    prospective / cross-sectional study, risk factor, prognosis and recurrence (owned by pathology), academic titles
    (pathology). Recommend building that include once all 5 miners have finished.
13. half-life: only "elimination half-life" is held here; bare "half-life" (radioactive "bán hủy") left to radiology.

### Decided 2026-10-15 18:48 (version 0.1.1)

His answer at 18:48: "1. Tổ hợp gen 2. Tân bổ trợ 3. Giai đoạn tiến xa 4. Ok hoá trị dẫn đầu"; items he did not mention follow the recommended column (as the coordinator told him). Rule order: his explicit choices > his earlier corrections > house rules > Southern frequency. The coordinator's M numbers map to the items above as M1-M6 = 1-6, M7 = 11, M8 = 7, M9 = 9, M10 = 10, M11 = 8.

- M1 vital signs = "sinh hiệu"; M2 general condition = "tổng trạng"; M3 infection family = "nhiễm trùng" (infection,
  sepsis, septic shock, UTI, upper respiratory tract infection); M4 "thuốc kháng đông" / "kháng kết tập tiểu cầu";
  M5 "nhập viện" / "xuất viện"; M6 "đường huyết", FPG / OGTT in the QĐ 5481 wording; M7 calcium = "canxi"; M11
  proteinuria = "đạm niệu" (= pathology-kidney): values unchanged, notes say "owner, recommended column 2026-10-15
  18:48 (M#)".
- M8 end-stage renal disease = "bệnh thận giai đoạn cuối" (was "suy thận giai đoạn cuối"), here and in
  `pathology-kidney` (0.1.2 -> 0.1.3). Bad news: the kidney pack's own count favoured "suy thận giai đoạn cuối" (7 docs,
  S5 N2); the recommendation came from this pack's corpus (7 vs 3) and KDIGO wording.
- M9 viral hepatitis = "viêm gan siêu vi" (was "viêm gan virus"), here and `pathology-hpb` chronic viral hepatitis =
  "viêm gan siêu vi mạn tính" (0.1.3 -> 0.1.4).
- M10 complete blood count = "công thức máu" (was "tổng phân tích tế bào máu"), here and in `pathology-hemato`
  (0.1.1 -> 0.1.2).
- Items 12 (shared clinical include) and 13 (half-life) were not decisions; unchanged.
- One test added (CBC, viral hepatitis, ESRD with must_not on the old values).
