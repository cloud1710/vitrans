# MINING_REPORT: radiology (Chẩn đoán hình ảnh), draft 0.1.0

Ngày khai thác: 2026-10-15 (run `pack-2026-10-15-radiology`), theo yêu cầu "Cào nội khoa, ngoại khoa, sản khoa, ung thư và
chẩn đoán hình ảnh gói cơ bản". Gói gốc (không có cha). Phạm vi: phương thức chụp (X quang, cắt lớp vi tính, cộng hưởng từ,
siêu âm, y học hạt nhân / PET), từ mô tả tổn thương (đậm độ, tín hiệu, hồi âm, bắt thuốc, thải thuốc, hạn chế khuếch tán,
vôi hóa, bờ), các hệ RADS và RECIST, thuốc cản quang và kỹ thuật chụp, điện quang can thiệp, câu chữ phiếu kết quả.

## 1. Tóm tắt (tin xấu trước)

- **Vượt trần 12 request / host 1 lần, nếu tính theo trang chứ không theo tên host:** `tapchiyhoctphcm.vn` 12 request qua
  `corpus_fetch` cộng 1 WebFetch tới `www.tapchiyhoctphcm.vn` (mục lục số chuyên đề) = 13 request tới cùng một tạp chí.
  Theo tên host thì không host nào quá 12.
- **6 lựa chọn đi ngược kế hoạch ngày 14-10** vì luật "phía Nam trước": enhancement = "bắt thuốc" (kế hoạch: "ngấm thuốc"),
  CT density = "đậm độ" (kế hoạch: "tỷ trọng"), MRI contrast = "thuốc tương phản" (kế hoạch: hòa), hyperintense = "tín hiệu
  cao", target lesion = "tổn thương mục tiêu", spelling "X quang" (pathology-breast đang viết "X-quang"). Cần anh chốt (mục 4).
- **Kho mỏng cho CĐHA:** 30 request mang về 27 bài; cộng kho cũ, chỉ khoảng 40 trong 263 văn bản thật sự là bài hình ảnh. 49 /
  314 dòng có "freq 0" (dạng ghép BUILT hoặc chỉ có bằng chứng web), 48 dòng ghi LOW.
- **PDF Y học TP.HCM lỗi font** ("{" = á, "|" = à, chèn khoảng trắng giữa chữ): đã sửa khi đếm, nhưng số đếm cụm ngắn có thể
  lệch nhẹ (ví dụ "giá trị b" bị đếm lố).
- Số liệu: 314 dòng glossary (15 giữ tiếng Anh), 2 term fix, 15 test. 8 khóa trùng pack khác và cùng giá trị (hypoechoic,
  microcalcification, ground-glass opacity, TI-RADS, BI-RADS...). 0 xung đột.

## 2. Phương pháp

1. Seed: kế hoạch `docs/packs/plans/ngoai_khoa.md` (mục radiology, các giá trị [KC]), ICD-9-CM QĐ 387/2026 chương 87-88 và 92
   (đã có trong kho, 0 request), danh mục từ vựng ACR (chỉ tên mục).
2. Kho: 27 bài mới (Y học TP.HCM 26(2) 2022 chuyên đề CĐHA: 12 bài; TC Y Dược học Cần Thơ: 5; TC Điện quang & YHHN Việt Nam:
   10; TC Y Dược học Huế: 2 bài Lung-RADS) cộng các tệp sẵn có ở `D:/vitranslate-corpus` (Phác đồ Ung bướu BV Bình Dân 2020
   là nguồn phía Nam lớn nhất). Trích chữ bằng pypdf, NFC.
3. Đếm theo số tài liệu và số tài liệu phía Nam (`sources.md`). Canonical = dạng nhiều tài liệu phía Nam nhất; hòa thì ưu
   tiên dạng nhất quán với các hàng cùng họ (ví dụ "bờ ...", "thì ...").
4. Ownership: so mọi khóa với 10 pack hiện có (lowercase, gạch nối = khoảng trắng). Không dùng khóa trần bị cấm (`margin`,
   `probe`, `section`...): margin luôn là khóa ghép ("irregular margin" = bờ không đều), probe thay bằng transducer.
5. Kiểm: `check_packs` 0 lỗi; registry có draft + `select_packs` trên văn bản tổng hợp; `build_lexicon`; pytest helper;
   `eval_pack` với mô hình thật (GPU rảnh: chỉ có llama-server của Ollama, 0-1 %).

## 3. Lưu lượng

| Host | Request (corpus_fetch) | Ghi chú |
|---|---|---|
| tapchiyhoctphcm.vn | 12 (robots.txt từ cache, 0) | + 1 WebFetch tới www.tapchiyhoctphcm.vn (mục lục số 431) |
| vjrnm.edu.vn | 11 (1 robots.txt + 10 PDF) | robots: chỉ cấm /cache/ |
| tapchi.ctump.edu.vn | 5 (robots từ cache) | |
| jmp.huemed-univ.edu.vn | 2 | robots.txt 404 (đã ghi trong manifest của run khác) |
| Tổng | 30 / 40 | 0 lỗi 429 / 403 / reset |

WebSearch: 11 / 30. WebFetch: 1 / 10. Không truy cập tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com,
hoiyhoctphcm.org.vn.

## 4. Quyết định cần anh (mỗi câu kèm đề xuất theo luật của anh)

| # | Thuật ngữ | Pack đang ghi | Bằng chứng | Đề xuất |
|---|---|---|---|---|
| R1 | enhancement (contrast enhancement, rim / heterogeneous enhancement, APHE) | "bắt thuốc" | Kho: bắt thuốc 13 tài liệu (S 10), ngấm thuốc 16 (S 5; Bắc / VJRNM 10), tăng quang 5 (S 4). VJOL toàn quốc (kế hoạch): 85 / 26 / 11. Tiêu đề Y học TP.HCM 2022: "động học bắt thuốc", "bắt thuốc thì muộn" | **"bắt thuốc"** (luật phía Nam). Nếu anh muốn theo toàn quốc thì đổi một loạt 15 dòng sang "ngấm thuốc" |
| R2 | attenuation / hypodense / hyperdense / isodense | "đậm độ", "giảm / tăng / đồng đậm độ" | đậm độ 15 (S 13) vs tỷ trọng 10 (S 2) + tỉ trọng 3; giảm đậm độ 3 (S 3) vs giảm tỷ trọng 3 (S 1); tiêu đề YHCM22-189 "số đo đậm độ" | **"đậm độ"** |
| R3 | MRI contrast (gadolinium-based contrast agent) | "thuốc tương phản (chứa gadolinium)"; CT giữ "thuốc cản quang" | thuốc tương phản 15 (S 11) vs thuốc đối quang (từ) 4 (S 1); VJOL toàn quốc hòa 25 / 18 | **"thuốc tương phản"** |
| R4 | hyperintense / hypointense | "tín hiệu cao" / "tín hiệu thấp" | tín hiệu cao 7 (S 5) vs tăng tín hiệu 7 (S 3); tín hiệu thấp 7 (S 5) vs giảm tín hiệu 5 (S 2) | **"tín hiệu cao / thấp"** (luật phía Nam; chênh 5:3) |
| R5 | Chính tả X quang | "X quang" (chụp X quang, X quang ngực) | X quang 27 (S 22) vs X-quang 16 (S 6); pathology-breast ghi mammography = "chụp X-quang tuyến vú" | **"X quang"**, sửa luôn dòng mammography của pathology-breast (pack này không giữ khóa mammography để khỏi xung đột) |
| R6 | target / non-target lesion (RECIST) | "tổn thương mục tiêu / không mục tiêu" | mục tiêu 1 (S 1, YHCM 2026) vs đích 0 (kế hoạch ghi "đích" [CKC]) | **"tổn thương mục tiêu"**, bằng chứng mỏng; nhờ đồng nghiệp ung bướu xác nhận |
| R7 | well-defined / ill-defined | "ranh giới rõ / không rõ" | ranh giới rõ 7 (S 1) vs giới hạn rõ 9 (S 7, cả 7 từ một trang BV Nguyễn Tri Phương); ranh giới không rõ 7 (S 3) vs giới hạn không rõ 2 (S 1) | Giữ **"ranh giới"** cho đồng bộ cặp; nếu anh quen "giới hạn rõ" thì đổi cả cặp |
| R8 | embolization | "nút mạch" | Y học TP.HCM 2022 (can thiệp XHTH): nút mạch 14 vs tắc mạch 1; VJRNM 29 vs 15; nhưng Phác đồ BV Bình Dân viết "gây tắc mạch" 15 vs nút mạch 9; "tắc mạch" còn nghĩa tắc / thuyên tắc | **"nút mạch"** |
| R9 | washout | "thải thuốc (washout)" | thải thuốc 5 (S 3) vs giữ "washout" 3 (S 2) | **"thải thuốc (washout)"** (VI kèm EN, đúng ý anh "washout có thể giữ") |
| R10 | Viết tắt CT / MRI | Giữ như văn bản gốc; viết đầy đủ thì dịch "cắt lớp vi tính", "cộng hưởng từ" (prompt) | CLVT 34 tài liệu, CHT 13; "CT" / "MRI" trần cũng phổ biến | Giữ như gốc (ít rủi ro nhất cho mô hình nhỏ) |

### Đã chốt 2026-10-15 18:48 (bản 0.1.1)

Anh trả lời lúc 18:48: "1. Tổ hợp gen 2. Tân bổ trợ 3. Giai đoạn tiến xa 4. Ok hoá trị dẫn đầu"; mục anh không nhắc theo cột đề xuất (điều phối viên đã báo trước). Thứ tự luật: lựa chọn rõ của anh > sửa trước đây của anh > house rule > tần suất phía Nam.

| # | Giá trị chốt | Ai chốt |
|---|---|---|
| R1 | "bắt thuốc" (cả họ enhancement) | owner, recommended column |
| R2 | "đậm độ", giảm / tăng / đồng đậm độ | owner, recommended column |
| R3 | MRI: "thuốc tương phản"; CT / X quang giữ "thuốc cản quang" | owner, recommended column |
| R4 | "tín hiệu cao / thấp" | owner, recommended column |
| R5 | "X quang"; `pathology-breast` mammography = "chụp X quang tuyến vú" (0.1.3 -> 0.1.4, test mammography đổi theo: must "X quang tuyến vú", must_not "X-quang") | owner, recommended column |
| R6 | "tổn thương mục tiêu / không mục tiêu" (bằng chứng mỏng: 1 tài liệu) | owner, recommended column |
| R7 | "ranh giới rõ / không rõ" | owner, recommended column |
| R8 | "nút mạch" | owner, recommended column |
| R9 | "thải thuốc (washout)" | owner, recommended column |
| R10 | CT / MRI giữ như văn bản gốc | owner, recommended column |

Không dòng nào đổi giá trị; cột note các dòng chính ghi "owner, recommended column 2026-10-15 18:48 (R#)". Thêm 1 test
(chest X-ray = "X quang ngực", must_not "X-quang").

## 5. Chưa giải quyết (freq 0 hoặc chỉ dạng ghép)

functional MRI, MRA, MRCP, CEUS, elastography, PET (tên đầy đủ), SUV (tên đầy đủ), SPECT (tên đầy đủ), opposed-phase /
chemical shift, echogenic foci ("chấm tăng âm"), posterior acoustic enhancement, resistive index, complex cyst, part-solid /
subsolid nodule (chỉ có web), midline shift, rim / ring / homogeneous enhancement, hypoenhancement, transitional phase,
oral contrast, contrast-induced nephropathy, sagittal plane, MIP, volume rendering, lung window, non-target lesion, measurable
lesion, sum of diameters, microwave ablation, PTBD, bronchial artery embolization, vertebroplasty, mechanical thrombectomy,
prior study, incidentaloma, spiculated margin ("bờ tua gai": 1 tài liệu Huế; "tua gai" 4). Không tìm được dạng tiếng Việt
cho fluoroscopy ("màn tăng sáng" / "soi huỳnh quang" đều 0): chưa đưa vào.

## 6. Từ chung KHÔNG đưa vào (đề nghị đưa vào `_shared/clinical_core` hoặc pack chủ)

catheter (ống thông), lymphadenopathy, consolidation (chủ: medicine-pulmonology, chưa có pack), pleural effusion,
atelectasis, pneumothorax, ascites, lesion (pathology), biopsy (pathology), screening (tầm soát 50 tài liệu S 32 vs sàng lọc
42 S 13: đề nghị medicine sở hữu, chọn "tầm soát"), transvaginal ultrasound (obgyn: "siêu âm ngả âm đạo"), mammography
(pathology-breast, xem R5), echocardiography (cardiology), transrectal ultrasound (surgery-uro). Ứng viên cho
`_shared/specimen_context` (quyết định 11): CT, MRI, contrast-enhancing = "bắt thuốc", T2 hyperintense = "tín hiệu cao trên
T2W".

## 7. Kiểm tra

- `tools/check_packs.py packs`: 0 lỗi (1 cảnh báo cũ của pack `pathology`: bronchiole / bronchioles).
- Registry có draft + `matching.select_packs`: văn bản báo cáo CĐHA tổng hợp chọn `radiology` (cosine 0,393; 34 khóa; 20 lần
  detect); văn bản GPB đại tràng tổng hợp chỉ chọn `pathology` (radiology cosine 0,000).
- `tools/build_lexicon.py`: cập nhật `web/engine/medical_words.json` (1916 từ khóa, 231 từ corpus); `--check` sạch.
- Pytest helper: 1129 passed, 4 skipped, 2 deselected.
- `tools/eval_pack.py radiology --dir --family`, mô hình thật gemma4:e4b trên GPU (GPU 0 % trước khi chạy): **15 / 15** test đạt (chạy lại sau khi đổi R4).
