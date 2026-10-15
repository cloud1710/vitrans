# Mining report: medicine-oncology (Ung thư học) 0.1.0, draft

Date 2026-10-15. Child of `medicine`. The basic oncology pack asked by the owner on 2026-10-15 ("Cào nội khoa, ngoại
khoa, sản khoa, ung thư và chẩn đoán hình ảnh gói cơ bản"); scope from docs/packs/plans/noi_khoa.md (row and section
7 of `medicine-oncology`): systemic therapy and lines, radiotherapy basics, response and survival outcomes, toxicity,
performance status, tumour markers, clinical staging words, tumour board, palliative / supportive care,
survivorship, clinical-trial words.

## Result

- 276 glossary rows, 28 detect keywords, 0 term fixes (no wrong form with strong evidence yet), 15 synthetic tests.
- 22 rows reuse the value of another pack (pathology, medicine, molecular-pathology, radiology, surgery,
  pathology-breast): see sources.md. No key gets a different value from any pack of this branch nor from the drafts
  `radiology`, `obgyn`, `nutrition`, `pathology-hemato` (branches) and `surgery` (worktree, uncommitted at the time):
  tools/check_packs.py on all of them together reports only one error, `low birth weight` between nutrition and
  obgyn, not this pack.
- One candidate row was dropped because molecular-pathology holds it with another value: acquired resistance
  (molecular-pathology: "kháng thuốc thứ phát").
- Keys left out on purpose: resectable / unresectable and palliative surgery (surgery draft holds "cắt bỏ được",
  "không cắt bỏ được", "phẫu thuật tạm thời"); neoadjuvant chemoradiotherapy (pathology-gi: "hóa xạ trị tiền phẫu");
  bare cycle, fraction, induction, resistance (ambiguous; owners.csv bans induction and resistance); drug names
  (INN as in the source, owner decision 8).

## Method

1. Seed list of ~350 English terms from the plan scope, trimmed to 276 rows the model may get wrong or where a Southern
   / national choice is needed.
2. Vietnamese variants counted in full texts of the shared corpus (291 Vietnamese documents, about 30 of them clinical
   oncology), by document and region (S / N / H / B); counting script kept locally, counts in sources.md.
3. Rule: Southern form first, national when the South has none; for the survival family the owner pack's form
   ("sống còn", pathology) is extended to PFS / DFS / RFS / EFS so the family stays one word.
4. Values of keys owned by other packs reused; a validator run over this branch plus the 5 sibling drafts.

## Traffic (run pack-2026-10-15-medicine-oncology)

| Host | Requests | Note |
|---|---|---|
| tapchinghiencuuyhoc.vn | 10 | robots.txt in the corpus allows all but /cache/ |
| tapchiyhoctphcm.vn | 7 | robots.txt allows all; 1 more URL answered from the cache |
| jmp.huemed-univ.edu.vn | 4 | robots.txt 404 (allowed) |
| tapchi.ctump.edu.vn | 4 | robots.txt: `*` allowed except /cache/, Crawl-delay 20 honoured (--delay 20); downloads are disallowed only for named crawlers (GPTBot, ChatGPT-User, bingbot...), not for this tool's user agent |
| tcydls108.benhvien108.vn | 3 | robots.txt allows all but /cache/ |
| total | 28 / 40 | no 429 / 403 / reset; no new host (every robots.txt was already in the corpus) |

WebSearch 12 / 30, WebFetch 0 / 10. tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, hoiyhoctphcm.org.vn,
bthh.org.vn not contacted (a search result listed an msdmanuals page; it was not opened).

## Validation

- tools/check_packs.py packs: 0 errors (1 warning in `pathology`, not this pack).
- Selection (registry with drafts, SYNTHETIC texts): oncology clinic note (NSCLC, first-line chemo-immunotherapy,
  RECIST, febrile neutropenia, palliative RT) -> [medicine-oncology 0.292, medicine (parent)]; trial abstract ->
  [medicine-oncology 0.324, medicine]; breast pathology report -> [pathology] (oncology 0.012, 1 term);
  post-neoadjuvant rectal pathology report -> [pathology] (oncology 0.037, 2 terms, 1 detect); internal medicine
  case -> [medicine] (oncology 0.0).
- tools/build_lexicon.py run (web/engine/medical_words.json rebuilt; --check up to date); helper pytest: 1129
  passed, 4 skipped.
- tools/eval_pack.py medicine-oncology --dir --family with the real model (gemma4:e4b on the GPU, idle at start:
  1 %, 912 MiB): 30 / 30 (15 oncology + 15 medicine tests).

## Unresolved terms (no corpus count; family rule, guideline form or search result only)

induction chemotherapy (hóa trị dẫn đầu, 0; "điều trị tấn công" 2 docs is the leukaemia sense), perioperative
chemotherapy, dose intensity / relative dose intensity, dose-limiting toxicity, maximum tolerated dose (1),
total neoadjuvant therapy (YDLS108 title seen in search), antibody-drug conjugate (kháng thể liên hợp thuốc),
chemoimmunotherapy, CAR T-cell therapy, stereotactic body radiotherapy (YDLS108 titles seen in search; 0 in
extracted text), short-course and hypofractionated radiotherapy, conventional fractionation, GTV / CTV / PTV ("thể
tích đích" S1 vs "thể tích bia" N1), radiation pneumonitis / dermatitis, pseudoprogression, time to progression,
recurrence-free / event-free / cancer-specific survival (family rule), hazard ratio (tỷ số nguy cơ, 0), hand-foot
syndrome (vnras title in search; corpus "hội chứng tay-chân" 1), cardiotoxicity (1 doc per form), immune-related
pneumonitis, best supportive care, survivorship care, second primary cancer, oligometastatic disease,
platinum-sensitive.

## Decisions for the owner (recommendation by the 2026-10-14 rule: Southern first)

1. Survival family. Kept pathology's "sống còn toàn bộ" (S6 N1) against "sống thêm toàn bộ" (S5 N13) and extended
   it: PFS = "sống còn không bệnh tiến triển" (S1) vs "sống thêm bệnh không tiến triển" (S1 N4); DFS = "sống còn
   không bệnh" (S4) vs "sống thêm không bệnh" (S3 N9). Recommend: keep "sống còn" (Southern).
2. advanced stage. pathology holds "giai đoạn tiến xa" (S5 N3); the corpus has "giai đoạn muộn" S15 N10.
   Recommend: switch pathology and this pack to "giai đoạn muộn" (Southern majority); keep "tiến xa tại chỗ" for
   locally advanced (S2), because "tiến triển tại chỗ" is local progression in radiology.
3. performance status. pathology "tổng trạng" (S4 N0) vs "thể trạng" (S8 N11, also the body-build sense) vs "toàn
   trạng" (S1 N12). Recommend: keep "tổng trạng" (only a Southern form; same word as medicine's general condition).
4. neoadjuvant / adjuvant. surgery and pathology-breast hold "tân bổ trợ" (S2 N4); "tân hỗ trợ" is S4 N0 H1, and
   adjuvant "bổ trợ" vs "hỗ trợ / bổ túc" is a tie in the South. Recommend: keep "tân bổ trợ / bổ trợ", because
   "điều trị hỗ trợ" (12 docs) also means supportive treatment.
5. neoadjuvant chemoradiotherapy. pathology-gi holds "hóa xạ trị tiền phẫu" (2 docs) while this pack writes
   "hóa trị tân bổ trợ". Recommend: leave pathology-gi as is (it has the count); revisit if you want one word.
6. neutropenia. "giảm bạch cầu trung tính" vs "giảm bạch cầu hạt" tie (S2 / S2); febrile neutropenia follows
   ("sốt giảm bạch cầu hạt" S1 is the only Southern hit). Recommend: "trung tính", the same word as neutrophil in
   pathology-hemato and medicine.
7. tumour marker. "chất chỉ điểm khối u" (4 docs, "chỉ điểm khối u" 5) vs "dấu ấn ung thư" (2). Recommend: "chất chỉ
   điểm khối u" (closes the plan's open question).
8. induction chemotherapy. "hóa trị dẫn đầu" (BV K usage, 0 in corpus) vs "hóa trị tấn công" (leukaemia sense).
   Recommend: "hóa trị dẫn đầu" for solid tumours; tell me if your hospital says otherwise.
9. surgery draft rows (not in this pack): palliative surgery = "phẫu thuật tạm thời" while the oncology family is
   "giảm nhẹ" (S13); unresectable = "không cắt bỏ được" while the corpus has "không thể phẫu thuật" 8 docs vs "không
   thể cắt bỏ" 1. Recommend: surgery switches to "phẫu thuật giảm nhẹ" and "không thể cắt bỏ"; then this pack can
   add the rows.
10. Phase words. "pha III" (4 docs) chosen over "giai đoạn III" so trial phases never read as disease stages.
    Recommend: keep.

### Decided 2026-10-15 18:48 (version 0.1.1)

His answer at 18:48: "1. Tổ hợp gen 2. Tân bổ trợ 3. Giai đoạn tiến xa 4. Ok hoá trị dẫn đầu"; items he did not mention follow the recommended column (as the coordinator told him). Rule order: his explicit choices > his earlier corrections > house rules > Southern frequency.

- O1 survival family "sống còn" (OS, PFS, DFS): recommended column, unchanged.
- O2 advanced stage = "giai đoạn tiến xa" (his choice 3): pathology's value kept, NOT "giai đoạn muộn"; locally advanced
  = "tiến xa tại chỗ"; advanced cancer follows.
- O3 performance status = "tổng trạng": recommended column.
- O4 neoadjuvant = "tân bổ trợ", adjuvant = "bổ trợ" (his choice 2) in every pack: surgery, this pack,
  pathology-breast unchanged; pathology-gi changed (O5).
- O5 superseded by choice 2: `pathology-gi` neoadjuvant chemoradiotherapy = "hóa xạ trị tân bổ trợ" (was "hóa xạ trị
  tiền phẫu", 0.1.3 -> 0.1.4). Bad news: the GI pack's own count favoured "tiền phẫu" (5 docs vs 1).
- O6 neutropenia = "giảm bạch cầu trung tính" (febrile follows); O7 tumour marker = "chất chỉ điểm khối u"; O10 "pha
  III": recommended column.
- O8 induction chemotherapy = "hóa trị dẫn đầu" (his choice 4; still 0 docs in the corpus).
- O9 `surgery` switched to palliative surgery = "phẫu thuật giảm nhẹ" and unresectable = "không thể cắt bỏ"; both rows
  added here with the same values (no conflict).
- Two tests added (induction chemotherapy + advanced stage; palliative surgery + unresectable).
