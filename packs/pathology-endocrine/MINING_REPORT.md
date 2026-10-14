# MINING_REPORT: pathology-endocrine (Giải phẫu bệnh nội tiết), draft 0.1.0

Ngày khai thác: 2026-10-14, đợt 1 (run `wave1-thyroid`). Phạm vi: tuyến giáp (trọng tâm: u, viêm, phình giáp, tế bào học Bethesda, phẫu thuật và giai đoạn), cận giáp, thượng thận, tuyến yên, u thần kinh nội tiết. Pack con của `pathology`.

> Báo cáo này được **dựng lại offline** tối 2026-10-14. Miner bị ngắt khoảng 14:59, sau khi đã ghi `glossary.csv`, `rules.json`, `tests.jsonl`, `prompt.md`, `pack.json` nhưng trước bước cuối (`sources.md`, báo cáo này). Phần dữ liệu là của miner. `sources.md` và báo cáo được dựng lại từ manifest của run, các mã nguồn trong cột note và chính các tệp đã tải ở `D:/vitranslate-corpus` (chỉ đọc, không gửi request mạng nào). Mọi số đếm trong note đã được đếm lại. Số nào không xác nhận được thì ghi ở mục 4. Không sửa dòng glossary nào; chỉ sửa 1 test (mục 7).

## 1. Tóm tắt (tin xấu trước)

- **4 dòng ghi đè pack cha** (validator báo INFO override): `poorly differentiated thyroid carcinoma`, `anaplastic thyroid carcinoma` (UTBM sang carcinôm), `goiter` ("nhân giáp" sang "phình giáp"), `frozen section` ("lát cắt lạnh" sang "sinh thiết tức thì", theo quyết định 6). Ba dòng đầu cần người dùng chốt (mục 3, E1-E3).
- **Ba lựa chọn ngược với bảng người dùng đã sửa:** pheochromocytoma (learned.csv: "u tủy thượng thận"), neuroendocrine carcinoma (learned.csv: "carcinôm thần kinh nội tiết"), psammoma body (`glossary_review.csv`: "thể psammoma"; kho phía Nam cũng nghiêng về "thể psammoma" 2:1). Test 3 đang cấm "thể psammoma".
- **Không còn log tìm kiếm.** Số lượt WebSearch / WebFetch của miner không xác định được. Run dùng 34 / 40 request: 32 tệp đọc được, 2 lần 302 (jcmhch.com.vn đòi đăng nhập; VJOL đổi URL rồi tải được). **3 tệp ngoài chủ đề** (MRI u buồng trứng, cắt tuyến tiền liệt, lymphoma tai mũi họng): mất 3 request.
- **2 số đếm không xác nhận được offline** (Bethesda category 7, adrenal gland 15). Thêm 6 số chỉ khớp khi đếm trên cả kho đợt 1 (tài liệu của run thận và run phân tử), tức miner đã đếm trên kho chung. Một nguồn được trích không có trong kho: YHCM09-FNA.
- 9 thuật ngữ WHO 2022 chưa có dạng tiếng Việt (UNRESOLVED): NIFTP (tên đầy đủ), FT-UMP, WDT-UMP, hyalinizing trabecular tumour, cribriform morular thyroid carcinoma, differentiated high-grade thyroid carcinoma, hobnail subtype, completion thyroidectomy, PitNET (tên đầy đủ).
- **Số liệu:** 170 dòng glossary, trong đó 8 dòng giữ tiếng Anh. 4 dòng ghi đè pack cha. 11 khóa trùng với pack anh em và cùng giá trị (headneck, breast, gi, hpb, kidney, molecular-pathology). 15 test, 0 term fix. `check_packs`: 0 lỗi. Eval gemma4:e4b (cả họ): 46/50; 14/15 test của pack.

## 2. Phương pháp (dựng lại từ manifest và note)

1. Tải toàn văn qua `tools/corpus_fetch.py --run wave1-thyroid` (07:33-07:47 UTC). Nguồn: Y học TP.HCM, TC Y Dược học Phạm Ngọc Thạch, TC Y Dược học Cần Thơ, 12 trang của BV Nguyễn Tri Phương (bài giảng GPB tuyến giáp P1-P3, FNA, Hashimoto, thượng thận, tuyến yên...), BV ĐH Y Dược (NET), TCNCYH, BV Quân y 103, TC Y Dược học Quân sự và QĐ 1514/QĐ-BYT (2020). Note còn trích 5 tài liệu do run phân tử và run thận tải về.
2. Đếm biến thể theo số tài liệu và theo vùng (S / N / O, xem `sources.md`). Canonical = biến thể phía Nam nhiều tài liệu nhất. Khi nguồn GPB phía Nam (BV Nguyễn Tri Phương, Y học TP.HCM) khác nguồn lâm sàng, miner chọn dạng GPB, kèm house style "carcinôm" và "dạng" (carcinôm tuyến giáp dạng nhú / nang / tủy). Thực thể WHO 2022 chưa có dạng tiếng Việt thì ghép từ thành tố của pack cha (ghi built / UNRESOLVED).
3. Đối chiếu bảng người dùng đã sửa: `glossary_review.csv` (colloid nodule = phình giáp keo) và bộ deck tuyến giáp của người dùng ("user thyroid deck"; không kiểm được offline).
4. Lượt dựng lại offline (agent này): trích chữ 37 tệp, đếm lại mọi cụm có số trong note, kiểm tay các ca lệch. Kết quả nằm ở cột cuối của `sources.md`.

## 3. Quyết định cần người dùng (USER DECISION)

| # | Thuật ngữ | Pack đang ghi | Bằng chứng ngược (đếm lại offline) | Ảnh hưởng nếu đổi |
|---|---|---|---|---|
| E1 | carcinoma tuyến giáp (PDTC, ATC; cùng mẫu với PTC / FTC / MTC) | "carcinôm tuyến giáp ...", **ghi đè** dòng "ung thư biểu mô tuyến giáp biệt hóa kém / thoái sản" của pack cha | Kho phía Nam: "carcinôm tuyến giáp" 5 tài liệu so với "ung thư biểu mô tuyến giáp" 2 (S2 N4 O1 toàn quốc). Pack cha 0.1.8 vẫn dùng UTBM cho PDTC / ATC, nhưng dùng "carcinôm nhú vi thể tuyến giáp" (người dùng 2026-10-14) | Chấp nhận ghi đè (rồi sửa 2 dòng của pack cha cho thống nhất) hay quay về UTBM |
| E2 | anaplastic thyroid carcinoma | "carcinôm tuyến giáp thoái sản (ATC)" (luật nhà anaplastic = thoái sản; learned.csv "Carcinom thoái sản") | Y văn gọi ATC là "không biệt hóa": 10 tài liệu (S5 N4 O1), trong đó GPB phía Nam viết "carcinôm tuyến giáp không biệt hóa" 2; "thoái sản" chỉ 1 (BYT) | Luật nhà và bảng người dùng sửa cùng ủng hộ "thoái sản"; cần chốt có chấp nhận lệch y văn không |
| E3 | goiter / multinodular goiter | "phình giáp" / "phình giáp đa nhân", **ghi đè** pack cha `goiter` = "nhân giáp" | "phình giáp" 4 tài liệu S (GPB); lâm sàng phía Nam viết "bướu giáp" 8 (S6 N1 O1) và "bướu giáp đa nhân" 3 (S3); "phình giáp đa nhân" 0. Bản thân pack cha không nhất quán: thyroid nodule = nhân giáp, nodular goiter = bướu giáp nhân, follicular goiter = phình giáp tuyến | Chốt một hệ cho goiter, rồi sửa các dòng của pack cha cho khớp |
| E4 | psammoma body | "thể cát" (ghi chú của pack cha; S1 O1) | "thể psammoma" 3 (S2 N1); `glossary_review.csv` người dùng sửa thành "thể psammoma" | Test 3 bắt buộc "thể cát" và cấm "thể psammoma": phải đảo nếu đổi |
| E5 | pheochromocytoma | "u tế bào ưa crom (pheochromocytoma)" (BYT1514 và BVNTP-UTTT, mỗi tài liệu 20 lần) | learned.csv: "u tủy thượng thận" (đánh dấu "u thượng thận" là sai); BVNTP-PHEO viết "u tủy thượng thận". Phía Nam hòa 1:1 | Test 12 chấp nhận cả "u tế bào ưa crom / ưa crôm" |
| E6 | neuroendocrine carcinoma | "ung thư biểu mô thần kinh nội tiết (NEC)" (= `pathology-gi`; hai pack anh em phải cùng giá trị) | learned.csv: "carcinôm thần kinh nội tiết (NEC)"; BVDHYD-NET viết "carcinoma thần kinh nội tiết" | Phải đổi cùng `pathology-gi` |
| E7 | adrenal cortical carcinoma | "carcinôm vỏ thượng thận (ACC)" (house form, 0 tài liệu) | Phía Nam: BVNTP-ACC "ung thư biểu mô vỏ thượng thận" (18 lần); "ung thư vỏ thượng thận" 2 (S1 O1) | Đi theo câu E1 |
| E8 | minimally / widely invasive follicular carcinoma, NIFTP | "xâm lấn tối thiểu / xâm lấn rộng / không xâm lấn" (theo pack cha: capsular invasion = xâm lấn vỏ bao, vascular invasion = xâm lấn mạch máu) | GPB phía Nam (BVNTP-GPB3) viết "xâm nhập tối thiểu", "xâm nhập lan rộng". "xâm lấn tối thiểu / rộng" có trong BYT1514, BV103 và 1 trang BVNTP. Quyết định 6 đặt LVI = xâm nhập, mà xâm nhập mạch trong carcinôm tuyến giáp là tổn thương vi thể | Hỏi: invasion vỏ bao / mạch máu (dòng của pack cha) theo 6B "xâm nhập" hay giữ "xâm lấn" |
| E9 | medullary thyroid carcinoma | "dạng tủy" (S2) | "thể tủy" 5 (S1 N3 O1) | Đã áp luật phía Nam trước (gần hòa) |

Không cần người dùng: `frozen section` = "sinh thiết tức thì" đúng quyết định 6 đã chốt và đúng `pathology-headneck`. Dòng `frozen section` = "lát cắt lạnh" của pack cha nên được sửa ở bản pathology tới (đề xuất). Các dòng xâm lấn đại thể (extrathyroidal extension, extranodal extension) dùng "xâm lấn", đúng quyết định 6. Level VI = "nhóm VI" đúng quyết định đã ghi. Không có dòng nào dùng "lơ xê mi", "vảy", "tỉ lệ", "ADN" hay dấu kiểu cũ.

## 4. Số đếm không xác nhận được offline

| Dòng | Note ghi | Đếm lại trong kho |
|---|---|---|
| Bethesda category | 7 tài liệu ("nhóm I-VI" trong bảng Bethesda; S5 N1 O1) | "Bethesda" có trong 6 tài liệu (S4 N1 O1); nhóm Bethesda kiểu "nhóm IV" thấy ở 4 |
| adrenal gland | 15 tài liệu (S11 N3 O1) | tập nội tiết có 13 (S10 N2 O1) |
| YHCM09-FNA (trích ở follicular adenoma) | nguồn "bướu tuyến dạng nang" | không có tệp nào trong kho khớp; số 3 tài liệu của dòng đó vẫn đúng nhờ BVNTP-GPB2/3, BVNTP-FNA |
| "user thyroid deck 2026-07-17", tiêu đề JCMHCH "Bethesda nhóm IV" | trích trong note | không có trong kho (JCMHCH trả 302 về trang đăng nhập) |

Chỉ khớp khi đếm trên cả kho đợt 1 (OK_WIDER, 6 số): u tuyến thượng thận, neuroblastoma, Cushing syndrome, "thần kinh nội tiết", chromogranin A, synaptophysin. Các tài liệu thêm vào nằm trong run thận (YHTPHCM16-116, YHTPHCM18-95, YHTPHCM18-289, HueJMP22-92) và run phân tử. Đã xác nhận bằng tay (OK_MANUAL, 10 số): carcinôm tế bào Hürthle ở 2 dòng (chữ "ü" bị mất khi trích HTML nên bộ đếm tự động trả 0), FTC 1 + 1 như note giải thích, "dạng tủy" 2, "u tuyến (tuyến) giáp dạng nang" 3, "chồng chất" 2, "hormôn" 1, TI-RADS + TIRADS = 7, "xâm lấn ngoài hạch" 1, NET "biệt hóa tốt" 1. Tổng cộng trên 237 số đếm trong note: 177 OK, 10 OK_MANUAL, 6 OK_WIDER, 42 LOCAL_MORE, 2 LOCAL_LESS.

## 5. Mức bằng chứng, dòng giữ tiếng Anh, chưa giải quyết

- 137 dòng có nguồn trong kho. 30 dòng built (ghép từ thành tố), 16 dòng LOW, 47 dòng có "freq 0".
- **Giữ tiếng Anh (8):** NIFTP, TI-RADS, calcitonin, BRAF V600E, PitNET, chromogranin A, synaptophysin, INSM1. Thêm các tên giữ trong ngoặc hoặc trong cụm: Bethesda, Weiss, TBSRTC, RET/PTC, PAX8::PPARG, MEN1 / MEN2, Ki-67, ETE / ENE, PDTC / ATC / DTC / FTC / MTC / PTC.
- **UNRESOLVED (9):** differentiated high-grade thyroid carcinoma, NIFTP (tên đầy đủ, 2 cách viết), FT-UMP, WDT-UMP, hyalinizing trabecular tumour, cribriform morular thyroid carcinoma, hobnail subtype, completion thyroidectomy, pituitary neuroendocrine tumour.
- **Bằng chứng mỏng (1 tài liệu hoặc LOW):** follicular neoplasm, nondiagnostic, nuclear clearing, ground-glass nuclei, microfollicle ("vi nang" 1 so với "nang nhỏ" 2, chữ chung chung), colloid nodule, strap muscles, chief cell, atypical parathyroid tumour, parathyroid carcinoma, paraganglioma ("u cận hạch" 1; BVNTP-PHEO viết "u hạch cận giao cảm"), adrenal incidentaloma.

## 6. Lưu lượng

| Host | Request | Kết quả |
|---|---|---|
| bvnguyentriphuong.com.vn | 12 | 12 trang HTML |
| tapchiyhoctphcm.vn | 6 | 6 PDF (1 ngoài chủ đề) |
| www.tapchiyhoctphcm.vn | 2 | 2 PDF (cả 2 ngoài chủ đề) |
| tapchinghiencuuyhoc.vn | 5 | 5 PDF |
| tapchi.ctump.edu.vn | 2 | 2 PDF |
| vjol.info.vn | 2 | 1 x 302 (đổi URL) + 1 PDF |
| jcmhch.com.vn | 1 | 302 về trang đăng nhập, không có tệp |
| www.bvbnd.vn | 1 | QĐ 1514/QĐ-BYT (PDF) |
| www.benhvien103.vn | 1 | 1 PDF |
| bvdaihoc.com.vn | 1 | 1 trang HTML |
| jmpm.vn | 1 | 1 trang tóm tắt |
| **Tổng** | **34 / 40** | 32 tệp đọc được; không gặp 429 / 403 / reset (`counter.json`: stopped = null) |

WebSearch / WebFetch: không xác định được (phiên miner đã mất, không có log). Lượt dựng lại offline: 0 request mạng; chỉ gọi Ollama cục bộ (127.0.0.1) cho eval.

## 7. Kiểm tra (chạy lại tối 2026-10-14)

- `tools/check_packs.py packs`: 0 lỗi; 4 INFO override (mục 1). 28 cảnh báo đều thuộc pack `pathology`.
- `tools/build_registry.py packs <scratch> --include-drafts`: không cảnh báo.
- Thăm dò chọn pack (đoạn tổng hợp tự viết): đoạn cắt toàn bộ tuyến giáp + Bethesda chọn `pathology-endocrine` 0,279 + `pathology`; đoạn thượng thận / tuyến yên / cận giáp chọn `pathology-endocrine` 0,238 + `pathology`; đoạn GPB vú (đối chứng) không chọn pack nội tiết.
- Test là câu tự viết: so với toàn bộ kho (195 tệp, gồm cả bài PMC tiếng Anh), chuỗi từ dài nhất trùng là 6 từ ("the patient underwent total thyroidectomy with"), chỉ là cụm thông thường. Không có test nào phải viết lại.
- **Sửa 1 test (dữ liệu, không phải validator):** test 1 đòi "nhóm V", trong khi chính glossary của pack ghi `Bethesda category` = "nhóm Bethesda", nên bản dịch đúng "nhóm Bethesda V" bị chấm trượt. Đã đổi thành `must_any` [["nhóm V", "nhóm Bethesda V"]].
- `cd helper && python -m pytest -q`: 715 passed, 2 deselected (lần chạy cuối, trước khi commit).
- `tools/eval_pack.py pathology-endocrine gemma4:e4b --dir --family` (GPU, Ollama cục bộ): **46/50** sau khi sửa test 1 (45/50 trước khi sửa). Test của pack đạt 14/15; test trượt là "overlapping" được dịch thành "chồng lấp" (glossary chỉ có khóa `nuclear overlapping`). 3 test trượt còn lại của pack cha (cũng trượt khi chạy riêng pack cha: 32/35). Chạy riêng pack, không có cha, trước khi sửa test: 11/15. Tiêu chí nhận pack của lộ trình dùng qwen3.5:9b; lần này dùng gemma4:e4b theo yêu cầu.
