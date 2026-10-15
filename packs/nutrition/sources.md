# sources.md: nutrition (Dinh dưỡng y khoa), draft 0.1.1

Bằng chứng cho từng thuật ngữ của gói `nutrition`. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn, tiêu đề và URL; không chép câu nào từ bài báo.

## Cách đếm

- Kho: run `pack-2026-10-15-nutrition` của `tools/corpus_fetch.py` (40 / 40 request, 2026-10-15), cộng 2 tệp đã có sẵn trong kho từ run trước (BD18x, PNT19x, đều lạc đề). 36 tài liệu đọc được: 34 PDF toàn văn và 2 trang tóm tắt HTML (ND2-A1, ND2-A2).
- Trích chữ: PyMuPDF (PDF) và BeautifulSoup (HTML), chuẩn hóa NFC, chữ thường, gộp dấu kiểu cũ (hoá = hóa, tuỷ = tủy), đổi "ƣ" (lỗi font PDF) thành "ư". Bản chữ chỉ lưu cục bộ, không commit.
- Đếm theo **số tài liệu** có ít nhất một lần xuất hiện, khớp nguyên từ, khoảng trắng và gạch nối linh hoạt. "Lần" = tổng số lần xuất hiện.
- Vùng: **S** = phía Nam (Tạp chí Y học TP.HCM, kể cả các số chuyên đề của BV Chợ Rẫy, Nhân dân Gia Định, Bình Dân, Nhi Đồng 2, Thống Nhất, Nhân dân 115; Tạp chí Y Dược học Phạm Ngọc Thạch); **M** = Cần Thơ (Tạp chí Y Dược học Cần Thơ); **H** = Huế (Tạp chí Y Dược học Huế); **N** = Hà Nội / toàn quốc (Tạp chí Nghiên cứu Y học, Tạp chí Y Dược lâm sàng 108).
- YHTP26-69 đăng trên Y học TP.HCM nhưng tác giả ở BV Nhi Hà Nội; HUE21 đăng ở Huế nhưng tác giả ở BV Bạch Mai. Hai bài vẫn tính theo tạp chí.
- Canonical = biến thể nhiều tài liệu nhất, phía Nam trước; hòa thì theo dạng phía Nam hoặc theo dòng cùng họ trong gói (ghi rõ ở note). Khóa trùng với gói khác giữ đúng giá trị của gói đó.
- **BUILT** = ghép từ thành tố đã có, không có dạng nguyên cụm trong kho. **LOW** = 0-1 tài liệu. **UNRESOLVED** / **UNVERIFIED** = xem MINING_REPORT mục 4.
- "web (search only)" = bằng chứng từ đoạn trích của công cụ tìm kiếm (không tải trang). Các trang này không có trong kho, không kiểm lại được offline.
- Không dùng MedEV, không dùng số đếm của ô tìm kiếm OJS.

## Mã trích dẫn

| Mã | Bài / trang (tiêu đề rút gọn) | Nguồn | Năm | Vùng | URL |
|---|---|---|---|---|---|
| CR17 | Can thiệp dinh dưỡng chu phẫu, ung thư hạ họng - thanh quản (Khoa Dinh dưỡng / TMH BV Chợ Rẫy) | Y học TP.HCM 21(2), HNKH BV Chợ Rẫy | 2017 | S | https://tapchiyhoctphcm.vn/upload/2017/21%202CR/278.pdf |
| NDGD16 | Điểm cắt chẩn đoán suy dinh dưỡng của SGA-MIS và sinh hóa tổng hợp ở bệnh nhân lọc máu định kỳ | Y học TP.HCM 20(6), HNKH BV Nhân dân Gia Định | 2016 | S | https://duoc.tapchiyhoctphcm.vn/upload/2016/20%206ndgd/230.pdf |
| ND2-17 | Dinh dưỡng ở trẻ sơ sinh tim bẩm sinh được phẫu thuật (BV Nhi Đồng 2) | Y học TP.HCM 21(1), Nhi khoa | 2017 | S | https://tapchiyhoctphcm.vn/upload/2017/21%201SKSS-BMTE%20(TTngay5-6-17)/247.pdf |
| CR21 | Chăm sóc người bệnh cắt toàn bộ hạ họng - thanh quản - thực quản (Khoa TMH BV Chợ Rẫy) | Y học TP.HCM 25(3), HNKH BV Chợ Rẫy | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S3%202021%20BV%20CRay%20(goi%20HDGS%202022)/49.pdf |
| YHTP26-69 | Tình trạng dinh dưỡng ở trẻ viêm phổi 6-24 tháng (tác giả BV Nhi Hà Nội) | Y học TP.HCM 29(5) | 2026 | S (tạp chí) | https://tapchiyhoctphcm.vn/upload/2026/T29%20S5/69.pdf |
| NDTP25 | Hiệu quả sữa thủy phân protein toàn phần (BV Nhi Đồng Thành phố) | Y học TP.HCM 28(7) | 2025 | S | https://www.tapchiyhoctphcm.vn/upload/2025/T28%20S7/9.pdf |
| TN16 | Loãng xương ở nam giới (BV Thống Nhất), liên quan một phần | Y học TP.HCM 20(6) | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%206thongnhat/125.pdf |
| Q175-25 | Thực trạng dinh dưỡng ở người bệnh phổi tắc nghẽn mạn tính (BV Quân y 175) | Y học TP.HCM 28(3) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S3/8.pdf |
| ND115-25 | Chiến lược hồi phục sớm sau phẫu thuật nội soi cắt dạ dày (BV Nhân dân 115) | Y học TP.HCM 28(5) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S5/106.pdf |
| BD16 | Săn sóc bệnh nhân ngay sau ghép gan (tổng quan, BV Bình Dân), liên quan một phần | Y học TP.HCM 20(2) | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%202binh%20dan/35.pdf |
| CRNT16 | Ứng dụng SGA đánh giá dinh dưỡng ở bệnh nhân bệnh thận mạn chưa điều trị thay thế (BV Chợ Rẫy) | Y học TP.HCM 20(4), Niệu - Thận | 2016 | S | https://www.tapchiyhoctphcm.vn/upload/2016/20%204nieu%20than/154.pdf |
| MK18 | Tỷ lệ nuôi con bằng sữa mẹ hoàn toàn đến 6 tháng (BV Mêkông) | Y học TP.HCM 22(1), SKSS - BMTE | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%201BAMEVATREEM/166.pdf |
| AG16 | Đặc điểm nuôi ăn nhũ nhi và trẻ nhỏ (BVĐK Hạnh Phúc An Giang) | Y học TP.HCM 20(1), SKSS - BMTE | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%201cd%20suckhoe%20sinh%20san/086.pdf |
| YHCT19 | Bệnh lý mạn tính và thể lâm sàng YHCT trên bệnh thừa cân - béo phì | Y học TP.HCM 23(4), YHCT | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%204%20yhct/144.pdf |
| UMP25 | Hội chứng chuyển hóa và các yếu tố liên quan (ĐH Y Dược TP.HCM) | Y học TP.HCM 28(11) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S11/111.pdf |
| UMP24 | Bệnh não gan trong xơ gan ở người lớn tuổi (tổng quan, ĐH Y Dược TP.HCM) | Y học TP.HCM 27(5) | 2024 | S | https://tapchiyhoctphcm.vn/upload/2024/T27%20S5/1.pdf |
| CC18 | Thừa cân, béo phì ở học sinh tiểu học Củ Chi | Y học TP.HCM 22(1), YTCC | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%201khoc%20coban%20yte%20congcong/355.pdf |
| ND2-18 | Đau bụng colic trẻ nhũ nhi (tổng quan, BV Nhi Đồng 2), liên quan một phần | Y học TP.HCM 22(4) | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%204%20ND%202%20lan%202%202018/005.pdf |
| NHI19 | Ảnh hưởng của phản ứng viêm trên nồng độ dưỡng chất trong máu (tổng quan nhi) | Y học TP.HCM 23(1), Nhi khoa | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%201%20nhi/001.pdf |
| ND2-A1 | Hạ phospho máu và hội chứng nuôi ăn lại ở bệnh nhi nặng (BV Nhi Đồng 2), trang tóm tắt | Y học TP.HCM | - | S | https://tapchiyhoctphcm.vn/articles/17401 |
| ND2-A2 | Hỗ trợ dinh dưỡng và kết cục ở bệnh nhi nặng tại PICU, trang tóm tắt | Y học TP.HCM | - | S | https://tapchiyhoctphcm.vn/articles/17402 |
| PNT24 | Cập nhật đồng thuận ASPEN về hội chứng nuôi ăn lại (BV Quân y 175, BV Nhân dân Gia Định) | Tạp chí Y Dược học Phạm Ngọc Thạch 3(3) | 2024 | S | https://vjol.info.vn/pnt/vi/article/download/100551/84829/ |
| BD18x | Bướu biểu mô tuyến ức (lạc đề, có sẵn trong kho) | Y học TP.HCM 22(2) | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/30.pdf |
| PNT19x | Điều trị ung thư trực tràng (lạc đề, có sẵn trong kho) | Y học TP.HCM 23(3) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20pnt/11.pdf |
| CT24-2453 | Suy dinh dưỡng ở bệnh nhân bệnh thận mạn (BVĐK Trung ương Cần Thơ) | Tạp chí Y Dược học Cần Thơ 76 | 2024 | M | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/2453/2015/19593 |
| CT25-3457 | Sarcopenia ở người cao tuổi huyện Phong Điền | Tạp chí Y Dược học Cần Thơ 83 | 2025 | M | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/3457/2308/26117 |
| CT25-3185 | Suy dinh dưỡng ở người bệnh suy thận mạn được lọc máu (BVĐK TP Cần Thơ) | Tạp chí Y Dược học Cần Thơ 83 | 2025 | M | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/3185/2296/26105 |
| CT23-503 | Thiếu vi chất ở trẻ suy dinh dưỡng dưới 5 tuổi (BV Nhi Đồng Cần Thơ) | Tạp chí Y Dược học Cần Thơ 56 | 2023 | M | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/503/500/1142 |
| CT23-1279 | Mức độ suy dinh dưỡng cấp và viêm phổi ở trẻ 2 tháng - 5 tuổi (BV Nhi Đồng Cần Thơ) | Tạp chí Y Dược học Cần Thơ 61 | 2023 | M | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/1279/1372/6720 |
| HUE21 | Tình trạng dinh dưỡng của bệnh nhân phẫu thuật ung thư ống tiêu hóa | Tạp chí Y Dược học Huế 11(6) | 2021 | H | https://jmp.huemed-univ.edu.vn/BBao/2022/6/PDF_2022m06d07_15_49_19.pdf |
| HUE18 | Tình trạng dinh dưỡng của bệnh nhân nội trú (BV Trường ĐH Y Dược Huế) | Tạp chí Y Dược học Huế 8(2) | 2018 | H | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d020_8_22_15.pdf |
| TCN22-969 | Tình trạng dinh dưỡng và nuôi dưỡng qua ống thông dạ dày ở người bệnh hồi sức (BV điều trị COVID-19) | TCNCYH 157(9) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/969/626 |
| TCN24-2381 | Nguy cơ hội chứng nuôi ăn lại ở người bệnh ung thư thực quản xét xạ trị (BV K) | TCNCYH 178(5) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2381/1587/30093 |
| TCN26-4366 | Tình trạng dinh dưỡng của người bệnh phẫu thuật đường tiêu hóa (BV ĐH Y Hà Nội, GLIM) | TCNCYH 198(1) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4366/3026/60818 |
| TCN25-3335 | Nuôi dưỡng sớm đường tiêu hóa sau phẫu thuật Santulli (báo cáo ca, BV Nhi TƯ) | TCNCYH 193(8) | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3335/2606/50100 |
| Y108-18 | Nuôi dưỡng tĩnh mạch ở trẻ sinh non viêm ruột hoại tử (BV Nhi TƯ) | Tạp chí Y Dược lâm sàng 108, 13(5) | 2018 | N | https://tcydls108.benhvien108.vn/index.php/YDLS/article/download/514/321/ |

Phân bố: 24 tài liệu S (2 lạc đề, 3 liên quan một phần), 5 M, 2 H, 5 N.

## Bằng chứng ngoài kho (chỉ đoạn trích tìm kiếm)

- SAM / suy dinh dưỡng cấp tính: Bộ Y tế QĐ 4487/QĐ-BYT (2016), "Hướng dẫn chẩn đoán và điều trị bệnh suy dinh dưỡng cấp tính ở trẻ em từ 0 đến 72 tháng tuổi"; trang Khoa Nhi BV Nguyễn Tri Phương "quản lý suy dinh dưỡng cấp tính"; Vụ Pháp chế BYT nhắc "F75, F100 và RUTF".
- frailty: nghiên cứu ở BV Thống Nhất và BV ĐH Y Dược TP.HCM (TCNCYH), trang Lão khoa BV Nguyễn Tri Phương, bài Cần Thơ dùng "suy yếu"; BV Lão khoa TƯ dùng "hội chứng dễ bị tổn thương".
- dietetics / therapeutic diet: Thông tư 08/2011/TT-BYT "công tác dinh dưỡng, tiết chế trong bệnh viện", "chế độ ăn bệnh lý".
- IDDSI: bản dịch tiếng Việt chính thức có trên iddsi.org nhưng `robots.txt` của www.iddsi.org chặn mọi bot (`User-agent: * Disallow: /`), nên **không tải**. Tên các mức IDDSI trong gói là dạng ghép, chưa kiểm.

## Quyết định 2026-10-15: D5, D6, D8 theo luật (toàn kho)

Người dùng trả lời "1 ok" (2026-10-15 17:36) cho bảng quyết định; D5, D6, D8 không có đề xuất nên chọn theo luật: biến thể dùng nhiều nhất trong toàn văn tiếng Việt đã có trong `D:/vitranslate-corpus`, phía Nam trước. Không tải thêm. Kho đếm lại: mọi tệp status 200 của mọi run, chỉ giữ tệp đọc là tiếng Việt, được **164 tài liệu**: Y học TP.HCM 69, BV Nguyễn Tri Phương 32 trang, TCNCYH 28, Cần Thơ 8, VJS 7, Huế 7, BV ĐH Y Dược 4, Y Dược lâm sàng 108 3, VJOL 2, và 4 host khác 1 tài liệu mỗi host. Vùng **W** = trang web bệnh viện phía Nam (BV Nguyễn Tri Phương, BV ĐH Y Dược, BV Bình Dân), không qua bình duyệt; các vùng khác như mục "Cách đếm".

| Quyết định | Biến thể | Tài liệu | Lần | Vùng | Chọn |
|---|---|---|---|---|---|
| D5 carbohydrate | carbohydrate | 6 | 10 | S3 N2 W1 | **giữ EN "carbohydrate"** |
| | glucid | 5 | 14 | N3 H1 W1 | không có tạp chí phía Nam |
| | gluxid / carbohydrat | 1 / 1 | 1 / 1 | H1 / W1 | |
| | bột đường / chất bột đường | 2 / 1 | 2 / 1 | S2 / S1 | từ phổ thông |
| | tinh bột | 3 | 4 | N2 S1 | nghĩa khác (starch) |
| D6 dysphagia | khó nuốt | 6 | 15 | S1 W5 | **"khó nuốt"** |
| | nuốt khó | 3 | 7 | N1 S1 W1 | cùng nghĩa, đảo trật tự |
| | nuốt vướng | 8 | 22 | N3 S3 W2 | loại: triệu chứng hẹp hơn (cảm giác vướng); trong cùng văn bản được liệt kê cạnh "khó nuốt" / "nuốt khó" như hai triệu chứng khác nhau (CR21, 2 trang BVNTP) |
| | nuốt đau | 4 | 14 | N2 S1 W1 | nghĩa khác (odynophagia) |
| | nuốt nghẹn | 3 | 18 | N1 S1 W1 | chỉ dùng cho tắc thực quản |
| | rối loạn nuốt | 1 | 1 | S1 | |
| D8 CRBSI (danh từ chính) | nhiễm trùng huyết | 6 | 10 | S5 W1 | **"nhiễm trùng huyết liên quan đến catheter (CRBSI)"** |
| | nhiễm khuẩn huyết | 4 | 5 | N1 S2 W1 | |
| | nhiễm trùng (trần) | 46 | 284 | S23 W11 N8 H3 M1 | |
| | nhiễm khuẩn (trần) | 31 | 87 | S13 W9 N6 M2 H1 | |
| | mọi dạng ghép với catheter / dòng máu | 0 | 0 | - | không có trong kho |

Ghi chú D6: theo đúng số đếm, "nuốt vướng" đứng đầu (8 tài liệu). Nó bị loại vì không cùng nghĩa với dysphagia nói chung. Bằng chứng ngược: một bài tuyến giáp dịch "nuốt vướng" thành "dysphagia" trong tóm tắt tiếng Anh. Người dùng có thể đổi nếu muốn theo số đếm thuần.

## Số đếm từng biến thể

Bảng dưới gồm mọi biến thể đã đếm cho các khóa của gói (kể cả biến thể 0 tài liệu). Nhóm khóa là nhãn làm việc, không phải khóa glossary.

| Nhóm khóa (EN) | Biến thể tiếng Việt | Tài liệu | Lần | Vùng | Nguồn (tối đa 3) |
|---|---|---|---|---|---|
| malnutrition | suy dinh dưỡng | 28 | 384 | H2 M5 N5 S16 | CR17, NDGD16, ND2-17 |
| malnutrition | thiếu dinh dưỡng | 4 | 4 | N2 S2 | Q175-25, CC18, TCN22-969 |
| malnutrition | sdd | 15 | 379 | H2 M5 N3 S5 | CR17, ND2-17, YHTP26-69 |
| undernutrition | thiếu dinh dưỡng | 4 | 4 | N2 S2 | Q175-25, CC18, TCN22-969 |
| undernutrition | dinh dưỡng kém | 4 | 4 | H1 N1 S2 | CR17, YHTP26-69, HUE21 |
| nutritional status | tình trạng dinh dưỡng | 25 | 256 | H2 M3 N5 S15 | CR17, NDGD16, ND2-17 |
| nutrition screening | sàng lọc dinh dưỡng | 3 | 4 | H2 S1 | HUE21, HUE18, PNT24 |
| nutrition screening | tầm soát dinh dưỡng | 1 | 4 | H1 | HUE18 |
| nutrition screening | sàng lọc nguy cơ dinh dưỡng | 1 | 1 | N1 | TCN22-969 |
| nutrition screening | tầm soát nguy cơ dinh dưỡng | 1 | 1 | H1 | HUE18 |
| nutritional risk | nguy cơ dinh dưỡng | 5 | 20 | H2 N2 S1 | CR17, HUE21, HUE18 |
| nutritional risk | nguy cơ suy dinh dưỡng | 11 | 21 | H2 M2 N2 S5 | CR17, ND2-17, YHTP26-69 |
| nutrition assessment | đánh giá dinh dưỡng | 10 | 34 | H1 N2 S7 | CR17, NDGD16, CR21 |
| nutrition assessment | đánh giá tình trạng dinh dưỡng | 15 | 63 | H2 M2 N4 S7 | CR17, NDGD16, CR21 |
| SGA | đánh giá tổng thể chủ quan | 3 | 5 | H1 M1 S1 | CR17, CT24-2453, HUE21 |
| SGA | đánh giá tổng thể theo chủ quan | 0 | 0 | - | - |
| SGA | đánh giá toàn diện chủ quan | 1 | 1 | H1 | HUE21 |
| SGA | đánh giá tổng thể tình trạng dinh dưỡng theo chủ quan | 1 | 1 | S1 | CRNT16 |
| SGA | đánh giá dinh dưỡng tổng thể chủ quan | 0 | 0 | - | - |
| SGA | sga | 9 | 248 | H1 M2 N1 S5 | CR17, NDGD16, Q175-25 |
| PG-SGA | pg-sga | 2 | 2 | H1 S1 | CR17, HUE21 |
| PG-SGA | pg sga | 2 | 2 | H1 S1 | CR17, HUE21 |
| NRS | nrs-2002 | 2 | 22 | H1 S1 | HUE18, PNT24 |
| NRS | nrs 2002 | 2 | 22 | H1 S1 | HUE18, PNT24 |
| NRS | nrs2002 | 1 | 21 | H1 | HUE18 |
| MNA | mna | 4 | 47 | M1 N1 S2 | Q175-25, CT25-3457, TCN26-4366 |
| MNA | mna-sf | 2 | 8 | M1 S1 | CT25-3457, PNT24 |
| MUST | must | 2 | 4 | S2 | PNT24, ND2-A1 |
| GLIM | glim | 3 | 43 | H1 N2 | HUE21, TCN22-969, TCN26-4366 |
| GLIM | tiêu chuẩn glim | 2 | 17 | N2 | TCN22-969, TCN26-4366 |
| GLIM | tiêu chí glim | 1 | 1 | N1 | TCN22-969 |
| anthropometry | nhân trắc | 9 | 17 | H1 M2 N1 S5 | ND2-17, YHTP26-69, NDTP25 |
| anthropometry | nhân trắc học | 1 | 1 | M1 | CT25-3457 |
| anthropometry | chỉ số nhân trắc | 6 | 10 | M1 S5 | ND2-17, YHTP26-69, NDTP25 |
| anthropometry | đo nhân trắc | 1 | 1 | H1 | HUE21 |
| BMI | chỉ số khối cơ thể | 11 | 15 | H1 M1 N3 S6 | CR21, Q175-25, ND115-25 |
| BMI | chỉ số khối lượng cơ thể | 0 | 0 | - | - |
| BMI | bmi | 19 | 224 | H2 M2 N3 S12 | CR17, NDGD16, CR21 |
| body composition | thành phần cơ thể | 2 | 2 | S2 | TN16, CRNT16 |
| body composition | thành phần khối cơ thể | 0 | 0 | - | - |
| bioimpedance | trở kháng điện sinh học | 0 | 0 | - | - |
| bioimpedance | phân tích trở kháng | 0 | 0 | - | - |
| bioimpedance | bia | 3 | 20 | M1 N1 S1 | TN16, CT25-3457, TCN24-2381 |
| bioimpedance | điện trở kháng sinh học | 0 | 0 | - | - |
| phase angle | góc pha | 0 | 0 | - | - |
| handgrip | sức cơ tay | 0 | 0 | - | - |
| handgrip | lực bóp tay | 1 | 1 | M1 | CT25-3457 |
| handgrip | sức nắm tay | 0 | 0 | - | - |
| handgrip | lực nắm tay | 0 | 0 | - | - |
| handgrip | sức bóp cơ bàn tay | 0 | 0 | - | - |
| handgrip | sức co bóp cơ bàn tay | 0 | 0 | - | - |
| handgrip | sức mạnh cơ tay | 0 | 0 | - | - |
| handgrip | lực cơ tay | 1 | 1 | M1 | CT25-3457 |
| handgrip | sức cơ nắm tay | 0 | 0 | - | - |
| handgrip | lực nắm bàn tay | 0 | 0 | - | - |
| MUAC | chu vi vòng cánh tay | 1 | 1 | M1 | CT23-1279 |
| MUAC | vòng cánh tay | 1 | 1 | M1 | CT23-1279 |
| MUAC | vòng cánh tay giữa | 0 | 0 | - | - |
| MUAC | chu vi giữa cánh tay | 0 | 0 | - | - |
| MUAC | chu vi cánh tay | 0 | 0 | - | - |
| triceps skinfold | nếp gấp da cơ tam đầu | 0 | 0 | - | - |
| triceps skinfold | bề dày nếp gấp da | 0 | 0 | - | - |
| triceps skinfold | nếp gấp da | 0 | 0 | - | - |
| calf circumference | chu vi vòng bắp chân | 0 | 0 | - | - |
| calf circumference | vòng bắp chân | 0 | 0 | - | - |
| calf circumference | chu vi bắp chân | 1 | 1 | S1 | Q175-25 |
| waist circumference | vòng eo | 2 | 7 | S2 | YHCT19, UMP25 |
| waist circumference | chu vi vòng eo | 1 | 1 | S1 | YHCT19 |
| waist circumference | vòng bụng | 2 | 2 | S2 | YHCT19, UMP25 |
| waist to hip ratio | tỷ số eo/hông | 0 | 0 | - | - |
| waist to hip ratio | tỷ lệ eo/hông | 1 | 3 | S1 | YHCT19 |
| waist to hip ratio | tỉ số eo/hông | 0 | 0 | - | - |
| waist to hip ratio | tỉ lệ eo/hông | 0 | 0 | - | - |
| waist to hip ratio | tỷ số eo hông | 0 | 0 | - | - |
| waist to hip ratio | tỷ số vòng eo/vòng mông | 0 | 0 | - | - |
| waist to hip ratio | tỷ lệ vòng eo/vòng mông | 0 | 0 | - | - |
| waist to hip ratio | vòng eo/vòng mông | 0 | 0 | - | - |
| waist to hip ratio | eo/mông | 0 | 0 | - | - |
| fat free mass | khối nạc | 0 | 0 | - | - |
| fat free mass | khối không mỡ | 0 | 0 | - | - |
| fat free mass | khối lượng không mỡ | 0 | 0 | - | - |
| fat free mass | khối lượng nạc | 0 | 0 | - | - |
| fat mass | khối mỡ | 2 | 2 | H1 S1 | NDGD16, HUE21 |
| fat mass | khối lượng mỡ | 1 | 1 | H1 | HUE21 |
| muscle mass | khối cơ | 17 | 35 | H2 M2 N4 S9 | CR17, NDGD16, CR21 |
| muscle mass | khối lượng cơ | 5 | 10 | M1 N1 S3 | ND115-25, UMP24, CT25-3457 |
| skeletal muscle mass | khối cơ xương | 1 | 2 | M1 | CT25-3457 |
| skeletal muscle mass | khối lượng cơ xương | 1 | 2 | M1 | CT25-3457 |
| skeletal muscle mass | khối cơ vân | 0 | 0 | - | - |
| appendicular | khối cơ xương tứ chi | 0 | 0 | - | - |
| appendicular | cơ xương tứ chi | 0 | 0 | - | - |
| appendicular | khối cơ tứ chi | 0 | 0 | - | - |
| muscle strength | sức cơ | 2 | 2 | S2 | NDGD16, TN16 |
| muscle strength | sức mạnh cơ | 1 | 5 | M1 | CT25-3457 |
| muscle strength | lực cơ | 3 | 4 | M1 S2 | BD18x, UMP24, CT25-3457 |
| gait speed | tốc độ đi bộ | 1 | 2 | M1 | CT25-3457 |
| gait speed | tốc độ dáng đi | 0 | 0 | - | - |
| gait speed | tốc độ đi | 1 | 2 | M1 | CT25-3457 |
| weight loss | sụt cân | 11 | 16 | M2 N3 S6 | CR17, NDGD16, CR21 |
| weight loss | giảm cân | 7 | 26 | H2 N3 S2 | NDGD16, YHTP26-69, HUE21 |
| weight loss | mất cân | 5 | 8 | S5 | YHTP26-69, TN16, BD16 |
| weight loss | sút cân | 3 | 14 | H1 N1 S1 | YHTP26-69, HUE21, TCN24-2381 |
| unintentional weight loss | sụt cân không chủ ý | 0 | 0 | - | - |
| unintentional weight loss | giảm cân không chủ ý | 0 | 0 | - | - |
| unintentional weight loss | sụt cân ngoài ý muốn | 0 | 0 | - | - |
| unintentional weight loss | giảm cân ngoài ý muốn | 0 | 0 | - | - |
| unintentional weight loss | sụt cân không mong muốn | 0 | 0 | - | - |
| unintentional weight loss | giảm cân không mong muốn | 0 | 0 | - | - |
| unintentional weight loss | sụt cân không chủ đích | 1 | 1 | S1 | PNT24 |
| unintentional weight loss | giảm cân không chủ đích | 2 | 5 | N2 | TCN22-969, TCN26-4366 |
| dietary intake | khẩu phần | 9 | 24 | H2 M3 N2 S2 | AG16, CC18, CT24-2453 |
| dietary intake | khẩu phần ăn | 8 | 14 | H2 M3 N2 S1 | AG16, CT24-2453, CT25-3457 |
| dietary intake | lượng ăn vào | 0 | 0 | - | - |
| dietary intake | lượng thức ăn ăn vào | 0 | 0 | - | - |
| dietary intake | lượng ăn | 0 | 0 | - | - |
| reduced food intake | giảm ăn | 0 | 0 | - | - |
| reduced food intake | giảm lượng ăn vào | 0 | 0 | - | - |
| reduced food intake | giảm khẩu phần | 2 | 2 | N2 | TCN22-969, TCN26-4366 |
| 24h recall | hỏi ghi khẩu phần 24 giờ | 0 | 0 | - | - |
| 24h recall | khẩu phần 24 giờ | 0 | 0 | - | - |
| 24h recall | hỏi ghi 24 giờ | 0 | 0 | - | - |
| serum albumin | albumin huyết thanh | 7 | 23 | H1 M2 N1 S3 | CR17, NDGD16, Q175-25 |
| serum albumin | albumin máu | 4 | 16 | H1 N1 S2 | CR17, ND115-25, HUE21 |
| prealbumin | prealbumin | 5 | 57 | H1 N1 S3 | CR17, NDGD16, Q175-25 |
| prealbumin | tiền albumin | 0 | 0 | - | - |
| transferrin | transferrin | 3 | 4 | H1 S2 | NDGD16, NHI19, HUE21 |
| total lymphocyte count | tổng số lượng tế bào lympho | 0 | 0 | - | - |
| total lymphocyte count | tổng số lympho bào | 0 | 0 | - | - |
| total lymphocyte count | số lượng tế bào lympho | 1 | 2 | S1 | NDGD16 |
| total lymphocyte count | tổng số tế bào lympho | 1 | 2 | S1 | NDGD16 |
| total lymphocyte count | tổng số lượng lympho | 0 | 0 | - | - |
| nitrogen balance | cân bằng nitơ | 1 | 1 | S1 | CR17 |
| nitrogen balance | cân bằng nito | 0 | 0 | - | - |
| nitrogen balance | cân bằng đạm | 0 | 0 | - | - |
| sarcopenia | thiểu cơ | 1 | 5 | M1 | CT25-3457 |
| sarcopenia | thiếu cơ | 1 | 1 | M1 | CT25-3457 |
| sarcopenia | sarcopenia | 5 | 65 | M2 S3 | CR17, UMP24, CT24-2453 |
| sarcopenia | mất cơ | 3 | 4 | S3 | TN16, UMP24, PNT24 |
| sarcopenia | giảm cơ | 1 | 1 | S1 | YHTP26-69 |
| sarcopenia | suy giảm khối cơ | 0 | 0 | - | - |
| sarcopenia | teo cơ | 2 | 3 | H1 S1 | CRNT16, HUE21 |
| sarcopenic obesity | béo phì thiểu cơ | 0 | 0 | - | - |
| sarcopenic obesity | béo phì kèm thiểu cơ | 0 | 0 | - | - |
| cachexia | suy mòn | 6 | 31 | M1 N1 S4 | CR17, NDGD16, UMP24 |
| cachexia | hội chứng suy mòn | 1 | 10 | S1 | NDGD16 |
| cachexia | suy kiệt | 3 | 4 | N2 S1 | CR21, TCN24-2381, TCN25-3335 |
| cachexia | cachexia | 4 | 10 | S4 | CR17, NDGD16, Q175-25 |
| cachexia | mòn mỏi | 0 | 0 | - | - |
| frailty | suy yếu | 4 | 5 | M1 N1 S2 | BD16, UMP24, CT25-3457 |
| frailty | hội chứng dễ bị tổn thương | 0 | 0 | - | - |
| frailty | dễ bị tổn thương | 0 | 0 | - | - |
| frailty | frailty | 0 | 0 | - | - |
| frailty | hội chứng suy yếu | 0 | 0 | - | - |
| frailty | lão suy | 0 | 0 | - | - |
| frailty | già yếu | 0 | 0 | - | - |
| refeeding syndrome | hội chứng nuôi ăn lại | 6 | 73 | N2 S4 | CR17, TCN22-969, TCN24-2381 |
| refeeding syndrome | hội chứng nuôi dưỡng lại | 0 | 0 | - | - |
| refeeding syndrome | hội chứng tái nuôi ăn | 0 | 0 | - | - |
| refeeding syndrome | hội chứng tái nuôi dưỡng | 0 | 0 | - | - |
| refeeding syndrome | hcnal | 2 | 44 | N1 S1 | TCN24-2381, ND2-A2 |
| hypophosphatemia | hạ phospho máu | 2 | 12 | S2 | ND2-A1, ND2-A2 |
| hypophosphatemia | giảm phospho máu | 1 | 1 | S1 | ND2-A2 |
| hypophosphatemia | hạ phosphor máu | 0 | 0 | - | - |
| hypophosphatemia | hạ phốt pho máu | 0 | 0 | - | - |
| hypophosphatemia | hạ phosphat máu | 0 | 0 | - | - |
| hypophosphatemia | giảm phosphat máu | 1 | 1 | S1 | PNT24 |
| hypokalemia | hạ kali máu | 1 | 1 | S1 | UMP24 |
| hypokalemia | giảm kali máu | 2 | 3 | S2 | BD16, PNT24 |
| hypomagnesemia | hạ magie máu | 0 | 0 | - | - |
| hypomagnesemia | hạ magnesi máu | 0 | 0 | - | - |
| hypomagnesemia | giảm magie máu | 0 | 0 | - | - |
| hypomagnesemia | hạ magiê máu | 0 | 0 | - | - |
| thiamine | thiamin | 2 | 6 | N1 S1 | TCN24-2381, PNT24 |
| thiamine | thiamine | 1 | 1 | S1 | UMP24 |
| thiamine | vitamin b1 | 3 | 12 | N1 S2 | UMP24, TCN22-969, PNT24 |
| protein energy wasting | suy mòn protein năng lượng | 0 | 0 | - | - |
| protein energy wasting | suy kiệt protein năng lượng | 0 | 0 | - | - |
| protein energy wasting | hao mòn protein năng lượng | 0 | 0 | - | - |
| protein energy wasting | pew | 0 | 0 | - | - |
| protein energy malnutrition | suy dinh dưỡng protein năng lượng | 0 | 0 | - | - |
| protein energy malnutrition | thiếu năng lượng protein | 0 | 0 | - | - |
| protein energy malnutrition | suy dinh dưỡng protein - năng lượng | 0 | 0 | - | - |
| protein energy malnutrition | suy dinh dưỡng năng lượng protein | 0 | 0 | - | - |
| nutritional edema | phù dinh dưỡng | 0 | 0 | - | - |
| kwashiorkor | kwashiorkor | 0 | 0 | - | - |
| kwashiorkor | thể phù | 0 | 0 | - | - |
| marasmus | marasmus | 0 | 0 | - | - |
| marasmus | thể teo đét | 0 | 0 | - | - |
| marasmus | teo đét | 0 | 0 | - | - |
| catabolism | dị hóa | 5 | 11 | M1 N2 S2 | BD16, CT24-2453, TCN22-969 |
| catabolism | tăng dị hóa | 3 | 4 | M1 N1 S1 | BD16, CT24-2453, TCN22-969 |
| catabolism | quá trình dị hóa | 0 | 0 | - | - |
| anabolism | đồng hóa | 2 | 3 | S2 | TN16, PNT24 |
| hypermetabolism | tăng chuyển hóa | 1 | 1 | N1 | TCN22-969 |
| energy requirement | nhu cầu năng lượng | 6 | 11 | H1 N2 S3 | BD16, CC18, HUE18 |
| energy requirement | nhu cầu calo | 0 | 0 | - | - |
| energy requirement | nhu cầu năng lượng khuyến nghị | 0 | 0 | - | - |
| energy expenditure | năng lượng tiêu hao | 2 | 2 | S2 | ND2-17, YHCT19 |
| energy expenditure | tiêu hao năng lượng | 2 | 4 | N1 S1 | Q175-25, TCN22-969 |
| energy expenditure | năng lượng tiêu hao lúc nghỉ | 0 | 0 | - | - |
| energy expenditure | tiêu hao năng lượng lúc nghỉ | 0 | 0 | - | - |
| energy expenditure | tiêu hao năng lượng khi nghỉ | 0 | 0 | - | - |
| basal metabolic rate | chuyển hóa cơ bản | 0 | 0 | - | - |
| basal metabolic rate | năng lượng chuyển hóa cơ bản | 0 | 0 | - | - |
| indirect calorimetry | đo năng lượng gián tiếp | 0 | 0 | - | - |
| indirect calorimetry | nhiệt lượng kế gián tiếp | 0 | 0 | - | - |
| indirect calorimetry | đo nhiệt lượng gián tiếp | 0 | 0 | - | - |
| indirect calorimetry | nhiệt lượng gián tiếp | 0 | 0 | - | - |
| energy intake | năng lượng ăn vào | 0 | 0 | - | - |
| energy intake | năng lượng khẩu phần | 0 | 0 | - | - |
| energy intake | lượng năng lượng | 1 | 1 | N1 | TCN26-4366 |
| protein intake | lượng protein | 4 | 12 | H1 M1 N1 S1 | UMP24, CT25-3185, HUE21 |
| protein intake | protein ăn vào | 0 | 0 | - | - |
| protein intake | lượng đạm | 2 | 7 | M1 S1 | CR17, CT24-2453 |
| protein intake | đạm ăn vào | 0 | 0 | - | - |
| carbohydrate | carbohydrate | 3 | 5 | N1 S2 | BD16, TCN22-969, PNT24 |
| carbohydrate | carbohydrat | 0 | 0 | - | - |
| carbohydrate | glucid | 4 | 11 | H1 N3 | HUE21, TCN22-969, TCN25-3335 |
| carbohydrate | bột đường | 2 | 2 | S2 | AG16, CC18 |
| carbohydrate | chất bột đường | 1 | 1 | S1 | CC18 |
| carbohydrate | glucide | 0 | 0 | - | - |
| macronutrient | đa lượng | 1 | 2 | N1 | Y108-18 |
| macronutrient | chất dinh dưỡng đa lượng | 0 | 0 | - | - |
| macronutrient | chất sinh năng lượng | 1 | 2 | N1 | TCN22-969 |
| macronutrient | các chất sinh năng lượng | 1 | 2 | N1 | TCN22-969 |
| micronutrient | vi chất | 5 | 39 | M1 N3 S1 | NHI19, CT23-503, TCN22-969 |
| micronutrient | vi chất dinh dưỡng | 4 | 8 | M1 N3 | CT23-503, TCN22-969, TCN25-3335 |
| micronutrient | vi lượng | 1 | 6 | N1 | Y108-18 |
| micronutrient | chất dinh dưỡng vi lượng | 0 | 0 | - | - |
| trace element | nguyên tố vi lượng | 0 | 0 | - | - |
| trace element | yếu tố vi lượng | 1 | 5 | N1 | Y108-18 |
| trace element | nguyên tố vết | 0 | 0 | - | - |
| trace element | chất khoáng vi lượng | 0 | 0 | - | - |
| micronutrient deficiency | thiếu vi chất | 2 | 24 | M1 N1 | CT23-503, TCN25-3335 |
| micronutrient deficiency | thiếu vi chất dinh dưỡng | 0 | 0 | - | - |
| fiber | chất xơ | 2 | 3 | N1 S1 | UMP24, TCN22-969 |
| iron deficiency anemia | thiếu máu thiếu sắt | 1 | 1 | M1 | CT23-503 |
| iron deficiency anemia | thiếu sắt | 2 | 10 | M1 S1 | NHI19, CT23-503 |
| zinc deficiency | thiếu kẽm | 2 | 7 | M1 S1 | NHI19, CT23-503 |
| zinc deficiency | kẽm huyết thanh | 2 | 5 | M1 S1 | NHI19, CT23-503 |
| vitamin d deficiency | thiếu vitamin d | 2 | 2 | M1 N1 | CT23-503, TCN22-969 |
| vitamin d deficiency | thiếu hụt vitamin d | 0 | 0 | - | - |
| vitamin a | thiếu vitamin a | 0 | 0 | - | - |
| vitamin a | vitamin a | 5 | 6 | M1 N1 S3 | ND115-25, AG16, NHI19 |
| medical nutrition therapy | liệu pháp dinh dưỡng | 0 | 0 | - | - |
| medical nutrition therapy | điều trị dinh dưỡng | 2 | 8 | S2 | CR17, BD16 |
| medical nutrition therapy | liệu pháp dinh dưỡng y khoa | 0 | 0 | - | - |
| medical nutrition therapy | dinh dưỡng điều trị | 1 | 1 | S1 | CR17 |
| nutrition support | hỗ trợ dinh dưỡng | 7 | 17 | H1 M1 S5 | CR17, Q175-25, ND115-25 |
| nutrition support | nâng đỡ dinh dưỡng | 0 | 0 | - | - |
| nutrition support | dinh dưỡng hỗ trợ | 0 | 0 | - | - |
| nutrition intervention | can thiệp dinh dưỡng | 10 | 41 | H1 M1 N3 S5 | CR17, NDGD16, Q175-25 |
| nutrition care | chăm sóc dinh dưỡng | 7 | 9 | M2 N2 S3 | CR21, ND115-25, CT24-2453 |
| nutrition care | quy trình chăm sóc dinh dưỡng | 0 | 0 | - | - |
| nutrition care | kế hoạch chăm sóc dinh dưỡng | 0 | 0 | - | - |
| nutrition counseling | tư vấn dinh dưỡng | 3 | 3 | M1 S2 | YHTP26-69, AG16, CT25-3185 |
| nutrition counseling | giáo dục dinh dưỡng | 1 | 1 | S1 | YHTP26-69 |
| ONS | bổ sung dinh dưỡng đường uống | 1 | 2 | M1 | CT25-3185 |
| ONS | dinh dưỡng đường uống | 1 | 2 | M1 | CT25-3185 |
| ONS | sản phẩm dinh dưỡng đường uống | 0 | 0 | - | - |
| ONS | uống bổ sung | 0 | 0 | - | - |
| ONS | thực phẩm bổ sung đường uống | 0 | 0 | - | - |
| ONS | sữa bổ sung | 0 | 0 | - | - |
| ONS | ons | 0 | 0 | - | - |
| ONS | bổ sung đường uống | 0 | 0 | - | - |
| enteral nutrition | dinh dưỡng qua đường tiêu hóa | 0 | 0 | - | - |
| enteral nutrition | dinh dưỡng đường tiêu hóa | 0 | 0 | - | - |
| enteral nutrition | nuôi dưỡng đường tiêu hóa | 1 | 6 | N1 | TCN25-3335 |
| enteral nutrition | nuôi ăn đường tiêu hóa | 1 | 1 | N1 | TCN25-3335 |
| enteral nutrition | dinh dưỡng đường ruột | 0 | 0 | - | - |
| enteral nutrition | dinh dưỡng qua đường ruột | 2 | 4 | N1 S1 | CR17, TCN22-969 |
| enteral nutrition | nuôi ăn đường ruột | 0 | 0 | - | - |
| enteral nutrition | nuôi ăn qua đường ruột | 2 | 2 | N1 S1 | CR17, TCN25-3335 |
| enteral nutrition | nuôi dưỡng qua đường tiêu hóa | 0 | 0 | - | - |
| enteral nutrition | nuôi ăn qua đường tiêu hóa | 0 | 0 | - | - |
| parenteral nutrition | dinh dưỡng tĩnh mạch | 2 | 5 | S2 | CR17, ND2-17 |
| parenteral nutrition | nuôi ăn tĩnh mạch | 1 | 1 | N1 | TCN25-3335 |
| parenteral nutrition | nuôi dưỡng tĩnh mạch | 4 | 27 | N4 | TCN22-969, TCN24-2381, TCN25-3335 |
| parenteral nutrition | dinh dưỡng đường tĩnh mạch | 1 | 1 | S1 | BD16 |
| parenteral nutrition | nuôi ăn đường tĩnh mạch | 1 | 1 | S1 | ND2-17 |
| parenteral nutrition | nuôi dưỡng đường tĩnh mạch | 1 | 1 | N1 | Y108-18 |
| parenteral nutrition | dinh dưỡng qua đường tĩnh mạch | 1 | 1 | S1 | CR21 |
| parenteral nutrition | nuôi tĩnh mạch | 2 | 3 | S2 | ND2-A1, ND2-A2 |
| total parenteral nutrition | dinh dưỡng tĩnh mạch toàn phần | 0 | 0 | - | - |
| total parenteral nutrition | nuôi ăn tĩnh mạch toàn phần | 0 | 0 | - | - |
| total parenteral nutrition | nuôi dưỡng tĩnh mạch toàn phần | 1 | 2 | N1 | TCN25-3335 |
| total parenteral nutrition | nuôi tĩnh mạch toàn phần | 0 | 0 | - | - |
| total parenteral nutrition | tpn | 2 | 45 | N2 | TCN25-3335, Y108-18 |
| partial parenteral nutrition | dinh dưỡng tĩnh mạch một phần | 0 | 0 | - | - |
| partial parenteral nutrition | dinh dưỡng tĩnh mạch bổ sung | 0 | 0 | - | - |
| partial parenteral nutrition | nuôi ăn tĩnh mạch một phần | 0 | 0 | - | - |
| partial parenteral nutrition | nuôi dưỡng tĩnh mạch một phần | 0 | 0 | - | - |
| partial parenteral nutrition | nuôi tĩnh mạch một phần | 0 | 0 | - | - |
| partial parenteral nutrition | dinh dưỡng tĩnh mạch hỗ trợ | 0 | 0 | - | - |
| central venous catheter | catheter tĩnh mạch trung tâm | 0 | 0 | - | - |
| central venous catheter | catheter tĩnh mạch trung ương | 0 | 0 | - | - |
| central venous catheter | tĩnh mạch trung tâm | 1 | 1 | N1 | Y108-18 |
| central venous catheter | cvc | 0 | 0 | - | - |
| three chamber bag | túi 3 ngăn | 0 | 0 | - | - |
| three chamber bag | túi ba ngăn | 0 | 0 | - | - |
| three chamber bag | túi 2 ngăn | 0 | 0 | - | - |
| three chamber bag | all-in-one | 0 | 0 | - | - |
| lipid emulsion | nhũ dịch lipid | 0 | 0 | - | - |
| lipid emulsion | nhũ tương lipid | 0 | 0 | - | - |
| lipid emulsion | nhũ dịch béo | 1 | 2 | N1 | Y108-18 |
| lipid emulsion | lipid tĩnh mạch | 0 | 0 | - | - |
| amino acid | acid amin | 2 | 2 | N1 S1 | UMP24, TCN22-969 |
| amino acid | axit amin | 2 | 5 | S2 | NDTP25, UMP24 |
| amino acid | amino acid | 1 | 3 | S1 | BD16 |
| osmolarity | áp lực thẩm thấu | 2 | 2 | S2 | ND115-25, BD16 |
| osmolarity | độ thẩm thấu | 0 | 0 | - | - |
| osmolarity | nồng độ thẩm thấu | 0 | 0 | - | - |
| CRBSI | nhiễm khuẩn huyết liên quan | 0 | 0 | - | - |
| CRBSI | nhiễm trùng huyết liên quan | 0 | 0 | - | - |
| CRBSI | nhiễm khuẩn liên quan đến catheter | 0 | 0 | - | - |
| CRBSI | nhiễm trùng liên quan đến catheter | 0 | 0 | - | - |
| CRBSI | nhiễm trùng catheter | 0 | 0 | - | - |
| CRBSI | nhiễm khuẩn catheter | 0 | 0 | - | - |
| CRBSI | nhiễm trùng máu liên quan | 0 | 0 | - | - |
| phlebitis | viêm tĩnh mạch | 0 | 0 | - | - |
| tube feeding | nuôi ăn qua ống thông | 1 | 1 | S1 | BD16 |
| tube feeding | nuôi dưỡng qua ống thông | 2 | 9 | N1 S1 | CR21, TCN22-969 |
| tube feeding | dinh dưỡng qua ống thông | 1 | 4 | S1 | CR21 |
| tube feeding | nuôi ăn qua sonde | 1 | 1 | S1 | ND2-17 |
| tube feeding | nuôi dưỡng qua sonde | 1 | 10 | N1 | TCN22-969 |
| tube feeding | ăn qua ống thông | 4 | 5 | N1 S3 | CR17, CR21, BD16 |
| tube feeding | ăn qua sonde | 4 | 12 | N2 S2 | CR17, ND2-17, TCN22-969 |
| tube feeding | bơm ăn | 0 | 0 | - | - |
| nasogastric tube | ống thông mũi dạ dày | 1 | 4 | S1 | CR21 |
| nasogastric tube | ống thông dạ dày | 4 | 8 | N1 S3 | CR17, ND115-25, BD16 |
| nasogastric tube | sonde dạ dày | 2 | 12 | S2 | ND2-17, CR21 |
| nasogastric tube | ống sonde dạ dày | 1 | 5 | S1 | CR21 |
| nasogastric tube | sonde mũi dạ dày | 0 | 0 | - | - |
| nasogastric tube | ống thông mũi - dạ dày | 1 | 4 | S1 | CR21 |
| nasojejunal | ống thông mũi hỗng tràng | 0 | 0 | - | - |
| nasojejunal | sonde mũi hỗng tràng | 0 | 0 | - | - |
| nasojejunal | mũi hỗng tràng | 0 | 0 | - | - |
| gastrostomy | mở dạ dày ra da | 0 | 0 | - | - |
| gastrostomy | mở thông dạ dày | 1 | 3 | N1 | TCN24-2381 |
| gastrostomy | mở dạ dày | 0 | 0 | - | - |
| gastrostomy | dẫn lưu dạ dày | 0 | 0 | - | - |
| jejunostomy | mở hỗng tràng ra da | 0 | 0 | - | - |
| jejunostomy | mở thông hỗng tràng | 0 | 0 | - | - |
| jejunostomy | mở hỗng tràng | 1 | 2 | S1 | ND115-25 |
| jejunostomy | mở hổng tràng | 0 | 0 | - | - |
| peg | peg | 0 | 0 | - | - |
| peg | qua nội soi | 1 | 6 | S1 | PNT19x |
| bolus | bolus | 3 | 17 | N1 S2 | PNT19x, BD16, TCN22-969 |
| bolus | bơm ngắt quãng | 0 | 0 | - | - |
| bolus | bơm từng bữa | 0 | 0 | - | - |
| bolus | bơm bolus | 1 | 12 | N1 | TCN22-969 |
| bolus | ngắt quãng | 1 | 4 | N1 | TCN22-969 |
| enteral formula | công thức dinh dưỡng | 0 | 0 | - | - |
| enteral formula | sữa công thức | 5 | 12 | N1 S4 | ND2-17, MK18, CC18 |
| enteral formula | chế phẩm dinh dưỡng | 1 | 1 | N1 | TCN22-969 |
| enteral formula | dung dịch nuôi ăn | 0 | 0 | - | - |
| enteral formula | sản phẩm dinh dưỡng | 3 | 6 | N1 S2 | ND115-25, MK18, TCN22-969 |
| polymeric | công thức polymer | 0 | 0 | - | - |
| polymeric | polymeric | 0 | 0 | - | - |
| polymeric | nguyên phân tử | 0 | 0 | - | - |
| polymeric | đa phân tử | 0 | 0 | - | - |
| polymeric | cao phân tử | 0 | 0 | - | - |
| peptide based | bán nguyên tố | 0 | 0 | - | - |
| peptide based | peptide | 1 | 1 | S1 | NDTP25 |
| peptide based | thủy phân một phần | 0 | 0 | - | - |
| peptide based | semi-elemental | 0 | 0 | - | - |
| peptide based | chuỗi peptide | 0 | 0 | - | - |
| extensively hydrolysed | thủy phân toàn phần | 1 | 6 | S1 | NDTP25 |
| extensively hydrolysed | thủy phân hoàn toàn | 1 | 2 | N1 | TCN25-3335 |
| extensively hydrolysed | thủy phân protein toàn phần | 1 | 11 | S1 | NDTP25 |
| extensively hydrolysed | thủy phân cao | 0 | 0 | - | - |
| extensively hydrolysed | thủy phân mức độ cao | 0 | 0 | - | - |
| extensively hydrolysed | thủy phân protein | 1 | 11 | S1 | NDTP25 |
| feeding intolerance | không dung nạp | 0 | 0 | - | - |
| feeding intolerance | kém dung nạp | 2 | 15 | N1 S1 | CR21, TCN22-969 |
| feeding intolerance | rối loạn dung nạp | 0 | 0 | - | - |
| feeding intolerance | dung nạp | 10 | 31 | N4 S6 | CR21, NDTP25, ND115-25 |
| gastric residual volume | dịch tồn lưu | 0 | 0 | - | - |
| gastric residual volume | dịch tồn dư | 1 | 7 | N1 | TCN22-969 |
| gastric residual volume | tồn lưu dạ dày | 0 | 0 | - | - |
| gastric residual volume | tồn dư dạ dày | 1 | 2 | N1 | TCN22-969 |
| gastric residual volume | dịch dạ dày tồn lưu | 0 | 0 | - | - |
| gastric residual volume | thể tích dịch tồn lưu | 0 | 0 | - | - |
| gastric residual volume | thể tích tồn lưu | 0 | 0 | - | - |
| gastric residual volume | dịch còn lại trong dạ dày | 0 | 0 | - | - |
| gastric residual volume | dịch tồn đọng | 0 | 0 | - | - |
| gastric residual volume | ứ đọng dạ dày | 0 | 0 | - | - |
| abdominal distension | chướng bụng | 4 | 8 | N1 S3 | CR17, CR21, ND115-25 |
| early enteral | nuôi ăn sớm | 2 | 3 | N1 S1 | ND115-25, TCN25-3335 |
| early enteral | nuôi dưỡng sớm | 2 | 15 | N1 S1 | ND115-25, TCN25-3335 |
| early enteral | dinh dưỡng sớm | 6 | 8 | H1 N2 S3 | CR21, Q175-25, BD16 |
| early enteral | cho ăn sớm | 2 | 8 | S2 | CR17, ND115-25 |
| early enteral | nuôi ăn đường ruột sớm | 0 | 0 | - | - |
| early enteral | ăn sớm | 3 | 11 | N1 S2 | CR17, ND115-25, TCN25-3335 |
| trophic feeding | nuôi ăn tối thiểu | 1 | 1 | N1 | TCN25-3335 |
| trophic feeding | dinh dưỡng tối thiểu | 0 | 0 | - | - |
| trophic feeding | nuôi dưỡng tối thiểu | 0 | 0 | - | - |
| trophic feeding | trophic | 0 | 0 | - | - |
| underfeeding | nuôi ăn thiếu | 0 | 0 | - | - |
| underfeeding | nuôi dưỡng thiếu | 0 | 0 | - | - |
| underfeeding | cung cấp thiếu | 0 | 0 | - | - |
| underfeeding | thiếu năng lượng | 2 | 8 | H1 N1 | HUE21, TCN26-4366 |
| overfeeding | nuôi ăn quá mức | 0 | 0 | - | - |
| overfeeding | nuôi dưỡng quá mức | 0 | 0 | - | - |
| overfeeding | nuôi ăn dư | 0 | 0 | - | - |
| overfeeding | thừa năng lượng | 0 | 0 | - | - |
| overfeeding | cung cấp quá mức | 0 | 0 | - | - |
| energy target | mục tiêu năng lượng | 0 | 0 | - | - |
| energy target | đạt nhu cầu năng lượng | 1 | 1 | N1 | TCN22-969 |
| energy target | đạt mục tiêu năng lượng | 0 | 0 | - | - |
| BCAA | acid amin chuỗi nhánh | 0 | 0 | - | - |
| BCAA | axit amin chuỗi nhánh | 1 | 3 | S1 | UMP24 |
| BCAA | acid amin chuỗi phân nhánh | 0 | 0 | - | - |
| BCAA | amino acid chuỗi phân nhánh | 1 | 1 | S1 | BD16 |
| BCAA | bcaa | 2 | 4 | S2 | BD16, UMP24 |
| late evening snack | bữa phụ tối muộn | 0 | 0 | - | - |
| late evening snack | bữa ăn khuya | 0 | 0 | - | - |
| late evening snack | bữa phụ buổi tối | 1 | 1 | S1 | CC18 |
| late evening snack | bữa ăn nhẹ buổi tối | 0 | 0 | - | - |
| late evening snack | bữa phụ trước khi ngủ | 0 | 0 | - | - |
| fasting | nhịn ăn | 6 | 8 | N3 S3 | ND115-25, UMP25, TCN24-2381 |
| fasting | nhịn đói | 2 | 2 | S2 | TN16, PNT24 |
| fasting | nhịn ăn uống | 0 | 0 | - | - |
| fasting | nhịn ăn trước mổ | 0 | 0 | - | - |
| fasting | nhịn ăn trước phẫu thuật | 0 | 0 | - | - |
| carbohydrate loading | nạp carbohydrate | 0 | 0 | - | - |
| carbohydrate loading | carbohydrate trước mổ | 0 | 0 | - | - |
| carbohydrate loading | nước đường trước mổ | 0 | 0 | - | - |
| carbohydrate loading | uống carbohydrate | 0 | 0 | - | - |
| carbohydrate loading | bổ sung carbohydrate | 0 | 0 | - | - |
| ERAS | hồi phục sớm sau phẫu thuật | 1 | 2 | S1 | ND115-25 |
| ERAS | hồi phục sớm sau mổ | 1 | 7 | S1 | ND115-25 |
| ERAS | tăng cường hồi phục sau phẫu thuật | 0 | 0 | - | - |
| ERAS | phục hồi sớm sau phẫu thuật | 0 | 0 | - | - |
| ERAS | eras | 3 | 34 | N2 S1 | ND115-25, TCN26-4366, TCN25-3335 |
| prehabilitation | tiền phục hồi | 0 | 0 | - | - |
| prehabilitation | phục hồi chức năng trước mổ | 0 | 0 | - | - |
| prehabilitation | tiền phục hồi chức năng | 0 | 0 | - | - |
| immunonutrition | dinh dưỡng miễn dịch | 1 | 2 | S1 | ND115-25 |
| immunonutrition | miễn dịch dinh dưỡng | 0 | 0 | - | - |
| hepatic encephalopathy | bệnh não gan | 1 | 17 | S1 | UMP24 |
| hepatic encephalopathy | hôn mê gan | 0 | 0 | - | - |
| protein restriction | hạn chế protein | 1 | 1 | S1 | UMP24 |
| protein restriction | hạn chế đạm | 1 | 1 | S1 | NDTP25 |
| protein restriction | giảm đạm | 0 | 0 | - | - |
| protein restriction | ăn giảm đạm | 0 | 0 | - | - |
| protein restriction | chế độ ăn giảm đạm | 0 | 0 | - | - |
| protein restriction | chế độ ăn ít đạm | 0 | 0 | - | - |
| protein restriction | ăn ít đạm | 0 | 0 | - | - |
| protein restriction | ăn hạn chế đạm | 0 | 0 | - | - |
| hemodialysis | lọc máu | 5 | 68 | M2 S3 | NDGD16, BD16, CRNT16 |
| hemodialysis | thận nhân tạo | 2 | 4 | M1 S1 | YHCT19, CT25-3185 |
| hemodialysis | chạy thận nhân tạo | 2 | 3 | M1 S1 | YHCT19, CT25-3185 |
| hemodialysis | lọc máu định kỳ | 1 | 12 | S1 | NDGD16 |
| hemodialysis | lọc máu chu kỳ | 3 | 19 | M2 S1 | NDGD16, CT24-2453, CT25-3185 |
| hemodialysis | thận nhân tạo chu kỳ | 1 | 2 | M1 | CT25-3185 |
| hemodialysis | chạy thận | 3 | 6 | M1 S2 | BD16, YHCT19, CT25-3185 |
| hemodialysis | lọc thận | 1 | 4 | M1 | CT25-3185 |
| ckd | bệnh thận mạn | 7 | 46 | M2 N1 S4 | NDGD16, TN16, CRNT16 |
| ckd | suy thận mạn | 3 | 20 | M2 S1 | NDGD16, CT24-2453, CT25-3185 |
| ckd | bệnh thận mạn tính | 2 | 2 | M1 S1 | UMP24, CT25-3185 |
| diabetes | đái tháo đường | 13 | 60 | H1 M3 N1 S8 | CR21, TN16, Q175-25 |
| diabetes | tiểu đường | 2 | 2 | H1 M1 | CT25-3185, HUE18 |
| type 2 | đái tháo đường típ 2 | 0 | 0 | - | - |
| type 2 | đái tháo đường type 2 | 1 | 1 | S1 | UMP25 |
| type 2 | đái tháo đường týp 2 | 0 | 0 | - | - |
| type 2 | đái tháo đường tuýp 2 | 0 | 0 | - | - |
| type 2 | đtđ típ 2 | 0 | 0 | - | - |
| type 2 | đtđ type 2 | 0 | 0 | - | - |
| glycemic index | chỉ số đường huyết | 0 | 0 | - | - |
| glycemic index | chỉ số glucose huyết | 0 | 0 | - | - |
| glycemic index | chỉ số glycemic | 0 | 0 | - | - |
| glycemic index | chỉ số tăng đường huyết | 0 | 0 | - | - |
| glycemic control | kiểm soát đường huyết | 0 | 0 | - | - |
| glycemic control | kiểm soát glucose máu | 0 | 0 | - | - |
| glycemic control | kiểm soát glucose huyết | 0 | 0 | - | - |
| hyperglycemia | tăng đường huyết | 2 | 2 | N1 S1 | BD16, TCN22-969 |
| hyperglycemia | tăng glucose máu | 2 | 3 | S2 | BD16, UMP25 |
| hyperglycemia | tăng glucose huyết | 0 | 0 | - | - |
| hypoglycemia | hạ đường huyết | 2 | 3 | S2 | BD16, YHCT19 |
| hypoglycemia | hạ glucose máu | 0 | 0 | - | - |
| gestational diabetes | đái tháo đường thai kỳ | 0 | 0 | - | - |
| obesity | béo phì | 15 | 105 | H2 M2 N2 S9 | YHTP26-69, TN16, BD16 |
| overweight | thừa cân | 12 | 87 | H2 M2 N2 S6 | YHTP26-69, TN16, Q175-25 |
| overweight | thừa cân - béo phì | 8 | 25 | M1 N2 S5 | YHTP26-69, TN16, AG16 |
| overweight | thừa cân, béo phì | 3 | 12 | M1 S2 | YHCT19, CC18, CT25-3185 |
| central obesity | béo phì trung tâm | 1 | 4 | S1 | UMP25 |
| central obesity | béo bụng | 2 | 3 | S2 | TN16, UMP25 |
| central obesity | béo phì dạng nam | 0 | 0 | - | - |
| central obesity | béo phì vùng bụng | 0 | 0 | - | - |
| metabolic syndrome | hội chứng chuyển hóa | 2 | 14 | S2 | UMP25, UMP24 |
| insulin resistance | đề kháng insulin | 1 | 5 | S1 | UMP25 |
| insulin resistance | kháng insulin | 1 | 5 | S1 | UMP25 |
| dyslipidemia | rối loạn lipid máu | 3 | 4 | S3 | YHCT19, UMP25, UMP24 |
| dyslipidemia | rối loạn mỡ máu | 0 | 0 | - | - |
| dyslipidemia | rối loạn chuyển hóa lipid | 1 | 1 | S1 | CC18 |
| fatty liver | gan nhiễm mỡ | 2 | 2 | S2 | BD16, UMP24 |
| fatty liver | bệnh gan nhiễm mỡ | 0 | 0 | - | - |
| fatty liver | bệnh gan nhiễm mỡ không do rượu | 0 | 0 | - | - |
| fatty liver | nafld | 0 | 0 | - | - |
| fatty liver | masld | 0 | 0 | - | - |
| bariatric | phẫu thuật giảm béo | 0 | 0 | - | - |
| bariatric | phẫu thuật điều trị béo phì | 0 | 0 | - | - |
| bariatric | phẫu thuật bariatric | 0 | 0 | - | - |
| bariatric | phẫu thuật giảm cân | 0 | 0 | - | - |
| bariatric | phẫu thuật chuyển hóa | 0 | 0 | - | - |
| short bowel | hội chứng ruột ngắn | 1 | 1 | N1 | TCN25-3335 |
| short bowel | ruột ngắn | 1 | 5 | N1 | TCN25-3335 |
| intestinal failure | suy ruột | 0 | 0 | - | - |
| intestinal failure | suy chức năng ruột | 0 | 0 | - | - |
| intestinal failure | suy đường ruột | 0 | 0 | - | - |
| dysphagia | nuốt khó | 1 | 1 | S1 | CR21 |
| dysphagia | khó nuốt | 1 | 1 | S1 | Q175-25 |
| dysphagia | rối loạn nuốt | 1 | 1 | S1 | CR17 |
| dysphagia | nuốt nghẹn | 1 | 13 | N1 | TCN24-2381 |
| dysphagia | nuốt vướng | 1 | 1 | S1 | CR21 |
| texture modified | thay đổi kết cấu | 0 | 0 | - | - |
| texture modified | điều chỉnh kết cấu | 0 | 0 | - | - |
| texture modified | biến đổi kết cấu | 0 | 0 | - | - |
| texture modified | kết cấu | 0 | 0 | - | - |
| thickened | làm đặc | 0 | 0 | - | - |
| thickened | chất lỏng làm đặc | 0 | 0 | - | - |
| thickened | đồ uống làm đặc | 0 | 0 | - | - |
| pureed | xay nhuyễn | 0 | 0 | - | - |
| pureed | nghiền nhuyễn | 0 | 0 | - | - |
| pureed | nhuyễn | 0 | 0 | - | - |
| pureed | xay | 1 | 2 | S1 | ND115-25 |
| soft diet | chế độ ăn mềm | 0 | 0 | - | - |
| soft diet | ăn mềm | 2 | 2 | H1 N1 | HUE21, TCN26-4366 |
| soft diet | cháo | 3 | 4 | H1 N1 S1 | ND115-25, HUE21, TCN26-4366 |
| soft diet | thức ăn mềm | 2 | 2 | H1 N1 | HUE21, TCN26-4366 |
| liquid diet | chế độ ăn lỏng | 0 | 0 | - | - |
| liquid diet | ăn lỏng | 0 | 0 | - | - |
| liquid diet | thức ăn lỏng | 0 | 0 | - | - |
| liquid diet | lỏng trong | 0 | 0 | - | - |
| low salt | ăn nhạt | 0 | 0 | - | - |
| low salt | giảm muối | 0 | 0 | - | - |
| low salt | hạn chế muối | 0 | 0 | - | - |
| low salt | ăn mặn | 0 | 0 | - | - |
| low salt | natri | 4 | 6 | M1 N1 S2 | BD16, CT25-3185, TCN25-3335 |
| dietitian | chuyên gia dinh dưỡng | 4 | 7 | S4 | CR21, YHTP26-69, CRNT16 |
| dietitian | bác sĩ dinh dưỡng | 1 | 1 | N1 | TCN25-3335 |
| dietitian | cử nhân dinh dưỡng | 0 | 0 | - | - |
| dietitian | chuyên viên dinh dưỡng | 0 | 0 | - | - |
| dietitian | nhân viên dinh dưỡng | 0 | 0 | - | - |
| dietitian | điều dưỡng dinh dưỡng | 0 | 0 | - | - |
| clinical nutrition | dinh dưỡng lâm sàng | 2 | 3 | H1 S1 | CR17, HUE18 |
| clinical nutrition | khoa dinh dưỡng | 3 | 3 | H1 S2 | CR17, CRNT16, HUE18 |
| clinical nutrition | dinh dưỡng - tiết chế | 0 | 0 | - | - |
| clinical nutrition | dinh dưỡng tiết chế | 0 | 0 | - | - |
| clinical nutrition | tiết chế | 2 | 7 | H1 M1 | CT25-3185, HUE18 |
| nutrition support team | nhóm hỗ trợ dinh dưỡng | 0 | 0 | - | - |
| nutrition support team | tổ dinh dưỡng | 0 | 0 | - | - |
| nutrition support team | nhóm dinh dưỡng | 1 | 1 | S1 | CR17 |
| nutrition support team | ê kíp dinh dưỡng | 0 | 0 | - | - |
| stunting | thấp còi | 4 | 30 | M2 S2 | ND2-17, YHTP26-69, CT23-503 |
| stunting | suy dinh dưỡng thể thấp còi | 3 | 7 | M1 S2 | ND2-17, YHTP26-69, CT23-503 |
| stunting | suy dinh dưỡng thấp còi | 3 | 5 | M1 S2 | ND2-17, YHTP26-69, CT23-503 |
| stunting | còi cọc | 0 | 0 | - | - |
| wasting | gầy còm | 2 | 10 | M1 S1 | YHTP26-69, CT23-1279 |
| wasting | suy dinh dưỡng thể gầy còm | 1 | 1 | S1 | YHTP26-69 |
| wasting | suy dinh dưỡng gầy còm | 1 | 1 | S1 | YHTP26-69 |
| wasting | gầy mòn | 1 | 1 | S1 | NDGD16 |
| wasting | còm | 2 | 10 | M1 S1 | YHTP26-69, CT23-1279 |
| underweight | nhẹ cân | 4 | 27 | M2 S2 | ND2-17, YHTP26-69, CT23-503 |
| underweight | suy dinh dưỡng thể nhẹ cân | 2 | 6 | M1 S1 | ND2-17, CT23-503 |
| underweight | suy dinh dưỡng nhẹ cân | 2 | 4 | M1 S1 | ND2-17, CT23-503 |
| underweight | thiếu cân | 1 | 3 | S1 | ND115-25 |
| SAM | suy dinh dưỡng cấp tính nặng | 0 | 0 | - | - |
| SAM | suy dinh dưỡng cấp nặng | 1 | 1 | M1 | CT23-1279 |
| SAM | suy dinh dưỡng nặng | 6 | 10 | M1 S5 | CR17, NDGD16, YHTP26-69 |
| SAM | suy dinh dưỡng cấp tính | 1 | 1 | M1 | CT23-1279 |
| SAM | suy dinh dưỡng cấp | 1 | 20 | M1 | CT23-1279 |
| SAM | sam | 0 | 0 | - | - |
| MAM | suy dinh dưỡng cấp tính vừa | 0 | 0 | - | - |
| MAM | suy dinh dưỡng cấp vừa | 1 | 2 | M1 | CT23-1279 |
| MAM | suy dinh dưỡng cấp tính trung bình | 0 | 0 | - | - |
| MAM | suy dinh dưỡng vừa | 2 | 4 | S2 | YHTP26-69, ND115-25 |
| MAM | suy dinh dưỡng trung bình | 1 | 1 | M1 | CT24-2453 |
| MAM | mam | 0 | 0 | - | - |
| RUTF | rutf | 0 | 0 | - | - |
| RUTF | thực phẩm điều trị ăn liền | 0 | 0 | - | - |
| RUTF | thực phẩm điều trị | 0 | 0 | - | - |
| RUTF | f-75 | 0 | 0 | - | - |
| RUTF | f-100 | 0 | 0 | - | - |
| WAZ | cân nặng theo tuổi | 2 | 9 | S2 | YHTP26-69, NDTP25 |
| WAZ | cân nặng/tuổi | 0 | 0 | - | - |
| WAZ | waz | 1 | 16 | S1 | YHTP26-69 |
| HAZ | chiều cao theo tuổi | 1 | 3 | S1 | YHTP26-69 |
| HAZ | chiều cao/tuổi | 0 | 0 | - | - |
| HAZ | chiều dài theo tuổi | 1 | 5 | S1 | NDTP25 |
| HAZ | haz | 1 | 13 | S1 | YHTP26-69 |
| HAZ | laz | 0 | 0 | - | - |
| WHZ | cân nặng theo chiều cao | 2 | 3 | M1 S1 | YHTP26-69, CT23-1279 |
| WHZ | cân nặng/chiều cao | 2 | 3 | S2 | YHTP26-69, ND115-25 |
| WHZ | cân nặng theo chiều dài | 1 | 4 | S1 | NDTP25 |
| WHZ | whz | 1 | 9 | S1 | YHTP26-69 |
| WHZ | wlz | 0 | 0 | - | - |
| BAZ | bmi theo tuổi | 1 | 2 | S1 | CC18 |
| BAZ | bmi/tuổi | 0 | 0 | - | - |
| BAZ | baz | 0 | 0 | - | - |
| z-score | z-score | 4 | 27 | S4 | ND2-17, YHTP26-69, NDTP25 |
| z-score | điểm z | 1 | 1 | S1 | YHTP26-69 |
| z-score | chỉ số z | 2 | 3 | S2 | YHTP26-69, NDTP25 |
| z-score | z score | 4 | 27 | S4 | ND2-17, YHTP26-69, NDTP25 |
| z-score | độ lệch chuẩn | 9 | 15 | M1 S8 | CR17, CR21, YHTP26-69 |
| growth chart | biểu đồ tăng trưởng | 1 | 1 | N1 | Y108-18 |
| growth chart | chuẩn tăng trưởng | 1 | 1 | S1 | YHTP26-69 |
| growth chart | biểu đồ phát triển | 0 | 0 | - | - |
| growth chart | đường cong tăng trưởng | 0 | 0 | - | - |
| growth faltering | chậm tăng trưởng | 0 | 0 | - | - |
| growth faltering | chậm tăng cân | 0 | 0 | - | - |
| growth faltering | chậm phát triển thể chất | 0 | 0 | - | - |
| growth faltering | không tăng cân | 2 | 2 | N2 | TCN25-3335, Y108-18 |
| growth faltering | đứng cân | 0 | 0 | - | - |
| catch-up growth | tăng trưởng bắt kịp | 0 | 0 | - | - |
| catch-up growth | bắt kịp tăng trưởng | 0 | 0 | - | - |
| low birth weight | cân nặng lúc sinh thấp | 1 | 1 | S1 | YHTP26-69 |
| low birth weight | cân nặng sơ sinh thấp | 1 | 1 | S1 | YHTP26-69 |
| low birth weight | nhẹ cân lúc sinh | 0 | 0 | - | - |
| low birth weight | sơ sinh nhẹ cân | 0 | 0 | - | - |
| low birth weight | cân nặng khi sinh thấp | 0 | 0 | - | - |
| exclusive breastfeeding | bú mẹ hoàn toàn | 4 | 41 | M1 S3 | MK18, AG16, ND2-18 |
| exclusive breastfeeding | nuôi con bằng sữa mẹ hoàn toàn | 3 | 18 | S3 | MK18, AG16, ND2-18 |
| exclusive breastfeeding | nuôi con hoàn toàn bằng sữa mẹ | 0 | 0 | - | - |
| exclusive breastfeeding | bú sữa mẹ hoàn toàn | 2 | 5 | S2 | MK18, AG16 |
| breastfeeding | nuôi con bằng sữa mẹ | 4 | 33 | M1 S3 | MK18, AG16, ND2-18 |
| breastfeeding | bú mẹ | 5 | 95 | M1 S4 | MK18, AG16, CC18 |
| breastfeeding | cho con bú | 5 | 14 | M1 S4 | NDTP25, MK18, AG16 |
| breastfeeding | bú sữa mẹ | 5 | 25 | S5 | NDTP25, MK18, AG16 |
| breastfeeding | cho bú | 2 | 7 | S2 | ND2-17, MK18 |
| early initiation | bú mẹ sớm | 3 | 11 | S3 | MK18, AG16, CC18 |
| early initiation | bú sớm | 2 | 7 | S2 | MK18, AG16 |
| early initiation | cho bú sớm | 0 | 0 | - | - |
| early initiation | giờ đầu sau sinh | 2 | 7 | S2 | MK18, AG16 |
| complementary feeding | ăn bổ sung | 1 | 1 | S1 | AG16 |
| complementary feeding | ăn dặm | 4 | 59 | M1 S3 | NDTP25, MK18, AG16 |
| complementary feeding | thức ăn bổ sung | 0 | 0 | - | - |
| complementary feeding | cho ăn bổ sung | 0 | 0 | - | - |
| weaning | cai sữa | 1 | 2 | S1 | CC18 |
| infant formula | sữa công thức | 5 | 12 | N1 S4 | ND2-17, MK18, CC18 |
| infant formula | sữa bột | 1 | 29 | S1 | AG16 |
| infant formula | sữa ngoài | 2 | 2 | S2 | MK18, ND2-18 |
| IYCF | nuôi ăn nhũ nhi và trẻ nhỏ | 1 | 5 | S1 | AG16 |
| IYCF | nuôi dưỡng trẻ nhỏ | 0 | 0 | - | - |
| IYCF | nuôi dưỡng trẻ nhũ nhi | 0 | 0 | - | - |
| picky eating | biếng ăn | 3 | 6 | S3 | YHTP26-69, CC18, PNT24 |
| picky eating | kén ăn | 0 | 0 | - | - |
| picky eating | lười ăn | 0 | 0 | - | - |
| picky eating | khó khăn khi ăn | 0 | 0 | - | - |
| rickets | còi xương | 1 | 1 | M1 | CT23-503 |
| length of stay | thời gian nằm viện | 14 | 65 | H2 M1 N3 S8 | CR17, NDGD16, ND2-17 |
| length of stay | thời gian điều trị | 5 | 9 | M1 N1 S3 | CR17, ND2-17, ND115-25 |
| length of stay | thời gian nằm hồi sức | 1 | 1 | S1 | ND2-A2 |
| food frequency | tần suất tiêu thụ thực phẩm | 0 | 0 | - | - |
| food frequency | tần suất sử dụng thực phẩm | 0 | 0 | - | - |
| food frequency | tần suất ăn | 0 | 0 | - | - |
| dietary habit | thói quen ăn uống | 3 | 4 | H1 N1 S1 | CC18, HUE21, TCN26-4366 |
| dietary habit | tập quán ăn uống | 0 | 0 | - | - |
| dietary habit | hành vi ăn uống | 0 | 0 | - | - |
| physical activity | hoạt động thể lực | 2 | 8 | M1 S1 | YHCT19, CT25-3457 |
| physical activity | hoạt động thể chất | 1 | 1 | S1 | UMP24 |
| physical activity | vận động thể lực | 2 | 5 | M1 S1 | TN16, CT25-3457 |
| mediterranean | địa trung hải | 0 | 0 | - | - |
| saturated fat | chất béo bão hòa | 1 | 1 | H1 | HUE18 |
| saturated fat | acid béo bão hòa | 0 | 0 | - | - |
| saturated fat | axit béo bão hòa | 0 | 0 | - | - |
| added sugar | đường bổ sung | 0 | 0 | - | - |
| added sugar | đường thêm vào | 0 | 0 | - | - |
| added sugar | đồ ngọt | 0 | 0 | - | - |
| added sugar | nước ngọt | 0 | 0 | - | - |
| energy density | đậm độ năng lượng | 0 | 0 | - | - |
| energy density | mật độ năng lượng | 0 | 0 | - | - |
| perioperative | chu phẫu | 2 | 3 | S2 | CR17, ND115-25 |
| perioperative | quanh phẫu thuật | 1 | 2 | S1 | BD16 |
| perioperative | quanh mổ | 0 | 0 | - | - |
