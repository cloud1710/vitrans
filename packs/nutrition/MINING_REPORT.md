# MINING_REPORT: nutrition (Dinh dưỡng y khoa), draft 0.1.1

Ngày khai thác: 2026-10-15, run `pack-2026-10-15-nutrition`. Yêu cầu của người dùng (2026-10-15): "cào 2 gói: domain dinh dưỡng y khoa ...". Gói gốc mới, **không có `parent`**: gói gốc `medicine` dự kiến chưa tồn tại. Phạm vi: sàng lọc và đánh giá dinh dưỡng, suy dinh dưỡng / thiểu cơ / suy mòn / suy yếu / hội chứng nuôi ăn lại, năng lượng và vi chất, điều trị dinh dưỡng (đường uống, qua ống thông, tĩnh mạch), dinh dưỡng theo bệnh, dinh dưỡng nhi khoa, béo phì - chuyển hóa, tiết chế và chế độ ăn (IDDSI), nhãn dinh dưỡng trong tài liệu lâm sàng.

## 1. Tóm tắt (tin xấu trước)

- **Kho mỏng ở mảng dinh dưỡng tĩnh mạch / qua ống thông, IDDSI, viêm tụy, bỏng, phẫu thuật giảm béo.** 81 / 246 dòng là dạng ghép (BUILT), 107 dòng ghi LOW (0-1 tài liệu), 12 dòng UNRESOLVED / UNVERIFIED.
- **IDDSI:** bản dịch tiếng Việt chính thức nằm trên iddsi.org, nhưng `robots.txt` của www.iddsi.org chặn mọi bot (`User-agent: * Disallow: /`), nên không tải. Lưu ý: URL PDF trên iddsi.org (không www) đã được gửi trong cùng lô, **trước** khi kiểm robots. Request đó trả 301, không có nội dung; sau khi đọc robots thì không theo URL chuyển hướng nữa. Bốn tên mức IDDSI trong gói là dạng ghép, chưa kiểm.
- **Lexicon:** `web/engine/medical_words.json` được sinh từ mọi glossary (kể cả bản nháp), nên thêm gói thì tệp cũ đi (lần đầu `test_the_committed_lexicon_is_up_to_date` trượt). Đã chạy lại `tools/build_lexicon.py` và commit tệp này cùng các quyết định 2026-10-15 (1909 từ thuật ngữ, 267 từ corpus).
- 3 tài liệu lạc đề hoặc chỉ liên quan một phần (TN16, BD16, ND2-18), cộng 2 tệp lạc đề có sẵn trong kho (BD18x, PNT19x). Các tệp này không làm sai số đếm của thuật ngữ dinh dưỡng.
- Số liệu: 246 dòng, 15 dòng giữ tiếng Anh (NRS-2002, PG-SGA, MNA, MNA-SF, MUST, GLIM, SGA-MIS, prealbumin, ERAS, IDDSI, RUTF, sarcopenia, carbohydrate...), 1 term fix, 15 test. `check_packs`: 0 lỗi (1 cảnh báo cũ thuộc `pathology`). Eval gemma4:e4b trên GPU: 15 / 15.

## 2. Phương pháp

1. 29 lượt WebSearch để tìm PDF toàn văn, ưu tiên phía Nam (Y học TP.HCM với các số chuyên đề của Chợ Rẫy, Nhân dân Gia Định, Nhi Đồng 2, Bình Dân, Nhân dân 115, ĐH Y Dược; Y Dược học Phạm Ngọc Thạch; Y Dược học Cần Thơ), rồi Huế và Hà Nội (TCNCYH, Y Dược lâm sàng 108). Tạp chí Dinh dưỡng & Thực phẩm không có PDF lấy được qua tìm kiếm.
2. Tải qua `tools/corpus_fetch.py --run pack-2026-10-15-nutrition --max-total 40`. 36 tài liệu đọc được (2 tệp lấy từ cache của run trước, không tốn request).
3. Trích chữ (PyMuPDF / BeautifulSoup, chạy bằng python của env `titan_gpu310` vì env `vitranslate` không có PyMuPDF; chỉ đọc tệp kho, chữ trích ra chỉ lưu cục bộ). Đếm 676 biến thể theo số tài liệu và theo vùng; kết quả ở `sources.md`.
4. Chọn canonical: biến thể nhiều tài liệu nhất, phía Nam trước. Khóa trùng với gói khác giữ giá trị của gói đó (`amino acid` = acid amin của `molecular`, `dialysis` = lọc máu của `pathology-kidney`, `MASLD` của `pathology-hpb`). Dạng nhà: lymphô bào, típ, acid, tỷ lệ.
5. Không dùng MedEV. Không chép câu nào từ bài báo. `tools/private_text_guard.py` chạy trên `packs/nutrition`: sạch so với kho riêng của người dùng (143 nguồn) và so với 36 tài liệu đã tải. Hai tiêu đề bài báo trong `sources.md` được rút gọn để không trùng nguyên văn.

## 3. Quyết định (đã chốt 2026-10-15)

Người dùng trả lời "1 ok" (2026-10-15 17:36) cho bảng quyết định: theo cột đề xuất. D5, D6, D8 không có đề xuất nên chọn theo luật: biến thể dùng nhiều nhất trong toàn văn tiếng Việt đã có trong kho (164 tài liệu, mọi run, không tải thêm), phía Nam trước; giữ tiếng Anh khi y văn giữ. Số đếm ở `sources.md`, mục "Quyết định 2026-10-15".

| # | Thuật ngữ | Giá trị trong gói | Căn cứ | Ai chốt |
|---|---|---|---|---|
| D1 | enteral nutrition | "dinh dưỡng qua đường tiêu hóa" | Họ "đường tiêu hóa" 3 tài liệu (S2 N1) hòa họ "đường ruột" 3 (S1 N2); động từ "dinh dưỡng" để đi cặp với D2 | decided by the owner 2026-10-15 ('1 ok') |
| D2 | parenteral nutrition | "dinh dưỡng tĩnh mạch" | Phía Nam 4 tài liệu; Hà Nội "nuôi dưỡng tĩnh mạch" 4 | decided by the owner 2026-10-15 ('1 ok') |
| D3 | sarcopenia | "sarcopenia" (giữ EN, không có từ Việt làm giá trị chính); sarcopenic obesity = "béo phì kèm sarcopenia" | Tài liệu phía Nam phần lớn giữ "sarcopenia" (5 tài liệu, 65 lần) | decided by the owner 2026-10-15 ('1 ok') |
| D4 | complementary feeding | "ăn dặm" | Phía Nam 4 tài liệu (59 lần) so với "ăn bổ sung" 1 | decided by the owner 2026-10-15 ('1 ok') |
| D5 | carbohydrate | "carbohydrate" (giữ EN) | Toàn kho: "carbohydrate" 6 tài liệu (S3 N2 W1) so với "glucid" 5 (N3 H1 W1, không tạp chí phía Nam nào) | by rule |
| D6 | dysphagia | "khó nuốt" (trước đó "nuốt khó") | Toàn kho: "khó nuốt" 6 tài liệu (S1 W5) + "nuốt khó" 3; "nuốt vướng" 8 (S3 N3 W2) bị loại vì là triệu chứng hẹp hơn, được liệt kê cạnh "khó nuốt" trong cùng văn bản | by rule (xem ghi chú dưới) |
| D7 | hyperglycemia | "tăng đường huyết" | Hòa 2 / 2 với "tăng glucose máu"; đi cặp với hạ đường huyết | decided by the owner 2026-10-15 ('1 ok') |
| D8 | catheter-related bloodstream infection | "nhiễm trùng huyết liên quan đến catheter (CRBSI)" | Toàn kho: không có dạng ghép; "nhiễm trùng huyết" 6 tài liệu (S5 W1) so với "nhiễm khuẩn huyết" 4 (S2 N1 W1); "nhiễm trùng" 46 so với "nhiễm khuẩn" 31 | by rule |
| D9 | total lymphocyte count | "tổng số lymphô bào" | Dạng nhà GPB "lymphô bào"; kho có "tổng số tế bào lympho" 1 | decided by the owner 2026-10-15 ('1 ok') |
| D10 | phenotypic criterion (GLIM) | "tiêu chí kiểu hình" | PNT24 viết "tiêu chí hình thái" (1) | decided by the owner 2026-10-15 ('1 ok') |

Ghi chú D6: theo số đếm thuần thì "nuốt vướng" đứng đầu. Nó bị loại vì không cùng nghĩa với dysphagia nói chung, dù có một bài tuyến giáp dịch "nuốt vướng" thành "dysphagia" trong tóm tắt tiếng Anh. Muốn theo số đếm thuần thì đổi một dòng glossary và test 14.

Còn mở: **D11 vị trí gói.** Gói đang là gốc riêng, không có `parent`. Khi có gốc `medicine`, cần quyết định giữ `nutrition` làm gốc hay chuyển thành gói con; luật họ (3 họ / 6 gói) đang tính `nutrition` là một họ.

### Đã chốt thêm 2026-10-15 18:48 (bản 0.1.2)

- **low birth weight** = **"nhẹ cân"** (trước: "cân nặng lúc sinh thấp"), một giá trị với `obgyn` theo luật tần suất
  phía Nam: obgyn "nhẹ cân" S8 N1 O1 tài liệu so với gói này "cân nặng lúc sinh thấp" 1 (S1) = "cân nặng sơ sinh thấp"
  1 (S1), "sơ sinh nhẹ cân" 0. Đếm lại offline D:/vitranslate-corpus: cụm có chữ "sinh" 1 tài liệu S mỗi cụm; "nhẹ cân"
  trần 6 tài liệu S (gồm cả nghĩa underweight = "nhẹ cân" của gói này). Thêm 1 test.

## 4. Chưa giải quyết

- fat-free mass: "khối không mỡ (FFM)", 0 tài liệu cho mọi biến thể ("khối nạc" cũng 0).
- indirect calorimetry: "đo năng lượng gián tiếp (IC)", 0 tài liệu; "nhiệt lượng kế gián tiếp" có gặp trên web.
- trace element: "yếu tố vi lượng" (1 tài liệu, N); "nguyên tố vi lượng" 0.
- polymeric / peptide-based / elemental formula, all-in-one admixture: dạng ghép, 0 tài liệu.
- Bốn mức IDDSI (pureed diet, minced and moist, soft and bite-sized, moderately thick liquid): chưa kiểm vì robots.txt chặn.
- bariatric surgery: "phẫu thuật giảm béo", 0 tài liệu.
- RUTF giữ tiếng Anh: chưa có tên tiếng Việt kiểm được (BYT chỉ viết "RUTF").
- kwashiorkor / marasmus: giữ EN kèm chú thích ghép ("thể phù", "thể teo đét"), 0 tài liệu.

## 5. Lưu lượng

| Host | Request | Kết quả |
|---|---|---|
| tapchiyhoctphcm.vn | 18 | 16 PDF + 2 trang tóm tắt HTML |
| www.tapchiyhoctphcm.vn | 2 | 2 PDF |
| duoc.tapchiyhoctphcm.vn | 1 | 1 PDF |
| tapchi.ctump.edu.vn | 5 | 5 PDF |
| tapchinghiencuuyhoc.vn | 4 | 4 PDF |
| vjol.info.vn | 4 | 3 x 302 (đường dẫn /index.php/ và /en/), 1 PDF |
| jmp.huemed-univ.edu.vn | 2 | 2 PDF |
| tcydls108.benhvien108.vn | 1 | 1 PDF |
| iddsi.org | 2 | 2 x 301 (robots.txt và PDF), không có nội dung |
| www.iddsi.org | 1 | robots.txt: chặn mọi bot, dừng host này |
| **Tổng** | **40 / 40** | 34 tệp + 2 tệp cache = 36 tài liệu; không gặp 429 / 403 / reset |

WebSearch: 29 / 30. WebFetch: 0 / 10. Không chạm tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, hoiyhoctphcm.org.vn (một kết quả tìm kiếm trỏ tới msdmanuals.com nhưng không mở).

## 6. Kiểm tra

- `tools/check_packs.py packs`: 0 lỗi, 1 cảnh báo (duplicate_key `bronchiole` của `pathology`, có từ trước), 6 override cũ; gói `nutrition` không có phát hiện nào.
- `tools/build_registry.py packs <scratch> --include-drafts`, rồi `matching.select_packs` trên đoạn văn tổng hợp tự viết:
  - Đoạn dinh dưỡng người lớn (sàng lọc, GLIM, nuôi ăn, hội chứng nuôi ăn lại): chọn `nutrition`, cosine 0,460 (25 thuật ngữ, 17 lần trúng detect).
  - Đoạn dinh dưỡng nhi (thấp còi, SAM, RUTF, bú mẹ): chọn `nutrition`, cosine 0,288.
  - Đoạn GPB vú (đối chứng): không chọn `nutrition` (cosine 0,000); chọn `pathology-breast` 0,212 và `pathology`.
- `cd helper && python -m pytest -q`: 983 đạt, 4 bỏ qua, 0 trượt (sau khi chạy lại `build_lexicon.py`). Lần đầu, trước khi chạy lại: 982 đạt, 1 trượt (lexicon).
- `tools/eval_pack.py nutrition --dir`: chạy thật, không `--fake`, mô hình mặc định gemma4:e4b; GPU rảnh (0 %), chỉ có Ollama chạy. Bản đầu: 14 / 14. Sau các quyết định 2026-10-15: lần chạy đầu 14 / 15. Test sarcopenia trượt vì bắt buộc chữ "BIA", trong khi câu nguồn không có chữ đó, tức test viết sai. Đã đổi thành bắt buộc "trở kháng điện sinh học", chạy lại được **15 / 15**. Gói không có cha nên không chạy `--family`.
