# MINING_REPORT: pathology-breast (draft 0.1.0)

Ngày khai thác: 2026-10-13. Trạng thái: **DRAFT** (`"draft": true` trong pack.json; `tools/build_registry.py` bỏ qua pack này nếu không có `--include-drafts`). Chưa commit.

## 1. Phương pháp

1. Chọn khoảng 60 thuật ngữ gốc từ WHO Classification of Breast Tumours (ấn bản 5) và các mục trong báo cáo giải phẫu bệnh vú (danh sách do coordinator đưa).
2. Tra từng cụm (gộp các thuật ngữ gần nhau khi được), ưu tiên tạp chí VN có phản biện: Tạp chí Y học Việt Nam (tapchiyhocvietnam.vn và các bài đăng lại trên vnras.com), Tạp chí Nghiên cứu Y học (ĐH Y Hà Nội), Y học TP.HCM, Tạp chí Y Dược học Huế, VNU J Sci Med Pharm Sci, Y Dược lâm sàng 108, cùng hướng dẫn chẩn đoán và điều trị ung thư vú của Bộ Y tế (QĐ 3128/QĐ-BYT 2020). Trang bệnh viện và nhà thuốc (Vinmec, Tâm Anh, Long Châu, Pharmacity) được đếm riêng là "lay".
3. Với mỗi thuật ngữ: đếm số **nguồn khác nhau** dùng từng biến thể, lấy từ tiêu đề nguyên văn, trang đã mở (WebFetch) hoặc đoạn trích của công cụ tìm kiếm (đánh dấu *snippet* trong sources.md). Một bài toàn văn (VNU21) được trích chữ cục bộ từ PDF đã tải.
4. Chọn canonical = biến thể phổ biến nhất trong y văn peer-reviewed VN. Quy tắc về tính nhất quán với pack cha `pathology`:
   - Nếu pack cha ghi một **quyết định rõ ràng của user** hoặc có **term_fix** (cấm một dạng), pack vú **giữ giá trị của pack cha** và ghi xung đột ở mục 4.
   - Nếu giá trị của pack cha chỉ là mặc định, chưa ghi quyết định, thì pack vú chỉ đổi khi y văn vú có **ít nhất 2 nguồn peer/hướng dẫn** ủng hộ biến thể khác; mọi lần đổi đều ghi ở mục 4.
   - Nếu không có y văn VN: giữ tiếng Anh (H-score, RCB, HER2-ultralow, BI-RADS), hoặc theo tiền lệ của pack cha là dùng cụm mô tả kèm gloss EN trong ngoặc (FEA, columnar cell lesion, sclerosing adenosis, macrometastasis, EIC).
5. Không chép câu nào từ bài báo; chỉ lấy cặp thuật ngữ, số đếm và trích dẫn.

**Số lượt tìm:** 87 WebSearch + 13 WebFetch = **100 lượt gọi web** (giới hạn khoảng 120), cộng 1 lần trích chữ cục bộ từ PDF VNU21. Có 2 lần fetch hỏng: luận án HMU (HTTP 500) và trang tnjos chuyển hướng (đã fetch lại).

**Kiểm tra đã chạy:** `load_pack` đọc được 88 dòng glossary, 0 term_fix, 10 test (test nào cũng có `must`); không có dòng EN trùng; CSV UTF-8, không BOM, xuống dòng LF. Không pattern `wrong` nào của pack cha khớp với canonical của pack vú. `build_registry.py packs <out>` bỏ qua pack draft; thêm `--include-drafts` thì build được (99 profile terms).

## 2. Kết quả

- Glossary có **88 dòng**. Một số thuật ngữ có 2 dòng vì khác chính tả (tumor/tumour, pathologic/pathological), và có thêm vài dòng ngoài danh sách gốc khi có bằng chứng: microinvasive, encapsulated/solid papillary, NPI, hormone receptor, DISH, BCS, mastectomy, axillary dissection, basal-like, complex sclerosing lesion, fibrocystic change, perineural invasion.
- 88 dòng = 84 thuật ngữ khác nhau (4 dòng chỉ là biến thể chính tả).
- **Canonical tiếng Việt có nguyên văn trong nguồn VN: 72 dòng (69 thuật ngữ).** Số này gồm cả các dòng bằng chứng chỉ ở mức lay hoặc 1 nguồn; mức tin cậy ghi trong cột note.
- **Canonical tiếng Việt nhưng không có nguyên văn trong y văn vú (chọn để nhất quán với pack cha hoặc ghép từ thành tố đã có):** histologic grade, Nottingham histologic grade ("độ mô bệnh học"; y văn vú dùng "độ mô học"), lobular neoplasia ("tân sinh"; BYT dùng "tân sản"), TILs ×2 (dạng gần với các biến thể đã thấy), apocrine metaplasia.
- **Giữ tiếng Anh vì y văn VN cũng giữ EN hoặc không có thuật ngữ:** HER2-ultralow, H-score, residual cancer burden (RCB), BI-RADS.
- **Chưa giải quyết (không tìm thấy y văn VN, dùng cụm mô tả kèm gloss EN):** flat epithelial atypia, columnar cell lesion, sclerosing adenosis, macrometastasis, extensive intraductal component, myoepithelial cell (dạng nhất quán với pack cha nhưng không có nguồn).
- **Bằng chứng yếu (chỉ 1 nguồn peer hoặc chỉ lay):** tubule formation, nuclear pleomorphism, apocrine metaplasia, comedo necrosis, radial scar, complex sclerosing lesion, usual ductal hyperplasia, ADH, ALH, medullary carcinoma / medullary pattern, microinvasive, solid papillary, DISH, HER2 overexpression, H-score.
- `rules.json` để trống. Không biến thể sai nào đạt đủ cả hai điều kiện: thấy nguyên văn trong văn bản máy dịch hoặc văn bản phổ thông, VÀ có bằng chứng y văn mạnh phản bác. Ứng viên "loạn sản ống dẫn không điển hình" (dùng cho ADH) chỉ thấy trong một đoạn tóm tắt của công cụ tìm kiếm, chưa kiểm được nguyên văn, nên không đưa vào.

### Câu hỏi còn mở của pack cha: carcinoma = "ung thư biểu mô" hay "carcinôm"?
Y văn vú VN dùng áp đảo **"ung thư biểu mô" (UTBM)**: ≥15 nguồn peer, gồm hướng dẫn Bộ Y tế, BV K, ĐH Y Hà Nội, Huế, 108 và cả bài năm 2003 của Tạp chí Y học TP.HCM. "Carcinôm/carcinom" chỉ gặp ở 3 bài, đều phía Nam (VMJ-11344, VMJ-745 của BV Từ Dũ, YHTPHCM10). Ngay ung thư biểu mô tế bào gai ở vú cũng viết "ung thư biểu mô tế bào gai" (VMJ-3175). Kết quả này khớp dòng `carcinoma` của pack cha. Lưu ý: bản thân pack cha đang không nhất quán (squamous cell carcinoma và SCLC lại dùng "carcinôm").

## 3. Mười dòng mẫu

| en | vi | note (rút gọn) |
|---|---|---|
| ductal carcinoma in situ | ung thư biểu mô ống tại chỗ (DCIS) | freq 4 vs "nội ống" 2 |
| invasive breast carcinoma of no special type | ung thư biểu mô vú xâm nhập típ không đặc biệt (NST) | freq 4 vs 1 |
| phyllodes tumor | u diệp thể | 4 vs "u phyllode" 2 |
| fibroadenoma | u xơ tuyến | 4 peer vs "u sợi tuyến" 0 peer |
| HER2-low | HER2 thấp | 2 peer + 3 lay |
| sentinel lymph node biopsy | sinh thiết hạch cửa | 2 peer vs "hạch gác cửa" 1 peer + 3 lay |
| pathologic complete response | đáp ứng hoàn toàn mô bệnh học (pCR) | 3 vs 2 vs 1 |
| triple-negative | bộ ba âm tính | 5 vs "tam âm" 1 lay |
| microcalcification | vi vôi hóa | 3 vs "vi canxi hóa" 1 |
| lymphovascular invasion | xâm nhập mạch bạch huyết | 6 peer vs "xâm lấn" 0 peer (xung đột với pack cha) |

## 4. Xung đột với pack cha `pathology`

| # | Thuật ngữ | Pack cha | Y văn vú (bằng chứng) | Pack vú đang ghi |
|---|---|---|---|---|
| C1 | histologic grade / Nottingham grade | phân độ mô bệnh học; prompt: "không viết mô học" (quy tắc user) | "độ mô học" 6+ peer (BYT20, VMJ-H2L, VNU21, YHTPHCM03, TCNCYH-3232, VMJ-16057), "độ mô bệnh học" 0 | **giữ pack cha**: độ mô bệnh học |
| C2 | lymphovascular invasion | xâm lấn mạch bạch huyết | "xâm nhập mạch (bạch huyết)" 6 peer + BYT20 "xâm nhập bạch mạch"; "xâm lấn" 0 peer | **đổi**: xâm nhập mạch bạch huyết |
| C3 | perineural invasion | xâm lấn quanh thần kinh | "xâm nhập (quanh) thần kinh" 2 (1 có snippet) | **đổi**: xâm nhập quanh thần kinh |
| C4 | cribriform | dạng sàng | "mặt sàng" 3 peer (BYT20, VMJ-16057, VNU21) + Vinmec; "dạng sàng" 0 | **đổi**: mặt sàng |
| C5 | mitotic count | mitotic figures = phân bào | "nhân chia" 3 (1 luận án snippet + 2 Vinmec) vs "phân bào" 1 | **giữ pack cha**: số phân bào (bằng chứng vú chưa đủ 2 nguồn peer) |
| C6 | fine needle aspiration | chọc hút tế bào bằng kim nhỏ (FNA); rules.json cấm "chọc hút kim nhỏ" | BYT20 + bài FNA vú (nsti, snippet) + trang Vinmec dùng "chọc hút kim nhỏ" | **giữ pack cha**. Lưu ý: rule sẽ biến "tế bào học chọc hút kim nhỏ" thành "tế bào học chọc hút tế bào bằng kim nhỏ" (lặp chữ) |
| C7 | fibroadenoma (quy tắc house fibro = sợi) | fibro = sợi (ngoại lệ: myxoma vẫn là "u nhầy") | "u xơ tuyến" 4 peer; "u sợi tuyến" 0 peer, 1 lay | **đổi**: u xơ tuyến (coi như ngoại lệ giống "u nhầy"). fibrocystic change hòa 1:1 nên theo quy tắc: thay đổi sợi bọc |
| C8 | borderline | giữ nguyên EN "borderline" | u diệp thể "giáp biên" (VMJ-1989, Vinmec) | thêm dòng riêng "borderline phyllodes tumor = u diệp thể giáp biên" |
| C9 | neoplasm (lobular neoplasia) | tân sinh / u | BYT20 "tân sản tiểu thùy" (1) | **giữ pack cha**: tân sinh tiểu thùy |
| C10 | hyperplasia (ADH/ALH/UDH) | tăng sản (cấm "phì đại") | "quá sản" 2 (BYT20, Vinmec) vs "tăng sản" 4 lay | **giữ pack cha**: tăng sản |
| C11 | lymphocyte (TILs) | lympho bào; rule cấm "tế bào lympho" | "xâm nhập lympho vào mô u", "lympho bào xâm nhập mô đệm", "thấm nhập lympho bào trong u" | lympho bào xâm nhập u (TILs). Ghi chú pack cha "infiltrate = thâm nhiễm" áp cho viêm; y văn vú dùng "xâm nhập" cho TILs |
| C12 | core biopsy | sinh thiết lõi | "sinh thiết kim lõi" cho core NEEDLE biopsy (BYT20) | thuật ngữ cụ thể hơn, không mâu thuẫn |

**Ảnh hưởng tới test:** `merge_packs` gộp test của mọi pack được chọn. Khi pack vú đứng trước pack cha, test số 6 của pack cha ("Lymphovascular invasion was present in two sections.", must "xâm lấn mạch bạch huyết") sẽ **mâu thuẫn** với canonical của pack vú. Nếu C2 được duyệt, cần đổi test đó sang `must_any` (xâm nhập / xâm lấn), hoặc chốt một dạng chung cho cả hai pack. Test số 2 của pack vú đã dùng `must_any` cho LVI vì lý do này.

## 5. Cần người quyết định

1. **C1, độ mô học / độ mô bệnh học:** y văn vú 6+ : 0 nghiêng về "độ mô học", nhưng có quy tắc user "histologic = mô bệnh học". Có cho ngoại lệ ở cụm "histologic grade" không?
2. **C2/C3, xâm nhập hay xâm lấn** cho invasion trong u vú (LVI, PNI): áp riêng cho pack vú hay sửa luôn pack cha? (xem phần ảnh hưởng tới test ở trên)
3. **C7, u xơ tuyến hay u sợi tuyến**; và fibrocystic change: "thay đổi sợi bọc" hay "biến đổi xơ nang".
4. **C4, mặt sàng hay dạng sàng.**
5. **C5, nhân chia hay phân bào** (mitotic count / mitoses trong phân độ Nottingham).
6. **C6, rule FNA:** nới rule hay giữ.
7. **molecular subtype:** "phân nhóm phân tử" (5) và "phân típ phân tử" (4) gần ngang nhau.
8. **Luminal A/B:** "lòng ống A (Luminal A)" (6) hay giữ EN "Luminal A" (5).
9. **sentinel lymph node:** "hạch cửa" (peer, BYT) hay "hạch gác cửa" (lay phổ biến hơn).
10. **Paget disease of the nipple:** "bệnh Paget núm vú" (theo BYT, sát nghĩa nipple) hay "bệnh Paget vú" (MSD + lay, khoảng 5 nguồn).
11. **TILs:** "lympho bào xâm nhập u (TILs)", hoặc dạng của VNU21 "xâm nhập lympho vào mô u".
12. **Các thuật ngữ chưa có y văn VN:** FEA, columnar cell lesion, sclerosing adenosis, macrometastasis ("đại di căn" hay "di căn lớn"), EIC, HER2-ultralow (giữ EN hay "HER2 cực thấp"), radial scar ("sẹo tỏa tia" hay "sẹo nan hoa").

## 6. Giới hạn

- Số đếm là số nguồn **tìm được** qua khoảng 100 lượt tra, không phải tần suất toàn văn. Nhiều trang vnras.com đăng lại bài TCYHVN, nên mỗi bài được đếm 1 lần.
- Một số bằng chứng chỉ đến từ đoạn trích của công cụ tìm kiếm (đánh dấu *snippet*). Các số đếm quyết định canonical (DCIS, NST, LVI, cribriform, fibroadenoma, triple-negative, pCR, grade) có ít nhất 1–2 nguồn đã mở toàn văn hoặc tóm tắt (BYT20, VMJ-H2L, VNU21, VMJ-16057, YHTPHCM03).
- Không tra được Tạp chí Ung thư học Việt Nam (vjco.vn): tìm theo domain không ra kết quả.
