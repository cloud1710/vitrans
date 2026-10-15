# MINING_REPORT: surgery (Ngoại khoa), draft 0.1.0

Ngày khai thác: 2026-10-15 (run `pack-2026-10-15-surgery`). Pack **gốc** (không có parent): ngoại khoa chung, chu phẫu và gây mê hồi sức, ngoại khoa ung thư, kỹ thuật mổ, biến chứng và phân loại (Clavien-Dindo, ASA, phân loại vết mổ), nội soi và robot, tên các phẫu thuật thường gặp. Kế hoạch: `docs/packs/plans/ngoai_khoa.md`.

## 1. Tóm tắt (tin xấu trước)

- **Kho phía Nam mỏng cho vài nhóm.** Thoát vị, ghép da / vạt và HIPEC chỉ có 1-3 tài liệu; 27 dòng ghi LOW, 50 dòng BUILT. Các dòng gây mê dựa chủ yếu vào 8 bài Y học TP.HCM / Hội GMHS TP.HCM.
- **Văn bản ung bướu "bvbnd.vn" là QĐ 1514/QĐ-BYT 2020 (ban biên soạn Hà Nội)**, không phải phác đồ miền Nam. Tôi tách nó thành vùng B (Bộ Y tế). Sau khi tách, phía Nam **hòa** giữa "triệt căn" (8 tài liệu) và "tận gốc" (9).
- **Phía Nam nghiêng về "tân hỗ trợ" / "hóa trị hỗ trợ"** (4 tài liệu so với 0), ngược với giá trị "tân bổ trợ" mà `pathology-breast` đang giữ. Pack giữ "tân bổ trợ" để không vỡ luật một khóa một giá trị; cần anh quyết (Q2).
- **Traffic:** `tapchiyhoctphcm.vn` 11 request + `www.tapchiyhoctphcm.vn` 1 + `duoc.tapchiyhoctphcm.vn` 1 = **13 request vào cùng một tạp chí** (ba tên miền khác nhau, mỗi tên miền dưới trần 12). Báo rõ để anh biết.
- **Eval:** lần chạy đầu bằng mô hình thật, `nvidia-smi` đọc 0 % lúc kiểm tra nhưng 60 % lúc khởi chạy (một miner khác đang dùng Ollama). Kết quả lần đầu 12/15; lần hai (GPU rảnh, 0 %) 15/15 sau khi thêm 3 dòng và sửa 1 test.
- Số liệu: **312 dòng**; 0 xung đột giá trị với mọi pack trong repo và với nháp đang làm của medicine / radiology / nutrition / pathology-hemato (đối chiếu lúc 2026-10-15); 28 dòng trùng khóa và cùng giá trị (ghi "= owner"). 5 term fix, 15 test tổng hợp. `check_packs`: 0 lỗi (1 cảnh báo có sẵn của `pathology`).

## 2. Phương pháp

1. **Seed 0 request:** trích bảng song ngữ ICD-9-CM QĐ 387/2026 (`D:/vitranslate-corpus/icd9cm`, 3.660 mã) cho tên thủ thuật (chương 06-07, 17, 31, 38-41, 43-54, 84-86). Văn mã hóa ("Phẫu thuật/thủ thuật ...", "tiệt căn", "phục hổi") chỉ dùng làm ứng viên.
2. **Tái dùng kho:** 239 tệp có sẵn (kidney, thyroid, molecular, pathology-core, cùng các run nutrition / medicine / radiology / obgyn chạy song song) được trích chữ và đếm trước khi tải thêm.
3. **Tải thêm 35 / 40 request** qua `tools/corpus_fetch.py`, ưu tiên phía Nam: hội nghị BV Bình Dân, BV Chợ Rẫy, BV Nhân dân Gia Định, BV Nhân dân 115, BV Nguyễn Tri Phương, Hội GMHS TP.HCM; sau đó Cần Thơ, Huế, TCNCYH, 108. Cần Thơ: robots.txt đòi `Crawl-delay: 20`, nên tôi chạy riêng với `--delay 20`.
4. **Đếm** theo số tài liệu và theo vùng (S / C / N / B) trên toàn văn (339 tệp), khớp nguyên cụm. Chọn biến thể nhiều tài liệu nhất **ở phía Nam trước**. Khi phía Nam hòa (chênh dưới 1,5 lần), lấy dạng của văn bản Bộ Y tế / ICD (quyết định 1C của lộ trình). Khóa của pack khác: chép đúng giá trị của owner.
5. Đối chiếu khóa với mọi pack trong repo và với nháp của các miner đang chạy (medicine, radiology, nutrition, pathology-hemato). Ba giá trị đổi theo pack khác để khỏi xung đột: gastrostomy, jejunostomy (= nutrition, cũng là dạng phía Nam "ra da") và nasogastric tube (= medicine, nutrition).

## 3. Request và tìm kiếm

| Host | Request | Ghi chú |
|---|---|---|
| tapchiyhoctphcm.vn | 11 | 10 bài + 1 bài thoát vị vết mổ (robots: cho phép tất cả) |
| www.tapchiyhoctphcm.vn | 1 | cùng tạp chí |
| duoc.tapchiyhoctphcm.vn | 1 | cùng tạp chí (bài vạt BV NDGD) |
| tapchi.ctump.edu.vn | 6 | delay 20 s theo robots |
| bvnguyentriphuong.com.vn | 3 | 3 trang phác đồ / quy trình |
| tapchinghiencuuyhoc.vn | 2 | |
| hsa.org.vn | 2 | robots.txt + 1 PDF (Hội GMHS TP.HCM) |
| huejmp.vn | 2 | robots.txt (404) + 1 PDF |
| jmp.huemed-univ.edu.vn | 2 | robots.txt (404) + 1 PDF |
| tcydls108.benhvien108.vn | 2 | robots.txt + 1 PDF |
| benhvientanphu.vn | 2 | robots.txt + phác đồ thoát vị bẹn BV 115 |
| jcmhch.com.vn | 1 | 302 sang trang đăng nhập; không đi theo |
| **Tổng** | **35 / 40** | không gặp 429 / 403 / reset |

- WebSearch: **20 / 30**. WebFetch: **0 / 10**.
- Không truy cập tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, hoiyhoctphcm.org.vn, icd.kcb.vn. Không crawl: mọi URL đến từ kết quả tìm kiếm.

## 4. Thuật ngữ chưa giải quyết (bằng chứng 0-1 tài liệu)

- HIPEC / cytoreductive surgery: "hóa trị nhiệt trong phúc mạc", "phẫu thuật giảm khối u" (0 tài liệu bình duyệt trong kho, chỉ có trang bệnh viện / nhà thuốc).
- critical view of safety: "góc nhìn an toàn (CVS)" (BUILT, 0 tài liệu).
- acute abdomen: "bụng cấp" (3 tài liệu C / N); dạng giảng dạy phía Nam "bụng ngoại khoa" không có trong kho.
- palliative surgery: "phẫu thuật tạm thời" và "phẫu thuật giảm nhẹ" (mỗi dạng 1 lần, đều trong văn bản BYT).
- borderline resectable: chưa đưa vào pack; chưa thấy dạng ổn định ("giới hạn cắt bỏ được"?).
- surgical field: "phẫu trường" (0 tài liệu trong kho, là từ sách giáo khoa).
- inhalational anesthesia, single-incision laparoscopic surgery, wide local excision, staging laparoscopy: BUILT / LOW.

## 5. Quyết định cần anh (kèm đề xuất theo luật của anh)

| # | Thuật ngữ | Pack đang ghi | Bằng chứng | Đề xuất |
|---|---|---|---|---|
| Q1 | anastomotic leak | "xì miệng nối" | Phía Nam: xì 3 tài liệu / 17 lần (BV Bình Dân, Y học TP.HCM), rò 3 / 5, dò 1 / 10. Toàn quốc: xì 5, rò 5, dò 3. Kế hoạch cũ tạm chọn "rò" (theo ICD / BYT) | Giữ **"xì miệng nối"** theo luật miền Nam trước; test chấp nhận cả rò / dò |
| Q2 | neoadjuvant / adjuvant | "tân bổ trợ" (= pathology-breast) | Phía Nam: "tân hỗ trợ" 4 tài liệu, "tân bổ trợ" 0; "hóa trị hỗ trợ" S1 so với "bổ trợ" S0. BYT 1514 và Cần Thơ dùng "bổ trợ" | Theo luật miền Nam thì đổi sang **"tân hỗ trợ / hỗ trợ"**, nhưng phải đổi cùng lúc `pathology-breast`, `pathology-gi` và pack ung bướu nội khoa. Nếu chưa muốn đổi thì giữ "tân bổ trợ" cho thống nhất |
| Q3 | radical | "triệt căn" | Phía Nam hòa: tận gốc 9 tài liệu (chủ yếu tiết niệu, tuyến giáp), triệt căn 8. BYT 1514 "triệt căn" 55 lần; ICD "tiệt căn". `pathology-kidney` giữ "cắt thận tận gốc" | Giữ **"triệt căn"** cho ngoại chung (luật hòa thì theo BYT); để `surgery-uro` sau này ghi đè "tận gốc" |
| Q4 | fistula (chính tả) | "rò" | Bài phía Nam hay viết "dò" (dò tiêu hóa, lỗ dò, dò mật: khoảng 32 lần so với 17 lần "rò"); đây là biến thể chính tả r / d, không phải từ khác. ICD 387 viết "rò" | Giữ **"rò"** (chính tả chuẩn); test chấp nhận "dò" |
| Q5 | modified radical mastectomy | "cắt tuyến vú triệt căn biến đổi" | Phía Nam dùng "đoạn nhũ" (2 trang GPB BV Nguyễn Tri Phương) và "cắt tuyến vú vét hạch nách" (BVNTP); "Patey" 2 | Giữ, hoặc đổi sang "đoạn nhũ tận gốc biến đổi" nếu anh muốn văn phong phía Nam. Khi đổi thì xét luôn "mastectomy" của `pathology-breast` |
| Q6 | nerve block | "gây tê thần kinh" | Hòa 2 / 2 với "phong bế thần kinh" (đều phía Nam). "phong bế" chủ yếu dùng cho mức phong bế cảm giác / vận động | Giữ **"gây tê thần kinh"**; cấm calque "phong tỏa thần kinh" |
| Q7 | emergence | "tỉnh mê" | tỉnh mê 2 tài liệu / 13 lần (S), thoát mê 2 / 5 (S1 C1) | Giữ "tỉnh mê" |
| Q8 | nasogastric tube | "ống thông mũi dạ dày" (= medicine, nutrition) | Phía Nam hay viết "sonde dạ dày" (3 tài liệu) | Giữ dạng thuần Việt; không giữ "sonde" (tiếng Pháp) |

**Từ lâm sàng chung không đưa vào pack** (để `_shared/clinical_core` hoặc pack `medicine` quyết, theo lệnh không thêm từ chung): complication (khóa trần), mortality, length of stay (khóa trần), follow-up, readmission, retrospective study, comorbidity / Charlson, blood transfusion, deep vein thrombosis / pulmonary embolism, hypotension, nausea and vomiting (khóa trần), adjuvant chemotherapy, bowel obstruction (khóa trần), peritonitis (khóa trần), acute appendicitis. Pack chỉ giữ dạng ghép mang nghĩa ngoại khoa ("postoperative mortality", "postoperative length of stay", "adhesive small bowel obstruction", "generalized peritonitis").

**Khóa dùng chung với pack khác (cùng giá trị, note "= owner"):** frozen section, intraoperative frozen section, lymph node dissection, lymphadenectomy, neck dissection, sentinel lymph node biopsy, axillary lymph node dissection, mastectomy, breast-conserving surgery, thyroidectomy, pancreaticoduodenectomy, total mesorectal excision, splenectomy, neoadjuvant, neoadjuvant therapy, surgical margin, resection margin, negative / positive margin (pathology*); ultrasound-guided (radiology); Enhanced Recovery After Surgery, preoperative fasting, gastrostomy, jejunostomy, nasogastric tube (nutrition / medicine, các pack này chưa merge).


### Đã chốt 2026-10-15 18:48 (bản 0.1.1)

Anh trả lời lúc 18:48: "1. Tổ hợp gen 2. Tân bổ trợ 3. Giai đoạn tiến xa 4. Ok hoá trị dẫn đầu"; mục anh không nhắc theo cột đề xuất (điều phối viên đã báo trước). Thứ tự luật: lựa chọn rõ của anh > sửa trước đây của anh > house rule > tần suất phía Nam. Số của điều phối viên: S1-S6 = Q1-Q6, S7 = Q8.

| # | Giá trị chốt | Ai chốt |
|---|---|---|
| Q1 (S1) | anastomotic leak = "xì miệng nối" | owner, recommended column |
| Q2 (S2) | **neoadjuvant = "tân bổ trợ", adjuvant = "bổ trợ" ở MỌI gói** (surgery, medicine-oncology, pathology-breast, pathology-gi...); không đổi sang "tân hỗ trợ" | owner 2026-10-15 18:48 (lựa chọn 2) |
| Q3 (S3) | radical = "triệt căn"; obgyn radical hysterectomy đổi theo ("cắt tử cung triệt căn") | owner, recommended column |
| Q4 (S4) | fistula = "rò" (test nhận "dò") | owner, recommended column |
| Q5 (S5) | "cắt tuyến vú triệt căn biến đổi" | owner, recommended column |
| Q6 (S6) | nerve block = "gây tê thần kinh" | owner, recommended column |
| Q7 | emergence = "tỉnh mê" | owner, recommended column |
| Q8 (S7) | "ống thông mũi dạ dày" | owner, recommended column |
| O9 (oncology) | palliative surgery = **"phẫu thuật giảm nhẹ"** (trước: "phẫu thuật tạm thời"); unresectable = **"không thể cắt bỏ"** (trước: "không cắt bỏ được"); `medicine-oncology` thêm hai dòng cùng giá trị | owner, recommended column |

Tin xấu: số đếm của chính gói này nghiêng về "không cắt bỏ được" (4 tài liệu, S3) so với "không thể cắt bỏ" (1, B1);
anh đã nhận cột đề xuất của oncology. Thêm 2 test (palliative surgery + unresectable; neoadjuvant therapy, must_not
"tân hỗ trợ").

## 6. Kiểm tra

- `tools/check_packs.py packs`: 0 lỗi; 1 cảnh báo có sẵn (`pathology`, bronchiole trùng khóa); 6 override cha-con có sẵn.
- Registry nháp (`build_registry.py --include-drafts`) + `matching.select_packs` trên văn bản **tổng hợp**:
  - bài phẫu thuật nội soi cắt túi mật: chọn `surgery`, cosine **0,373** (27 thuật ngữ, 19 lượt detect);
  - bài gây mê / gây tê mổ thoát vị bẹn: chọn `surgery`, cosine 0,267;
  - phiếu GPB dạ dày (có frozen section, gastrectomy, resection margin): **không** chọn `surgery` (cosine 0,022, 0 detect);
  - phiếu GPB tuyến giáp (thyroidectomy, neck dissection, frozen section): không chọn (0,040, 0 detect).
- `tools/build_lexicon.py` đã chạy lại (`web/engine/medical_words.json`); bộ test Python của helper: xanh.
- `tools/eval_pack.py surgery` (gemma4:e4b, GPU): lần 1 **12/15** (trượt: "có hướng dẫn siêu âm" thay vì "dưới hướng dẫn siêu âm"; test ERAS đòi chữ "ERAS" không có trong câu nguồn, lỗi của test; "incarcerated" bị dịch thành "nghẹt" và "mesh" thành "lưới"). Đã thêm 3 dòng (ultrasound-guided, incarcerated inguinal hernia, polypropylene mesh) và sửa test ERAS. Lần 2 (GPU 0 % lúc khởi chạy): **15/15**.
