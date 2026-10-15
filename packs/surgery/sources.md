# sources.md: surgery (Ngoại khoa), draft 0.1.0

Bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn, tiêu đề rút gọn và URL; không chép câu nào từ bài báo.

## Cách đếm

- Kho: `D:/vitranslate-corpus` tại thời điểm 2026-10-15 (339 tệp đọc được), gồm 35 request của run `pack-2026-10-15-surgery` cộng các tệp có sẵn từ các run khác (wave1-kidney, wave1-thyroid, wave1-molecular, pathology-core, nutrition, medicine, radiology, obgyn). Chỉ đọc tại máy, không gửi request nào để đếm.
- Trích chữ PDF bằng PyMuPDF, HTML bằng BeautifulSoup. Chuẩn hóa NFC, chữ thường, gộp dấu kiểu cũ (hoá = hóa, tuỷ = tủy), nối từ bị ngắt dòng bằng gạch nối. Khớp nguyên cụm, khoảng trắng và gạch nối linh hoạt.
- Đếm theo **số tài liệu** có ít nhất một lần xuất hiện; "hits" = tổng số lần.
- Vùng:
  - **S** = phía Nam: Tạp chí Y học TP.HCM (mọi tên miền con), BV Nguyễn Tri Phương, BV ĐH Y Dược TP.HCM, Hội GMHS TP.HCM (hsa.org.vn), phác đồ BV Nhân dân 115 (đăng trên trang BV Tân Phú).
  - **C** = miền Trung / Cần Thơ: TC Y Dược học Cần Thơ, TC Y Dược Huế, TC Y học lâm sàng BV TW Huế.
  - **N** = phía Bắc / toàn quốc: TCNCYH, TC Y Dược lâm sàng 108, TC Phụ sản, các bệnh viện phía Bắc.
  - **B** = văn bản Bộ Y tế: QĐ 1514/QĐ-BYT 2020 "Hướng dẫn chẩn đoán và điều trị một số bệnh ung bướu" (tệp tải từ bvbnd.vn nhưng là văn bản BYT, ban biên soạn Hà Nội; **không** tính là miền Nam).
- ICD387 = QĐ 387/QĐ-BYT (05/02/2026), bảng ICD-9-CM song ngữ, bản trích chữ có sẵn ở `D:/vitranslate-corpus/icd9cm` (0 request). Chỉ dùng làm ứng viên và đối chiếu, không chép nguyên văn mã hóa ("Phẫu thuật/thủ thuật ...").
- BUILT = ghép từ thành tố đã có bằng chứng; LOW = bằng chứng mỏng (0-1 tài liệu).
- Không dùng MedEV, không dùng số đếm ô tìm kiếm OJS.

## Mã trích dẫn

| Mã | Bài / trang (rút gọn) | Nguồn | Năm | Vùng | URL |
|---|---|---|---|---|---|
| BD18-601 | Ngoại tiêu hóa (xì dò miệng nối, gỡ dính, rửa bụng) | Y học TP.HCM 22(2), HNKH BV Bình Dân | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/601.pdf |
| BD18-126 | Thoát vị vết mổ, đặt mảnh ghép | Y học TP.HCM 22(2), HNKH BV Bình Dân | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/126.pdf |
| BV115-TVB | Phác đồ thoát vị bẹn (BV Nhân dân 115) | trang BV Tân Phú | 2014 | S | http://benhvientanphu.vn/Image/Picture/phac%20do%20dieu%20tri/Ngoai%20Khoa/87%20THO%C3%81T%20V%E1%BB%8A%20B%E1%BA%B8N%20-%20BV%20115.pdf |
| NDGD16-171 | Vạt vi phẫu che phủ khuyết hổng phần mềm (BV Nhân dân Gia Định) | Y học TP.HCM 20(6) | 2016 | S | https://duoc.tapchiyhoctphcm.vn/upload/2016/20%206ndgd/171.pdf |
| YHTPHCM19-37 | Ngoại khoa, biến chứng theo Clavien | Y học TP.HCM 23(2) chuyên đề Ngoại | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%202%20ngoai%202/37.pdf |
| YHTPHCM19-255 | Phẫu thuật robot cắt bàng quang (BV Bình Dân) | Y học TP.HCM 23(3) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20nieu%20than/255.pdf |
| YHTPHCM19-PNT11 | Ngoại khoa ung thư (ĐH Y khoa Phạm Ngọc Thạch) | Y học TP.HCM 23(3) | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20pnt/11.pdf |
| YHTPHCM21-93 | Hạ đại tràng qua ngả hậu môn (xì miệng nối) | Y học TP.HCM 25(2) | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S2%202021%20Hoi%20PT%20ban%20tay%20(goi%20HDGS%202022)/93.pdf |
| YHTPHCM25-59 | Thang điểm RENAL và biến chứng Clavien-Dindo sau cắt thận một phần | Y học TP.HCM 28(7) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S7/59.pdf |
| YHTPHCM25-68 | Gây tê ống cơ khép (+ IPACK) thay khớp gối | Y học TP.HCM 28(5) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S5/68.pdf |
| YHTPHCM25-106 | Hồi phục sớm sau phẫu thuật nội soi cắt dạ dày | Y học TP.HCM 28(5) | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S5/106.pdf |
| YHTPHCM24-12 | Dexamethasone + gây tê TAP, phẫu thuật nội soi đại trực tràng | Y học TP.HCM 27(2) | 2024 | S | https://www.tapchiyhoctphcm.vn/upload/2024/T27%20S2/12.pdf |
| YHTPHCM10-211 | Phối hợp tê tủy sống và ngoài màng cứng (thay khớp) | Y học TP.HCM 14(1) | 2010 | S | https://tapchiyhoctphcm.vn/upload/2010/NoiKhoa/211-216.pdf |
| YHTPHCM10-199 | Gây mê TCI propofol, khởi mê / tỉnh mê | Y học TP.HCM 14(1) | 2010 | S | https://tapchiyhoctphcm.vn/upload/2010/NoiKhoa/199-203.pdf |
| YHTPHCM18-74 | BIS hướng dẫn khởi mê ở người cao tuổi | Y học TP.HCM 22(5) | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%206%20ddktyh/74.pdf |
| YHTPHCM16-104 | Tê tủy sống mổ lấy thai | Y học TP.HCM 20(3) | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%203/104.pdf |
| YHTPHCM26-20 | Gây mê sản phụ có bệnh tim | Y học TP.HCM 29(1) | 2026 | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S1/20.pdf |
| HSA16 | Độ mê trong gây mê tĩnh mạch kiểm soát nồng độ đích | Hội GMHS TP.HCM (bản Y học TP.HCM 17(1)) | 2013 | S | https://hsa.org.vn/wp-content/uploads/2016/12/TS-Nguyen-Van-Chinh-Danh-gia-do-me-trong-gay-me-tinh-mach-kiem-soat-nong-do-dich.pdf |
| BVNTP-D2 | Cắt bán phần dạ dày nội soi, nạo vét hạch D2 | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/ngoai-tieu-hoa/phau-thuat-cat-ban-phan-da-day-noi-soi-va-nao-vet-hach-d2 |
| BVNTP-VU | Cắt tuyến vú vét hạch nách | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/ung-buou/phau-thuat-cat-tuyen-vu-vet-hach-nach |
| BVNTP-KS | Hướng dẫn kháng sinh dự phòng (phân loại phẫu thuật sạch / sạch - nhiễm) | BV Nguyễn Tri Phương | - | S | https://bvnguyentriphuong.com.vn/phac-do-dieu-tri/huong-dan-su-dung-khang-sinh-du-phong-phan-2 |
| CTUMP-914 | Kết quả sớm điều trị ung thư dạ dày (nội soi, D2) | TC Y Dược học Cần Thơ 46 | 2022 | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/914/770 |
| CTUMP-687 | Phẫu thuật nội soi cắt trước thấp | TC Y Dược học Cần Thơ | - | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/687/583/1830 |
| CTUMP-770 | Ung thư trực tràng thấp | TC Y Dược học Cần Thơ | - | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/770/637/2099 |
| CTUMP-2562 | Cắt túi mật nội soi ở người cao tuổi | TC Y Dược học Cần Thơ | - | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/2562/2115/20958 |
| CTUMP-611 | Nội soi cắt túi thừa manh tràng ở trẻ em | TC Y Dược học Cần Thơ | - | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/611/550/1504 |
| CTUMP-3954 | Dị vật đường tiêu hóa, biến chứng sau mổ | TC Y Dược học Cần Thơ | - | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/3954/2434 |
| CTUMP-716 | (run wave1-kidney) phẫu thuật thận | TC Y Dược học Cần Thơ | - | C | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/716/611/1887 |
| HUE22 | Hút áp lực âm trong xì miệng nối thực quản | TC Y Dược Huế | 2022 | C | https://jmp.huemed-univ.edu.vn/BBao/2022/6/PDF_2022m06d07_16_47_38.pdf |
| HUEJMP-343 | Gây tê mặt phẳng cơ dựng sống | TC Y Dược Huế | - | C | https://huejmp.vn/index.php/journal/article/download/343/336 |
| YDLS108-930 | Nội soi hoàn toàn cắt bán phần dạ dày | TC Y Dược lâm sàng 108 | - | N | https://tcydls108.benhvien108.vn/index.php/YDLS/article/download/930/590 |
| TCNCYH-4965 | Kết cục ngắn hạn sau phẫu thuật viêm ruột thừa cấp | TCNCYH | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4965/3285/68352 |
| TCNCYH-4341 | Cắt túi mật nội soi sau dẫn lưu (Tokyo 2018) | TCNCYH | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4341/3053/60861 |
| TCNCYH-2262 | (run wave1-kidney) phẫu thuật thận nội soi | TCNCYH | - | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2262/1545/28895 |
| BYT1514 | Hướng dẫn chẩn đoán và điều trị một số bệnh ung bướu (QĐ 1514/QĐ-BYT) | Bộ Y tế, NXB Y học | 2020 | B | https://www.bvbnd.vn/wp-content/uploads/2022/09/Phac-do-Ung-buoi_2020.pdf |
| ICD387 | Bảng phân loại phẫu thuật, thủ thuật ICD-9-CM (QĐ 387/QĐ-BYT) | Bộ Y tế | 2026 | B | bản trích chữ tại D:/vitranslate-corpus/icd9cm (0 request) |

## Số đếm theo nhóm (số tài liệu; vùng; hits)

| Nhóm | Biến thể (docs, vùng, hits) | Chọn |
|---|---|---|
| radical | triệt căn 23 (S8 C5 N9 B1; 101); tận gốc 13 (S9 C2 N1 B1; 62); tiệt căn 0 | triệt căn (phía Nam hòa; BYT1514 + ICD387) |
| open surgery | mổ mở 18 (S7 C5 N6; 94); phẫu thuật mở 9 (S6 C2 N1; 34); mổ hở 4 | mổ mở |
| conversion | chuyển mổ mở 8 (C3 N5; 26); chuyển sang mổ mở 1; chuyển mổ hở 0 | chuyển mổ mở |
| minimally invasive | ít xâm lấn 9 (S5 C1 N3); xâm lấn tối thiểu 5 (S3 C1 N1); xâm nhập tối thiểu 3; ít xâm hại 2 | ít xâm lấn |
| operative time | thời gian phẫu thuật 20 (S11 C5 N4); thời gian mổ 15 (S5 C5 N5) | thời gian phẫu thuật |
| preoperative | trước mổ 39 (S21); trước phẫu thuật 23 (S17); tiền phẫu 9 | trước mổ |
| postoperative | sau mổ 48 (S24; 607); sau phẫu thuật 63 (S35; 511); hậu phẫu 29 | sau mổ (cụm: biến chứng sau mổ 19 / sau phẫu thuật 10) |
| intraoperative | trong mổ 29 (S13; 134); trong phẫu thuật 29 (S20; 82) | trong mổ (tai biến trong mổ 8 / 0) |
| perioperative | chu phẫu 6 (S6); quanh phẫu thuật 3 | chu phẫu |
| SSI | nhiễm trùng vết mổ 13 (S6 C6 N1); nhiễm khuẩn vết mổ 2 (S1 N1) | nhiễm trùng vết mổ |
| anastomotic leak | xì miệng nối 5 (S3 C2; 21); rò 5 (S3 C1 N1; 11); dò 3 (S1 C2; 33); bục 2; xì dò 1; rò rỉ 0 | xì miệng nối (quyết định chủ) |
| fistula spelling | phía Nam: dò (dò tiêu hóa, lỗ dò, dò ruột, dò mật, dò tụy) khoảng 32 hits; rò (rò ruột, rò nước tiểu, rò bạch huyết, rò dịch) khoảng 17 hits | rò (chính tả chuẩn, ICD387); xem MINING_REPORT |
| seroma | tụ dịch 12 (S8); đọng dịch 1 | tụ dịch |
| residual abscess | áp xe tồn lưu 4 (S2 C1 N1); áp xe trong ổ bụng 0 | áp xe tồn lưu |
| postop bleeding | chảy máu sau mổ 4 (S4); xuất huyết sau mổ 0 | chảy máu sau mổ |
| reoperation | mổ lại 9 (S5; 35); phẫu thuật lại 10 (S6; 19); tái phẫu thuật 0 | mổ lại |
| ERAS | hồi phục sớm sau mổ 1 (S; 7); hồi phục sớm sau phẫu thuật 1 (S; 2); tăng cường hồi phục 1 (S; 2); phục hồi sớm sau phẫu thuật 0 | hồi phục sớm sau phẫu thuật (ERAS) (= nutrition) |
| general anaesthesia | gây mê toàn thân 6 (S3 C2 N1); gây mê nội khí quản 4 (S2 C2); gây mê toàn diện 2 | gây mê toàn thân |
| epidural | gây tê ngoài màng cứng 6 (S3 N3) | gây tê ngoài màng cứng |
| spinal | gây tê tủy sống 5 (S5); tê tủy sống 5 (S5; 29) | gây tê tủy sống |
| nerve block | gây tê thần kinh 2 (S2); phong bế thần kinh 2 (S2); phong bế 6 (S6, chủ yếu mức phong bế cảm giác / vận động) | gây tê thần kinh |
| induction | khởi mê 4 (S4; 61); dẫn mê 0 | khởi mê |
| emergence | tỉnh mê 2 (S2; 13); thoát mê 2 (S1 C1; 5); hồi tỉnh 5 (recovery) | tỉnh mê |
| depth | độ mê 2 (S2; 24); độ sâu gây mê 2 (4) | độ mê |
| anaesthetist | bác sĩ gây mê 5 (S5); bác sĩ gây mê hồi sức 0 | bác sĩ gây mê |
| wound classes | phẫu thuật sạch 2 (S1 B1); sạch - nhiễm 1 (S1); phẫu thuật nhiễm 1 (S1) | theo BVNTP-KS |
| resectable | cắt bỏ được 7 (S5 C1 B1); có thể cắt bỏ 2 (B1 N1) | cắt bỏ được |
| unresectable | không cắt bỏ được 4 (S3 B1); không thể cắt bỏ 1 (B1) | không cắt bỏ được |
| neoadjuvant | tân hỗ trợ 5 (S4 C1); tân bổ trợ 4 (B1 C1 N2) | tân bổ trợ (= pathology-breast; quyết định chủ) |
| adjuvant | hóa trị hỗ trợ 2 (S1 B1); hóa trị bổ trợ 2 (B1 C1; 20); điều trị hỗ trợ 13 (S8) | không đưa vào pack (vùng của ung bướu nội khoa) |
| lymph node dissection | vét hạch 12; nạo hạch 11; nạo vét hạch 6; nạo vét hạch D2 3; vét hạch D2 3 | nạo vét hạch (= pathology) |
| frozen section | sinh thiết tức thì 8 (S4); sinh thiết lạnh 4 (S4; 59 trong 1 trang BV ĐH Y Dược); cắt lạnh 8 | sinh thiết tức thì (= pathology, quyết định 7) |
| mesh | mảnh ghép 8 (S6 N2; 136); đặt mảnh ghép 2 (S2; 45); đặt lưới 1 | mảnh ghép |
| hernia | thoát vị bẹn 4 (S4); vết mổ 3; rốn 2; đùi 1; kẹt 1; nghẹt 1 | như bảng |
| amputation | cắt cụt 7 (S3 C2 N2); đoạn chi 2 (S2) | cắt cụt chi |
| ileostomy | hồi tràng ra da 5 (S2 C3); mở hồi tràng ra da 2 (S1 C1); mở thông hồi tràng 0 (ICD387) | mở hồi tràng ra da |
| colostomy | hậu môn nhân tạo 7 (S3 C3 N1) | hậu môn nhân tạo |
| gastrostomy / jejunostomy | mở thông dạ dày 3 (S1 N1 B1); mở dạ dày ra da 1 (S1); mở hỗng tràng ra da 1 (S1); mở thông hỗng tràng 1 (C1) | "ra da" (= nutrition) |
| elective / emergency | mổ chương trình 2 (S2); phẫu thuật chương trình 0; mổ cấp cứu 10 (S5); phẫu thuật cấp cứu 5 | mổ chương trình, mổ cấp cứu |
| surgeon | phẫu thuật viên 36 (S21); bác sĩ phẫu thuật 8 | phẫu thuật viên |
| Tokyo | Hướng dẫn Tokyo 2 (C1 N1); khuyến cáo Tokyo 0 trong kho (có trong một tiêu đề Cần Thơ, theo kế hoạch) | Hướng dẫn Tokyo 2018 |
| exploratory | thám sát 7 (S3; BD18-601 58); thăm dò 12 (N7 S5, nhiều nghĩa) | thám sát |
