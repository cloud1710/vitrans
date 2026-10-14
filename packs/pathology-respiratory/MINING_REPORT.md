# Mining report: pathology-respiratory (draft 0.1.0)

Pack: `pathology-respiratory`, "Giải phẫu bệnh hô hấp" (lung, pleura and airway pathology). Parent: `pathology`.
Status: DRAFT. Nothing committed. Mined 2026-10-13.

## Method

1. **Building the corpus.** I ran OJS site searches with Vietnamese and English keywords on these journals:
   - Tạp chí Nghiên cứu Y học (TCNCYH)
   - Tạp chí Y Dược lâm sàng 108 (YDLS108)
   - Tạp chí Y học Cộng đồng (YHCD)
   - Tạp chí Y Dược học Cần Thơ (YDHCT)
   - VJOL cross-journal search (vjol.info.vn), which also mirrors Tạp chí Y học Việt Nam (VMJ), YHLS Huế, Y Dược học Phạm Ngọc Thạch (YDPNT), Ung thư học and Phẫu thuật tim mạch và lồng ngực
   - VMJ search on its own site (rare-term queries only; common words time out there)

   I also browsed 27 issue pages of Tạp chí Y học TP.HCM (YHTPHCM). These were the Giải phẫu bệnh, Ung bướu, Ngoại lồng ngực and Nội khoa supplements, 2001-2019.

   I kept only hits whose titles were lung-related, then downloaded the full-text PDF and extracted it with `pdftotext`. When no PDF was available I used the abstract (most YHTPHCM issues before 2016). Sixteen web searches restricted to Vietnamese journal domains found a few extra key articles. I also read Bộ Y tế QĐ 4825/QĐ-BYT (2018), the NSCLC guideline (via the vnras.com mirror).
2. **Counting.** Text was Unicode-normalised (NFC), lower-cased and whitespace-collapsed. Old tone placement was folded (hoá -> hóa). Each Vietnamese variant has a regex. Each count is the number of **distinct articles** that contain the variant, tagged by region:
   - S = South
   - C = Huế
   - N = North
   - X = national journals or VJOL mirrors

   I checked the key variants by KWIC (key word in context). That removed false positives such as "kháng thể đặc hiệu" for "thể đặc", "phẫu thuật xâm lấn tối thiểu" for MIA, "âm phế bào" for "phế bào" and "nếu nấm" for "u nấm".
3. **Choosing the canonical term.** The rule is the most frequent variant in Vietnamese peer-reviewed literature. Tie-breaks:
   - the BYT guideline
   - consistency with the parent pack and with the sibling terms in this pack
   - If the parent pack already defines a term, I override it **only when the evidence is clear** (at least about 2x and at least 5 articles). Every override is listed under conflicts. Near-ties and user-chosen parent rules are kept and flagged.
4. **Copyright.** No sentences were copied. Only term pairs, counts and citations were kept (titles, journal, year, URL). Full lists are in `sources.md`.

## Numbers

- **Search requests: about 125.** That is 16 WebSearch calls plus about 109 journal-site OJS search queries. The OJS count includes about 25 endpoint probes, test reruns and failed or timed-out VMJ attempts. There were 69 distinct productive journal queries. This is slightly above the ~120 cap. The YHTPHCM issue browsing (27 pages) and the article/PDF downloads are not counted as searches.
- **Corpus: 715 lung-related articles after de-duplication.**
  - 682 had readable Vietnamese text.
  - 512 were full-text PDFs; the rest were abstracts.
  - 16 PDFs without readable Vietnamese text (legacy font encoding or English-only) were excluded.
  - Largest sources: YHTPHCM 158 (mostly abstracts), TCNCYH 142, YDLS108 138, VMJ 83, YDHCT 45, YHCD 37, YHLS Huế 19.
- **Glossary: 77 rows.**
  - 62 rows cover the 59 seed items. Some seeds were split: typical/atypical carcinoid; mesothelioma plus 3 subtypes; embolism/infarct; adenocarcinoma/lung adenocarcinoma.
  - 15 rows are extra central terms: NSCLC, small cell carcinoma (histologic type), adenosquamous carcinoma, invasive adenocarcinoma, invasive non-mucinous adenocarcinoma, cribriform pattern, predominant, ALK fusion, pleural effusion, cell block, bronchoscopy, CT-guided transthoracic biopsy, interstitial pneumonia, hyaline membrane disease, ground-glass opacity.
- **Dropped seeds:** none. "ROS1" became "ROS1 rearrangement" and "KRAS G12C" became "KRAS G12C mutation".

## Resolved

**Resolved with at least 5 supporting articles:**
- lung adenocarcinoma / adenocarcinoma: ung thư biểu mô tuyến (phổi), 111
- squamous cell carcinoma: ung thư biểu mô vảy, 53 (all "vảy" forms 60)
- small cell lung carcinoma: ung thư phổi tế bào nhỏ, 34
- small cell carcinoma: ung thư biểu mô tế bào nhỏ, 14
- NSCLC: ung thư phổi không tế bào nhỏ, 189
- large cell carcinoma: ung thư biểu mô tế bào lớn, 14
- adenosquamous carcinoma: ung thư biểu mô tuyến-vảy, 19
- LCNEC: ung thư biểu mô thần kinh nội tiết tế bào lớn, 5
- typical / atypical carcinoid: u carcinoid (không) điển hình, 6
- sarcomatoid carcinoma: ung thư biểu mô dạng sarcôm, 6 + BYT
- acinar: dạng chùm nang, 6
- micropapillary: vi nhú, 7
- EGFR mutation: đột biến gen EGFR, 105 (tie with "đột biến EGFR" 106)
- ALK fusion: dung hợp gen ALK, 6
- pleural effusion: tràn dịch màng phổi, 112
- pleural effusion cytology: tế bào học dịch màng phổi, 7
- cell block: khối tế bào, 10
- bronchoalveolar lavage: dịch rửa phế quản phế nang (BAL), 12
- bronchoscopy: nội soi phế quản, 73
- CT-guided biopsy: sinh thiết ... dưới hướng dẫn cắt lớp vi tính, 17 (xuyên thành ngực 35)
- interstitial pneumonia: viêm phổi kẽ, 28
- organizing pneumonia: viêm phổi tổ chức hóa, 6
- honeycombing: (hình ảnh) tổ ong, 12
- sarcoidosis: kept EN, 12
- caseating granuloma: hoại tử bã đậu, 6
- tuberculosis: lao, 181
- AFB: kept EN, 44 (Vietnamese "trực khuẩn kháng acid" 2)
- aspergilloma: u nấm (Aspergillus), 9
- emphysema: khí phế thũng, 23
- bronchiectasis: giãn phế quản, 45
- sclerosing pneumocytoma: u phế bào xơ hóa, 5
- pulmonary embolism: thuyên tắc phổi, 31
- pulmonary infarct: nhồi máu phổi, 8
- atelectasis: xẹp phổi, 67
- TTF-1: 18
- p40: 9
- napsin A: 5
- ground-glass opacity: kính mờ, 34
- type II pneumocyte: tế bào phế nang loại II, 5
- hyaline membrane disease: bệnh màng trong, 15

**Resolved but low evidence (1-4 articles; canonical from the best available form):**
- AIS: 1 + BYT
- MIA "xâm lấn tối thiểu": 3 + BYT
- invasive adenocarcinoma "xâm lấn": 4 + BYT
- invasive mucinous "nhầy xâm lấn": tie 3-3
- invasive non-mucinous "không nhầy": 1
- lepidic: "dạng lepidic" 4; the word "lepidic" is kept in all 13 sources
- papillary "dạng nhú": 4
- solid "dạng đặc": 4
- cribriform "dạng sàng": 1
- STAS "lan tràn qua khoảng không": 2
- visceral pleural invasion "xâm lấn màng phổi tạng": 3 + BYT
- PD-L1 TPS "điểm tỷ lệ tế bào u (TPS)": 1; TPS kept in 7
- ALK rearrangement "tái sắp xếp gen ALK": 4 + BYT
- ROS1 rearrangement: BYT only
- KRAS G12C: 2
- mesothelioma subtypes: 2-3 each
- EBUS-TBNA: 2; EBUS kept in 7
- transbronchial biopsy: tie 4-4
- UIP: 4
- NSIP: 3
- DAD: 3
- hyaline membranes "màng hyalin": 1
- hypersensitivity pneumonitis: 3
- pulmonary hamartoma "u mô thừa": 3; EN kept 4
- alveolar macrophages: 3

**Unresolved (no Vietnamese form in the corpus).** These are constructed from parent-pack components or kept from the parent, and marked UNRESOLVED or LOW in `glossary.csv`:
- atypical adenomatous hyperplasia: "tăng sản u tuyến không điển hình (AAH)". Only "AAH" itself was seen, once.
- fibroblastic foci: "ổ nguyên bào sợi" (parent).
- lymphangitic carcinomatosis: "viêm bạch mạch do ung thư" (parent). The corpus has only one descriptive "lan theo đường bạch huyết".
- BAP1 loss: "mất bộc lộ BAP1" (parent rule: loss of expression = mất bộc lộ).
- non-necrotizing granuloma: "u hạt không hoại tử". The sarcoid literature says "u hạt không bã đậu hóa" (1 article).
- type II pneumocyte *hyperplasia*: the cell name is attested; the whole phrase is not.

**Kept in English (the Vietnamese literature keeps them):**
- lepidic
- sarcoidosis
- marker and gene names: TTF-1, napsin A, p40, p63, PD-L1, EGFR, ALK, ROS1, KRAS, BAP1
- acronyms: STAS, TPS, EBUS(-TBNA), AFB, UIP/NSIP/DAD (in brackets)

## Conflicts with the general pack (`packs/pathology/glossary.csv`)

**Overridden in this pack (clear evidence, at least 2x):**

| EN | parent | this pack | evidence (articles) |
|---|---|---|---|
| squamous cell carcinoma | carcinôm tế bào gai | ung thư biểu mô vảy | "vảy" 60 (N39, X15, S4, C2) vs "gai" 14 (S12). BYT 4825 also uses "tế bào vẩy". |
| small cell lung carcinoma | carcinôm tế bào nhỏ (SCLC) | ung thư phổi tế bào nhỏ (SCLC) | 34 vs "ung thư biểu mô tế bào nhỏ" 14 vs "carcinôm tế bào nhỏ" 2. The parent's own note already calls this mainstream. |
| acinar pattern | kiểu túi tuyến | dạng chùm nang | "chùm nang" 6 (YHCD-1129, VMJ-16504, YDHQS, YDHCT-765 "tuyến chùm nang"...) vs "túi tuyến" 1 (YDHCT-765) vs "tuyến nang" 4 (one hit is adenoid cystic carcinoma). |
| interstitial pneumonia | viêm phổi mô kẽ | viêm phổi kẽ | 28 vs 5. The UIP and NSIP rows follow ("viêm phổi kẽ thông thường / không đặc hiệu"). |

**Not overridden (flagged; parent kept):**

| EN | parent (kept) | competing form | evidence | why kept |
|---|---|---|---|---|
| mesothelioma / malignant mesothelioma | u trung biểu mô | u trung mạc (ác tính màng phổi) | 5 vs 4. South (YHTPHCM 2010-2013, UTH-PNT 2025) and Huế use "trung mạc"; the North (TCNCYH-914, VMJ, YDLS108) uses "trung biểu mô". | near-tie |
| histologic grade | phân độ mô bệnh học (user rule: histologic = mô bệnh học) | độ mô học | lung literature "độ mô học" 9 vs "độ mô bệnh học" 1 | user decision in parent / memory |
| lymphangitis carcinomatosis | viêm bạch mạch do ung thư | (none found) | 0 Vietnamese occurrences | no alternative |
| interstitial lung disease | bệnh phổi mô kẽ | bệnh phổi kẽ | tie 16-16 | tie; parent cites BYT QĐ 1005/2023 |

**The two open questions in the general pack:**

- **carcinoma: "ung thư biểu mô" vs "carcinôm".** The lung literature uses **"ung thư biểu mô"** overwhelmingly: 143 articles (plus "UTBM" 40) vs "carcinôm/carcinom" 34. The split is strongly regional:
  - South: carcinôm 26 vs ung thư biểu mô 17 (YHTPHCM: "carcinôm tuyến", "carcinôm tế bào gai")
  - North: 1 vs 80
  - national journals: 5 vs 41
  - Huế: 2 vs 5

  This pack follows the majority. A Southern house style ("carcinôm tuyến / carcinôm tế bào gai") would need a deliberate user override.
- **lymphoma: "lymphôm" vs "u lympho".** Few lung articles mention it: "u lympho" 13 vs "lymphôm" 2 (both Southern: YHTPHCM, VMJ-16049). This is not a lung term, so there is no row for it here.

**Cross-pack note.** The breast pack translates invasion as "xâm nhập". The lung literature uses **"xâm lấn"**:
- MIA "xâm lấn tối thiểu": 3 vs 1
- lymphovascular "xâm lấn mạch": 8 vs 4
- visceral pleural "xâm lấn": BYT 4825

This pack uses "xâm lấn". That agrees with the parent's "xâm lấn mạch bạch huyết" but differs from the breast pack.

## Items needing a human decision

1. **Mesothelioma naming.** "u trung biểu mô" (parent, North) or "u trung mạc" (South, 5 vs 4).
2. **Carcinoma register for Southern users.** The majority form "ung thư biểu mô" is used here; the HCMC GPB literature uses "carcinôm". Should the user's own house style override it?
3. **Invasive mucinous / non-mucinous adenocarcinoma.**
   - Verb: "xâm lấn" or "xâm nhập" (tie 3-3; same-paper mixing in YHCD-1129).
   - Modifier: "nhầy" / "chế nhầy" / "tiết nhầy" (1 / 2 / 2).
4. **Atypical adenomatous hyperplasia.** No Vietnamese form was found; the proposed "tăng sản u tuyến không điển hình (AAH)" needs approval.
5. **Histologic grade.** The literature says "độ mô học"; the user rule says "mô bệnh học". The user rule is kept.
6. **Transbronchial biopsy.** "sinh thiết xuyên thành phế quản" or "sinh thiết xuyên phế quản" (tie 4-4; BYT uses the latter).
7. **Lymphangitic carcinomatosis and fibroblastic foci.** Both have zero Vietnamese evidence and are kept from the parent. A targeted look at Vietnamese GPB or radiology textbooks would help.

## Limitations

- **The corpus is clinically weighted.** Oncology, respiratory medicine and radiology dominate. Pathology pattern terms (AAH, STAS, fibroblastic foci, hyaline membranes) are rare in it, so their counts are low.
- **YHTPHCM 2001-2015 is mostly abstracts.** Many of those PDFs return 404. Southern usage is therefore under-sampled by text length.
- **Some sources were not searched.**
  - The vjco.vn domain did not resolve.
  - The Huế journal (custom CMS) was not searched directly; only its VJOL mirror was.
  - VMJ site search times out on common words, so VMJ was sampled through rare-term queries and the VJOL mirror.
- **Counts are regex matches per article.** The key variants were checked by KWIC; rare non-lung senses may remain in the "(any)" variants.
- `rules.json` has no term_fixes. No clearly wrong multi-word variant with strong evidence against it was observed.
