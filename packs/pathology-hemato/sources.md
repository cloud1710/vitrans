# sources.md: pathology-hemato (Huyết học GPB: hạch - lách - tủy xương), draft 0.1.0

Nguồn bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn, tiêu đề và URL; không chép câu
nào từ bài báo. Gói gộp hai mục cũ của hàng đợi: #5 `pathology-lymphnode` và #6 `pathology-bonemarrow`.

## Cách đếm

- **Kho chung** `D:/vitranslate-corpus` (chỉ đọc): 205 tệp đã tải bởi các run trước (`wave1-*`, `pack-2026-10-14-*`,
  `distill-p1`). Trích chữ bằng pypdf (PDF) và lxml (HTML) vào thư mục tạm của phiên, không ghi vào kho. Khoảng 13
  tệp có nội dung huyết học / hạch; phần còn lại chỉ đóng góp số đếm ngẫu nhiên (ví dụ "lui bệnh" trong bài thận).
- **Run `pack-2026-10-15-pathology-hemato`** (`tools/corpus_fetch.py`, --max-total 40): **dừng ở request đầu tiên**.
  `https://bthh.org.vn/robots.txt` trả lỗi transport `SSL: UNEXPECTED_EOF_WHILE_READING`; công cụ khóa run và đưa
  bthh.org.vn vào danh sách `blocked` của `counter.json`. Không tải thêm tệp nào qua công cụ.
- **WebFetch (8 / 10)**: 5 PDF Y học TP.HCM (WebFetch không đọc được chữ, nhưng lưu tệp nhị phân; tôi trích chữ bằng
  pypdf ngay trong thư mục tạm, không đưa vào kho chung) và 3 trang HTML BV Nguyễn Tri Phương (dùng bản tóm tắt thuật ngữ
  của WebFetch, ghi là WF). Không gọi bthh.org.vn sau lỗi SSL.
- **WebSearch (18 / 30)**, có domain lọc hoặc chặn tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com,
  hoiyhoctphcm.org.vn. Chỉ dùng tiêu đề và đoạn trích để xác nhận một biến thể có tồn tại (ghi là WS), không đếm.
- Chuẩn hóa NFC, chữ thường, gộp dấu kiểu cũ (tuỷ -> tủy, hoá -> hóa). Đếm theo **số tài liệu**, khớp nguyên từ. Bốn
  PDF Y học TP.HCM đời cũ (2017, 2019, 2021) có lớp chữ chèn dấu cách giữa các chữ cái ("lo ạ n s ả n"): các tệp này
  được đếm thêm một lượt sau khi bỏ hết dấu cách (chỉ áp cho các tệp đó, vì bỏ dấu cách làm mất ranh giới từ).
- Vùng: **S** = phía Nam (Y học TP.HCM, BV Truyền máu Huyết học TP.HCM, BV Chợ Rẫy, BV Nguyễn Tri Phương, BV ĐH Y Dược
  TP.HCM); **N** = Hà Nội (TCNCYH); **O** = văn bản chính thức (QĐ 1514/QĐ-BYT 2020 hướng dẫn ung bướu, bản đăng trên
  bvbnd.vn; QĐ 3336/QĐ-BYT 2017 quy trình kỹ thuật huyết học, bản trên vnras.com); **Huế** ghi riêng.
- **OWN** = bảng người dùng đã tự sửa: `translator/glossary/glossary_review.csv` (cột VN_sua_o_day) và `learned.csv`.
  Đây là bằng chứng tin cậy nhất về house style, nhưng một số dòng có trước các quyết định 2026-10-14 (lymphôm có mũ,
  "tế bào lympho"): các dòng đó được chuyển theo quyết định mới (lymphom, lymphô bào).
- **BUILT** = ghép từ các dòng đã có (gói cha, OWN, quyết định của người dùng) khi y văn trong kho không có dạng nào;
  **UNRESOLVED** = không tìm thấy dạng tiếng Việt, giữ chú thích tiếng Anh trong ngoặc.
- Không dùng MedEV, không dùng số đếm của ô tìm kiếm OJS.

## Mã trích dẫn

| Mã | Bài / trang | Nguồn | Năm | Vùng | URL |
|---|---|---|---|---|---|
| BYT1514 | Hướng dẫn chẩn đoán và điều trị ung bướu (QĐ 1514/QĐ-BYT), bản PDF | bvbnd.vn | 2020 | O | https://www.bvbnd.vn/wp-content/uploads/2022/09/Phac-do-Ung-buoi_2020.pdf |
| BYT3336 | Quy trình kỹ thuật huyết học - truyền máu - miễn dịch - di truyền - sinh học phân tử (QĐ 3336/QĐ-BYT) | vnras.com | 2017 | O | https://vnras.com/huong-dan-quy-trinh-ky-thuat-huyet-hoc-truyen-mau-mien-dich-di-truyen-sinh-hoc-phan-tu-theo-bo-y-te-quyet-dinh-so-3336-qd-byt-ngay-20-07-2017/ |
| BVNTP-HACH1 | Giải phẫu bệnh học bệnh lý hạch limphô P1 | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-hach-limpho-p1 |
| BVNTP-HACH2 | Giải phẫu bệnh học bệnh lý hạch limphô P2 (Hodgkin) | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-hach-limphop2 |
| BVNTP-HACH3 | Giải phẫu bệnh học bệnh lý hạch limphô P3 (lymphom không Hodgkin) | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-hach-limphop3 |
| BVDHYD-HACH | Hạch phì đại: phân biệt viêm phản ứng, lao hạch và lymphôm qua giải phẫu bệnh | BV ĐH Y Dược TP.HCM | - | S | https://bvdaihoc.com.vn/thu-vien-suc-khoe/hach-phi-dai-phan-biet-viem-phan-ung-lao-hach-va-lymphom-qua-giai-phau-benh-p-3010 |
| BVNTP-XLBP | Xử lý bệnh phẩm sinh thiết và chẩn đoán mô học (huyết học - truyền máu) | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/huyet-hoc-truyen-mau/xu-ly-benh-pham-sinh-thiet-va-chan-doan-mo-hoc |
| BVNTP-HMMD | Xét nghiệm hóa mô miễn dịch | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/xet-nghiem-hoa-mo-mien-dich |
| BVNTP-FNA | Chọc hút tế bào tuyến giáp bằng kim nhỏ | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/choc-hut-te-bao-tuyen-giap-bang-kim-nho-fna-tuyen-giap |
| BVNTP-GPB1 | Giải phẫu bệnh học bệnh lý tuyến giáp P1 | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-tuyen-giap-p1 |
| BVNTP-CT1 | Giải phẫu bệnh học bệnh lý cầu thận P1 | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-cau-than-p1 |
| BVDHYD-QC | Kiểm soát chất lượng tiền phân tích | BV ĐH Y Dược TP.HCM | - | S | https://bvdaihoc.com.vn/thu-vien-suc-khoe/kiem-soat-chat-luong-tien-phan-tich-nen-tang-cho-chan-doan-chinh-xac-p-3051 |
| YHCM18-134 | Đặc điểm lâm sàng, cận lâm sàng lymphoma tại BV Chợ Rẫy 2014-2017 | Y học TP.HCM 22(1) | 2018 | S | https://www.tapchiyhoctphcm.vn/upload/2018/22%201tai%20muihong/134.pdf |
| YHCM21-CML | Khảo sát các bất thường nhiễm sắc thể trên bệnh nhân bạch cầu mạn dòng tủy | Y học TP.HCM 25(1), CĐHA - SHPT | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/151.pdf |
| YHCM26-MRD | Khảo sát bệnh tồn lưu đo được trước và sau ghép (BV Truyền máu Huyết học) | Y học TP.HCM 29(11) | 2026 | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S11/111.pdf |
| YHCM25-197 | Bài thận học, Phân môn Thận ĐH Y Dược TP.HCM (số đếm ngẫu nhiên) | Y học TP.HCM 28(8) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S8/197.pdf |
| YHCM22-NĐ1 | Hội chứng thận hư kháng steroid ở trẻ em, BV Nhi Đồng 1 (số đếm ngẫu nhiên "lui bệnh") | Y học TP.HCM 26(2) | 2022 | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20BV%20N%C4%901%20(HN%20T4-2022)/188.pdf |
| YHCM19-HH139 | Báo cáo một trường hợp hội chứng loạn sản tủy xương thể mất NST 5q điều trị bằng lenalidomide (HNKH BV Truyền máu Huyết học) | Y học TP.HCM 23(6) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%206%20huyethoc/139.pdf |
| YHCM19-HH489 | Biến cố bất lợi trên bệnh nhân u lympho không Hodgkin não nguyên phát tế bào B lớn lan tỏa điều trị methotrexate liều cao + rituximab (BV Chợ Rẫy) | Y học TP.HCM 23(6) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%206%20huyethoc/489.pdf |
| YHCM19-HH95 | Đánh giá bước đầu kết quả ghép tế bào gốc máu ngoại vi đồng loại nửa thuận hợp (BV Truyền máu Huyết học) | Y học TP.HCM 23(6) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%206%20huyethoc/95.pdf |
| YHCM17-CR322 | Khảo sát đột biến CALR trên bệnh nhân xơ tủy nguyên phát bằng giải trình tự (HNKH BV Chợ Rẫy; tác giả BV Truyền máu Huyết học) | Y học TP.HCM 21(2) | 2017 | S | https://tapchiyhoctphcm.vn/upload/2017/21%202CR/322.pdf |
| YHCM24-MZL | Tổng quan về u lympho nguyên phát tại phổi vùng rìa ngoài hạch của các mô lympho liên kết niêm mạc (ĐH Y Dược TP.HCM) | Y học TP.HCM 27(3) | 2024 | S | https://tapchiyhoctphcm.vn/upload/2024/T27%20S3/1.pdf |
| TCNCYH26-AMY | Tổn thương thận do lắng đọng amyloid: loạt ca và nhìn lại y văn | TCNCYH 198(1) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4436/3046/60854 |
| TCNCYH-NB | Tiếp cận đa chiều chẩn đoán u nguyên bào thần kinh (đau khớp tái diễn ở trẻ nhỏ) | TCNCYH 198(1) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4427/3056/60864 |
| TCNCYH-914 | U trung biểu mô màng phổi ác tính, tổng quan (số đếm ngẫu nhiên) | TCNCYH 155(7) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/914/615/9292 |
| HUE20 | Nguyên nhân và tổn thương mô bệnh học hội chứng thận hư ở người cao tuổi | TC Y Dược học Huế số 27 | 2020 | Huế | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d019_8_50_7.pdf |
| HUE20b | Can thiệp xâm nhập tối thiểu (số đếm ngẫu nhiên "đa u tủy") | TC Y Dược học Huế 10(1) | 2020 | Huế | https://jmp.huemed-univ.edu.vn/BBao/2020/6/PDF_2020m06d029_17_23_11.pdf |
| HUE22 | Phân loại mô bệnh học và hóa mô miễn dịch ở bệnh nhân ung thư phổi | TC Y Dược học Huế 12(2) | 2022 | Huế | https://jmp.huemed-univ.edu.vn/BBao/2022/12/PDF_2022m012d01_16_53_14.pdf |
| BVNTP-STX (WF) | Sinh thiết tủy xương | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/ung-buou/sinh-thiet-tuy-xuong |
| BVNTP-CAST (WF) | Tăng sản hạch bạch huyết (bệnh Castleman) là gì? | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/huyet-hoc-truyen-mau/tang-san-hach-bach-huyet-benh-castleman-la-gi |
| BVNTP-MPN (WF) | Các bệnh tăng sinh tủy mạn ác tính (văn phong miền Bắc: "lơ xê mi") | BV Nguyễn Tri Phương | - | S (nội dung N) | https://bvnguyentriphuong.com.vn/huyet-hoc-truyen-mau/cac-benh-tang-sinh-tuy-man-actinh-myeloprolllerative-disorders |
| bthh.org.vn (WS) | Tiêu đề các bài của BV Truyền máu Huyết học TP.HCM (AML, đa u tủy, MCL, tân sinh tăng sinh tủy WHO 2016, xơ tủy nguyên phát, loạn sinh tủy, nhuộm Perls, sinh thiết tủy xương ở tủy giảm sinh / xơ tủy, bệnh bạch cầu mạn dòng lympho / dòng tủy) | WebSearch | - | S | https://bthh.org.vn/ |
| YHCM09-RDD (WS) | Bệnh Rosai-Dorfman ("bệnh mô bào xoang gây hạch to"), Y học TP.HCM 13(3) | WebSearch | 2009 | S | https://tapchiyhoctphcm.vn/articles/4793 |
| VIENHH22 (WS) | Hướng dẫn chẩn đoán và điều trị một số bệnh lý huyết học (CMML = "bệnh bạch cầu mạn dòng tủy - mono") | Viện Huyết học - Truyền máu TW | 2022 | N | https://vienhuyethoc.vn/wp-content/uploads/2022/07/Huong-dan-Chan-doan-va-dieu-tri-mot-so-benh-ly-huyet-hoc.pdf |
| TCNCYH-KIK (WS) | Bệnh viêm hạch Kikuchi ở trẻ em: báo cáo ca bệnh và tổng quan | TCNCYH | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/view/4269 |

## Biến thể và số đếm theo nhóm (số tài liệu; số lần trong ngoặc)

### Tên họ bệnh (quyết định của người dùng thắng số đếm)

| Khái niệm | Dạng chọn | Biến thể trong kho |
|---|---|---|
| lymphoma | lymphom (quyết định 2026-10-14) | u lympho 9 tài liệu (BYT1514 246, YHCM24-MZL 54, BYT3336 10, YHCM19-HH489 4...); lymphôm 4 (BVDHYD-HACH 46); lymphom 1 |
| leukemia | bệnh bạch cầu (quyết định 2026-10-14) | bệnh bạch cầu 7 (BYT1514 25, BVNTP-HACH3 7); lơ xê mi 1 (BYT1514 56); "leukemia" để nguyên 20 |
| AML | bệnh bạch cầu cấp dòng tủy | bạch cầu cấp dòng tủy: YHCM19-HH95 4 (S), BYT1514 3; lơ xê mi cấp dòng tủy: BYT1514 2 |
| ALL | bệnh bạch cầu cấp dòng lympho | bạch cầu cấp dòng lympho: YHCM19-HH95 3 (S), BYT1514 5; lơ xê mi cấp dòng lympho: BYT1514 3; OWN "bệnh bạch cầu nguyên bào lympho cấp tính" |
| CML | bệnh bạch cầu mạn dòng tủy | bạch cầu mạn dòng tủy: YHCM26-MRD 4, YHCM21-CML 1, YHCM17-CR322 2 (S), BYT1514 1; "mạn tính dòng tủy" 0; lơ xê mi kinh dòng bạch cầu hạt: BYT1514 6; OWN "bệnh bạch cầu mạn tính dòng tủy" |
| CLL | bệnh bạch cầu mạn dòng lympho | bạch cầu mạn dòng lympho 2 (BYT1514, YHCM25-197); bạch cầu lympho mạn 2; lơ xê mi kinh dòng lympho BYT1514 10; OWN "mạn tính dòng lympho" |
| myeloma | đa u tủy | đa u tủy 3 (+ YHCM19-HH489 5); "đa u tủy xương" là dạng dài trong cùng tài liệu; OWN "Myeloma = u tủy" |
| MDS | hội chứng loạn sản tủy | YHCM19-HH139 (BV TMHH): "hội chứng loạn sản tủy (xương)" 19, "(rối) loạn sinh tủy" 10; BYT1514: "loạn sinh tủy" 3, "rối loạn sinh tủy" 3; OWN "hội chứng loạn sản tủy (MDS)" (đã loại "rối loạn sinh tủy") |
| MPN | tân sinh tăng sinh tủy | OWN; bthh.org.vn tiêu đề (WS); YHCM26-MRD 1; YHCM17-CR322 "tân sản tăng sinh tủy" 3; BYT1514 "tăng sinh tủy mạn" 3 |
| PV / ET / PMF | đa hồng cầu nguyên phát / tăng tiểu cầu nguyên phát / xơ tủy nguyên phát | YHCM17-CR322 2 / 2 / 29; BVNTP-MPN ~10 / ~8 / ~5 (WF); BYT1514 12 / "tiên phát" 2 / "xơ tủy vô căn" 1 |

### Tủy xương

| Khái niệm | Dạng chọn | Biến thể |
|---|---|---|
| blast | blast (giữ) | YHCM19-HH139 17; BYT1514 "tế bào blast" 17, "blast" 21; "nguyên bào" là từ chung (246 lần, đa số u nguyên bào); OWN "MDS tăng nguyên bào" |
| ring sideroblasts | nguyên hồng cầu sắt vòng | YHCM19-HH139 4; OWN; "nguyên bào sắt vòng" 0 |
| megakaryocyte | mẫu tiểu cầu | BYT1514 6, TCNCYH-NB 2; BVNTP-STX / BVNTP-MPN ~12 (WF); OWN (loại "tế bào nhân khổng lồ") |
| bone marrow aspirate | tủy đồ | 5 tài liệu (BYT1514 19, TCNCYH26-AMY 6) + 4 S (YHCM19-HH139 3, HH95, HH489, YHCM21-CML); "huyết tủy đồ" 3; "chọc hút tủy" 1 |
| trephine biopsy | sinh thiết tủy xương | 4 tài liệu (BYT1514 9, TCNCYH26-AMY 6, YHCM24-MZL 2, BVNTP-XLBP 1) + BVNTP-STX + bthh (WS); "trephine" 0 |
| cellularity | mật độ tế bào | OWN; 4 tài liệu; "độ tế bào" 5 (đa số ngoài huyết học); tủy giàu / nghèo tế bào: BYT1514 4 / 1, BVNTP-MPN ~4 / 1 (WF); "tủy giảm sinh" bthh (WS) |
| peripheral blood | (máu ngoại vi, của gói molecular) | máu ngoại vi 9 tài liệu (BYT1514 30, BVNTP-HACH3 4, YHCM19-HH95 4); máu ngoại biên 3 + YHCM19-HH139 2 |
| peripheral blood smear | phết máu ngoại vi | "phết máu ngoại biên" YHCM19-HH139 2; "phết máu ngoại vi" 0; "huyết đồ" 2 |
| myelofibrosis / reticulin | xơ tủy / sợi liên võng (reticulin) | YHCM17-CR322 "xơ tủy" 31, "reticulin" 15; BVNTP-STX "sợi liên võng" (WF); BVNTP-MPN "xơ hóa dạng reticulin" (WF); gói cha reticulin fiber = sợi liên võng (reticulin) |
| karyotype | (nhiễm sắc thể đồ, của gói cha) | "NST đồ" YHCM21-CML 21, YHCM19-HH139 6 (S); "nhiễm sắc thể đồ" 2 (ns); "karyotype" 6 |
| BCR::ABL1 | tổ hợp gen BCR::ABL1 | YHCM26-MRD "tổ hợp gen BCR::ABL1" 3, "BCR::ABL1" 45; "tổ hợp gen" 5 tài liệu; "gen dung hợp" 0 |
| bone marrow involvement | xâm lấn tủy xương | "xâm lấn tủy" 2 (TCNCYH-NB 9, BYT1514 7); "di căn tủy" 2; "thâm nhiễm tủy" 1 (BYT1514 2) |

### Hạch

| Khái niệm | Dạng chọn | Biến thể |
|---|---|---|
| germinal center | trung tâm mầm | 7 tài liệu (BVNTP-HACH1 17, BVNTP-HACH3 6, BVDHYD-HACH 5); OWN; = pathology-endocrine |
| lymphoid follicle | nang lympho | nang lympho 3 (BVDHYD-HACH 4, BYT1514 3); nang limphô 3 (BVNTP-HACH1 18: chính tả cũ); nang bạch huyết 2 |
| paracortex | vùng cận vỏ | 3 S (BVNTP-HACH1 9, BVDHYD-HACH 4, BVNTP-HACH3 1); "vùng cạnh vỏ" 0 |
| marginal zone | vùng rìa (gói cha) | vùng rìa 4 (BVNTP-HACH3 8, BYT1514 6, YHCM24-MZL 5); vùng viền 2 (BVNTP-HACH3 7, BVNTP-HACH1 3) |
| mantle zone | vùng áo nang (gói cha) | "vùng áo" 1, "áo nang" 1 (BYT1514 3) |
| centrocyte / centroblast | tâm bào / nguyên tâm bào | tâm bào 3 S (BVNTP-HACH1 11, HACH3 11, HACH2 1); nguyên tâm bào 3 S |
| immunoblast | nguyên bào miễn dịch (gói cha) | 4 tài liệu (BVNTP-HACH1 9, BYT1514 6) |
| classic Hodgkin | kinh điển | BVNTP-HACH2 20 (S) vs "cổ điển" 2 tài liệu |
| Reed-Sternberg | tế bào Reed-Sternberg | 3 tài liệu; tế bào Hodgkin 2 |
| interfollicular | giữa các nang | 4 tài liệu (BVNTP-HACH1/3); "liên nang" 0 |
| effaced architecture | cấu trúc hạch bị xóa | 3 tài liệu (BVNTP-HACH3 3, BVNTP-HACH2 1, BYT1514 1) |
| immunophenotype | kiểu hình miễn dịch | 5 tài liệu (BVNTP-HACH1 10, HACH3 10, HACH2 3, HUE22 16) |
| co-expression | đồng bộc lộ | YHCM 2008 (WS) "đồng bộc lộ CD5"; "đồng biểu hiện" 0 |
| excisional biopsy | sinh thiết trọn hạch | BVDHYD-HACH 3; "sinh thiết hạch" 4 tài liệu |
| tuberculous lymphadenitis | lao hạch | BVDHYD-HACH 12, BYT1514 4 |
| Kikuchi | viêm hạch hoại tử mô bào | WS (Tâm Anh, TCNCYH-KIK); kho 0 |
| Rosai-Dorfman | bệnh mô bào xoang gây hạch to | YHCM09-RDD (WS); kho 0 |
| Castleman đơn ổ / đa ổ | đơn ổ / đa ổ | WS (trang bệnh viện phía Nam); BVNTP-CAST "khu trú" / "đa cơ quan" (WF) |

### Giai đoạn, đáp ứng, ghép

| Khái niệm | Dạng chọn | Biến thể |
|---|---|---|
| B symptoms | triệu chứng B | 3 tài liệu (YHCM18-134 3, BYT1514 3, BVDHYD-HACH 1) + YHCM19-HH489 3 |
| bulky | bệnh khối lớn (bulky) | "khối lớn" 2 (BYT1514 4, BVNTP-HACH2 1) |
| IPI | chỉ số tiên lượng quốc tế (IPI) | BYT1514 1; "IPI" 4 |
| extranodal | ngoài hạch | 6 tài liệu (BYT1514 61, YHCM18-134 11, YHCM24-MZL 7) |
| complete remission | lui bệnh hoàn toàn | 3 tài liệu + YHCM19-HH95 / HH489 |
| refractory | kháng trị | 2 tài liệu + YHCM19-HH95 / HH489 |
| PTCL | tế bào T ngoại vi | "ngoại vi" 2 (BYT1514 9, BVNTP-HACH3 5) vs "ngoại biên" 1 |
| NOS | không đặc hiệu | 10 tài liệu vs "không xác định" 9 |
| HSCT / GVHD | ghép tế bào gốc tạo máu / bệnh mảnh ghép chống ký chủ | YHCM19-HH95 21 / 2 |

## Các dòng giữ theo gói cha hoặc gói anh em (không ghi đè)

- Gói cha 0.2.1: lymphoma, follicular lymphoma, DLBCL, Hodgkin lymphoma, mantle zone, mantle cell lymphoma, marginal
  zone, MZL, lymphocyte, plasma cell, plasma cell neoplasm, histiocyte, eosinophil, centroblast, immunoblast, FDC, TFH,
  NLPHL, mixed cellularity, lymphocyte-rich / -depleted, hairy cell leukemia, LPL, ANKL, ALCL, ENKTCL, flow cytometry,
  light chain restriction, Hans classifier, monoclonal / polyclonal / monotypic, karyotype, cytogenetics,
  rearrangement, translocation, reticulin fiber, amyloidosis ("thoái hóa dạng bột"), tingible-body macrophage ("đại thực
  bào nhặt mảnh"), hemophagocytic syndrome. Hai dòng nháp trùng khóa với gói cha (amyloidosis, tingible body
  macrophage) đã bị bỏ để không ghi đè.
- molecular: peripheral blood = máu ngoại vi, stem cell = tế bào gốc, FISH, translocation. molecular-pathology:
  measurable residual disease, MRD, fusion gene = gen dung hợp (gói này dùng khóa ghép "BCR::ABL1 fusion" = "tổ hợp gen
  BCR::ABL1" theo ghi chú của chính molecular-pathology). pathology-gi: MALT lymphoma = lymphom MALT.
  pathology-endocrine: germinal centre = trung tâm mầm. pathology-hpb: IgG4-related disease.

## Bổ sung 0.1.1 (2026-10-15, quyết định của người dùng)

Các bảng trên ghi số đếm của 0.1.0. Dạng chọn đổi ở 0.1.1 (lý do và số đếm trong MINING_REPORT mục 6):

| Khái niệm | 0.1.0 | 0.1.1 | Cơ sở |
|---|---|---|---|
| CML / CLL / CMML (tên bệnh) | mạn dòng tủy / mạn dòng lympho / mạn dòng tủy - mono | không đổi | người dùng 17:50: tên theo y văn; D: corpus "mạn dòng tủy" 3 tài liệu, "mạn tính dòng tủy" 0; "mạn dòng lympho" 2 = "lympho mạn" 2, "mạn tính dòng lympho" 0; CMML 0 mọi biến thể |
| chronic phase | giai đoạn mạn | giai đoạn mạn tính | D: corpus "giai đoạn mạn tính" 2 tài liệu (BYT1514 7, YHCM26-MRD 1) vs "giai đoạn mạn" đứng riêng 1 (YHCM21-CML 2); 0.1.0 đếm nhầm vì "giai đoạn mạn" khớp cả "giai đoạn mạn tính" |
| chronic neutrophilic leukemia | (không có) | bệnh bạch cầu mạn dòng bạch cầu trung tính (CNL) | D: corpus 0; ghép theo mẫu tên CML / CMML |
| blast (danh từ) | blast | blast | người dùng 17:48 |
| blast phase / crisis | giai đoạn chuyển cấp | giai đoạn blast | người dùng 17:48 |
| B- / T-lymphoblastic leukemia/lymphoma | ... nguyên bào lympho B / T | bệnh bạch cầu/lymphom cấp dòng lympho B / T | người dùng 17:49; D: corpus chỉ BYT1514 viết tên WHO ("nguyên bào lympho B tiền thân", 1 tài liệu, 2 lần) |
| acute lymphocytic / lymphoid leukemia | (không có) | bệnh bạch cầu cấp dòng lympho (ALL) | người dùng 17:49 |
| peripheral blood smear | phết máu ngoại vi | phết máu ngoại biên | người dùng 17:45 |
| BCR::ABL1 fusion / fusion gene | tổ hợp gen BCR::ABL1 | không đổi; molecular-pathology "fusion gene" đổi theo | D: corpus nghĩa gen dung hợp: "tổ hợp gen" 2 tài liệu S (YHCM26-MRD 3, YHCM21-CML 1) + BYT1514 "gen tổ hợp BCR-ABL" 1; "gen dung hợp" 0 tài liệu |
| bone marrow involvement | xâm lấn tủy xương | không đổi | D: corpus "xâm lấn tủy (xương)" 2 tài liệu (BYT1514 7, TCNCYH-NB 9) vs "thâm nhiễm tủy" 1 (BYT1514 2); không tài liệu phía Nam nào có cả hai |
| AL amyloidosis | thoái hóa dạng bột chuỗi nhẹ | bỏ dòng (theo gói cha) | người dùng 17:45 |
| myeloblast | nguyên tủy bào | bỏ dòng | người dùng 17:48 (danh từ "-blast" không tự thành "nguyên bào") |
| BPDCN | tân sinh tế bào tua dạng tương bào non | giữ tên tiếng Anh | không có dạng Việt |
