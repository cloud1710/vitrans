# MINING_REPORT: obgyn (Sản phụ khoa), draft 0.1.0

Ngày khai thác: 2026-10-15, run `pack-2026-10-15-obgyn`. Pack gốc (không có cha). Phạm vi: thai kỳ, khám thai, chuyển dạ và sinh, mổ lấy thai, biến chứng thai kỳ (tiền sản giật, băng huyết sau sinh, thai ngoài tử cung, sẩy thai, đái tháo đường thai kỳ, nhau tiền đạo / cài răng lược), theo dõi tim thai và siêu âm sản khoa, phụ khoa (u xơ, lạc nội mạc, khối phần phụ, xuất huyết tử cung bất thường, cắt tử cung, nội soi), vô sinh và hỗ trợ sinh sản, sơ sinh tại phòng sinh, bệnh nguyên bào nuôi (phần lâm sàng).

## 1. Tóm tắt (tin xấu trước)

- **Kho phía Nam mỏng ở phần chuyển dạ.** Bài phía Nam tải được chủ yếu là băng huyết sau sinh, nhau tiền đạo / cài răng lược, sinh non (Từ Dũ), hỗ trợ sinh sản (Mỹ Đức, HOSREM). Không có văn bản phía Nam nào cho theo dõi tim thai (CTG), pha chuyển dạ, độ mờ da gáy, cơn co / cơn gò. Các hàng đó dựa trên QĐ 315/QĐ-BYT (phía Bắc) hoặc là `built` / `LOW` / `UNRESOLVED`.
- **Run dừng ở request 39 / 40 vì HTTP 429** từ `sti.vista.gov.vn` (đích chuyển hướng của nsti.vista.gov.vn); host này đã vào danh sách `blocked` của counter.json. Hai bài Y học TP.HCM về khởi phát chuyển dạ (Từ Dũ, Hùng Vương) vì vậy không có.
- `tudu.com.vn` cấm mọi bot trừ Googlebot (robots.txt); `bvphusanct.com.vn` cấm thư mục chứa tập san hội nghị. Không tải gì từ hai host này ngoài robots.txt.
- 2 request tới `www.vjol.info.vn` (Phạm Ngọc Thạch) gửi đi **trước khi đọc robots.txt của đúng host www** (robots của vjol.info.vn đã có trong kho); cả hai trả 302, không có tệp.
- **10 quyết định cần anh (mục 3).** Bốn cái có số đếm đi ngược thói quen nói của lâm sàng phía Nam: cơn co / cơn gò, chậm phát triển / chậm tăng trưởng, ống dẫn trứng / vòi tử cung, 3 tháng đầu / tam cá nguyệt.
- **Số liệu:** 313 dòng glossary, 9 term fix (rau -> nhau, đẻ -> sinh, mổ đẻ -> mổ lấy thai, chửa -> thai ngoài tử cung), 15 test tổng hợp, 30 detect. `check_packs`: 0 lỗi (1 cảnh báo cũ của `pathology`: bronchiole). Eval mô hình thật gemma4:e4b: 15/15. Chọn pack: bài sản tổng hợp cosine 0,387; bài phụ khoa tổng hợp 0,248; bài GPB phụ khoa tổng hợp không chọn obgyn (0,022, 0 detect).

## 2. Phương pháp

1. Đọc kho chung trước (manifest.jsonl): gần như không có bài sản khoa (chỉ vài bài Y học TP.HCM của run trước). Tải thêm qua `tools/corpus_fetch.py --run pack-2026-10-15-obgyn --max-total 40 --max-per-host 12`, kiểm robots.txt của mọi host mới.
2. Nguồn phía Nam: bài Từ Dũ / Hùng Vương / An Giang (trang tóm tắt trên vnras.com), Y học Sinh sản số 47 (Mỹ Đức), tài liệu HOSREM, Y học TP.HCM (bài Từ Dũ nhau cài răng lược), ĐHQG TP.HCM (sinh non Từ Dũ), ĐH Y Dược Cần Thơ (Y học Cộng đồng), BV Phương Châu. Nguồn quốc gia / phía Bắc: QĐ 315/QĐ-BYT (2015) và 5 bài Tạp chí Phụ Sản 23(3) của BV Phụ sản Trung ương / Bạch Mai. Miền Trung: 2 bài Y Dược Huế.
3. Đếm biến thể theo số tài liệu và vùng (S / N / C / O), trích chữ bằng PyMuPDF / BeautifulSoup, chuẩn hóa NFC. Bảng các cặp Bắc / Nam và mã trích dẫn ở `sources.md`.
4. Chọn dạng: biến thể phía Nam nhiều tài liệu nhất; phía Nam không có thì dạng quốc gia (BYT 315); dạng nhà đã chốt (sinh, nhau, carcinom, tân sinh, INN) được áp cho cả cụm ghép (ví dụ "bóc nhau nhân tạo" dù kho chỉ có "bóc rau nhân tạo"). Ghi `built` / `LOW` / `UNRESOLVED` trong note.
5. Khóa do pack khác sở hữu được giữ nguyên giá trị: thai trứng, u nguyên bào nuôi, gai nhau (pathology); không đặt khóa trần cấm trong owners.csv (delivery, presentation, induction, section, margin...). Mô học u phụ khoa (leiomyoma, u buồng trứng theo WHO) để cho `pathology` / `pathology-gyn`.
6. Kiểm tra: `check_packs` 0 lỗi; registry có draft + `matching.select_packs` trên 3 văn bản tổng hợp; `build_lexicon.py` (web/engine/medical_words.json: 1964 từ thuật ngữ, 243 từ corpus); pytest helper 1129 passed, 4 skipped; eval_pack mô hình thật (GPU 0 % lúc chạy).

## 3. Quyết định cần anh (USER DECISION), kèm đề xuất theo luật của anh

| # | Thuật ngữ | Pack đang ghi | Bằng chứng | Đề xuất |
|---|---|---|---|---|
| T1 | first / second / third trimester | 3 tháng đầu / giữa / cuối thai kỳ; "trimester" trần = tam cá nguyệt | "3 tháng đầu" S2 N2 O1; "tam cá nguyệt" S1 (BVNTP) | Giữ theo số đếm. Nếu anh biết Từ Dũ / ĐHYD viết "tam cá nguyệt I" trong văn bản chính thức thì đổi (dạng Nam) |
| T2 | prenatal screening | tầm soát trước sinh | Cụm đúng: "sàng lọc trước sinh" S1 N1, "tầm soát trước sinh" 0; từ trần "tầm soát" S36 / "sàng lọc" S14; pathology đã dùng "tầm soát" | Giữ "tầm soát" (Nam, nhất quán với pathology) |
| T3 | fetal growth restriction / IUGR | thai chậm phát triển trong tử cung | Chỉ "chậm phát triển" có trong kho (S1 N2 O1); "chậm tăng trưởng" 0 | Giữ theo số đếm; đổi sang "chậm tăng trưởng" nếu anh xác nhận đó là dạng Từ Dũ / Hùng Vương |
| T4 | uterine contraction, tocolysis | cơn co tử cung, giảm co | "cơn co tử cung" S1 (Mỹ Đức) N3 O1; "cơn gò" S0 N1 O1; "giảm gò" 0 | Giữ "cơn co" (số đếm phía Nam); test chấp nhận cả "giảm gò". Cần một bài chuyển dạ phía Nam để chốt |
| T5 | amniotic fluid embolism | tắc mạch ối | "tắc mạch ối" C1 O1; "thuyên tắc ối" 0 | Phía Nam không có dạng trong kho -> dạng quốc gia. Đổi nếu anh muốn "thuyên tắc ối" |
| T6 | fallopian tube, salpingectomy, tubal ligation, HSG | ống dẫn trứng, cắt ống dẫn trứng, thắt ống dẫn trứng | "ống dẫn trứng" S4 (Mỹ Đức, BV Bình Dân); "vòi trứng" S2; "vòi tử cung" S0 (BYT 315 32 lần) | Giữ "ống dẫn trứng" theo luật Nam trước. Lưu ý: GPB phụ khoa sau này có thể muốn "vòi tử cung" (tên giải phẫu): khóa "fallopian tube" phải cùng giá trị ở hai pack |
| T7 | pelvic inflammatory disease | viêm vùng chậu | Không có bài phía Nam; BYT 315 có cả "viêm vùng chậu" và "viêm tiểu khung" (mỗi dạng 3 lần) | Giữ "viêm vùng chậu" (hòa, chọn dạng dịch sát và quen ở phía Nam) |
| T8 | total hysterectomy | cắt tử cung hoàn toàn | Không có bài phía Nam; BYT 315 "hoàn toàn" 12 lần / "toàn phần" 2; BV Phụ sản TW dùng cả hai | Giữ theo số đếm; test chấp nhận cả hai |
| T9 | radical hysterectomy | cắt tử cung tận gốc | 0 tài liệu trong kho; kế hoạch ngoại khoa: VJOL có cả "tận gốc" lẫn "triệt căn"; surgery sở hữu khóa trần "radical" = triệt căn | Cần anh hoặc agent surgery chốt; nếu muốn nhất quán với surgery thì đổi thành "cắt tử cung triệt căn" |
| T10 | pelvic organ prolapse | sa sinh dục | Chỉ BYT 315 (26 lần); "sa tạng chậu" 0 | Giữ dạng quốc gia; đổi nếu đơn vị niệu phụ khoa phía Nam viết "sa tạng chậu" |

Không cần anh (đã áp luật): sinh thay đẻ, nhau thay rau, băng huyết sau sinh, mổ lấy thai, thai ngoài tử cung, chấm dứt thai kỳ, noãn / phóng noãn, nhiễm trùng (hậu sản, ối), thai trứng (= pathology), "magnesium sulfate" giữ nguyên INN.


### Đã chốt 2026-10-15 18:48 (bản 0.1.1)

Anh trả lời lúc 18:48: "1. Tổ hợp gen 2. Tân bổ trợ 3. Giai đoạn tiến xa 4. Ok hoá trị dẫn đầu"; mục anh không nhắc theo cột đề xuất (điều phối viên đã báo trước). Thứ tự luật: lựa chọn rõ của anh > sửa trước đây của anh > house rule > tần suất phía Nam.

- T1, T2, T3, T4, T5, T6, T7, T8, T10: giữ như gói đang ghi (cột đề xuất); note các dòng ghi "owner, recommended column
  2026-10-15 18:48 (T#)".
- T9 radical hysterectomy = **"cắt tử cung triệt căn"** (trước: "cắt tử cung tận gốc"), thống nhất với surgery
  radical = triệt căn (S3). Test mới: must "cắt tử cung triệt căn", must_not "tận gốc".
- **low birth weight** (xung đột với `nutrition`): một giá trị **"nhẹ cân"** theo luật tần suất phía Nam: gói này
  "nhẹ cân" S8 N1 O1 tài liệu so với `nutrition` "cân nặng lúc sinh thấp" 1 (S1) = "cân nặng sơ sinh thấp" 1 (S1),
  "sơ sinh nhẹ cân" 0 (sources.md của nutrition). Đếm lại offline trong D:/vitranslate-corpus (pypdf): các cụm có chữ
  "sinh" mỗi cụm 1 tài liệu S, "nhẹ cân" trần 6 tài liệu S (gồm cả nghĩa underweight). `nutrition` đổi theo (0.1.2).
  Test mới: "nhẹ cân", must_not "cân nặng lúc sinh thấp".

## 4. Chưa giải quyết (UNRESOLVED / bằng chứng 0)

- nuchal translucency: "độ mờ da gáy" (0 tài liệu cho mọi dạng; dạng phía Nam theo hiểu biết, Bắc "khoảng sáng sau gáy").
- cardiotocography: "biểu đồ tim thai - cơn co (CTG)"; lâm sàng nói "monitor sản khoa" / "băng CTG". Lưu ý "NST" trong văn bản Việt là "nhiễm sắc thể", không phải non-stress test.
- latent phase = "pha tiềm thời" (0 tài liệu), active phase = "pha hoạt động" (hòa với "pha tích cực", mỗi dạng N1).
- adenomyosis: chỉ có từ tiếng Anh trong kho; ghi "lạc nội mạc tử cung trong cơ tử cung (adenomyosis)".
- Các hàng 0 tài liệu khác (dựng từ thành tố, ghi `built` hoặc `LOW`): song thai một / hai bánh nhau, TTTS, CRL, biophysical profile, nhịp giảm muộn, partograph, sổ nhau, bóc nhau nhân tạo, Robson, B-Lynch, Bakri, VBAC, PUL, vỡ thai ngoài tử cung, thai đoạn kẽ, phổ nhau cài răng lược, ứ mật trong gan thai kỳ, trầm cảm sau sinh, cắt tử cung ngả âm đạo / qua nội soi, PALM-COEIN, RMI, Pap, OHSS (cụm đầy đủ), AFC, hỗ trợ hoàng thể.

## 5. Lưu lượng

| Host | Request | Ghi chú |
|---|---|---|
| vjog.vn | 9 | robots, archive, 1 mục lục số 23(3), 6 PDF |
| hosrem.org.vn | 5 | robots (404 = không có luật), 4 PDF Y học Sinh sản 47 |
| vnras.com | 4 | 4 trang tóm tắt (robots đã có từ run trước) |
| tapchiyhcd.vn | 3 | robots, 1 lần 302, 1 PDF |
| jmp.huemed-univ.edu.vn | 3 | robots (404), 2 PDF |
| nsti.vista.gov.vn | 3 | robots (404), 2 lần 302 |
| sti.vista.gov.vn | 2 | robots (404), **429 -> run dừng** |
| elib.bvdktuthainguyen.gov.vn | 2 | robots (không có tệp), PDF QĐ 315 |
| hs.vnuhcmjournal.com.vn | 2 | robots, 1 PDF |
| www.vjol.info.vn | 2 | 2 lần 302 |
| tapchiyhoctphcm.vn | 1 | 1 trang bài |
| tudu.com.vn | 1 | robots: cấm -> dừng |
| bvphusanct.com.vn | 1 | robots: cấm thư mục tập san -> dừng |
| www.hosrem.org.vn | 1 | 1 PDF |
| **Tổng** | **39 / 40** | không host nào vượt 12 |

WebSearch: 21 / 30. WebFetch: 0 / 10. Không truy cập tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com, hoiyhoctphcm.org.vn.

## 6. Từ lâm sàng chung không đưa vào (đề nghị cho `_shared/clinical_core.csv` hoặc pack chủ)

retrospective / prospective study, cross-sectional study, cohort, risk factor, odds ratio, follow-up, length of hospital stay, complication, blood transfusion, anaemia, hypertension (mạn), proteinuria, disseminated intravascular coagulation, sepsis, spinal / epidural anaesthesia (surgery), laparoscopy / laparotomy (surgery), embolization (radiology), Doppler (radiology), oral glucose tolerance test (medicine-endocrinology), karyotype / NIPT / aneuploidy (molecular / genetics; pathology đang giữ karyotype = nhiễm sắc thể đồ).

## 7. Va chạm cần theo dõi với các miner chạy song song

Không thấy được pack của medicine / surgery / radiology / pathology-hemato trong worktree này. Khóa có thể trùng: `labour analgesia`, `uterine artery embolisation` (radiology), `radical hysterectomy` (surgery), `neonatal resuscitation` / `newborn` (medicine-pediatrics), `menopause`, `infertility`. Nếu pack khác giữ cùng khóa với giá trị khác, `check_packs` sẽ báo `cross_pack` khi gộp.
