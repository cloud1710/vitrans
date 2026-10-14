# sources.md: pathology-kidney (Giải phẫu bệnh thận), draft 0.1.0

Nguồn bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn, tiêu đề và URL; không chép câu nào từ bài báo.

> Dựng lại offline ngày 2026-10-14 (tối). Miner đợt 1 (run `wave1-kidney`) bị ngắt khoảng 14:59, sau khi đã ghi `glossary.csv`, `rules.json`, `tests.jsonl`, `prompt.md`, `pack.json` nhưng trước khi ghi file này. Bảng mã trích dẫn lấy từ các dòng manifest của run và các mã nguồn đã có trong cột note của glossary. Cột "Đếm lại offline" được đếm lại trên chính các tệp đã tải ở `D:/vitranslate-corpus` (chỉ đọc), không gửi request mạng nào. Không sửa dòng glossary nào vì số đếm.

## Cách đếm

- Kho: 40 request của run `wave1-kidney` (`tools/corpus_fetch.py`, 07:32-07:43 UTC), ra 39 tệp đọc được. Một URL (bài Huế 2018 về hội chứng thận hư trong lupus) trả 301 về trang HTML và không có tệp. Trích chữ PDF bằng PyMuPDF, HTML bằng BeautifulSoup (bỏ script/style). Chuẩn hóa NFC, chữ thường, gộp dấu kiểu cũ (hoá = hóa, tuỷ = tủy), đổi "ƣ" (lỗi font PDF) thành "ư".
- Đếm theo **số tài liệu** có ít nhất một lần xuất hiện. Khớp nguyên từ, khoảng trắng và gạch nối linh hoạt; phần "(...)" trong một biến thể được coi là tùy chọn. "hits" = tổng số lần xuất hiện.
- Vùng, theo đúng chữ cái mà các note đang dùng:
  - **S** = phía Nam: Tạp chí Y học TP.HCM. HueJMP20-85 cũng tính S vì tác giả ở BV Thống Nhất TP.HCM.
  - **C** = miền Trung: TC Y Dược học Huế; bài của BV Đà Nẵng đăng trên TC Y Dược học Cần Thơ.
  - **N** = Hà Nội: TCNCYH, TC Y Dược lâm sàng 108.
  - **H** = hai trang bài giảng GPB bệnh cầu thận của BV Nguyễn Tri Phương (TP.HCM).
  - **L** = trang thông tin cho người bệnh của Khoa Nhi BV Nguyễn Tri Phương (TP.HCM).
  - H và L cũng là nguồn phía Nam nhưng không phải bài bình duyệt.
- Note ghi "web", "web snippet", "lay web" hoặc tên trang (xray.vn, hahoangkiem.com, clbv.vn, Long Châu, Vinmec, "vjol PNT (web)") là bằng chứng miner lấy từ tìm kiếm web lúc chạy. Các trang này **không có tệp trong kho**, nên không kiểm lại được offline.
- "learned.csv" = `translator/glossary/learned.csv` (bảng thuật ngữ người dùng đã sửa). Tôi đã đối chiếu các dòng được trích. Có nhiều chỗ người dùng đã sửa ngược với giá trị của pack (kị sắc, carcinôm cho các thực thể RCC, oncocytoma giữ EN, tế bào có chân): xem MINING_REPORT mục 3.
- Trạng thái ở cột cuối (so số trong note với số đếm lại):
  - **OK**: khớp, kể cả phần chia vùng nếu note có ghi.
  - **OK_NOH**: khớp khi bỏ 2 trang H. Hai trang này được tải sau cùng (07:43 UTC), nên nhiều khả năng các số đó được đếm trước khi có chúng.
  - **OK_MANUAL**: tôi kiểm tay và xác nhận (giải thích ngay sau trạng thái).
  - **LOCAL_MORE**: kho có nhiều tài liệu hơn số note ghi; lựa chọn không bị yếu đi.
  - **LOCAL_LESS**: kho có ít hơn: số trong note **không xác nhận được offline**. Dòng glossary giữ nguyên; danh sách ở MINING_REPORT mục 4.
- Không dùng MedEV; không dùng số đếm của ô tìm kiếm OJS.

## Mã trích dẫn

| Mã | Bài / trang | Nguồn | Năm | Vùng | URL |
|---|---|---|---|---|---|
| YHTPHCM16-116 | Vai trò của X quang cắt lớp điện toán trong chẩn đoán và phân giai đoạn ung thư tế bào thận | Y học TP.HCM 20(2), HNKH BV Bình Dân | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%202binh%20dan/116.pdf |
| YHTPHCM16-160 | Đặc điểm giải phẫu bệnh u sau phúc mạc | Y học TP.HCM 20(2), HNKH BV ĐH Y Dược TP.HCM | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%202bvdhyd/160.pdf |
| YHTPHCM16-194 | Viêm cầu thận tăng sinh màng nguyên phát ở trẻ em: 8 trường hợp (BV Nhi Đồng 1) | Y học TP.HCM 20(4), chuyên đề Niệu - Thận | 2016 | S | http://tapchiyhoctphcm.vn/upload/2016/20%204nieu%20than/194.pdf |
| YHTPHCM16-207 | Kết quả chăm sóc thai kỳ sau ghép thận tại BV Chợ Rẫy | Y học TP.HCM 20(4) | 2016 | S | https://www.tapchiyhoctphcm.vn/upload/2016/20%204nieu%20than/207.pdf |
| YHTPHCM18-10 | Xét nghiệm kháng thể kháng bào tương neutrophil (ANCA) và viêm mạch máu liên quan ANCA (tổng quan) | Y học TP.HCM 22(4) | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%204nieu%20than/10.pdf |
| YHTPHCM18-19 | Schönlein-Henoch và các thể lâm sàng nặng ở trẻ em (tổng quan) | Y học TP.HCM 22(4) | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%204nieu%20than/19.pdf |
| YHTPHCM18-95 | Giá trị X quang cắt lớp vi tính trong đánh giá xâm lấn của u Wilms ở trẻ em | Y học TP.HCM 22(3), HNKH ĐH Y khoa Phạm Ngọc Thạch | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%203PB%20PHAMNGOCTHACH/95.pdf |
| YHTPHCM18-289 | Hiệu quả điều trị bệnh thận IgA nặng bằng thuốc ức chế miễn dịch | Y học TP.HCM 22(2), chuyên đề Nội khoa | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202noikhoa2/289.pdf |
| YHTPHCM19-255 | Phẫu thuật robot cắt bàng quang tận gốc cho ung thư bàng quang (BV Bình Dân) | Y học TP.HCM 23(3) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20nieu%20than/255.pdf |
| YHTPHCM19-291 | So sánh kết quả sinh thiết thận giữa nhóm không suy thận và nhóm suy thận tiến triển nhanh | Y học TP.HCM 23(3) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20nieu%20than/291.pdf |
| YHTPHCM22-188 | Điều trị và kết cục thận của hội chứng thận hư nguyên phát kháng steroid ở trẻ em (BV Nhi Đồng 1) | Y học TP.HCM 26(2) | 2022 | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20BV%20N%C4%901%20(HN%20T4-2022)/188.pdf |
| YHTPHCM25-58 | Tương quan giữa lắng đọng C4d với lâm sàng và mô bệnh học thận ở bệnh nhân bệnh cầu thận | Y học TP.HCM 28(10) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S10/58.pdf |
| YHTPHCM25-177 | Đặc điểm mô bệnh học của viêm cầu thận liềm ở bệnh nhân suy thận tiến triển nhanh (GPB BV Nhân dân Gia Định) | Y học TP.HCM 28(10) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S10/177.pdf |
| YHTPHCM25-185 | Viêm cầu thận cấp tiến triển nhanh thể nghèo miễn dịch ở người cao tuổi (BV Thống Nhất) | Y học TP.HCM 28(10) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S10/185.pdf |
| YHTPHCM25-197 | Bệnh cầu thận màng ở bệnh nhân adenocarcinoma phế quản phổi (ca lâm sàng) | Y học TP.HCM 28(8) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S8/197.pdf |
| YHTPHCM26-116 | Đặc điểm lâm sàng, cận lâm sàng và điều trị viêm thận lupus tăng sinh ở trẻ em | Y học TP.HCM 29(7) | 2026 | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S7/116.pdf |
| YHTPHCM-a10418 | Khảo sát đặc điểm hình ảnh cắt lớp điện toán carcinôm tế bào thận (trang tóm tắt) | Y học TP.HCM | – | S | https://tapchiyhoctphcm.vn/articles/10418 |
| YHTPHCM-a14383 | Đặc điểm lâm sàng và mô bệnh học thận của suy thận tiến triển nhanh ở người trưởng thành tại BV Chợ Rẫy (trang tóm tắt) | Y học TP.HCM | – | S | https://tapchiyhoctphcm.vn/articles/14383 |
| YHTPHCM-a16827 | Kết quả điều trị và theo dõi sau phẫu thuật ung thư biểu mô tế bào thận (trang tóm tắt) | Y học TP.HCM | – | S | https://tapchiyhoctphcm.vn/articles/16827 |
| YHTPHCM-a7782 | Mức độ hoạt tính của lupus đỏ hệ thống ở trẻ em theo SLEDAI và ECLAM (trang tóm tắt) | Y học TP.HCM | – | S | https://tapchiyhoctphcm.vn/articles/7782 |
| HueJMP20-85 | Nguyên nhân và tổn thương mô bệnh học của 6 trường hợp hội chứng thận hư ở người cao tuổi (tác giả BV Thống Nhất TP.HCM) | TC Y Dược học Huế, số 27 | 2020 | S | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d019_8_50_7.pdf |
| HueJMP17-22 | Đặc điểm chung, mô bệnh học của ung thư bàng quang và liên quan với giai đoạn | TC Y Dược học Huế 7(3) | 2017 | C | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d016_16_34_9.pdf |
| HueJMP20-7 | Can thiệp xâm nhập tối thiểu trong hệ tiết niệu: phối hợp ngoại khoa và chẩn đoán hình ảnh | TC Y Dược học Huế 10(1) | 2020 | C | https://jmp.huemed-univ.edu.vn/BBao/2020/6/PDF_2020m06d029_17_23_11.pdf |
| HueJMP20-39 | Sử dụng thuốc chống thải ghép, tác dụng phụ và biến chứng sau ghép thận | TC Y Dược học Huế, số 27 | 2020 | C | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d019_8_48_44.pdf |
| HueJMP22-92 | Phân loại mô bệnh học và hóa mô miễn dịch ở bệnh nhân ung thư phổi (**ngoài chủ đề thận**) | TC Y Dược học Huế 12(2) | 2022 | C | https://jmp.huemed-univ.edu.vn/BBao/2022/12/PDF_2022m012d01_16_53_14.pdf |
| CTUMP-716 | Kết quả điều trị ung thư tế bào thận bằng phẫu thuật cắt thận bảo tồn thận tại BV Đà Nẵng | TC Y Dược học Cần Thơ, số 58 | 2023 | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/716/611/1887 |
| TCNCYH-2046 | Phẫu thuật điều trị u cơ mỡ mạch thận tại BV ĐH Y Hà Nội 2021-2022 | TCNCYH 171(10) | 2023 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2046/1331/25058 |
| TCNCYH-2262 | Phẫu thuật nội soi cắt thận do ung thư biểu mô tế bào thận trên 10 cm (T3a): ca lâm sàng | TCNCYH 176(3) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2262/1545/28895 |
| TCNCYH-3276 | Tổn thương thận ở người lớn mắc viêm mao mạch dị ứng Schonlein-Henoch: hai ca | TCNCYH 189(4) | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3276/2334/43358 |
| TCNCYH-3614 | Đặc điểm mô bệnh học và siêu cấu trúc thận thải ghép mạn tính tại Việt Nam | TCNCYH 193(8) | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3614/2563/49976 |
| TCNCYH-3992 | Phẫu thuật nội soi sau phúc mạc cắt thận bán phần điều trị ung thư biểu mô tế bào thận | TCNCYH 195(10) | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3992/2719 |
| TCNCYH-4436 | Tổn thương thận do lắng đọng amyloid: loạt ca lâm sàng | TCNCYH 198(1) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4436/3046/60854 |
| TCNCYH-5667 | Đặc điểm lâm sàng và cận lâm sàng của viêm thận lupus ở trẻ nam (BV Nhi Trung ương) | TCNCYH 205(8) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/5667/3745/85367 |
| TCNCYH-a4851 | Thay đổi thể tích u trên CLVT sau hóa trị và mô bệnh học ở bệnh nhân u nguyên bào thận (trang tóm tắt) | TCNCYH | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/view/4851 |
| YDLS108-1021 | Đặc điểm mô bệnh học ung thư biểu mô tế bào thận tại BV TƯQĐ 108 | TC Y Dược lâm sàng 108 (HNKH 70 năm) | 2021 | N | https://tcydls108.benhvien108.vn/index.php/YDLS/article/download/1021/654/ |
| YDLS108-1074 | Độ mô học WHO 2016 và các đặc điểm GPB khác trong ung thư biểu mô tế bào sáng của thận (trang tóm tắt) | TC Y Dược lâm sàng 108 | 2022 | N | https://tcydls108.benhvien108.vn/index.php/YDLS/article/view/1074 |
| BVNTP-GPB-P1 | Giải phẫu bệnh học bệnh lý cầu thận P1 (bài giảng) | BV Nguyễn Tri Phương | – | H | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-cau-than-p1 |
| BVNTP-GPB-P2 | Giải phẫu bệnh học bệnh lý cầu thận P2 (bài giảng) | BV Nguyễn Tri Phương | – | H | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-cau-than-p2 |
| BVNTP-web | Bướu ác thận trẻ em (Khoa Nhi) | BV Nguyễn Tri Phương | – | L | https://bvnguyentriphuong.com.vn/khoa-nhi/buou-ac-than-tre-em |

Ghi chú: note của glossary viết "BVNTP-GPB" (không số) ở vài dòng, nghĩa là P1 và/hoặc P2. "BVNTP-GPB-P1/P2" trong note = cả hai trang.

## Theo thuật ngữ

| EN | VI | Ghi chú trong glossary | Đếm lại offline |
|---|---|---|---|
| kidney | thận | freq 40/40 docs (kidney corpus, see sources.md); profile term | canonical: 37 tài liệu (S21 C3 N10 L1 H2); LOCAL_LESS; 40 request = 39 tệp đọc được (1 lần 301); 'thận' có trong 37/39 (thiếu HueJMP22-92 bài phổi, HueJMP17-22 bài bàng quang) |
| renal | thận | freq 40/40 docs; adjective: renal = thận | canonical: 37 tài liệu (S21 C3 N10 L1 H2); LOCAL_LESS; như dòng kidney: 37/39 tài liệu |
| renal tumor | u thận | freq 'u thận' 9 docs (S2 C2 N4 H1); src: YHTPHCM16-116, YHTPHCM18-95, TCNCYH-2046; parent tumor = u | canonical: 9 tài liệu (S2 C2 N4 H1); OK |
| renal mass | khối u thận | freq 3 docs (C1 N2); src: CTUMP-716, TCNCYH-2262, TCNCYH-3992; LOW | canonical: 3 tài liệu (C1 N2); OK |
| clear cell renal cell carcinoma | ung thư biểu mô tế bào thận tế bào sáng | = parent clear cell RCC; freq 'tế bào sáng' 9 docs (S4 C1 N3 L1); src: YHTPHCM16-116, YHTPHCM-a10418, YDLS108-1074; alt South urology/radiology 'carcinôm tế bào sáng thận' (YHTPHCM-a10418), 'uttbt tế bào sáng' (YHTPHCM16-116); carcinoma kept = parent rule | canonical: 0 tài liệu; OK |
| papillary renal cell carcinoma | ung thư biểu mô tế bào thận dạng nhú | = parent papillary RCC; src: YDLS108-1021 ('típ nhú' 14, 'utbm dạng nhú'), YHTPHCM16-116 ('uttbt loại nhú'), YHTPHCM-a10418 ('carcinôm nhú tế bào thận') | canonical: 0 tài liệu; OK_MANUAL; bài viết 'týp nhú' (14 lần, YDLS108-1021), không phải 'típ nhú' |
| chromophobe renal cell carcinoma | ung thư biểu mô tế bào thận kỵ màu | = parent chromophobe RCC; freq 'kỵ màu' 3 docs (S1 N2); src: YHTPHCM16-116, YDLS108-1021, TCNCYH-3992; alt 'kị sắc' (user-corrected textbook, translator/glossary/learned.csv), 'kỵ sắc' 0 docs | canonical: 1 tài liệu (N1); OK x2 |
| clear cell papillary renal cell tumor | u tế bào thận dạng nhú tế bào sáng | WHO 2022 name; freq 0; BUILT from parent clear cell / papillary rows; keep (CCPRCT) in brackets | canonical: 0 tài liệu; OK |
| clear cell papillary renal cell carcinoma | ung thư biểu mô tế bào thận dạng nhú tế bào sáng | older WHO 2016 name; src: YDLS108-1021 'utbmtbt nhú tế bào sáng' (N1); learned.csv 'Carcinom tế bào sáng của thận dạng nhú' | canonical: 0 tài liệu; note không có số đếm để so |
| multilocular cystic renal neoplasm of low malignant potential | tân sinh thận dạng nang nhiều ngăn có tiềm năng ác tính thấp | = parent MCNLMP row (long key added); freq 0 VN docs; learned.csv 'u thận dạng nang nhiều ngăn' | canonical: 0 tài liệu; OK |
| TFE3-rearranged renal cell carcinoma | ung thư biểu mô tế bào thận tái sắp xếp TFE3 | = parent TFE3-rearranged RCC (long key added); freq 0 VN docs | canonical: 0 tài liệu; OK |
| TFEB-altered renal cell carcinoma | ung thư biểu mô tế bào thận biến đổi TFEB | WHO 2022; freq 0; BUILT: alteration = biến đổi (parent) | canonical: 0 tài liệu; OK |
| ALK-rearranged renal cell carcinoma | ung thư biểu mô tế bào thận tái sắp xếp ALK | WHO 2022; freq 0; BUILT; sibling row ALK rearrangement = tái sắp xếp gen ALK | canonical: 0 tài liệu; OK |
| ELOC-mutated renal cell carcinoma | ung thư biểu mô tế bào thận đột biến ELOC | WHO 2022 (formerly TCEB1); freq 0; BUILT | canonical: 0 tài liệu; OK |
| fumarate hydratase-deficient renal cell carcinoma | ung thư biểu mô tế bào thận thiếu hụt fumarate hydratase | parent FH-/SDH-deficient RCC row (deficient = thiếu hụt); full form instead of 'UTBM' | canonical: 0 tài liệu; note không có số đếm để so |
| succinate dehydrogenase-deficient renal cell carcinoma | ung thư biểu mô tế bào thận thiếu hụt succinate dehydrogenase | parent FH-/SDH-deficient RCC row | canonical: 0 tài liệu; note không có số đếm để so |
| eosinophilic solid and cystic renal cell carcinoma | ung thư biểu mô tế bào thận ái toan dạng đặc và nang | WHO 2022; freq 0; BUILT: eosinophilic = ái toan (parent oncocytic), solid = dạng đặc, cystic = dạng nang (parent) | canonical: 0 tài liệu; OK |
| acquired cystic disease-associated renal cell carcinoma | ung thư biểu mô tế bào thận liên quan bệnh thận nang mắc phải | src: YDLS108-1021 'utbmtbt liên quan với bệnh thận nang...' (N1); LOW | canonical: 0 tài liệu; note không có số đếm để so |
| mucinous tubular and spindle cell carcinoma | ung thư biểu mô dạng ống và tế bào hình thoi chế nhầy | freq 0; BUILT: spindle cell = tế bào hình thoi (parent); mucinous = chế nhầy; LOW | canonical: 0 tài liệu; OK |
| tubulocystic renal cell carcinoma | ung thư biểu mô tế bào thận dạng ống-nang | freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| renal cell carcinoma with fibromyomatous stroma | ung thư biểu mô tế bào thận có mô đệm sợi-cơ | WHO 2022; freq 0; BUILT: fibro = sợi (house rule); LOW | canonical: 0 tài liệu; OK |
| unclassified renal cell carcinoma | ung thư biểu mô tế bào thận không xếp loại | freq 0; BUILT; WHO 2022 'RCC NOS' = không đặc hiệu (NOS) | canonical: 0 tài liệu; OK |
| SMARCB1-deficient renal medullary carcinoma | ung thư biểu mô tủy thận thiếu hụt SMARCB1 | parent renal medullary carcinoma + deficient = thiếu hụt | canonical: 0 tài liệu; note không có số đếm để so |
| papillary adenoma | u tuyến nhú | freq 0; BUILT: adenoma = u tuyến (parent) | canonical: 0 tài liệu; OK |
| papillary renal neoplasm with reverse polarity | tân sinh thận dạng nhú phân cực đảo ngược | freq 0; BUILT; keep (PRNRP) | canonical: 0 tài liệu; OK |
| oncocytoma | u tế bào ái toan (oncocytoma) | = sibling pathology-headneck row; parent renal oncocytoma = u tế bào ái toan ở thận; corpus: 'u tế bào lớn (oncocytoma)' YHTPHCM16-116 (S1); web: 'u tế bào lớn ưa toan' (xray.vn), 'u tế bào biểu mô hạt' (hahoangkiem.com); LOW | canonical: 0 tài liệu; note không có số đếm để so |
| low-grade oncocytic tumor | u dạng tế bào ái toan độ thấp | WHO 2022 emerging entity; freq 0; BUILT from parent oncocytic = dạng tế bào ái toan; keep (LOT) | canonical: 0 tài liệu; OK |
| eosinophilic vacuolated tumor | u ái toan có không bào | freq 0; BUILT; keep (EVT) | canonical: 0 tài liệu; OK |
| metanephric adenoma | u tuyến hậu thận | learned.csv (user-corrected textbook); YHTPHCM18-95 'u hậu thận' (S1) | canonical: 0 tài liệu; note không có số đếm để so |
| angiomyolipoma with epithelial cysts | u cơ mỡ mạch có nang biểu mô | freq 0; BUILT from parent angiomyolipoma; keep (AMLEC) | canonical: 0 tài liệu; OK |
| mixed epithelial and stromal tumor | u hỗn hợp biểu mô và mô đệm | freq 0; BUILT; keep (MEST) -- not Oxford MEST-C | canonical: 0 tài liệu; OK |
| cystic nephroma | u thận dạng nang | learned.csv 'u nang thận' (ambiguous with renal cyst); BUILT; LOW | canonical: 0 tài liệu; note không có số đếm để so |
| Wilms tumor | u Wilms | freq 'u Wilms' S1 (YHTPHCM18-95, 39 hits); alt 'bướu Wilms' S1 + BVNTP-web; parent nephroblastoma = u nguyên bào thận | canonical: 1 tài liệu (S1); note không có số đếm để so |
| blastemal | mầm | as blastema: blastemal component = thành phần mầm | canonical: 4 tài liệu (S1 L1 H2); note không có số đếm để so |
| favorable histology | mô bệnh học thuận lợi | BVNTP-web 'mô học thuận lợi' (S1); BYT Wilms guideline (clbv.vn, web snippet) 'nhóm thuận lợi'; histologic = mô bệnh học (house rule) | canonical: 0 tài liệu; note không có số đếm để so |
| favourable histology | mô bệnh học thuận lợi | same as favorable histology | canonical: 0 tài liệu; note không có số đếm để so |
| unfavorable histology | mô bệnh học không thuận lợi | BVNTP-web 'mô học không thuận lợi'; house rule mô bệnh học | canonical: 0 tài liệu; note không có số đếm để so |
| focal anaplasia | thoái sản khu trú | BVNTP-web 'thoái sản khu trú' (S); parent anaplasia = thoái sản; alt BYT Wilms guideline 'bất thục sản khu trú' (web snippet) | canonical: 1 tài liệu (L1); note không có số đếm để so |
| diffuse anaplasia | thoái sản lan tỏa | BVNTP-web 'thoái sản lan tỏa' (S); alt BYT 'bất thục sản lan tỏa' | canonical: 1 tài liệu (L1); note không có số đếm để so |
| nephrogenic rest | ổ tồn dư sinh thận | freq 0; BUILT; LOW (no VN form found) | canonical: 0 tài liệu; OK |
| cystic partially differentiated nephroblastoma | u nguyên bào thận dạng nang biệt hóa một phần | freq 0; BUILT from parent nephroblastoma; LOW | canonical: 0 tài liệu; OK |
| congenital mesoblastic nephroma | u nguyên trung mô thận bẩm sinh | YHTPHCM18-95 'u nguyên trung mô thận' (S1); alt BVNTP-web 'bướu nguyên - trung bì thận'; LOW | canonical: 0 tài liệu; note không có số đếm để so |
| clear cell sarcoma of kidney | sarcom tế bào sáng của thận | parent clear cell sarcoma = sarcom tế bào sáng; BVNTP-web 'sarcom tế bào sáng của thận'; YHTPHCM18-95 'sarcoma tế bào sáng' | canonical: 1 tài liệu (L1); note không có số đếm để so |
| rhabdoid tumor of kidney | u dạng cơ vân của thận | YHTPHCM18-95 'u dạng cơ vân' (S1); BVNTP-web 'bướu ác dạng cơ vân'; parent rhabdoid = dạng cơ vân | canonical: 0 tài liệu; note không có số đếm để so |
| urothelial carcinoma | ung thư biểu mô đường niệu | src: HueJMP17-22 (C, 7 hits; the paper calls it the now unified term); alt South urology 'bướu tế bào chuyển tiếp' (YHTPHCM19-255); carcinoma = ung thư biểu mô (parent) | canonical: 1 tài liệu (C1); note không có số đếm để so |
| urothelial carcinoma of the renal pelvis | ung thư biểu mô đường niệu bể thận | built from urothelial carcinoma + parent renal pelvis = bể thận | canonical: 0 tài liệu; note không có số đếm để so |
| upper tract urothelial carcinoma | ung thư biểu mô đường niệu trên | freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| invasive urothelial carcinoma | ung thư biểu mô đường niệu xâm nhập | parent pattern invasive ductal carcinoma = ung thư biểu mô ống xâm nhập | canonical: 0 tài liệu; note không có số đếm để so |
| transitional cell carcinoma | ung thư biểu mô đường niệu (tế bào chuyển tiếp) | old name; HueJMP17-22 gives 'ung thư tế bào chuyển tiếp' as the former name; YHTPHCM19-255 'bướu tế bào chuyển tiếp' (S) | canonical: 1 tài liệu (C1); note không có số đếm để so |
| ureter | niệu quản | freq 7 docs (S3 C1 N2 L1) | canonical: 7 tài liệu (S3 C1 N2 L1); OK |
| WHO/ISUP grade | độ WHO/ISUP | src: YDLS108-1021 'phân độ ... theo hệ thống WHO/ISUP', TCNCYH-3992 'ISUP độ 1'; ISUP kept English | canonical: 0 tài liệu; note không có số đếm để so |
| ISUP grade | độ ISUP | src: TCNCYH-3992 (N1) | canonical: 1 tài liệu (N1); note không có số đếm để so |
| WHO/ISUP nuclear grade | độ nhân WHO/ISUP | 'độ nhân' 0 docs; YDLS108-1021 calls it 'độ mô học' (N); nuclear grade = độ nhân (BUILT); DECISION | canonical: 0 tài liệu; OK |
| nuclear grade | độ nhân | freq 0; BUILT; alt 'độ mô học' (YDLS108-1021, YHTPHCM16-116) | canonical: 0 tài liệu; OK |
| Fuhrman grade | độ Fuhrman | src: YDLS108-1021 'phân độ theo Fuhrman', TCNCYH-2262 'Fuhrman: G3' (N2) | canonical: 0 tài liệu; note không có số đếm để so |
| nucleolus | hạt nhân | src: YDLS108-1021 (N1, 4 hits: 'hạt nhân rõ'); 'hạch nhân' 0, 'nhân con' 0; matcher also takes nucleoli | canonical: 2 tài liệu (C1 N1); OK x2 |
| prominent nucleoli | hạt nhân rõ | src: YDLS108-1021 'hạt nhân rõ và ưa axít' | canonical: 2 tài liệu (C1 N1); note không có số đếm để so |
| sarcomatoid | dạng sarcôm | parent: sarcomatoid = dạng sarcôm (RCC with sarcomatoid features row); corpus keeps 'sarcomatoid' EN once (YDLS108-1021) | canonical: 0 tài liệu; note không có số đếm để so |
| sarcomatoid differentiation | biệt hóa dạng sarcôm | YDLS108-1021 'biệt hóa dạng cơ vân hoặc sarcoma' (N1); parent sarcomatoid = dạng sarcôm | canonical: 0 tài liệu; note không có số đếm để so |
| rhabdoid differentiation | biệt hóa dạng cơ vân | src: YDLS108-1021 (N1, 2 hits); parent rhabdoid = dạng cơ vân | canonical: 1 tài liệu (N1); note không có số đếm để so |
| coagulative necrosis | hoại tử đông | general pathology term; freq 0 in kidney corpus; LOW | canonical: 0 tài liệu; OK |
| eosinophilic cytoplasm | bào tương ái toan | 'bào tương' 5 docs vs 'tế bào chất' 1; ái toan = parent oncocytic | canonical: 0 tài liệu; LOCAL_MORE, OK |
| raisinoid nuclei | nhân hình nho khô | chromophobe RCC; freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| central scar | sẹo trung tâm | oncocytoma; web xray.vn 'sẹo hình sao ở trung tâm'; LOW | canonical: 0 tài liệu; note không có số đếm để so |
| renal capsule | bao thận | freq 7 docs (S2 C1 N3 L1); alt 'vỏ bao thận' N1 (YDLS108-1074) | canonical: 7 tài liệu (S2 C1 N3 L1); OK |
| renal parenchyma | nhu mô thận | freq 8 docs; src: YHTPHCM16-116, CTUMP-716, TCNCYH-2262 | canonical: 8 tài liệu (S1 C2 N4 H1); OK |
| renal cortex | vỏ thận | freq 3 docs (S3) | canonical: 5 tài liệu (S3 H2); OK_NOH |
| renal medulla | tủy thận | src: TCNCYH-3614 (N1) | canonical: 2 tài liệu (N1 H1); note không có số đếm để so |
| renal hilum | rốn thận | src: BVNTP-web, TCNCYH-2262 (2 docs) | canonical: 2 tài liệu (N1 L1); note không có số đếm để so |
| nephrectomy | cắt thận | freq 9 docs (S3 C1 N4 L1); src: YHTPHCM16-116, YHTPHCM-a16827, TCNCYH-2262 | canonical: 10 tài liệu (S4 C1 N4 L1); LOCAL_MORE |
| radical nephrectomy | cắt thận tận gốc | S2 C1 (YHTPHCM16-116, YHTPHCM-a16827, CTUMP-716) vs 'cắt thận triệt căn' N2 (TCNCYH-2262, TCNCYH-3992); Southern first; roadmap national triệt căn 177 / tận gốc 38 (all surgery); DECISION | canonical: 4 tài liệu (S3 C1); note không có số đếm để so |
| partial nephrectomy | cắt một phần thận | South: 'cắt một phần thận' YHTPHCM-a16827 + BVNTP-web, 'cắt thận một phần' YHTPHCM16-116; vs 'cắt thận bán phần' 3 docs (C1 N2, 21 hits) + 'cắt bán phần thận' C1; DECISION | canonical: 4 tài liệu (S2 C1 L1); OK |
| nephron-sparing surgery | phẫu thuật bảo tồn thận | 'bảo tồn thận' 3 docs (C1 N2); src: CTUMP-716, TCNCYH-3992, TCNCYH-2046 | canonical: 0 tài liệu; OK |
| nephrectomy specimen | bệnh phẩm cắt thận | freq 0; BUILT; candidate for _shared/specimen_context (roadmap decision 11) | canonical: 0 tài liệu; OK |
| perinephric fat | mỡ quanh thận | freq 7 docs (S2 N4 L1); src: YHTPHCM16-116, YHTPHCM18-95, YDLS108-1021 | canonical: 7 tài liệu (S2 N4 L1); OK |
| perinephric fat invasion | xâm lấn mỡ quanh thận | YDLS108-1074 'xâm lấn mô mỡ quanh thận', TCNCYH-2262 'xâm lấn lớp mỡ quanh thận', YHTPHCM16-116 'xâm lấn mỡ quanh u'; staging invasion = xâm lấn (roadmap decision 6B) | canonical: 2 tài liệu (S1 N1); note không có số đếm để so |
| renal sinus | xoang thận | freq 3 docs (S2 N1); src: YHTPHCM16-116, YHTPHCM18-95, TCNCYH-2262 | canonical: 3 tài liệu (S2 N1); OK |
| renal sinus fat | mỡ xoang thận | freq 2 docs (S1 N1) | canonical: 2 tài liệu (S1 N1); OK |
| renal sinus fat invasion | xâm lấn mỡ xoang thận | src: YHTPHCM16-116 'xâm lấn mỡ xoang thận 34,3%' (S1) | canonical: 2 tài liệu (S1 N1); note không có số đếm để so |
| Gerota fascia | mạc Gerota | S1 'mạc Gerota' (YHTPHCM16-116, 9 hits) vs N1 'cân Gerota' (TCNCYH-2262, 4 hits); Southern first | canonical: 1 tài liệu (S1); note không có số đếm để so |
| Gerota's fascia | mạc Gerota | as Gerota fascia | canonical: 1 tài liệu (S1); note không có số đếm để so |
| renal vein | tĩnh mạch thận | freq 5 docs (S2 C1 N1 L1) | canonical: 5 tài liệu (S2 C1 N1 L1); OK |
| renal vein invasion | xâm lấn tĩnh mạch thận | src: YHTPHCM16-116 'xâm lấn tĩnh mạch thận cùng bên' (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| tumor thrombus | huyết khối u | src: YHTPHCM16-116 'huyết khối u' (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| inferior vena cava | tĩnh mạch chủ dưới | freq 5 docs (S3 N1 L1) | canonical: 5 tài liệu (S3 N1 L1); OK |
| adrenal gland | tuyến thượng thận | freq 5 docs (S3 N1 L1) | canonical: 5 tài liệu (S3 N1 L1); OK |
| renal cyst | nang thận | freq 4 docs (S1 C2 L1) | canonical: 4 tài liệu (S1 C2 L1); OK |
| polycystic kidney disease | bệnh thận đa nang | src: BVNTP-GPB-P1 (H1); standard term | canonical: 0 tài liệu; note không có số đếm để so |
| acquired cystic kidney disease | bệnh thận nang mắc phải | src: YDLS108-1021 (N1) | canonical: 1 tài liệu (N1); note không có số đếm để so |
| von Hippel-Lindau disease | bệnh von Hippel-Lindau | freq 0 in corpus; eponym kept; LOW | canonical: 0 tài liệu; OK |
| hereditary leiomyomatosis and renal cell carcinoma | hội chứng u cơ trơn và ung thư biểu mô tế bào thận di truyền | freq 0; BUILT; keep (HLRCC) | canonical: 0 tài liệu; OK |
| Birt-Hogg-Dubé syndrome | hội chứng Birt-Hogg-Dubé | eponym kept | canonical: 0 tài liệu; note không có số đếm để so |
| tuberous sclerosis complex | phức hợp xơ cứng củ | established VN disease name 'xơ cứng củ' (not parent sclerosis = xơ chai); freq 0 in corpus; LOW | canonical: 0 tài liệu; OK |
| RCC | RCC | acronym kept (parent note 'giữ viết tắt RCC') | canonical: 7 tài liệu (S2 C1 N3 L1); note không có số đếm để so |
| ccRCC | ccRCC | acronym kept (parent note 'Giữ CCRCC') | canonical: 0 tài liệu; note không có số đếm để so |
| PAX8 | PAX8 | IHC marker kept English | canonical: 0 tài liệu; note không có số đếm để so |
| CAIX | CAIX | IHC marker kept English; parent CAIX box row | canonical: 0 tài liệu; note không có số đếm để so |
| CD117 | CD117 | IHC marker kept English | canonical: 1 tài liệu (S1); note không có số đếm để so |
| CK7 | CK7 | IHC marker kept English (same row in a sibling pack) | canonical: 1 tài liệu (C1); note không có số đếm để so |
| cathepsin K | cathepsin K | IHC marker kept English | canonical: 0 tài liệu; note không có số đếm để so |
| TFE3 | TFE3 | gene / IHC marker kept English | canonical: 0 tài liệu; note không có số đếm để so |
| SDHB | SDHB | IHC marker kept English | canonical: 0 tài liệu; note không có số đếm để so |
| GATA3 | GATA3 | IHC marker kept English | canonical: 0 tài liệu; note không có số đếm để so |
| Melan-A | Melan-A | IHC marker kept English | canonical: 0 tài liệu; note không có số đếm để so |
| renal biopsy | sinh thiết thận | freq 17 docs (S12 C1 N4); src: YHTPHCM19-291, YHTPHCM25-58, YHTPHCM26-116 | canonical: 20 tài liệu (S13 C1 N4 H2); LOCAL_MORE |
| kidney biopsy | sinh thiết thận | as renal biopsy | canonical: 20 tài liệu (S13 C1 N4 H2); note không có số đếm để so |
| transplant kidney biopsy | sinh thiết thận ghép | 'thận ghép' 8 docs (S3 C2 N1 H2) | canonical: 1 tài liệu (N1); OK |
| biopsy adequacy | mức đạt yêu cầu của mẫu sinh thiết | src: TCNCYH-3614 'mẫu đạt yêu cầu' (N1); LOW | canonical: 0 tài liệu; note không có số đếm để so |
| light microscopy | kính hiển vi quang học | freq 9 docs (S7 N2); src: YHTPHCM25-197, YHTPHCM25-58, YHTPHCM16-194 | canonical: 11 tài liệu (S7 N2 H2); OK_NOH |
| immunofluorescence | miễn dịch huỳnh quang | freq 12 docs (S10 N2); abbreviation MDHQ S2 (YHTPHCM25-177, YHTPHCM25-185) | canonical: 14 tài liệu (S10 N2 H2); OK_NOH |
| electron microscopy | kính hiển vi điện tử | freq 5 docs (S3 N2) + BVNTP-GPB P1/P2; src: YHTPHCM25-197, YHTPHCM16-194, TCNCYH-3614 | canonical: 7 tài liệu (S3 N2 H2); OK_NOH |
| ultrastructure | siêu cấu trúc | src: TCNCYH-3614 (N1, 36 hits) | canonical: 2 tài liệu (N1 H1); note không có số đếm để so |
| PAS stain | nhuộm PAS | freq 12 docs (S9 N3) | canonical: 5 tài liệu (S3 H2); OK_MANUAL; 12 tài liệu (S9 N3) là số tài liệu có chữ 'PAS' (không tính 2 trang BVNTP-GPB); đúng cụm 'nhuộm PAS' chỉ 5 (S3 H2) |
| Jones silver stain | nhuộm bạc Jones | 'nhuộm bạc' 7 docs (S5 N2); stain name kept | canonical: 0 tài liệu; OK_NOH |
| Masson trichrome | nhuộm Masson trichrome | src: YHTPHCM25-177 'trichrome', YHTPHCM16-194; stain name kept | canonical: 0 tài liệu; note không có số đếm để so |
| Congo red | đỏ Congo | freq 3 docs (S2 N1); parent apple-green birefringence note | canonical: 0 tài liệu; OK_MANUAL; 3 tài liệu (S2 N1) là số tài liệu có chữ 'Congo'; đúng cụm 'đỏ Congo' 0 trong kho thận ('nhuộm Congo' 1) |
| glomerulus | cầu thận | freq 19+ docs (S13 C1 N5), 478 hits; 'tiểu cầu thận' 0; matcher also takes glomeruli | canonical: 23 tài liệu (S14 C2 N5 H2); LOCAL_MORE, OK |
| glomerular | cầu thận | as glomerulus | canonical: 23 tài liệu (S14 C2 N5 H2); note không có số đếm để so |
| glomerular basement membrane | màng đáy cầu thận | freq 10 docs (S6 N2 H2) | canonical: 10 tài liệu (S6 N2 H2); OK |
| basement membrane thickening | dày màng đáy | freq 2 docs (S1 N1) | canonical: 2 tài liệu (S1 N1); OK |
| capillary loops | quai mao mạch | freq S4 H2 (YHTPHCM25-197, YHTPHCM16-194, YHTPHCM25-58, BVNTP-GPB) | canonical: 6 tài liệu (S4 H2); note không có số đếm để so |
| Bowman capsule | bao Bowman | src: YHTPHCM25-177 (S1) | canonical: 3 tài liệu (S1 H2); note không có số đếm để so |
| Bowman's capsule | bao Bowman | as Bowman capsule | canonical: 3 tài liệu (S1 H2); note không có số đếm để so |
| mesangial | gian mạch | freq 12 docs (S9 N2 H1, 65 hits) vs 'gian mao mạch' 4 docs (S2 H2, 39 hits), 'trung mô' S2 (old, = mesenchymal); DECISION | canonical: 12 tài liệu (S9 N2 H1); OK x2 |
| mesangial matrix | chất nền gian mạch | freq 2 docs (S1 N1); YHTPHCM25-197 'chất nền vùng gian mạch' | canonical: 2 tài liệu (S1 N1); OK |
| mesangial proliferation | tăng sinh gian mạch | freq 6 docs (S4 N1 H1) | canonical: 5 tài liệu (S4 N1); OK_MANUAL; 5 (S4 N1) + BVNTP-GPB-P2 viết 'tăng sinh tế bào gian mạch' = 6 (S4 N1 H1) |
| mesangial hypercellularity | tăng sinh tế bào gian mạch | Oxford M; built from mesangial proliferation | canonical: 1 tài liệu (H1); note không có số đếm để so |
| endocapillary hypercellularity | tăng sinh tế bào trong mao mạch | Oxford E; South 'tăng sinh trong mao mạch' (YHTPHCM25-177, BVNTP-GPB) vs N 'tăng sinh nội mao mạch' (TCNCYH-3276, 4 hits); LOW | canonical: 0 tài liệu; note không có số đếm để so |
| extracapillary proliferation | tăng sinh ngoài mao mạch | freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| podocyte | tế bào chân giả (podocyte) | S2 'tế bào (biểu mô) chân giả' (YHTPHCM22-188, YHTPHCM25-197) vs 'túc bào' H1 (BVNTP-GPB, 12 hits), 'tế bào có chân' N1 (TCNCYH-3614), 'tế bào biểu mô tạng' S1; DECISION | canonical: 2 tài liệu (S2); note không có số đếm để so |
| foot process effacement | xóa chân (foot process) | BVNTP-GPB 'xóa chân các túc bào', TCNCYH-3614 'xóa, mất chân tế bào có chân'; LOW | canonical: 1 tài liệu (H1); note không có số đếm để so |
| endothelial cells | tế bào nội mô | 'nội mô' 6 docs (S4 N2); 'tế bào nội mô' 2 docs | canonical: 4 tài liệu (S1 N1 H2); OK_NOH x2 |
| subepithelial deposits | lắng đọng dưới biểu mô | freq 3 docs (S1 N1 H1) | canonical: 3 tài liệu (S1 N1 H1); OK |
| subendothelial deposits | lắng đọng dưới nội mô | freq 3 docs (S1 N1 H1) | canonical: 1 tài liệu (H1); OK_MANUAL; 3 tài liệu (S1 N1 H1) là số có 'dưới nội mô'; đúng cụm 'lắng đọng dưới nội mô' chỉ 1 (H1) |
| mesangial deposits | lắng đọng gian mạch | built from mesangial + deposits; YHTPHCM25-58 | canonical: 0 tài liệu; note không có số đếm để so |
| electron-dense deposits | lắng đọng đậm đặc điện tử | freq 0 exact; YHTPHCM18-10 'phức hợp giầu điện tử'; BUILT; LOW | canonical: 0 tài liệu; OK |
| immune deposits | lắng đọng miễn dịch | src: TCNCYH-4436, YHTPHCM25-58 | canonical: 5 tài liệu (S2 N2 H1); note không có số đếm để so |
| immune complex | phức hợp miễn dịch | freq 9 docs (S8 N1) | canonical: 11 tài liệu (S8 N1 H2); OK_NOH |
| granular staining | nhuộm dạng hạt | src: YHTPHCM25-197 'nhuộm dạng hạt ở các quai mao mạch'; parent membranous = nhuộm màng | canonical: 1 tài liệu (S1); note không có số đếm để so |
| linear staining | nhuộm dạng đường | anti-GBM; freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| wire loop | quai dây thép (wire loop) | freq 0 in corpus and web search; BUILT; LOW | canonical: 0 tài liệu; OK |
| hyaline thrombi | huyết khối hyalin | freq 0; BUILT; spelling hyalin (sibling 'màng hyalin'); LOW | canonical: 0 tài liệu; OK |
| double contours | đường viền đôi | src: YHTPHCM16-194 'đường viền đôi' (S1), BVNTP-GPB 'viền đôi'; alt 'đường đôi' N1 (TCNCYH-3614) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| tram-track appearance | hình ảnh đường rầy xe lửa | src: YHTPHCM16-194 'đường rầy xe lửa' (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| basement membrane spikes | gai màng đáy | freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| crescent | liềm | freq 12 docs (S9 N1 H2, 174 hits); alt 'liềm thể' 6 docs (S5 H1); 'tổn thương liềm' 7 docs | canonical: 12 tài liệu (S9 N1 H2); OK x3 |
| cellular crescent | liềm tế bào | freq 9 docs (S6 N1 H2) | canonical: 9 tài liệu (S6 N1 H2); OK |
| fibrocellular crescent | liềm tế bào-sợi | src: YHTPHCM25-177 (GPB Gia Dinh, 7 hits) vs 'liềm tế bào-xơ / xơ tế bào' S2 (YHTPHCM25-185, YHTPHCM16-194); fibro = sợi house rule; DECISION | canonical: 0 tài liệu; note không có số đếm để so |
| fibrous crescent | liềm sợi | src: YHTPHCM25-177 (GPB Gia Dinh, 10 hits) vs 'liềm xơ' S2 (2 hits); fibro = sợi house rule; DECISION | canonical: 1 tài liệu (S1); note không có số đếm để so |
| crescentic glomerulonephritis | viêm cầu thận liềm | freq 7 docs (S6 H1); 'hình liềm' / 'tạo liềm' 0 | canonical: 7 tài liệu (S6 H1); LOCAL_MORE, OK |
| glomerulonephritis | viêm cầu thận | freq 15 docs (S12 N3) | canonical: 17 tài liệu (S12 N3 H2); OK_NOH |
| rapidly progressive glomerulonephritis | viêm cầu thận tiến triển nhanh | freq 8 docs (S6 N2) | canonical: 10 tài liệu (S6 N2 H2); OK_NOH |
| pauci-immune | nghèo miễn dịch | freq 3 docs (S3, 23 hits); 'ít miễn dịch' 0 | canonical: 4 tài liệu (S3 H1); OK, OK_NOH |
| pauci-immune glomerulonephritis | viêm cầu thận nghèo miễn dịch | src: YHTPHCM25-185, YHTPHCM18-10, YHTPHCM25-177 | canonical: 0 tài liệu; note không có số đếm để so |
| anti-GBM disease | bệnh kháng màng đáy cầu thận | 'kháng màng đáy cầu thận' 3 docs (S2 N1) | canonical: 0 tài liệu; OK_NOH |
| anti-glomerular basement membrane disease | bệnh kháng màng đáy cầu thận | as anti-GBM disease | canonical: 0 tài liệu; note không có số đếm để so |
| ANCA-associated vasculitis | viêm mạch liên quan ANCA | freq 3 docs (S2 N1, 14 hits) | canonical: 1 tài liệu (S1); LOCAL_LESS; đúng cụm 1 (S1); 'viêm mạch máu liên quan ANCA' 2 (S2); không tìm được tài liệu N |
| microscopic polyangiitis | viêm đa mao mạch vi thể | src: YHTPHCM18-10 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| granulomatosis with polyangiitis | bệnh u hạt kèm viêm đa mao mạch | YHTPHCM-a14383 'u hạt Wegener'; BUILT; keep (GPA); LOW | canonical: 0 tài liệu; note không có số đếm để so |
| fibrinoid necrosis | hoại tử dạng fibrin | freq 2 docs (S2, 14 hits); 'hoại tử dạng tơ huyết' 0 | canonical: 2 tài liệu (S2); OK x2 |
| minimal change disease | bệnh cầu thận tổn thương tối thiểu | 'tổn thương (cầu thận) tối thiểu' 3 docs (S2 H1, 20 hits: BVNTP-GPB exact) vs 'sang thương tối thiểu' 3 docs (S3, 7 hits: UMP nephrology) vs 'thay đổi tối thiểu' N1; DECISION | canonical: 1 tài liệu (H1); OK x2 |
| focal segmental glomerulosclerosis | xơ chai cầu thận khu trú từng vùng | S2 (YHTPHCM19-291, YHTPHCM25-58; 6 hits) vs 'xơ hóa cầu thận khu trú từng phần' S1 (YHTPHCM22-188); parent sclerosis = xơ chai | canonical: 2 tài liệu (S2); note không có số đếm để so |
| FSGS | FSGS | acronym kept (5 docs) | canonical: 5 tài liệu (S4 H1); note không có số đếm để so |
| segmental sclerosis | xơ chai từng vùng | as FSGS; alt 'xơ hóa (cầu thận) từng phần' S3 (YHTPHCM25-197, -177, -185); DECISION | canonical: 0 tài liệu; note không có số đếm để so |
| segmental glomerulosclerosis | xơ chai cầu thận từng vùng | Oxford S; as segmental sclerosis | canonical: 0 tài liệu; note không có số đếm để so |
| collapsing variant | thể xẹp | FSGS Columbia; freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| tip lesion | tổn thương đỉnh | FSGS Columbia; freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| global glomerulosclerosis | xơ hóa cầu thận toàn bộ | 'xơ hóa toàn bộ' 7 docs (S5 N1 H1) vs 'xơ chai toàn bộ' 0 | canonical: 2 tài liệu (S1 N1); OK, OK_MANUAL; 6 (S5 H1) + TCNCYH-3614 viết 'xơ hóa cầu thận toàn bộ' = 7 (S5 N1 H1) |
| globally sclerosed glomeruli | cầu thận xơ hóa toàn bộ | as global glomerulosclerosis; YHTPHCM25-185 'số cầu thận xơ hóa toàn bộ' | canonical: 5 tài liệu (S5); note không có số đếm để so |
| membranous nephropathy | bệnh cầu thận màng | freq 5 docs (S3 H2, 22 hits) vs 'viêm cầu thận màng' 3 docs (S1 H2) | canonical: 5 tài liệu (S3 H2); OK x2 |
| PLA2R | PLA2R | antigen kept English (YHTPHCM25-197) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| membranoproliferative glomerulonephritis | viêm cầu thận tăng sinh màng | freq 4 docs (S4); BVNTP-GPB 'viêm cầu thận màng - tăng sinh' | canonical: 4 tài liệu (S4); OK |
| C3 glomerulopathy | bệnh cầu thận C3 | src: YHTPHCM16-194 (S1, 6 hits) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| C3 glomerulonephritis | viêm cầu thận C3 | src: YHTPHCM16-194 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| dense deposit disease | bệnh lắng đọng đặc | src: YHTPHCM16-194 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| IgA nephropathy | bệnh thận IgA | freq 7 docs (S6 N1, 69 hits); 'bệnh cầu thận IgA' 0 | canonical: 8 tài liệu (S6 N1 H1); OK_NOH x2 |
| Oxford classification | phân loại Oxford | src: YHTPHCM18-289 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| MEST-C score | thang điểm MEST-C | code kept English; LOW | canonical: 0 tài liệu; note không có số đếm để so |
| IgA vasculitis | viêm mạch IgA | src: YHTPHCM18-10 (S1); alt 'viêm mao mạch dị ứng' S1 N1 (13 hits) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| Henoch-Schönlein purpura | ban xuất huyết Henoch-Schönlein | YHTPHCM18-19 'bệnh Schönlein-Henoch'; 'ban xuất huyết' 5 docs; eponym kept | canonical: 0 tài liệu; OK |
| Henoch-Schonlein purpura | ban xuất huyết Henoch-Schönlein | as Henoch-Schönlein purpura (spelling without umlaut) | canonical: 0 tài liệu; note không có số đếm để so |
| lupus nephritis | viêm thận lupus | freq 8 docs (S6 N2, 101 hits) | canonical: 8 tài liệu (S6 N2); OK |
| ISN/RPS classification | phân loại ISN/RPS | src: YHTPHCM26-116, TCNCYH-5667 | canonical: 1 tài liệu (N1); note không có số đếm để so |
| class III lupus nephritis | viêm thận lupus nhóm III | class = nhóm: 5 docs (S4 H1, 69 hits) vs 'lớp' (TCNCYH-5667, N); src: YHTPHCM26-116, YHTPHCM25-177 | canonical: 1 tài liệu (S1); note không có số đếm để so |
| class IV lupus nephritis | viêm thận lupus nhóm IV | src: YHTPHCM25-177 'viêm thận lupus nhóm IV' (S) | canonical: 2 tài liệu (S2); note không có số đếm để so |
| class V lupus nephritis | viêm thận lupus nhóm V | src: YHTPHCM26-116 'nhóm V' (S) | canonical: 0 tài liệu; note không có số đếm để so |
| proliferative lupus nephritis | viêm thận lupus tăng sinh | src: YHTPHCM26-116 (S, title) | canonical: 2 tài liệu (S1 N1); note không có số đếm để so |
| activity index | chỉ số hoạt động | S1 H1 (YHTPHCM26-116, BVNTP-GPB); alt 'chỉ số hoạt tính' S1 | canonical: 2 tài liệu (S1 H1); note không có số đếm để so |
| chronicity index | chỉ số mạn tính | src: YHTPHCM26-116 (S1, 4 hits); alt 'chỉ số mãn tính' H1 | canonical: 1 tài liệu (S1); note không có số đếm để so |
| diabetic nephropathy | bệnh thận đái tháo đường | freq 3 docs (S3, 13 hits) | canonical: 2 tài liệu (S2); OK_MANUAL; 2 đúng cụm + YHTPHCM25-58 viết 'bệnh thận do đái tháo đường' = 3 (S3) |
| Kimmelstiel-Wilson nodule | nốt Kimmelstiel-Wilson | src: BVNTP-GPB P2 (H1) | canonical: 1 tài liệu (H1); note không có số đếm để so |
| nodular glomerulosclerosis | xơ hóa cầu thận dạng nốt | src: BVNTP-GPB (H1) | canonical: 1 tài liệu (H1); note không có số đếm để so |
| renal amyloidosis | thoái hóa dạng bột ở thận | follows parent amyloidosis = thoái hóa dạng bột; corpus: 'lắng đọng amyloid' N1 (32 hits), 'amyloidosis' kept EN 4 docs (S3 N1), 'bệnh amyloid thận' (HueJMP20-85); DECISION (parent) | canonical: 0 tài liệu; note không có số đếm để so |
| amyloid deposits | lắng đọng amyloid | src: TCNCYH-4436 (N1, 32 hits); parent amyloid = amyloid | canonical: 1 tài liệu (N1); note không có số đếm để so |
| thrombotic microangiopathy | bệnh vi mạch huyết khối | freq 2 docs (S2, 14 hits) vs 'viêm vi mạch huyết khối' S1; TMA kept | canonical: 1 tài liệu (S1); LOCAL_LESS; đúng cụm 1 (S1, YHTPHCM19-291); 'viêm vi mạch huyết khối' 1 (HueJMP20-85) |
| hemolytic uremic syndrome | hội chứng tán huyết urê huyết | 'tán huyết' S2 H1 vs 'tan máu' 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| postinfectious glomerulonephritis | viêm cầu thận hậu nhiễm trùng | src: BVNTP-GPB P1/P2 (H2), YHTPHCM18-10 (S1) | canonical: 2 tài liệu (H2); note không có số đếm để so |
| post-infectious glomerulonephritis | viêm cầu thận hậu nhiễm trùng | as postinfectious glomerulonephritis | canonical: 2 tài liệu (H2); note không có số đếm để so |
| Alport syndrome | hội chứng Alport | src: YHTPHCM16-194 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| thin basement membrane disease | bệnh màng đáy mỏng | src: YHTPHCM16-194 (S1) | canonical: 0 tài liệu; note không có số đếm để so |
| renal tubules | ống thận | freq S/N (e.g. YHTPHCM25-58 'ống thận') | canonical: 14 tài liệu (S9 N3 H2); note không có số đếm để so |
| tubular atrophy | teo ống thận | freq 3 docs (S3) | canonical: 4 tài liệu (S3 H1); OK_NOH |
| interstitial fibrosis | xơ hóa mô kẽ | freq 5 docs (S4 N1) | canonical: 7 tài liệu (S4 N1 H2); OK_NOH |
| interstitial fibrosis and tubular atrophy | xơ hóa mô kẽ và teo ống thận | built from both rows; keep (IFTA) | canonical: 0 tài liệu; note không có số đếm để so |
| interstitial inflammation | viêm mô kẽ | freq 3 docs (S1 N1 H1) | canonical: 3 tài liệu (S1 N1 H1); OK |
| tubulointerstitial | ống thận mô kẽ | S1 H1 ('ống thận - mô kẽ') vs 'ống thận kẽ' S2; parent interstitial = mô kẽ | canonical: 2 tài liệu (S1 H1); note không có số đếm để so |
| tubulointerstitial nephritis | viêm ống thận mô kẽ | src: YHTPHCM18-10, BVNTP-GPB (S1 H1) | canonical: 2 tài liệu (S1 H1); note không có số đếm để so |
| acute interstitial nephritis | viêm thận mô kẽ cấp | freq 0; lay web 'viêm thận kẽ cấp' (Long Chau), 'viêm ống kẽ thận cấp' (Vinmec); parent interstitial = mô kẽ; LOW | canonical: 0 tài liệu; OK |
| acute tubular necrosis | hoại tử ống thận cấp | freq 4 docs (S4) | canonical: 4 tài liệu (S4); OK |
| acute tubular injury | tổn thương ống thận cấp | freq 0; BUILT on 'tổn thương thận cấp' (S4) | canonical: 0 tài liệu; OK |
| tubulitis | viêm ống thận | src: HueJMP20-85 (S1); Banff t | canonical: 4 tài liệu (S2 H2); note không có số đếm để so |
| red blood cell casts | trụ hồng cầu | freq 5 docs (S2 N2 H1) | canonical: 5 tài liệu (S2 N2 H1); OK |
| arteriolar hyalinosis | hyalin hóa tiểu động mạch | 'hyalin(e) hóa' 3 docs (S3: YHTPHCM25-197, YHTPHCM25-185, HueJMP20-85); parent hyalinization = thoái hóa kính (0 docs here); DECISION | canonical: 0 tài liệu; OK |
| arterioles | tiểu động mạch | freq 7 docs (S5 N2) | canonical: 9 tài liệu (S5 C1 N2 H1); LOCAL_MORE |
| arteriosclerosis | xơ cứng động mạch | freq 0; standard VN term (not parent sclerosis = xơ chai); LOW | canonical: 0 tài liệu; OK |
| hypertensive nephrosclerosis | xơ hóa thận do tăng huyết áp | src: TCNCYH-3614 (N1); LOW | canonical: 0 tài liệu; note không có số đếm để so |
| nephrotic syndrome | hội chứng thận hư | freq 14 docs (S10 C1 N3) | canonical: 16 tài liệu (S10 C1 N3 H2); OK_NOH |
| steroid-resistant nephrotic syndrome | hội chứng thận hư kháng steroid | src: YHTPHCM22-188 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| nephritic syndrome | hội chứng viêm thận | freq 4 docs (S3 N1) vs 'hội chứng viêm cầu thận' S2 | canonical: 5 tài liệu (S3 N1 H1); OK_NOH |
| proteinuria | đạm niệu | S6 docs (64 hits) vs 'protein niệu' 10 docs (S5 C1 N4) vs 'tiểu đạm' S4; DECISION | canonical: 9 tài liệu (S7 H2); LOCAL_MORE |
| hematuria | tiểu máu | freq 13 docs (S10 N2 L1) vs 'đái máu' 7 (S2 C2 N3) | canonical: 15 tài liệu (S10 N2 L1 H2); OK, OK_NOH |
| acute kidney injury | tổn thương thận cấp | freq 4 docs (S4, 19 hits) vs 'suy thận cấp' 5 | canonical: 5 tài liệu (S4 N1); LOCAL_MORE x2 |
| chronic kidney disease | bệnh thận mạn | freq 11 docs (S8 N3) | canonical: 13 tài liệu (S9 C1 N3); LOCAL_MORE |
| end-stage kidney disease | bệnh thận giai đoạn cuối | freq 6 docs (S3 N3) | canonical: 7 tài liệu (S4 N3); LOCAL_MORE |
| end-stage renal disease | suy thận giai đoạn cuối | freq 7 docs (S5 N2) | canonical: 2 tài liệu (N2); LOCAL_LESS; đúng cụm 2 (N2); dạng phía Nam là 'suy thận mạn giai đoạn cuối' 7 (S6 C1) |
| glomerular filtration rate | độ lọc cầu thận | S7 docs (23 hits) vs 'mức lọc cầu thận' 4 docs (S1 N3) | canonical: 8 tài liệu (S7 H1); LOCAL_MORE |
| dialysis | lọc máu | freq 8 docs (S4 N4) | canonical: 12 tài liệu (S6 C1 N4 H1); LOCAL_MORE |
| kidney transplantation | ghép thận | freq 10 docs (S5 C1 N4, 110 hits) | canonical: 10 tài liệu (S5 C1 N4); OK |
| kidney transplant | ghép thận | as kidney transplantation | canonical: 10 tài liệu (S5 C1 N4); note không có số đếm để so |
| renal allograft | thận ghép | freq 8 docs (S3 C2 N1 H2) | canonical: 8 tài liệu (S3 C2 N1 H2); OK |
| allograft rejection | thải ghép | 'thải ghép' 2 docs (78 hits); bare 'rejection' left out (statistics sense) | canonical: 4 tài liệu (S2 C1 N1); LOCAL_MORE |
| acute rejection | thải ghép cấp | src: TCNCYH-3614, vjol PNT (web) | canonical: 4 tài liệu (S2 C1 N1); note không có số đếm để so |
| chronic rejection | thải ghép mạn | src: TCNCYH-3614 'thải ghép mạn tính' | canonical: 2 tài liệu (C1 N1); note không có số đếm để so |
| T cell-mediated rejection | thải ghép qua trung gian tế bào T | Banff name; TCNCYH-3614 'thải ghép tế bào' (N1, 12 hits); BUILT; keep (TCMR) | canonical: 0 tài liệu; note không có số đếm để so |
| antibody-mediated rejection | thải ghép qua trung gian kháng thể | src: TCNCYH-3614 (N1, 2 hits); alt 'thải ghép dịch thể' N1 (13 hits), 'thải ghép thể dịch' S1 (YHTPHCM25-58); keep (AMR) | canonical: 1 tài liệu (N1); note không có số đếm để so |
| humoral rejection | thải ghép thể dịch | src: YHTPHCM25-58 (S1); alt 'dịch thể' (TCNCYH-3614) | canonical: 0 tài liệu; note không có số đếm để so |
| chronic active antibody-mediated rejection | thải ghép qua trung gian kháng thể mạn tính hoạt động | Banff; BUILT | canonical: 0 tài liệu; note không có số đếm để so |
| Banff classification | phân loại Banff | src: TCNCYH-3614 (N1, 25 hits) | canonical: 0 tài liệu; note không có số đếm để so |
| C4d | C4d | kept English (S1 N1, 122 hits) | canonical: 2 tài liệu (S1 N1); note không có số đếm để so |
| C4d deposition | lắng đọng C4d | src: YHTPHCM25-58 (S1, 30 hits) | canonical: 1 tài liệu (S1); note không có số đếm để so |
| peritubular capillaries | mao mạch quanh ống thận | 'mao mạch quanh ống' 2 docs (S1 N1) | canonical: 2 tài liệu (S1 N1); OK |
| peritubular capillaritis | viêm mao mạch quanh ống thận | built from peritubular capillaries; LOW | canonical: 0 tài liệu; note không có số đếm để so |
| glomerulitis | viêm mao mạch cầu thận | Banff g; freq 0; BUILT (not 'viêm cầu thận' = glomerulonephritis); LOW | canonical: 1 tài liệu (N1); LOCAL_MORE |
| microvascular inflammation | viêm vi mạch | Banff MVI; freq 0; BUILT; LOW | canonical: 2 tài liệu (S1 N1); LOCAL_MORE |
| intimal arteritis | viêm nội mạc động mạch | Banff v; freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| transplant glomerulopathy | bệnh cầu thận ghép | src: TCNCYH-3614 (N1, 3 hits) | canonical: 1 tài liệu (N1); note không có số đếm để so |
| donor-specific antibodies | kháng thể đặc hiệu người hiến | freq 0; BUILT; keep (DSA); LOW | canonical: 0 tài liệu; OK |
| calcineurin inhibitor toxicity | độc tính của thuốc ức chế calcineurin | freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| BK polyomavirus nephropathy | bệnh thận do polyomavirus BK | freq 0; BUILT; LOW | canonical: 0 tài liệu; OK |
| pyelonephritis | viêm đài bể thận | src: YHTPHCM16-116 (S1) | canonical: 1 tài liệu (S1); note không có số đếm để so |
