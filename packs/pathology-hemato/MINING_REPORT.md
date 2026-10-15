# MINING_REPORT: pathology-hemato 0.1.1 (draft, 2026-10-15)

Gói "Huyết học GPB (hạch - lách - tủy xương)", con của `pathology` 0.2.1. Gộp hai mục hàng đợi #5
`pathology-lymphnode` và #6 `pathology-bonemarrow` theo yêu cầu 2026-10-15 ("cào 2 gói: ... pathology hematopathology").

## 1. Tin xấu trước

- **Run tải bị dừng ngay request đầu.** `tools/corpus_fetch.py --run pack-2026-10-15-pathology-hemato --max-total 40`
  gửi đúng 1 request (`https://bthh.org.vn/robots.txt`, BV Truyền máu Huyết học TP.HCM) và nhận lỗi transport
  `SSL: UNEXPECTED_EOF_WHILE_READING`. Theo luật, công cụ khóa cả run và đưa bthh.org.vn vào `counter.json` "blocked".
  Tôi không mở run mới. Nguồn phía Nam tốt nhất cho tủy xương (trang GPB của BV TMHH) vì vậy chỉ có tiêu đề qua WebSearch.
- Bằng chứng cho tủy xương mỏng: 5 bài Y học TP.HCM (2017-2024, lấy qua WebFetch), QĐ 1514/QĐ-BYT, 3 trang BVNTP. Khoảng
  1/3 số dòng là BUILT (ghép từ gói cha / bảng sửa của người dùng) hoặc chỉ có 1 tài liệu.
- (0.1.0) `helper` pytest: 982 passed, **1 failed**: `test_the_committed_lexicon_is_up_to_date`. Nguyên nhân gốc: từ commit 447d678
  `web/engine/medical_words.json` được dựng từ mọi thư mục pack (kể cả draft); thêm một pack mới làm lexicon lỗi thời.
  Đã kiểm: bỏ thư mục gói ra thì `build_lexicon.py --check` báo "up to date". Phạm vi commit của tôi chỉ gồm
  `packs/pathology-hemato/` và dòng hàng đợi, nên **chưa** chạy lại `tools/build_lexicon.py`: khi merge cần chạy nó và
  commit `web/engine/medical_words.json`. **Đã làm ở 0.1.1** (xem mục 7): 983 passed.

## 2. Phương pháp

- Đọc `docs/packs/miner_prompt.md`, `docs/PACKS.md`, roadmap mục 4, review 2026-10-13, gói cha 0.2.1 (glossary +
  rules), các gói anh em, `packs/_shared/owners.csv`.
- Kho chung `D:/vitranslate-corpus`: trích chữ 205 tệp sẵn có (pypdf / lxml) vào thư mục tạm, đếm biến thể theo số tài
  liệu, phía Nam trước. Bốn PDF Y học TP.HCM đời cũ có lớp chữ hỏng (dấu cách chen giữa chữ cái): đếm thêm sau khi bỏ dấu
  cách, chỉ trên các tệp đó.
- Bảng người dùng đã sửa (`translator/glossary/glossary_review.csv`, `learned.csv`, 271 dòng liên quan huyết học) là
  nguồn house style: megakaryocyte = mẫu tiểu cầu, cellularity = mật độ tế bào, MDS = hội chứng loạn sản tủy, ring
  sideroblasts = nguyên hồng cầu sắt vòng, MPN = tân sinh tăng sinh tủy, splenectomy = cắt lách... Các dòng có trước
  quyết định 2026-10-14 (lymphôm, tế bào lympho, vùng viền, tế bào áo) được chuyển theo quyết định mới.
- Quyết định ràng buộc áp dụng: lymphom (không mũ, không "u lympho"), carcinom / sarcom, lymphô bào, vùng áo nang, vùng
  rìa, bệnh bạch cầu, tân sinh, mô bệnh học, không điển hình, bộc lộ (protein).
- Không ghi đè dòng nào của gói cha: hai dòng nháp trùng khóa gói cha (amyloidosis, tingible body macrophage) đã bị bỏ;
  AL amyloidosis viết theo dạng gói cha "thoái hóa dạng bột".

## 3. Lưu lượng

| Kênh | Số lượng | Chi tiết |
|---|---|---|
| corpus_fetch (run pack-2026-10-15-pathology-hemato) | 1 / 40 | bthh.org.vn 1 (lỗi SSL, run dừng) |
| WebFetch | 8 / 10 | tapchiyhoctphcm.vn 5 (PDF), bvnguyentriphuong.com.vn 3 |
| WebSearch | 18 / 30 | luôn có allowed_domains hoặc blocked_domains |
| Host cấm | 0 | không gọi tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, hoiyhoctphcm.org.vn |

Không có 429 / 403. Lỗi duy nhất là SSL EOF của bthh.org.vn.

## 4. Kết quả (0.1.1)

- 249 dòng glossary, 2 term fix (megakaryocyte; myelodysplastic syndrome), 22 test tổng hợp, 28 từ khóa detect.
- `tools/check_packs.py packs`: 0 lỗi, 1 cảnh báo (trùng khóa ở gói khác, có từ trước); gói này không ghi đè gói cha.
- `tools/build_lexicon.py` chạy lại, `web/engine/medical_words.json` commit cùng 0.1.1; `helper` pytest: 983 passed,
  4 skipped, 0 failed.
- Chọn gói (registry nháp, `select_packs` mặc định) trên 5 đoạn tổng hợp: hạch DLBCL 0.165, tủy MDS 0.311, tủy CML/MPN
  0.252, hạch phản ứng 0.253, đa u tủy 0.125: gói được chọn cả 5 lần, cùng gói cha. Ba đoạn dò chéo (carcinom tuyến giáp,
  MALT dạ dày, carcinom vú): gói không được chọn (cosine 0.000 / 0.034 / 0.000).
- `tools/eval_pack.py pathology-hemato --family`, mô hình thật gemma4:e4b trên GPU (nvidia-smi 0 %, `ollama ps` chỉ có
  gemma4:e4b đang nạp sẵn): 68/71. Test của gói 21/22: câu co-expression ra "bộc lộ đồng thời CD5 và cyclin D1" thay vì
  "đồng bộc lộ" (đúng nghĩa, không dùng "biểu hiện"; ở 0.1.0 câu này đạt, mô hình dao động); 2 test hỏng còn lại là test tế
  bào gan của gói cha (có từ trước). 0.1.0: 62/64 (15/15).

## 5. Thuật ngữ chưa giải quyết (giữ tiếng Anh / chú thích tiếng Anh, người dùng đồng ý 2026-10-15)

touch imprint, emperipolesis, dermatopathic lymphadenopathy, mastocytosis / mast cell ("tế bào mast" hay "dưỡng bào"),
blastic plasmacytoid dendritic cell neoplasm (nay để nguyên tên tiếng Anh), lymphoid aggregate, monocytoid B cells,
M:E ratio, paratrabecular, interstitial pattern, PTGC, Waldenström macroglobulinemia, plasmablastic lymphoma, smoldering
myeloma, dry tap, micromegakaryocytes, white / red pulp (chỉ nguồn phổ thông), splenic marginal zone lymphoma, chronic
neutrophilic leukemia (0 tài liệu).

## 6. Quyết định (2026-10-15)

Thứ tự áp dụng: sửa của chính người dùng > house rule > tần suất phía Nam.

1. **MDS** = "hội chứng loạn sản tủy"; dyserythropoiesis = "loạn sản dòng hồng cầu" (dysgranulopoiesis, dysmegakaryopoiesis
   cùng mẫu). Decided by the owner 2026-10-15 ("đồng ý").
2. **blast vs -blastic: owner 2026-10-15 17:48** ("có blastic thì mới nguyên bào, không có blastic thì không"). Danh từ
   blast giữ "blast": blast = blast, increased / excess blasts = tăng blast, blast count = số lượng blast, MDS with excess
   blasts = MDS tăng blast (MDS-EB), MDS-IB / MDS-5q cùng mẫu, blast phase / blast crisis = giai đoạn blast (trước là
   "giai đoạn chuyển cấp"). Tính từ "-blastic" = "nguyên bào ...": lymphoblastic lymphoma = lymphom nguyên bào lympho,
   plasmablastic lymphoma = lymphom nguyên tương bào, angioimmunoblastic = nguyên bào miễn dịch mạch. Dòng `myeloblast`
   ("nguyên tủy bào") bị bỏ vì không theo quy tắc; erythroblast = "nguyên hồng cầu", sideroblast = "nguyên bào sắt",
   plasmablast = "nguyên tương bào" giữ (tên tế bào anh đã sửa / đi cùng plasmablastic). BPDCN để nguyên tên tiếng Anh.
   (Lượt 17:45 "blast = nguyên bào" đã bị lượt 17:48 thay.)
3. **Tên bệnh "mạn": owner 2026-10-15 17:50: names follow literature usage; mạn tính only in free prose.** Số đếm trong
   D:/vitranslate-corpus (không tải thêm):
   - CML: "bạch cầu mạn dòng tủy" 3 tài liệu (YHCM26-MRD 4, YHCM21-CML 1 S; BYT1514 1) vs "mạn tính dòng tủy" 0 ->
     "bệnh bạch cầu mạn dòng tủy (CML)".
   - CLL: "bạch cầu mạn dòng lympho" 2 tài liệu (BYT1514, YHCM25-197 S) = "bạch cầu lympho mạn" 2 (BYT1514,
     BVDHYD-HACH S), "mạn tính dòng lympho" 0; tiêu đề bthh.org.vn "bệnh bạch cầu mạn dòng lympho" (WS) phá hòa ->
     "bệnh bạch cầu mạn dòng lympho (CLL)".
   - CMML: 0 tài liệu mọi biến thể; Viện HHTM 2022 (WS) "bệnh bạch cầu mạn dòng tủy - mono" -> giữ.
   - CNL: 0 tài liệu; thêm dòng ghép "bệnh bạch cầu mạn dòng bạch cầu trung tính (CNL)" (low).
   - chronic phase: "giai đoạn mạn tính" 2 tài liệu (BYT1514 7, YHCM26-MRD 1 S) vs "giai đoạn mạn" đứng riêng 1
     (YHCM21-CML 2 S) -> "giai đoạn mạn tính" (0.1.0 đếm nhầm vì cụm ngắn khớp cả cụm dài).
   - Câu mô tả rời: chronic = "mạn tính" (một dòng trong prompt.md).
   (Lượt 17:45 "mạn tính cho mọi tên" đã bị lượt 17:50 thay.)
4. **ALL / AML: owner 2026-10-15 17:46 keeps 'cấp dòng lympho / dòng tủy'; supersedes the 2026-07-17 review row.**
   ALL = "bệnh bạch cầu cấp dòng lympho (ALL)" là **ngoại lệ có chủ ý** của quy tắc "-blastic = nguyên bào" (17:49). Mọi
   dạng tiếng Anh dẫn về cùng giá trị: acute lymphoblastic leukemia / leukaemia, acute lymphocytic leukemia, acute
   lymphoid leukemia. WHO-HAEM5: B- / T-lymphoblastic leukemia/lymphoma = "bệnh bạch cầu/lymphom cấp dòng lympho B / T"
   (D: corpus chỉ BYT1514 viết tên WHO, dạng "bệnh bạch cầu/u lympho nguyên bào lympho B tiền thân", 1 tài liệu chính
   thức, 2 lần: không đủ để coi là y văn ưu tiên rõ). AML = "bệnh bạch cầu cấp dòng tủy (AML)". CLL vẫn tách riêng.
5. **BCR::ABL1 / fusion gene: by rule.** D:/vitranslate-corpus, nghĩa "gen lai sinh ra do chuyển đoạn": "tổ hợp gen" 2 tài
   liệu S (YHCM26-MRD 3 "tổ hợp gen BCR::ABL1", YHCM21-CML 1 "tổ hợp gen BCR/ABL") + BYT1514 "gen tổ hợp BCR-ABL" 1;
   "gen dung hợp" 0 tài liệu. (Các lần "tái tổ hợp gen" ở BVNTP-HACH1, BYT1514 MLL và một bài virus học là nghĩa khác, không
   tính. "dung hợp gen" 2 tài liệu N là nghĩa sự kiện gene fusion, khóa khác.) Chọn **"tổ hợp gen"**; vì hai gói có thể được
   chọn cùng lúc, `molecular-pathology` khóa `fusion gene` đổi "gen dung hợp" -> "tổ hợp gen" (0.1.0 -> 0.1.1). Lưu ý: dòng
   cũ ghi "approved by the user 2026-08-11" và `translator/glossary/pathology.md` có dòng "gene fusion / fusion = gen dung
   hợp / dung hợp": nếu anh muốn giữ "gen dung hợp" thì đây là chỗ cần xác nhận lại. Các khóa `gene fusion` = "dung hợp
   gen", `fusion` = "dung hợp", `ALK fusion` = "dung hợp gen ALK" không đổi.
6. **peripheral blood smear** = "phết máu ngoại biên" (owner "đồng ý"); peripheral blood (gói molecular) vẫn "máu ngoại vi".
7. **amyloidosis**: theo gói cha; dòng `AL amyloidosis` bị bỏ khỏi gói này.
8. **bone marrow involvement: by rule.** D:/vitranslate-corpus: "xâm lấn tủy (xương)" 2 tài liệu (BYT1514 7, TCNCYH-NB 9)
   vs "thâm nhiễm tủy" 1 tài liệu (BYT1514 2), "di căn tủy" 2 tài liệu; không tài liệu phía Nam nào có cụm này. Giữ
   **"xâm lấn tủy xương"**.
9. **Thực thể không có dạng Việt**: giữ tiếng Anh / chú thích tiếng Anh như hiện tại, note giữ nguyên (owner "đồng ý").

10. **Chốt 2026-10-15 18:48 (bản 0.1.2).** Mục 5 được anh xác nhận (lựa chọn 1: "Tổ hợp gen"): fusion gene = "tổ hợp
   gen", cùng giá trị với `molecular-pathology`; thêm dòng `fusion gene` vào gói này để check_packs đối chiếu được;
   gene fusion / fusion / ALK fusion vẫn "dung hợp". Prompt của `molecular-pathology` sửa câu cũ "fusion gene = gen dung
   hợp" (0.1.2). Theo medicine M10 (cột đề xuất): complete blood count = **"công thức máu"** (trước: "tổng phân tích tế
   bào máu"), cùng giá trị với `medicine`. Thêm 1 test.

## 7. Thay đổi ngoài gói ở 0.1.1

- `packs/molecular-pathology/glossary.csv` (fusion gene) và `pack.json` 0.1.0 -> 0.1.1.
- Dấu mũ / dạng cũ trái quyết định carcinom - lymphom - sarcom (và LVI / PNI = xâm nhập, chromophobe = kị sắc, SIL =
  trong biểu mô gai, SCLC = carcinom tế bào nhỏ của gói cha) trong prompt.md của các gói nháp: breast, endocrine, gi,
  headneck, hpb, kidney, respiratory; mỗi gói tăng bản vá (patch). headneck: "gen dung hợp" -> "tổ hợp gen" theo mục 6.5.
- Ghi chú cũ ghi sai quyết định ("carcinoma = carcinôm", "user chose 'lymphôm'", "dạng sarcôm") trong glossary của gi,
  headneck, respiratory, kidney. Các số đếm biến thể có dấu mũ trong ghi chú (bằng chứng corpus) giữ nguyên.
- `web/engine/medical_words.json` dựng lại bằng `tools/build_lexicon.py`.
