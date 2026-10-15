# sources.md: obgyn (Sản phụ khoa), draft 0.1.0

Nguồn bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn và URL; không chép câu nào từ bài báo.

## Cách đếm

- Kho: `D:/vitranslate-corpus` (dùng chung). Run `pack-2026-10-15-obgyn` tải 39 request (xem MINING_REPORT mục 5); phần còn lại là tài liệu các run trước đã tải (Y học TP.HCM, BV Nguyễn Tri Phương, TCNCYH, YDLS108...), chỉ đọc lại, không request mới.
- Trích chữ PDF bằng PyMuPDF, HTML bằng BeautifulSoup (bỏ script/style). Chuẩn hóa NFC, chữ thường, gộp dấu kiểu cũ (hoá = hóa).
- Đếm theo **số tài liệu** có cụm từ (khớp nguyên từ), chia vùng:
  - **S** = phía Nam: Y học TP.HCM, BV Từ Dũ / Hùng Vương / An Giang (bài trên vnras.com), BV Mỹ Đức và HOSREM (Y học Sinh sản), ĐHQG TP.HCM, ĐH Y Dược Cần Thơ, BV Phương Châu, BV Bình Dân, BV Nguyễn Tri Phương.
  - **N** = phía Bắc: Tạp chí Phụ Sản tập 23 số 3 (các bài BV Phụ sản Trung ương, Bạch Mai, Phụ sản Hà Nội), TCNCYH, YDLS108.
  - **C** = miền Trung: Tạp chí Y Dược Huế.
  - **O** = văn bản quốc gia: QĐ 315/QĐ-BYT (29/01/2015) Hướng dẫn chẩn đoán và điều trị các bệnh sản phụ khoa (văn phong phía Bắc: "đẻ", "rau").
- Cột note của `glossary.csv`: `freq S.. N.. C.. O.. docs` = số tài liệu chứa đúng giá trị `vi`; `freq 'cụm' ...` = số đếm của cụm được ghi (khi giá trị là cụm ghép, ví dụ "dưới niêm mạc"); `alt:` = biến thể khác; `src:` = tối đa 3 mã, ưu tiên phía Nam; `built` = ghép từ thành tố, không có trong kho; `LOW` = bằng chứng mỏng.
- Cụm ngắn và chung (phôi, sơ sinh, sinh thường...) được đếm trên cả các bài không thuộc sản phụ khoa: số lớn không có nghĩa là bài sản khoa dùng nhiều.
- Không dùng MedEV, không dùng số đếm của ô tìm kiếm OJS.

## Các cặp Bắc / Nam (chính sách: dạng miền Nam trước)

| Khái niệm | Dạng chọn (Nam) | Số tài liệu S / N / C / O | Dạng còn lại | S / N / C / O |
|---|---|---|---|---|
| postpartum | sau sinh | 17 / 4 / 1 / 1 | sau đẻ | 1 / 2 / 0 / 1 |
| postpartum haemorrhage | băng huyết sau sinh | 7 / 0 / 1 / 1 | chảy máu sau đẻ | 0 / 1 / 0 / 1 |
| preterm birth | sinh non | 7 / 4 / 1 / 1 | đẻ non | 0 / 2 / 1 / 1 |
| vaginal delivery | sinh ngả âm đạo | 8 / 1 / 0 / 0 | đẻ đường âm đạo | 0 / 0 / 0 / 1 |
| caesarean section | mổ lấy thai | 11 / 4 / 2 / 1 | mổ đẻ | 0 / 4 / 0 / 1 |
| delivery room | phòng sinh | 2 / 0 / 1 / 1 | phòng đẻ | 0 / 1 / 0 / 1 |
| placenta | bánh nhau (+ nhau thai 4 / 1 / 0 / 0) | 2 / 0 / 1 / 0 | bánh rau (+ rau thai 0 / 2 / 0 / 1) | 0 / 1 / 0 / 1 |
| placenta previa | nhau tiền đạo | 5 / 0 / 1 / 0 | rau tiền đạo | 2 / 3 / 0 / 1 |
| placental abruption | nhau bong non | 3 / 0 / 1 / 1 | rau bong non | 0 / 1 / 0 / 1 |
| placenta accreta | nhau cài răng lược | 4 / 0 / 1 / 0 | rau cài răng lược | 0 / 2 / 0 / 1 |
| retained placenta | sót nhau | 0 / 0 / 1 / 1 | sót rau | 0 / 0 / 0 / 1 |
| ectopic pregnancy | thai ngoài tử cung | 2 / 0 / 0 / 1 | chửa ngoài tử cung | 0 / 0 / 0 / 1 |
| termination of pregnancy | chấm dứt thai kỳ | 2 / 0 / 2 / 1 | đình chỉ thai nghén | 0 / 2 / 0 / 1 |
| oocyte | noãn | 10 / 0 / 0 / 1 | trứng (từ chung) | 26 / 2 / 1 / 1 |
| ovulation | phóng noãn | 4 / 0 / 0 / 1 | rụng trứng | 2 / 0 / 0 / 1 |
| infection (hậu sản, ối) | nhiễm trùng (từ chung) | 65 / 11 / 6 / 1 | nhiễm khuẩn | 30 / 7 / 3 / 1 |
| history | tiền sử (từ chung) | 44 / 20 / 9 / 1 | tiền căn | 30 / 0 / 1 / 1 |
| fallopian tube | ống dẫn trứng | 4 / 0 / 0 / 1 | vòi trứng 2 / 0 / 0 / 1; vòi tử cung | 0 / 0 / 0 / 1 |
| uterine contraction | cơn co tử cung | 1 / 3 / 0 / 1 | cơn gò tử cung | 0 / 1 / 0 / 1 |
| trimester | 3 tháng đầu / giữa / cuối | 2 / 2 / 0 / 1 | tam cá nguyệt | 1 / 0 / 0 / 0 |

`hậu sản` (puerperium) dùng ở cả hai miền (S7 O1); giữ cho "puerperium" và "puerperal". `thai trứng` (Nam, Từ Dũ) theo pack `pathology`; BYT 315 viết "chửa trứng" (O1, 33 lần).

## Mã trích dẫn

| Mã | Nguồn | Vùng | URL |
|---|---|---|---|
| BYT315 | QĐ 315/QĐ-BYT 2015, Hướng dẫn chẩn đoán và điều trị các bệnh sản phụ khoa (bản PDF trên thư viện BVTW Thái Nguyên) | O | https://elib.bvdktuthainguyen.gov.vn/uploads/d0/6c/d06c3841337245a338276a861dfcb18c_1605357395.pdf |
| TDU-PPH1 | Cắt tử cung cấp cứu do băng huyết sau sinh ngả âm đạo nặng tại BV Từ Dũ (trang tóm tắt) | S | https://vnras.com/phau-thuat-cat-tu-cung-cap-cuu-do-bang-huyet-sau-sinh-nga-am-dao-nang-tai-benh-vien-tu-du/ |
| TDU-PPH2 | Yếu tố liên quan can thiệp ngoại khoa băng huyết sau sinh ngả âm đạo nặng tại BV Từ Dũ (trang tóm tắt) | S | https://vnras.com/khao-sat-cac-yeu-to-lien-quan-den-can-thiep-ngoai-khoa-bang-huyet-sau-sinh-nga-am-dao-nang-tai-benh-vien-tu-du/ |
| HV-ANEMIA | Thiếu máu ở phụ nữ mang thai tại BV Hùng Vương 2021 (trang tóm tắt) | S | https://vnras.com/ty-le-thieu-mau-va-cac-yeu-to-lien-quan-o-phu-nu-mang-thai-toi-kham-tai-benh-vien-hung-vuong-nam-2021/ |
| AG-PREVIA | Kết cục thai kỳ ở sản phụ nhau tiền đạo, BV Sản Nhi An Giang 2021-2022 (trang tóm tắt) | S | https://vnras.com/ket-cuc-thai-ki-o-san-phu-mac-nhau-tien-dao-nhap-vien-tai-benh-vien-san-nhi-an-giang-nam-2021-2022/ |
| MD-YHSS47-13 ... 16 | Tạp chí Y học Sinh sản (HOSREM) số 47, các bài của BV Mỹ Đức (4 tệp) | S | https://hosrem.org.vn/public/frontend/upload/YHSS_47/13.pdf (14, 15, 16 cùng thư mục) |
| HOSREM-ART | HOSREM, tài liệu về các trung tâm hỗ trợ sinh sản | S | https://www.hosrem.org.vn/public/frontend/files/CNTTHTSS.pdf |
| YHCM12-TDU-PAS | Y học TP.HCM 16(2): kết cục thai kỳ nhau cài răng lược tại BV Từ Dũ (trang tóm tắt) | S | https://tapchiyhoctphcm.vn/articles/10286 |
| YHCD25-CT2494 | Y học Cộng đồng: thai phụ đã mổ lấy thai từ 2 lần, BV Phụ sản TP Cần Thơ 2023-2025 (tác giả ĐH Y Dược Cần Thơ) | S | https://tapchiyhcd.vn/index.php/yhcd/vi/article/download/2494/1919/2193 |
| VNUHS25-TDU670 | Tạp chí KH Sức khỏe ĐHQG TP.HCM: sinh non tại BV Từ Dũ 2024 | S | https://hs.vnuhcmjournal.com.vn/index.php/hs/article/download/670/1043/5163 |
| VJOG25-1893 | Tạp chí Phụ Sản 23(3): HPV, BV Quốc tế Phương Châu (Cần Thơ) | S | https://vjog.vn/journal/article/download/1893/1603 |
| VJOG25-1905 | Tạp chí Phụ Sản 23(3): rau tiền đạo - rau cài răng lược, BV Phụ sản Trung ương | N | https://vjog.vn/journal/article/download/1905/1584 |
| VJOG25-1903 | Tạp chí Phụ Sản 23(3): sản phụ đẻ non, BV Phụ sản Trung ương | N | https://vjog.vn/journal/article/download/1903/1588 |
| VJOG25-1879 | Tạp chí Phụ Sản 23(3): chỉ định mổ lấy thai lần đầu, BV Bạch Mai | N | https://vjog.vn/journal/article/download/1879/1585 |
| VJOG25-1913 | Tạp chí Phụ Sản 23(3): gây tê ngoài màng cứng trong chuyển dạ | N | https://vjog.vn/journal/article/download/1913/1590 |
| VJOG25-1889 | Tạp chí Phụ Sản 23(3): dự đoán trọng lượng thai đủ tháng (tác giả Hà Nội) | N | https://vjog.vn/journal/article/download/1889/1587 |
| HUE17-PPH | Tạp chí Y Dược Huế: tổng quan băng huyết sau sinh | C | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d016_15_59_25.pdf |
| HUE22-PROM | Tạp chí Y Dược Huế: ối vỡ non, BV Trường ĐH Y Dược Huế | C | https://jmp.huemed-univ.edu.vn/BBao/2022/12/PDF_2022m012d01_16_49_41.pdf |
| YHCM16-CR207 | Y học TP.HCM 20(4): thai kỳ sau ghép thận, BV Chợ Rẫy (run trước) | S | https://www.tapchiyhoctphcm.vn/upload/2016/20%204nieu%20than/207.pdf |
| YHCM16-104 | Y học TP.HCM 20(3) bài 104 (run trước) | S | https://tapchiyhoctphcm.vn/upload/2016/20%203/104.pdf |
| YHCM16-SG001 | Y học TP.HCM 20(6): khuyến cáo suy giáp 2016, có phần thai kỳ (run trước) | S | https://duoc.tapchiyhoctphcm.vn/upload/2016/20%206ndgd/001.pdf |
| YHCM18-166 | Y học TP.HCM 22(1) chuyên đề Bà mẹ - Trẻ em, bài 166 (run trước) | S | https://tapchiyhoctphcm.vn/upload/2018/22%201BAMEVATREEM/166.pdf |
| YHCM26-20 | Y học TP.HCM 29(1) bài 20 (run trước) | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S1/20.pdf |
| BVBND-PD20 | BV Bình Dân, phác đồ ung bướu 2020 (run trước) | S | https://www.bvbnd.vn/wp-content/uploads/2022/09/Phac-do-Ung-buoi_2020.pdf |
| Các mã YHCMyy-nnn, BVNTP-..., TCNCYH-..., YDLS108-... khác | Bài của các run trước, không thuộc sản phụ khoa; chỉ góp số đếm cho từ chung (phôi, sơ sinh, mãn kinh, tránh thai...) | S / N | URL đầy đủ trong `D:/vitranslate-corpus/manifest.jsonl` |

## Không tải được (không tính vào số đếm)

- `tudu.com.vn`: robots.txt chặn mọi bot trừ Googlebot -> chỉ đọc robots.txt, không request trang nào.
- `bvphusanct.com.vn` (tập san hội nghị BV Phụ sản Cần Thơ): robots.txt cấm `/DesktopModules/` -> không tải.
- `www.vjol.info.vn/pnt` (Tạp chí Y Dược học Phạm Ngọc Thạch): 2 lần 302, bỏ.
- `nsti.vista.gov.vn` -> 302 sang `sti.vista.gov.vn` -> 429 (run dừng). Hai bài Y học TP.HCM về khởi phát chuyển dạ (Từ Dũ, Hùng Vương) không tải được.
