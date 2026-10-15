# MINING_REPORT: pathology-kidney (Giải phẫu bệnh thận), draft 0.1.0

Ngày khai thác: 2026-10-14, đợt 1 (run `wave1-kidney`). Phạm vi: u thận (phân loại WHO 2022), bệnh thận nội khoa (sinh thiết thận), thận ghép và phần đường niệu trên. Pack con của `pathology`.

> Báo cáo này được **dựng lại offline** tối 2026-10-14. Miner bị ngắt khoảng 14:59, sau khi đã ghi `glossary.csv`, `rules.json`, `tests.jsonl`, `prompt.md`, `pack.json` nhưng trước bước cuối (`sources.md`, báo cáo này). Phần dữ liệu là của miner. `sources.md` và báo cáo được dựng lại từ manifest của run, các mã nguồn trong cột note và chính các tệp đã tải ở `D:/vitranslate-corpus` (chỉ đọc, không gửi request mạng nào). Mọi số đếm trong note đã được đếm lại. Số nào không xác nhận được thì ghi ở mục 4; tôi không sửa dòng glossary nào vì số đếm.

## 1. Tóm tắt (tin xấu trước)

- **Không còn log tìm kiếm.** Số lượt WebSearch / WebFetch của miner không xác định được offline. Run đã dùng **hết 40 / 40 request**: 39 tệp đọc được, 1 URL trả 301 (không có tệp). Có 1 tệp ngoài chủ đề (HueJMP22-92, ung thư phổi) và 2 bài chỉ liên quan một phần (bàng quang, cắt bàng quang bằng robot).
- **Nhiều lựa chọn ngược với bảng người dùng đã tự sửa** (`translator/glossary/learned.csv`): chromophobe = "kị sắc" (người dùng đánh dấu "kỵ màu" là sai), "carcinôm" cho các thực thể RCC, oncocytoma giữ tiếng Anh, podocyte = "tế bào có chân". Pack đang theo pack cha `pathology` ở các dòng này. Cần người dùng chốt (mục 3, K1-K4).
- **5 số đếm không xác nhận được offline** (kho có ít tài liệu hơn note ghi): kidney / renal (note 40/40, kho 37/39), ANCA-associated vasculitis, thrombotic microangiopathy, end-stage renal disease. Thêm 19 số chỉ khớp khi bỏ 2 trang bài giảng BV Nguyễn Tri Phương. Hai trang này được tải sau cùng, nên nhiều khả năng các số đó được đếm trước khi có chúng. Chi tiết ở mục 4.
- **Bằng chứng mỏng ở thực thể hiếm và tổn thương Banff:** 48 dòng là dạng ghép từ thành tố (BUILT), 40 dòng ghi LOW, 44 dòng có "freq 0" (không có dạng tiếng Việt trong kho).
- 7 dòng có thêm bằng chứng từ trang web lấy lúc chạy (xray.vn, hahoangkiem.com, clbv.vn, Long Châu, Vinmec, "vjol PNT"). Các trang này không có trong kho, nên không kiểm lại được.
- **Số liệu:** 250 dòng glossary, trong đó 14 dòng giữ tiếng Anh. Không dòng nào ghi đè khóa của pack cha (validator: 0 override). 3 khóa trùng với pack anh em và cùng giá trị (oncocytoma = headneck, adrenal gland = endocrine, CK7 = hpb). 15 test, 0 term fix. `check_packs`: 0 lỗi. Eval gemma4:e4b (cả họ): 47/50; 15/15 test của pack; 3 test trượt đều là test của pack cha.

## 2. Phương pháp (dựng lại từ manifest và note)

1. Tải toàn văn qua `tools/corpus_fetch.py --run wave1-kidney` (07:32-07:43 UTC). Chủ yếu là Y học TP.HCM (chuyên đề Niệu - Thận, hội nghị BV Bình Dân, BV Nhi Đồng 1, BV ĐH Y Dược), TCNCYH, TC Y Dược học Huế, TC Y Dược lâm sàng 108, TC Y Dược học Cần Thơ, cùng 3 trang BV Nguyễn Tri Phương.
2. Đếm biến thể theo số tài liệu và theo vùng (S / C / N / H / L, xem `sources.md`). Canonical = biến thể nhiều tài liệu nhất, phía Nam trước. Khóa trùng với pack cha giữ đúng giá trị của cha. Thực thể WHO 2022 chưa có dạng tiếng Việt được ghép từ các thành tố đã có trong pack cha (ghi BUILT).
3. Đối chiếu `translator/glossary/learned.csv` (bảng người dùng đã sửa) cho chromophobe, metanephric adenoma, cystic nephroma, MCNLMP.
4. Lượt dựng lại offline (agent này): trích chữ 39 tệp (PyMuPDF / BeautifulSoup, NFC, gộp dấu kiểu cũ), đếm lại mọi cụm có số trong note, kiểm tay các ca lệch. Kết quả nằm ở cột cuối của `sources.md`.

## 3. Quyết định cần người dùng (USER DECISION)

Xung đột với pack cha `pathology`, với bảng người dùng đã sửa, hoặc các ca hòa phía Nam. Pack hiện **giữ giá trị của pack cha** ở mọi khóa do cha sở hữu.

| # | Thuật ngữ | Pack đang ghi | Bằng chứng ngược (đếm lại offline) | Ảnh hưởng nếu đổi |
|---|---|---|---|---|
| K1 | carcinoma trong tên RCC (clear cell / papillary / clear cell papillary / tubulocystic / mucinous tubular...) | "ung thư biểu mô tế bào thận ..." (= dòng `renal cell carcinoma`, `clear cell RCC`, `papillary RCC` của pack cha) | learned.csv: "Carcinom tế bào sáng của thận", "carcinôm tế bào thận dạng nhú", "carcinôm ống-nang", "carcinôm ống nhầy và tế bào hình thoi". Lộ trình (câu 1) ghi hệ quả "giữ carcinôm". Kho phía Nam: "ung thư biểu mô tế bào thận" 2 tài liệu, "ung thư tế bào thận" 1, "carcinôm tế bào thận" 1 | Sửa cùng lúc các dòng RCC của `pathology` (chủ sở hữu) và test 1 (`must_not` "carcinôm") |
| K2 | chromophobe | "kỵ màu" (= pack cha; kho 3 tài liệu: S1 N2) | learned.csv: "kị sắc", đánh dấu "kỵ màu" là sai; kho có 0 tài liệu "kị/kỵ sắc" | Test 2 đang bắt buộc "kỵ màu" và cấm "kỵ sắc". Nếu đổi thì sửa cả dòng `chromophobe RCC` của pack cha |
| K3 | oncocytoma | "u tế bào ái toan (oncocytoma)" (= `pathology-headneck`; pack cha: renal oncocytoma = u tế bào ái toan ở thận) | learned.csv: giữ "oncocytoma" tiếng Anh, đánh dấu "u tế bào ưa axit" là sai; kho phía Nam chỉ có "u tế bào lớn (oncocytoma)" (1 tài liệu) | Phải đổi cùng `pathology-headneck` (validator bắt hai pack anh em cùng giá trị) |
| K4 | podocyte | "tế bào chân giả (podocyte)" (S2) | "túc bào" (BVNTP bài giảng, 12 lần), "tế bào có chân" (TCNCYH-3614; learned.csv "tế bào có chân (podocyte)") | foot process effacement ("xóa chân") đi theo |
| K5 | sclerosis trong bệnh cầu thận | FSGS = "xơ chai ... khu trú từng vùng" (S2), segmental sclerosis = "xơ chai từng vùng" (0 tài liệu), nhưng global glomerulosclerosis = "xơ hóa ... toàn bộ" | Pack cha: sclerosis = xơ chai. Kho: "xơ hóa (cầu thận) từng phần" 3 (S2 H1), "xơ hóa toàn bộ" 7 (S5 N1 H1), "xơ chai toàn bộ" 0 | Hiện "xơ chai" và "xơ hóa" cùng tồn tại trong một pack |
| K6 | fibrous / fibrocellular crescent | "liềm sợi", "liềm tế bào-sợi" (luật nhà fibro = sợi; GPB BV Nhân dân Gia Định, 17 lần) | "liềm xơ" 3 tài liệu S (BV Thống Nhất, BV Nhi Đồng 1, ĐHYD) | Luật nhà thắng số đếm phía Nam 1:3 |
| K7 | arteriolar hyalinosis | "hyalin hóa tiểu động mạch" (S3) | Pack cha: hyalinization = "thoái hóa kính" (0 tài liệu trong kho thận) | Khóa khác nhau nên validator không bắt, nhưng hai pack lệch nhau về chữ |
| K8 | renal amyloidosis | "thoái hóa dạng bột ở thận" (theo pack cha amyloidosis) | 0 tài liệu; kho giữ "amyloidosis" (4 tài liệu: S3 N1), "bệnh amyloid thận" 1, "lắng đọng amyloid" 1 | Bằng chứng ngược với dòng `amyloidosis` của pack cha |
| K9 | WHO/ISUP nuclear grade, nuclear grade | "độ nhân (WHO/ISUP)", ghép từ thành tố, 0 tài liệu | Kho viết "độ mô học" (5 tài liệu: S2 C1 N2), trái luật histologic = mô bệnh học; learned.csv: ISUP nucleolar grade = "độ hạt nhân theo ISUP" | Chọn một dạng cho cả độ ISUP |
| K10 | minimal change disease | "bệnh cầu thận tổn thương tối thiểu" (đúng cụm 1, H1) | "tổn thương (cầu thận) tối thiểu" 3 (S2 H1), "sang thương tối thiểu" 3 (S3: phân môn Thận ĐHYD, BV Nhi Đồng 1) | Hòa ở phía Nam |
| K11 | proteinuria | "đạm niệu" 9 (S7 H2) | "protein niệu" 11 (S6 C1 N4), "tiểu đạm" 7 (S5 H2) | Phía Nam gần hòa; toàn quốc nghiêng về "protein niệu" |
| K12 | radical / partial nephrectomy | "cắt thận tận gốc" 4 (S3 C1); "cắt một phần thận" 4 (S2 C1 L1) | "cắt thận triệt căn" 2 (N2); "cắt thận bán phần" 3 (C1 N2, 22 lần) | Đã áp luật phía Nam trước. Lộ trình xếp "triệt căn / tận gốc" trong tiết niệu vào nhóm cần hỏi đồng nghiệp |

Không có xung đột nào với quyết định 6 (LVI / PNI = xâm nhập, invasion trần = xâm lấn). Các dòng "invasion" ở đây đều là xâm lấn đại thể / giai đoạn (mỡ quanh thận, mỡ xoang thận, tĩnh mạch thận), và đều viết "xâm lấn". Riêng "invasive urothelial carcinoma" = "... xâm nhập" theo mẫu `invasive ductal carcinoma` của pack cha. Ứng viên cho `_shared/specimen_context` (quyết định 11): `nephrectomy specimen`.

### Thay đổi 2026-10-15 18:48 (bản 0.1.3)

- end-stage renal disease = **"bệnh thận giai đoạn cuối"** (trước: "suy thận giai đoạn cuối") theo medicine M8 (cột đề
  xuất anh đã nhận): một giá trị với `medicine` và với dòng end-stage kidney disease của gói này. Tin xấu: số đếm của
  gói này nghiêng về "suy thận giai đoạn cuối" (7 tài liệu, S5 N2). proteinuria = "đạm niệu" được xác nhận (M11).
  Thêm 1 test.

## 4. Số đếm không xác nhận được offline

Dòng glossary giữ nguyên. Chi tiết từng dòng ở cột cuối của `sources.md`.

| Dòng | Note ghi | Đếm lại trong kho |
|---|---|---|
| kidney, renal | "freq 40/40 docs" | 40 request chỉ ra 39 tệp; "thận" có trong 37/39 (thiếu bài phổi HueJMP22-92 và bài bàng quang HueJMP17-22) |
| ANCA-associated vasculitis | 3 docs (S2 N1) | đúng cụm 1 (S1); "viêm mạch máu liên quan ANCA" 2 (S2); không tìm được tài liệu N nào |
| thrombotic microangiopathy | 2 docs (S2) | đúng cụm 1 (S1); thêm "viêm vi mạch huyết khối" 1 (HueJMP20-85) |
| end-stage renal disease | 7 docs (S5 N2) | đúng cụm 2 (N2). Dạng phía Nam là "suy thận mạn giai đoạn cuối" (7 tài liệu: S6 C1) |
| Bằng chứng web (oncocytoma, favorable histology, focal / diffuse anaplasia, central scar, acute interstitial nephritis, acute rejection) | xray.vn, hahoangkiem.com, clbv.vn, Long Châu, Vinmec, "vjol PNT" | Không có tệp trong kho, không kiểm được |

Các số lệch nhưng đã xác nhận bằng tay (OK_MANUAL, 7 dòng): "típ nhú" trong note thực ra là "týp nhú" (14 lần); PAS 12 = số tài liệu có chữ "PAS" (đúng cụm "nhuộm PAS" chỉ 5); Congo 3 = số tài liệu có chữ "Congo" (đúng cụm "đỏ Congo" 0); mesangial proliferation, subendothelial deposits, global glomerulosclerosis và diabetic nephropathy được đếm cả dạng có thêm chữ ("tăng sinh tế bào gian mạch", "dưới nội mô", "xơ hóa cầu thận toàn bộ", "bệnh thận do đái tháo đường"). Tổng cộng trên 143 số đếm trong note: 96 OK, 19 OK_NOH, 7 OK_MANUAL, 16 LOCAL_MORE, 5 LOCAL_LESS.

## 5. Mức bằng chứng, dòng giữ tiếng Anh, chưa giải quyết

- 157 dòng có nguồn trong kho (mã nguồn hoặc số đếm > 0). 48 dòng BUILT (ghép từ thành tố, phần lớn là thực thể WHO 2022 và tổn thương Banff). 40 dòng ghi LOW.
- **Giữ tiếng Anh (14):** RCC, ccRCC, PAX8, CAIX, CD117, CK7, cathepsin K, TFE3, SDHB, GATA3, Melan-A, FSGS, PLA2R, C4d. Thêm các mã giữ trong ngoặc: WHO/ISUP, Fuhrman, ISN/RPS, MEST-C, Banff, TCMR / AMR / IFTA / DSA.
- **Chưa có dạng tiếng Việt trong kho (BUILT, cần xác nhận khi có thêm tài liệu):** clear cell papillary renal cell tumor, TFEB-altered / ALK-rearranged / ELOC-mutated RCC, eosinophilic solid and cystic RCC, mucinous tubular and spindle cell carcinoma, tubulocystic RCC, RCC with fibromyomatous stroma, papillary renal neoplasm with reverse polarity, low-grade oncocytic tumor, eosinophilic vacuolated tumor, nephrogenic rest, raisinoid nuclei, wire loop, hyaline thrombi, basement membrane spikes, collapsing variant, tip lesion, glomerulitis, microvascular inflammation, intimal arteritis, donor-specific antibodies, BK polyomavirus nephropathy, calcineurin inhibitor toxicity.

## 6. Lưu lượng

| Host | Request | Kết quả |
|---|---|---|
| tapchiyhoctphcm.vn | 19 | 15 PDF + 4 trang tóm tắt HTML |
| www.tapchiyhoctphcm.vn | 1 | 1 PDF |
| tapchinghiencuuyhoc.vn | 8 | 7 PDF + 1 trang tóm tắt |
| jmp.huemed-univ.edu.vn | 6 | 5 PDF + 1 x 301 (không có tệp) |
| bvnguyentriphuong.com.vn | 3 | 3 trang HTML |
| tcydls108.benhvien108.vn | 2 | 1 PDF + 1 trang tóm tắt |
| tapchi.ctump.edu.vn | 1 | 1 PDF |
| **Tổng** | **40 / 40** | 39 tệp đọc được; không gặp 429 / 403 / reset (`counter.json`: stopped = null) |

WebSearch / WebFetch: không xác định được (phiên miner đã mất, không có log). Lượt dựng lại offline: 0 request mạng; chỉ gọi Ollama cục bộ (127.0.0.1) cho eval.

## 7. Kiểm tra (chạy lại tối 2026-10-14)

- `tools/check_packs.py packs`: 0 lỗi (28 cảnh báo đều thuộc pack `pathology`: 27 khóa có ngoặc, 1 khóa trùng). Pack này không có override, cảnh báo hay lỗi nào.
- `tools/build_registry.py packs <scratch> --include-drafts`: 261 profile terms, không cảnh báo.
- Thăm dò chọn pack (đoạn tổng hợp tự viết): bệnh phẩm cắt thận RCC chọn `pathology-kidney` 0,242 + `pathology`; sinh thiết thận bệnh IgA chọn `pathology-kidney` 0,242 + `pathology`; đoạn GPB vú (đối chứng) không chọn pack thận.
- Test là câu tự viết: so với toàn bộ kho (195 tệp, gồm cả bài PMC tiếng Anh), chuỗi từ dài nhất trùng với một tài liệu là 5 từ ("clear cell renal cell carcinoma"), tức chỉ là thuật ngữ. Không có test nào phải viết lại.
- `cd helper && python -m pytest -q`: 715 passed, 2 deselected (lần chạy cuối, trước khi commit).
- `tools/eval_pack.py pathology-kidney gemma4:e4b --dir --family` (GPU, Ollama cục bộ): **47/50**. 15/15 test của pack đều đạt. 3 test trượt đều của pack cha (myxoid stroma; hai câu về hepatocyte) và cũng trượt khi chạy riêng pack cha (32/35). Chạy riêng pack, không có cha: 13/15. Mô hình mặc định trong tiêu chí nhận pack của lộ trình là qwen3.5:9b; lần này dùng gemma4:e4b theo yêu cầu.
