# sources.md: pathology-endocrine (Giải phẫu bệnh nội tiết), draft 0.1.0

Nguồn bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn, tiêu đề và URL; không chép câu nào từ bài báo.

> Dựng lại offline ngày 2026-10-14 (tối). Miner đợt 1 (run `wave1-thyroid`) bị ngắt khoảng 14:59, sau khi đã ghi `glossary.csv`, `rules.json`, `tests.jsonl`, `prompt.md`, `pack.json` nhưng trước khi ghi file này. Bảng mã trích dẫn lấy từ các dòng manifest của run và các mã nguồn đã có trong cột note. Cột "Đếm lại offline" được đếm lại trên chính các tệp đã tải ở `D:/vitranslate-corpus` (chỉ đọc), không gửi request mạng nào. Không sửa dòng glossary nào vì số đếm.

## Cách đếm

- Kho: 34 request của run `wave1-thyroid` (`tools/corpus_fetch.py`, 07:33-07:47 UTC), ra 32 tệp đọc được. jcmhch.com.vn trả 302 về trang đăng nhập (không có tệp). VJOL trả 302 lần đầu; URL mới được tải ở request sau.
- Note còn trích 5 tài liệu do run khác tải về (cùng kho): YHCM18-BD351, YHCM16-ARID1B, YHCM16-SG, TCNCYH-NB (run `wave1-molecular`) và YHCM16-USPM (run `wave1-kidney`). Tập đếm của pack này là 32 + 5 = 37 tài liệu.
- Trích chữ PDF bằng PyMuPDF, HTML bằng BeautifulSoup (bỏ script/style). Chuẩn hóa NFC, chữ thường, gộp dấu kiểu cũ, đổi "ƣ" (lỗi font PDF) thành "ư". Đếm theo **số tài liệu**, khớp nguyên từ; phần "(...)" trong một biến thể được coi là tùy chọn.
- Vùng, theo đúng chữ cái mà các note đang dùng:
  - **S** = phía Nam: Y học TP.HCM, TC Y Dược học Phạm Ngọc Thạch, TC Y Dược học Cần Thơ, các trang của BV Nguyễn Tri Phương và BV ĐH Y Dược TP.HCM. CTUMP23-ATG (tác giả BV Ung bướu Đà Nẵng) cũng được note tính S.
  - **N** = Hà Nội: TCNCYH, BV Quân y 103, TC Y Dược học Quân sự.
  - **O** = văn bản chính thức: QĐ 1514/QĐ-BYT (2020), bản PDF đăng trên bvbnd.vn.
- Ba tệp tải về nằm ngoài chủ đề nội tiết: YHCM22-98 (MRI u buồng trứng), YHCM22-157 (cắt tuyến tiền liệt), YHCM18-134 (lymphoma tai mũi họng). YHCM18-TUC (u tuyến ức) chỉ được dùng cho MEN1. Các tệp này vẫn nằm trong tập đếm để số liệu khớp với note.
- Nguồn không có tệp trong kho, không kiểm lại được offline: YHCM09-FNA (miner trích nhưng không có tệp nào khớp trong `D:/vitranslate-corpus`), tiêu đề JCMHCH "Bethesda nhóm IV" (request bị 302), "user thyroid deck 2026-07-17".
- `translator/glossary/glossary_review.csv` và `learned.csv` là bảng người dùng đã sửa. Tôi đã đối chiếu các dòng được trích (colloid nodule = phình giáp keo: khớp).
- Trạng thái ở cột cuối (so số trong note với số đếm lại):
  - **OK**: khớp, kể cả phần chia vùng nếu note có ghi.
  - **OK_MANUAL**: tôi kiểm tay và xác nhận (giải thích ngay sau trạng thái).
  - **OK_WIDER**: khớp khi đếm trên cả kho đợt 1 (thêm tài liệu của run thận và run phân tử). Miner đã đếm trên kho chung, không chỉ trên tập nội tiết.
  - **LOCAL_MORE**: kho có nhiều tài liệu hơn số note ghi; lựa chọn không bị yếu đi.
  - **LOCAL_LESS**: kho có ít hơn: số trong note **không xác nhận được offline**. Dòng glossary giữ nguyên; danh sách ở MINING_REPORT mục 4.
- Không dùng MedEV; không dùng số đếm của ô tìm kiếm OJS.

## Mã trích dẫn

| Mã | Bài / trang | Nguồn | Năm | Vùng | URL |
|---|---|---|---|---|---|
| YHCM19-BGN | Đặc điểm tế bào học và giải phẫu bệnh bướu giáp nhân đã phẫu thuật | Y học TP.HCM 23(1), chuyên đề Nội khoa | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%201%20noi/209.pdf |
| YHCM18-RFA | Ứng dụng sóng cao tần trong điều trị nhân giáp lành tính (tổng quan) | Y học TP.HCM 22(1), chuyên đề Ngoại khoa | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%201ngoaikhoa%201/001.pdf |
| YHCM18-CCG | Cường cận giáp nguyên phát: đặc điểm bệnh lý, kết quả phẫu thuật | Y học TP.HCM 22(1), chuyên đề Ngoại khoa | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%201ngoaikhoa%201/26.pdf |
| YHCM21-CR120 | Đặc điểm hô hấp trước và sau mổ bướu giáp chèn ép khí quản (BV Chợ Rẫy) | Y học TP.HCM 25(3) | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S3%202021%20BV%20CRay%20(goi%20HDGS%202022)/120.pdf |
| YHCM18-BD351 | Nghiên cứu ung thư tuyến giáp BV Bình Dân 2014-2016 (run `wave1-molecular`) | Y học TP.HCM 22(2), HNKH BV Bình Dân | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/351.pdf |
| YHCM18-TUC | Cập nhật chẩn đoán và vai trò ung bướu nội khoa trong bướu biểu mô tuyến ức (tổng quan) | Y học TP.HCM 22(2), HNKH BV Bình Dân | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/30.pdf |
| YHCM16-SG | Cập nhật khuyến cáo chẩn đoán và điều trị suy giáp năm 2016 (run `wave1-molecular`) | Y học TP.HCM 20(6), HNKH BV Nhân dân Gia Định | 2016 | S | https://duoc.tapchiyhoctphcm.vn/upload/2016/20%206ndgd/001.pdf |
| YHCM16-ARID1B | Làm giàu trình tự toàn bộ exon của gen ARID1B trong u nguyên bào thần kinh (run `wave1-molecular`) | Y học TP.HCM 20(1), Nội khoa II | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%201cd%20noikhoa%202/144.pdf |
| YHCM16-USPM | Đặc điểm giải phẫu bệnh u sau phúc mạc (run `wave1-kidney`) | Y học TP.HCM 20(2), HNKH BV ĐH Y Dược | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%202bvdhyd/160.pdf |
| YHCM18-134 | Đặc điểm lâm sàng, cận lâm sàng lymphoma tại BV Chợ Rẫy 2014-2017 (ngoài chủ đề) | Y học TP.HCM 22(1), chuyên đề Mắt - TMH | 2018 | S | https://www.tapchiyhoctphcm.vn/upload/2018/22%201tai%20muihong/134.pdf |
| YHCM22-98 | Cộng hưởng từ khuếch tán và động học bắt thuốc trong u buồng trứng (ngoài chủ đề) | Y học TP.HCM 26(2), chuyên đề CĐHA - YTCC | 2022 | S | https://www.tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/98.pdf |
| YHCM22-157 | Biến chứng của cắt tuyến tiền liệt tận gốc kèm nạo hạch chậu (ngoài chủ đề) | Y học TP.HCM 26(1), chuyên đề Ngoại khoa | 2022 | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S1%202022%20Ngoai%20Khoa%20(goi%20HDGS%202022)/157.pdf |
| PNT23-CT | Vai trò của cắt lớp vi tính trong đánh giá xâm lấn và di căn hạch vùng ở bệnh nhân ung thư tuyến giáp (BV Ung Bướu TP.HCM) | TC Y Dược học Phạm Ngọc Thạch 2(2) | 2023 | S | https://vjol.info.vn/pnt/vi/article/download/79831/68091/ |
| CTUMP23-TIRADS | Áp dụng EU-TIRADS 2017 phân tầng nguy cơ ác tính nốt giáp tại BV Ung bướu TP. Cần Thơ | TC Y Dược học Cần Thơ, số 65 | 2023 | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/1904/1591/10032 |
| CTUMP23-ATG | Nồng độ anti-thyroglobulin trong theo dõi ung thư tuyến giáp thể biệt hóa sau phẫu thuật và I-131 (BV Ung bướu Đà Nẵng) | TC Y Dược học Cần Thơ, số 58 | 2023 | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/709/604 |
| BVNTP-GPB1 | Giải phẫu bệnh học bệnh lý tuyến giáp P1 (bài giảng) | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-tuyen-giap-p1 |
| BVNTP-GPB2 | Giải phẫu bệnh học bệnh lý tuyến giáp P2 (bài giảng) | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-tuyen-giap-p2 |
| BVNTP-GPB3 | Giải phẫu bệnh học bệnh lý tuyến giáp P3 (bài giảng) | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-tuyen-giap-p3 |
| BVNTP-FNA | Chọc hút tế bào tuyến giáp bằng kim nhỏ (FNA) | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/choc-hut-te-bao-tuyen-giap-bang-kim-nho-fna-tuyen-giap |
| BVNTP-HASHI | Viêm tuyến giáp Hashimoto | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/noi-tiet/viem-tuyen-giap-hashimoto |
| BVNTP-BANCAP | Viêm tuyến giáp bán cấp | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/noi-tiet/viem-tuyen-giap-ban-cap |
| BVNTP-UTTG | Chẩn đoán và điều trị ung thư tuyến giáp | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/ung-buou/chan-doan-va-dieu-tri-ung-thu-tuyen-giap |
| BVNTP-UTTG2 | Ung thư tuyến giáp, phần 2 | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/noi-tiet/ung-thu-tuyen-giap-phan-2 |
| BVNTP-ACC | Các loại ung thư biểu mô vỏ thượng thận | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/noi-than-tiet-nieu/cac-loai-ung-thu-bieu-mo-vo-thuong-than |
| BVNTP-UTTT | Ung thư tuyến thượng thận | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/ung-buou/ung-thu-tuyen-thuong-than |
| BVNTP-PHEO | U tủy thượng thận (pheochromocytoma), phác đồ | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/phac-do-dieu-tri/u-tuy-thuong-than-pheochromocytoma |
| BVNTP-PIT | U tuyến yên (pituitary adenoma) | BV Nguyễn Tri Phương | – | S | https://bvnguyentriphuong.com.vn/noi-tiet/u-tuyen-yen-pituitary-adenoma |
| BVDHYD-NET | U thần kinh nội tiết: từ khái niệm đến chẩn đoán mô bệnh học | BV ĐH Y Dược TP.HCM | – | S | https://bvdaihoc.com.vn/en/health-library/u-than-kinh-noi-tiet-neuroendocrine-tumor-p-3796 |
| TCNCYH-MTC | Đặc điểm lâm sàng, cận lâm sàng ung thư tuyến giáp thể tủy tại BV K 2018-2023 | TCNCYH 181(8) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2613/1811/34882 |
| TCNCYH-PDTC | Ung thư tuyến giáp thể kém biệt hóa và không biệt hóa tại BV K 2018-2023 | TCNCYH 181(8) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2641/1812/34883 |
| TCNCYH-LN | Di căn hạch của ung thư tuyến giáp thể biệt hóa ở nam giới | TCNCYH 138(2) | 2021 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/81/56/103 |
| TCNCYH-PT | Đặc điểm lâm sàng, cận lâm sàng người bệnh ung thư tuyến giáp sau phẫu thuật (BV ĐH Y Hà Nội) | TCNCYH 159(11) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/1240/748 |
| TCNCYH-CCG | Ca lâm sàng u cận giáp lạc chỗ kèm tăng sản một tuyến cận giáp (BV Bạch Mai) | TCNCYH 152(4) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/666/499/8750 |
| TCNCYH-NB | Tiếp cận đa chiều chẩn đoán u nguyên bào thần kinh (run `wave1-molecular`) | TCNCYH 198(1) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4427/3056/60864 |
| BV103-UTTG | Chẩn đoán và điều trị ung thư tuyến giáp (bài giảng, BV Quân y 103) | BV Quân y 103 | – | N | https://www.benhvien103.vn/vanban/CHAN_DOAN_VA_DIEU_TRI_UNG_THU_TUYEN_GIAP.pdf |
| JMPM-TTT | Giải phẫu bệnh và triệu chứng lâm sàng, cận lâm sàng của u tuyến thượng thận tại BV Quân y 103 (trang tóm tắt) | TC Y Dược học Quân sự | 2024 | N | https://jmpm.vn/index.php/jmpm/article/view/666 |
| BYT1514 | Hướng dẫn chẩn đoán và điều trị một số bệnh ung bướu (QĐ 1514/QĐ-BYT ngày 01/4/2020), bản PDF | Bộ Y tế (đăng trên bvbnd.vn) | 2020 | O | https://www.bvbnd.vn/wp-content/uploads/2022/09/Phac-do-Ung-buoi_2020.pdf |

## Theo thuật ngữ

| EN | VI | Ghi chú trong glossary | Đếm lại offline |
|---|---|---|---|
| papillary thyroid carcinoma | carcinôm tuyến giáp dạng nhú (PTC) | freq 3 docs exact (+ 'carcinôm dạng nhú' 1, 'carcinoma tuyến giáp dạng nhú' 1); src: YHCM19-BGN, BVNTP-GPB1, YHCM09-FNA; 'dạng nhú' 10 docs (S8 N1 O1) vs 'thể nhú' 5 (S1 N3 O1); North / BYT 'ung thư biểu mô tuyến giáp thể nhú' 2; user decisions: thyroid deck 2026-07-17 (carcinôm, dạng nhú) + parent 'carcinôm nhú vi thể' | canonical: 3 tài liệu (S3); LOCAL_MORE x2, OK x4 |
| papillary carcinoma | carcinôm dạng nhú | freq 1 doc (8 hits) + title YHCM09-FNA; src: BVNTP-GPB3, YHCM09-FNA | canonical: 1 tài liệu (S1); OK |
| follicular thyroid carcinoma | carcinôm tuyến giáp dạng nang (FTC) | freq 2 docs S ('carcinôm tuyến giáp dạng nang' BVNTP-GPB2, 'carcinôm dạng nang' BVNTP-GPB3 x10) vs 'ung thư (biểu mô) tuyến giáp thể nang' 3 docs (S1 N1 O1); src: BVNTP-GPB2, BVNTP-GPB3, BYT1514; house form carcinôm + 'dạng' as PTC | canonical: 1 tài liệu (S1); LOCAL_MORE, OK_MANUAL; 1 + 1 như note: 'carcinôm tuyến giáp dạng nang' (BVNTP-GPB2) và 'carcinôm dạng nang' (BVNTP-GPB3) |
| follicular carcinoma | carcinôm dạng nang | freq 1 doc (10 hits); src: BVNTP-GPB3 | canonical: 1 tài liệu (S1); OK |
| minimally invasive follicular carcinoma | carcinôm dạng nang xâm lấn tối thiểu | freq 2 docs ('xâm lấn tối thiểu'); src: BYT1514, BV103-UTTG; Southern GPB BVNTP-GPB3 writes 'xâm nhập tối thiểu' (1 doc, 3 hits); parent capsular / vascular invasion = xâm lấn; DECISION (invasion verb) | canonical: 0 tài liệu; LOCAL_MORE |
| widely invasive follicular carcinoma | carcinôm dạng nang xâm lấn rộng | freq 4 docs ('xâm lấn rộng', S1 N2 O1); src: BYT1514, BV103-UTTG, TCNCYH-PDTC; vs 'xâm nhập lan rộng' 1 (BVNTP-GPB3) | canonical: 0 tài liệu; OK x2 |
| medullary thyroid carcinoma | carcinôm tuyến giáp dạng tủy (MTC) | freq 2 docs S for 'dạng tủy' (BVNTP-GPB3 'carcinôm tuyến giáp dạng tủy', BVNTP-UTTG2); src: BVNTP-GPB3, TCNCYH-MTC, BYT1514; 'thể tủy' 4 docs (S1 N2 O1; TCNCYH-MTC 'ung thư tuyến giáp thể tủy' x20); South first, same pattern as PTC; DECISION (near tie) | canonical: 1 tài liệu (S1); LOCAL_MORE, OK_MANUAL; số 2 (S2) thuộc 'dạng tủy' như note ghi; đúng cụm canonical 1 (BVNTP-GPB3) |
| poorly differentiated thyroid carcinoma | carcinôm tuyến giáp kém biệt hóa (PDTC) | freq 2 docs S exact; src: YHCM19-BGN, BVNTP-FNA, TCNCYH-PDTC; OVERRIDES parent 'ung thư biểu mô tuyến giáp biệt hóa kém': 'kém biệt hóa' 6 docs (S4 N1 O1) vs 'biệt hóa kém' 2 (S1 O1); North 'ung thư tuyến giáp thể kém biệt hóa' (TCNCYH-PDTC x15) | canonical: 2 tài liệu (S2); LOCAL_MORE, OK x2 |
| anaplastic thyroid carcinoma | carcinôm tuyến giáp thoái sản (ATC) | freq 0 exact; src: parent rule anaplastic = thoái sản (BYT1514 1 hit); OVERRIDES parent UTBM form with the carcinôm house form only; DECISION: VN literature names ATC 'không biệt hóa' 9 docs (S5 N3 O1) vs 'thoái sản' 1; 'carcinôm tuyến giáp không biệt hóa' 2 docs S (YHCM19-BGN, BVNTP-FNA) | canonical: 0 tài liệu; LOCAL_MORE, OK x3 |
| undifferentiated thyroid carcinoma | carcinôm tuyến giáp không biệt hóa | freq 2 docs S; src: YHCM19-BGN, BVNTP-FNA, TCNCYH-PDTC; parent undifferentiated = không biệt hóa | canonical: 2 tài liệu (S2); OK |
| differentiated thyroid carcinoma | ung thư tuyến giáp thể biệt hóa (DTC) | freq 5 docs (S3 N1 O1); src: CTUMP23-ATG, BVNTP-UTTG, TCNCYH-LN; vs 'ung thư tuyến giáp biệt hóa' 3, 'carcinôm tuyến giáp biệt hóa' 0; clinical umbrella term, VN keeps 'ung thư' | canonical: 6 tài liệu (S3 N2 O1); LOCAL_MORE x2, OK |
| differentiated thyroid cancer | ung thư tuyến giáp thể biệt hóa (DTC) | freq 5 docs (S3 N1 O1); src: CTUMP23-ATG, BVNTP-UTTG, TCNCYH-LN | canonical: 6 tài liệu (S3 N2 O1); LOCAL_MORE |
| differentiated high-grade thyroid carcinoma | carcinôm tuyến giáp biệt hóa độ cao (DHGTC) | freq 0; src: none (WHO 2022 entity); built: differentiated = biệt hóa, high-grade = độ cao (parent); UNRESOLVED | canonical: 0 tài liệu; OK |
| thyroid carcinoma | carcinôm tuyến giáp | freq 5 docs S (YHCM19-BGN x19); src: YHCM19-BGN, BVNTP-GPB2, BVNTP-FNA; vs 'ung thư biểu mô tuyến giáp' 5 docs (S2 N2 O1); house form | canonical: 5 tài liệu (S5); LOCAL_MORE, OK |
| thyroid cancer | ung thư tuyến giáp | freq 14 docs (S10 N3 O1); src: YHCM18-BD351, TCNCYH-PT, BYT1514 | canonical: 16 tài liệu (S10 N5 O1); LOCAL_MORE |
| oncocytic carcinoma | carcinôm tế bào ái toan | freq 0 exact; src: BVNTP-GPB3, BYT1514, BVNTP-UTTG2; WHO 2022 name of Hürthle cell carcinoma; parent oncocytic = ái toan ('ái toan' 6 docs S5 O1); VN names the entity by Hurthle ('ung thư tế bào Hurthle' 3 docs S1 N1 O1) | canonical: 0 tài liệu; LOCAL_MORE, OK x2 |
| Hürthle cell carcinoma | carcinôm tế bào Hurthle | freq 1 doc S exact + 'ung thư tế bào Hurthle' 3 docs; src: BVNTP-GPB3, BYT1514, BV103-UTTG | canonical: 0 tài liệu; OK, OK_MANUAL; BVNTP-GPB3 viết 'carcinôm tế bào Hürthle' 3 lần (chữ ü mất khi trích HTML nên bộ đếm tự động trả 0) |
| Hurthle cell carcinoma | carcinôm tế bào Hurthle | freq 1 doc S exact + 'ung thư tế bào Hurthle' 3 docs; src: BVNTP-GPB3, BYT1514, BV103-UTTG | canonical: 0 tài liệu; OK, OK_MANUAL; như dòng Hürthle cell carcinoma |
| Hürthle cell | tế bào Hurthle | freq 7 docs (S5 N1 O1); src: YHCM18-BD351, YHCM19-BGN, BVNTP-HASHI; spelling 'Hurthle' 7 docs vs 'Hürthle' 1 | canonical: 7 tài liệu (S5 N1 O1); OK x3 |
| Hurthle cell | tế bào Hurthle | freq 7 docs (S5 N1 O1); src: YHCM18-BD351, YHCM19-BGN, BVNTP-HASHI | canonical: 7 tài liệu (S5 N1 O1); OK |
| oncocytic adenoma | u tuyến tế bào ái toan | freq 0; src: built (adenoma = u tuyến, oncocytic = ái toan); old name 'u tế bào Hurthle' 2 docs S (YHCM18-BD351, YHCM19-BGN) | canonical: 0 tài liệu; OK x2 |
| follicular adenoma | u tuyến dạng nang | freq 3 docs S as 'u tuyến (tuyến) giáp dạng nang'; src: BVNTP-GPB2, BVNTP-FNA, YHCM09-FNA ('bướu tuyến dạng nang'); 'u dạng túi tuyến' 1 (YHCM19-BGN) | canonical: 0 tài liệu; OK, OK_MANUAL; 3 (S3) thuộc 'u tuyến (tuyến) giáp dạng nang' (BVNTP-GPB2, -GPB3, -FNA); YHCM09-FNA không có trong kho |
| follicular neoplasm | tân sinh dạng nang | freq 1 doc (YHCM19-BGN x2); src: YHCM19-BGN, BYT1514; Bethesda IV; same doc also 'u dạng túi tuyến' x3, BYT1514 'u dạng nang' 1, BV103 'tổn thương dạng nang' 1; parent neoplasm = tân sinh; LOW | canonical: 1 tài liệu (S1); LOCAL_MORE, OK x2 |
| suspicious for a follicular neoplasm | nghi ngờ tân sinh dạng nang | freq 0 exact; src: built from 'tân sinh dạng nang' + 'nghi ngờ' (3 docs); Bethesda IV | canonical: 0 tài liệu; OK |
| NIFTP | NIFTP | freq 0 VN form; src: none; kept English (no Vietnamese form in 33 local thyroid / endocrine documents) | canonical: 0 tài liệu; OK |
| noninvasive follicular thyroid neoplasm with papillary-like nuclear features | tân sinh tuyến giáp dạng nang không xâm lấn có đặc điểm nhân dạng nhú (NIFTP) | freq 0; src: built (neoplasm = tân sinh; 'không xâm lấn' 3 docs vs 'không xâm nhập' 1; 'đặc điểm nhân' 4 docs); UNRESOLVED | canonical: 0 tài liệu; LOCAL_MORE, OK x3 |
| non-invasive follicular thyroid neoplasm with papillary-like nuclear features | tân sinh tuyến giáp dạng nang không xâm lấn có đặc điểm nhân dạng nhú (NIFTP) | freq 0; src: built as the row above (hyphenated spelling) | canonical: 0 tài liệu; OK |
| follicular tumour of uncertain malignant potential | u dạng nang có tiềm năng ác tính không chắc chắn (FT-UMP) | freq 0; src: none; built; UNRESOLVED | canonical: 0 tài liệu; OK |
| well-differentiated tumour of uncertain malignant potential | u biệt hóa tốt có tiềm năng ác tính không chắc chắn (WDT-UMP) | freq 0; src: none; built (well-differentiated = biệt hóa tốt, parent); UNRESOLVED | canonical: 0 tài liệu; OK |
| hyalinizing trabecular tumour | u dạng bè hyalin hóa | freq 0; src: none; built (trabecular = dạng bè; parent 'hyalinizing clear cell carcinoma' = hyalin hóa); UNRESOLVED | canonical: 0 tài liệu; OK |
| primary thyroid lymphoma | lymphôm tuyến giáp nguyên phát | freq 1 doc ('lymphôm tuyến giáp'); src: YHCM19-BGN, BVNTP-UTTG2 ('u lympho tuyến giáp'), BVNTP-HASHI ('lymphoma tuyến giáp'); house form lymphôm (parent) | canonical: 0 tài liệu; OK |
| cribriform morular thyroid carcinoma | carcinôm tuyến giáp dạng sàng - phôi dâu | freq 0; src: none (WHO 2022 entity); built (cribriform = dạng sàng, parent); UNRESOLVED | canonical: 0 tài liệu; OK |
| tall cell subtype | biến thể tế bào cao | freq 3 docs ('tế bào cao', S1 N1 O1); src: BVNTP-GPB2, BYT1514, BV103-UTTG; WHO 2022 'subtype': VN literature still writes 'biến thể' (5 docs) | canonical: 0 tài liệu; LOCAL_MORE |
| tall cell variant | biến thể tế bào cao | freq 3 docs ('tế bào cao'); src: BVNTP-GPB2, BYT1514, BV103-UTTG | canonical: 0 tài liệu; LOCAL_MORE |
| columnar cell subtype | biến thể tế bào trụ | freq 1 doc; src: BVNTP-GPB3; parent columnar = trụ | canonical: 1 tài liệu (S1); OK |
| hobnail subtype | biến thể đinh mũ (hobnail) | freq 0; src: none; built; UNRESOLVED | canonical: 0 tài liệu; OK |
| diffuse sclerosing subtype | biến thể xơ hóa lan tỏa | freq 1 doc exact ('xơ hóa lan tỏa' 2 docs); src: BVNTP-GPB3, BYT1514; parent sclerosing = xơ hóa | canonical: 1 tài liệu (S1); LOCAL_MORE |
| diffuse sclerosing variant | biến thể xơ hóa lan tỏa | freq 1 doc exact; src: BVNTP-GPB3, BYT1514 | canonical: 1 tài liệu (S1); OK |
| solid subtype | biến thể đặc | freq 0 exact ('dạng đặc' 3 docs); src: YHCM19-BGN, BYT1514; parent solid = dạng đặc | canonical: 0 tài liệu; LOCAL_MORE |
| follicular variant | biến thể nang | freq 2 docs S; src: YHCM19-BGN, BVNTP-GPB3 ('carcinôm dạng nhú biến thể nang') | canonical: 2 tài liệu (S2); OK |
| follicular subtype | biến thể nang | freq 2 docs S; src: YHCM19-BGN, BVNTP-GPB3 | canonical: 2 tài liệu (S2); OK |
| infiltrative follicular subtype | biến thể nang thâm nhiễm | freq 0; src: built (parent infiltrative border = bờ thâm nhiễm) | canonical: 0 tài liệu; OK |
| classic subtype | biến thể kinh điển | freq 3 docs ('kinh điển', S2 O1) vs 'cổ điển' 1 (BYT1514); src: YHCM18-RFA, BVNTP-HASHI, BYT1514 | canonical: 0 tài liệu; LOCAL_MORE, OK |
| nuclear features of papillary thyroid carcinoma | đặc điểm nhân của carcinôm tuyến giáp dạng nhú | freq 4 docs ('đặc điểm nhân'); src: YHCM19-BGN, BVNTP-FNA, BYT1514 | canonical: 0 tài liệu; OK |
| papillary-like nuclear features | đặc điểm nhân dạng nhú | freq 0 exact; src: built ('đặc điểm nhân' 4 docs + dạng nhú) | canonical: 0 tài liệu; OK x2 |
| nuclear clearing | nhân sáng | freq 1 doc; src: BVNTP-GPB3; LOW | canonical: 1 tài liệu (S1); OK |
| ground-glass nuclei | nhân dạng kính mờ | freq 0; src: none; built; LOW | canonical: 0 tài liệu; OK |
| nuclear overlapping | nhân chồng chất | freq 2 docs S ('chồng chất'); src: BVNTP-GPB3, BVNTP-FNA | canonical: 0 tài liệu; OK_MANUAL; 2 (S2) thuộc 'chồng chất' như note ghi |
| nuclear enlargement | nhân to | freq 3 docs (S2 O1); src: BVNTP-GPB2, BVNTP-FNA, BYT1514 | canonical: 3 tài liệu (S2 O1); OK |
| intranuclear pseudoinclusion | giả thể vùi trong nhân | freq 1 doc ('giả thể vùi') + 'thể vùi trong nhân' 2 docs S; src: BVNTP-FNA, BVNTP-GPB3; = parent nuclear pseudoinclusion / pseudoinclusion | canonical: 1 tài liệu (S1); OK x2 |
| psammoma body | thể cát | freq 2 docs (BVNTP-GPB3, BYT1514) vs 'thể psammoma' 3 (S2 N1); src: BVNTP-GPB3, BYT1514; parent note psammoma body = thể cát (user deck) | canonical: 2 tài liệu (S1 O1); OK x2 |
| colloid | chất keo | freq 6 docs (S5 O1); src: BVNTP-GPB2, BVNTP-FNA, BYT1514 | canonical: 6 tài liệu (S5 O1); OK |
| colloid nodule | phình giáp keo | freq 0 in corpus; src: user glossary review (translator/glossary/glossary_review.csv: Colloid nodule -> Phình giáp keo); LOW | canonical: 0 tài liệu; OK |
| thyroid follicle | nang giáp | freq 7 docs (S6 N1); src: BVNTP-GPB1, BVNTP-GPB2, YHCM19-BGN | canonical: 7 tài liệu (S6 N1); OK |
| follicular cell | tế bào nang giáp | freq 6 docs (S5 N1); src: BVNTP-GPB2, BVNTP-FNA, TCNCYH-PDTC; 'tế bào tuyến giáp' 8 docs (generic) | canonical: 6 tài liệu (S5 N1); OK x2 |
| microfollicle | vi nang | freq 1 doc; src: BVNTP-FNA; BVNTP-GPB2 'nang nhỏ'; LOW | canonical: 1 tài liệu (S1); OK |
| C cell | tế bào C | freq 5 docs (S3 N2); src: BVNTP-GPB1, BVNTP-GPB3, TCNCYH-MTC | canonical: 5 tài liệu (S3 N2); OK |
| parafollicular cell | tế bào C cận nang | freq 0 exact; src: built ('tế bào C' 5 docs); LOW | canonical: 0 tài liệu; OK x2 |
| C-cell hyperplasia | tăng sản tế bào C | freq 1 doc; src: BV103-UTTG; parent hyperplasia = tăng sản | canonical: 1 tài liệu (N1); OK |
| germinal centre | trung tâm mầm | freq 4 docs (S3 O1); src: BVNTP-GPB1, BVNTP-FNA, BYT1514 | canonical: 4 tài liệu (S3 O1); OK |
| goiter | phình giáp | freq 4 docs S (Southern GPB: YHCM19-BGN result table, BVNTP-GPB1/2, BVNTP-FNA); src: YHCM19-BGN, BVNTP-GPB2, BVNTP-FNA; OVERRIDES parent 'nhân giáp' (the parent value of thyroid nodule); clinical 'bướu giáp' 8 docs (S6 N1 O1); user thyroid deck: phình giáp; DECISION | canonical: 4 tài liệu (S4); OK x2 |
| goitre | phình giáp | freq 4 docs S; src: YHCM19-BGN, BVNTP-GPB2, BVNTP-FNA; British spelling of the row above | canonical: 4 tài liệu (S4); OK |
| multinodular goiter | phình giáp đa nhân | freq 0 exact; src: BVNTP-GPB1 ('phình giáp đa cục'), BVNTP-FNA ('phình giáp đa hạt'), YHCM19-BGN ('bướu giáp đa nhân'); clinical 'bướu giáp đa nhân' 3 docs S; root kept as goiter; DECISION | canonical: 0 tài liệu; OK x2 |
| multinodular goitre | phình giáp đa nhân | freq 0 exact; src: as multinodular goiter (British spelling) | canonical: 0 tài liệu; OK |
| diffuse goiter | phình giáp lan tỏa | freq 1 doc; src: BVNTP-GPB2 | canonical: 1 tài liệu (S1); OK |
| dyshormonogenetic goiter | phình giáp loạn sinh hormon | freq 1 doc; src: BVNTP-GPB2 ('phình giáp loạn sinh hormôn') | canonical: 0 tài liệu; OK_MANUAL; 1 tài liệu viết 'hormôn' (BVNTP-GPB2) |
| diffuse toxic goiter | phình giáp độc lan tỏa | freq 1 doc; src: BVNTP-GPB2 | canonical: 1 tài liệu (S1); OK |
| Graves disease | bệnh Basedow (Graves) | freq 4 docs 'bệnh Basedow' ('Basedow' 6 docs S5 O1) vs 'bệnh Graves' 1; src: BVNTP-GPB2, BVNTP-HASHI, BYT1514 | canonical: 4 tài liệu (S3 O1); OK x3 |
| Hashimoto thyroiditis | viêm giáp Hashimoto | freq 8 docs S vs 'viêm tuyến giáp Hashimoto' 3 (S2 O1); src: YHCM19-BGN, BVNTP-GPB1, BVNTP-HASHI | canonical: 9 tài liệu (S9); LOCAL_MORE, OK |
| Hashimoto's thyroiditis | viêm giáp Hashimoto | freq 8 docs S; src: YHCM19-BGN, BVNTP-GPB1, BVNTP-HASHI; possessive spelling of the row above | canonical: 9 tài liệu (S9); LOCAL_MORE |
| lymphocytic thyroiditis | viêm giáp lympho bào | freq 0 exact ('viêm tuyến giáp lympho' 1); src: BVNTP-HASHI; built: viêm giáp + parent lymphocyte = lympho bào; LOW | canonical: 0 tài liệu; LOCAL_MORE |
| chronic lymphocytic thyroiditis | viêm giáp lympho bào mạn tính | freq 0 exact ('viêm giáp mạn' 2 docs S); src: YHCM16-SG, BVNTP-HASHI; built | canonical: 0 tài liệu; LOCAL_MORE |
| autoimmune thyroiditis | viêm giáp tự miễn | freq 4 docs S vs 'viêm tuyến giáp tự miễn' 2; src: YHCM16-SG, BVNTP-GPB1, BVNTP-UTTG2 | canonical: 4 tài liệu (S4); OK x2 |
| thyroiditis | viêm giáp | freq 9 docs S (65 hits) vs 'viêm tuyến giáp' 7 docs (S6 O1, 27 hits); src: YHCM16-SG, BVNTP-GPB1, BVNTP-HASHI | canonical: 11 tài liệu (S11); LOCAL_MORE x2 |
| subacute thyroiditis | viêm giáp bán cấp | freq 2 docs S vs 'viêm tuyến giáp bán cấp' 2 (tie); src: YHCM19-BGN, BVNTP-HASHI; same root as thyroiditis row | canonical: 2 tài liệu (S2); OK x2 |
| subacute granulomatous thyroiditis | viêm giáp bán cấp dạng u hạt (de Quervain) | freq 0 exact; src: BVNTP-GPB1 (de Quervain); built: granuloma = u hạt (parent) | canonical: 0 tài liệu; OK |
| Riedel thyroiditis | viêm giáp Riedel | freq 2 docs S; src: YHCM16-SG, BVNTP-GPB1 | canonical: 2 tài liệu (S2); OK |
| hypothyroidism | suy giáp | freq 8 docs (S6 N1 O1) vs 'nhược giáp' 3 (S2 O1); src: YHCM16-SG, BVNTP-HASHI, BYT1514 | canonical: 8 tài liệu (S6 N1 O1); OK x2 |
| euthyroid | bình giáp | freq 8 docs; src: YHCM16-SG, BVNTP-GPB1, BYT1514 | canonical: 8 tài liệu (S6 N1 O1); OK |
| thyrotoxicosis | nhiễm độc giáp | freq 4 docs (S3 O1); src: BVNTP-HASHI, BVNTP-BANCAP, BYT1514 | canonical: 4 tài liệu (S3 O1); OK |
| ectopic thyroid tissue | mô giáp lạc chỗ | freq 1 doc exact (5 hits); 'giáp lạc chỗ' 6 docs; src: BVNTP-GPB1, TCNCYH-CCG, BYT1514 | canonical: 1 tài liệu (S1); OK x2 |
| thyroglossal duct cyst | nang ống giáp lưỡi | freq 1 doc exact ('ống giáp lưỡi' 3 docs); src: BVNTP-UTTG2, BVNTP-GPB1; = pathology-headneck | canonical: 1 tài liệu (S1); LOCAL_MORE |
| Bethesda System for Reporting Thyroid Cytopathology | Hệ thống Bethesda báo cáo tế bào học tuyến giáp (TBSRTC) | freq 2 docs ('phân loại Bethesda'); src: YHCM19-BGN, BVNTP-FNA; built name; Bethesda kept | canonical: 0 tài liệu; OK |
| Bethesda category | nhóm Bethesda | freq 7 docs ('nhóm I-VI' in Bethesda tables, S5 N1 O1); src: YHCM19-BGN, PNT23-CT, BVNTP-FNA; title JCMHCH 'Bethesda nhóm IV' | canonical: 0 tài liệu; LOCAL_LESS; 'Bethesda' có trong 6 tài liệu (S4 N1 O1); các nhóm Bethesda dạng 'nhóm IV' thấy ở 4 (YHCM19-BGN, PNT23-CT, BVNTP-FNA, BYT1514); không xác nhận được 7 |
| nondiagnostic | không đủ tiêu chuẩn chẩn đoán | freq 1 doc; src: BVNTP-FNA; Bethesda I; LOW | canonical: 2 tài liệu (S1 N1); LOCAL_MORE |
| non-diagnostic | không đủ tiêu chuẩn chẩn đoán | freq 1 doc; src: BVNTP-FNA; Bethesda I; LOW | canonical: 2 tài liệu (S1 N1); LOCAL_MORE |
| atypia of undetermined significance | không điển hình có ý nghĩa không xác định (AUS) | freq 1 doc exact; src: YHCM18-CCG, BVNTP-FNA ('tế bào không điển hình'); Bethesda III; parent atypical = không điển hình | canonical: 1 tài liệu (S1); OK |
| follicular lesion of undetermined significance | tổn thương dạng nang có ý nghĩa không xác định (FLUS) | freq 0 exact; src: built as AUS row; Bethesda III (2010-2017) | canonical: 0 tài liệu; OK |
| suspicious for malignancy | nghi ngờ ác tính | freq 3 docs S; src: YHCM19-BGN, CTUMP23-TIRADS, BVNTP-FNA; Bethesda V | canonical: 3 tài liệu (S3); OK |
| risk of malignancy | nguy cơ ác tính | freq 1 doc (3 hits); src: CTUMP23-TIRADS; 'tỷ lệ ác tính' 4 docs is the observed rate | canonical: 1 tài liệu (S1); LOCAL_MORE, OK |
| TI-RADS | TI-RADS | freq 7 docs ('TI-RADS' / 'TIRADS'); src: CTUMP23-TIRADS, TCNCYH-LN, BYT1514; kept English | canonical: 2 tài liệu (S1 N1); OK_MANUAL; 'TI-RADS' 2 + 'TIRADS' 6, hợp lại 7 tài liệu |
| microcalcification | vi vôi hóa | freq 7 docs (S3 N3 O1); src: CTUMP23-TIRADS, TCNCYH-MTC, BYT1514 | canonical: 7 tài liệu (S3 N3 O1); OK |
| taller-than-wide | chiều cao lớn hơn chiều rộng | freq 2 docs; src: BVNTP-UTTG, BYT1514 | canonical: 2 tài liệu (S1 O1); OK |
| hypoechoic | giảm âm | freq 7 docs (S3 N3 O1) vs 'phản âm kém' 1 (YHCM19-BGN); src: CTUMP23-TIRADS, TCNCYH-MTC, BYT1514 | canonical: 7 tài liệu (S3 N3 O1); OK x2 |
| thyroidectomy | cắt tuyến giáp | freq 7 docs (S5 N1 O1); src: YHCM18-BD351, CTUMP23-ATG, BYT1514 | canonical: 9 tài liệu (S5 N3 O1); LOCAL_MORE |
| total thyroidectomy | cắt toàn bộ tuyến giáp | freq 8 docs (S2 N5 O1); src: BVNTP-UTTG, TCNCYH-LN, BYT1514; vs 'cắt giáp toàn bộ' 3, 'cắt tuyến giáp toàn bộ' 3, 'cắt trọn tuyến giáp' 2 (S) | canonical: 8 tài liệu (S2 N5 O1); OK x4 |
| near-total thyroidectomy | cắt gần trọn tuyến giáp | freq 1 doc + 'cắt giáp gần trọn' 1 (both S); src: YHCM21-CR120, BVNTP-GPB2 | canonical: 1 tài liệu (S1); OK x2 |
| subtotal thyroidectomy | cắt bán phần tuyến giáp | freq 1 doc; src: CTUMP23-ATG | canonical: 1 tài liệu (S1); OK |
| thyroid lobectomy | cắt thùy tuyến giáp | freq 0 exact ('cắt thùy' 5 docs, 'cắt 1 thùy (giáp)' 3); src: BVNTP-GPB3, TCNCYH-PT, BYT1514; parent lobectomy = cắt thùy | canonical: 0 tài liệu; LOCAL_MORE |
| hemithyroidectomy | cắt thùy tuyến giáp | freq 0 exact; src: as thyroid lobectomy | canonical: 0 tài liệu; OK |
| isthmusectomy | cắt eo tuyến giáp | freq 1 doc (3 hits); src: YHCM18-BD351 | canonical: 1 tài liệu (S1); OK |
| completion thyroidectomy | cắt hoàn tất tuyến giáp | freq 0 ('phẫu thuật lại' 3 docs, generic); src: none; built; UNRESOLVED | canonical: 0 tài liệu; LOCAL_MORE |
| central neck dissection | nạo vét hạch cổ trung tâm | freq 0 exact; 'vét hạch cổ' 7 docs (S1 N5 O1) vs 'nạo hạch cổ' 2 (S1 N1); src: BYT1514, TCNCYH-LN, BVNTP-UTTG; parent neck dissection = nạo vét hạch cổ; Southern surgery also 'nạo hạch' (YHCM18-BD351) | canonical: 0 tài liệu; OK x3 |
| lateral neck dissection | nạo vét hạch cổ bên | freq 0 exact; src: as central neck dissection; 'hạch cổ bên' 4 docs | canonical: 0 tài liệu; LOCAL_MORE, OK |
| level VI | nhóm VI | freq 7 docs (S5 N1 O1); src: YHCM19-BGN, BVNTP-UTTG, BYT1514; user rule level I-VI = nhóm I-VI (parent prompt) | canonical: 7 tài liệu (S5 N1 O1); OK |
| central neck lymph node | hạch cổ trung tâm | freq 5 docs (S1 N4); src: PNT23-CT, TCNCYH-MTC, TCNCYH-LN | canonical: 5 tài liệu (S1 N4); OK |
| lateral neck lymph node | hạch cổ bên | freq 4 docs (S1 N3); src: PNT23-CT, TCNCYH-MTC, TCNCYH-PDTC | canonical: 5 tài liệu (S1 N4); LOCAL_MORE |
| extrathyroidal extension | xâm lấn ra ngoài tuyến giáp (ETE) | freq 3 docs (S2 O1) vs 'xâm lấn ngoài tuyến giáp' 1 (N); src: CTUMP23-TIRADS, BVNTP-UTTG, BYT1514; same pattern as pathology-headneck ENE row | canonical: 3 tài liệu (S2 O1); OK x2 |
| gross extrathyroidal extension | xâm lấn ra ngoài tuyến giáp đại thể | freq 0; src: built (gross = đại thể, parent) | canonical: 0 tài liệu; OK |
| minimal extrathyroidal extension | xâm lấn ra ngoài tuyến giáp tối thiểu | freq 0; src: built | canonical: 0 tài liệu; OK |
| strap muscles | cơ trước giáp | freq 1 doc; src: TCNCYH-LN; 'cơ ức giáp' (one strap muscle) 2 docs; LOW | canonical: 1 tài liệu (N1); OK |
| extranodal extension | xâm lấn ra ngoài hạch (ENE) | freq 1 doc 'xâm lấn ngoài hạch' (BYT1514 x17); src: BYT1514; = pathology-headneck (sibling value) | canonical: 0 tài liệu; OK_MANUAL; 1 tài liệu thuộc 'xâm lấn ngoài hạch' (BYT1514, 17 lần) như note ghi |
| recurrent laryngeal nerve | thần kinh thanh quản quặt ngược | freq 3 docs exact (S1 N1 O1) + 'thần kinh quặt ngược' 5 docs; src: BVNTP-UTTG, BYT1514, BV103-UTTG | canonical: 4 tài liệu (S1 N2 O1); LOCAL_MORE x2 |
| frozen section | sinh thiết tức thì | freq 3 docs (S1 N1 O1) vs 'cắt lạnh' 1; src: TCNCYH-MTC, BVNTP-UTTG, BYT1514; OVERRIDES parent 'lát cắt lạnh' (roadmap decision 6); = pathology-headneck | canonical: 4 tài liệu (S1 N2 O1); LOCAL_MORE, OK |
| radioactive iodine | iod phóng xạ | freq 7 docs (S6 O1) vs 'i ốt phóng xạ' 1 (BV103-UTTG); src: BVNTP-UTTG2, CTUMP23-ATG, BYT1514 | canonical: 7 tài liệu (S6 O1); OK x2 |
| radioactive iodine-refractory | kháng iod phóng xạ | freq 0; src: built; LOW | canonical: 0 tài liệu; OK |
| calcitonin | calcitonin | freq 7 docs; src: TCNCYH-MTC, BVNTP-GPB3, BYT1514; kept English | canonical: 7 tài liệu (S4 N2 O1); OK |
| BRAF V600E | BRAF V600E | freq 2 docs; src: CTUMP23-TIRADS, BYT1514; kept English; = molecular-pathology | canonical: 2 tài liệu (S1 O1); OK |
| RET/PTC rearrangement | tái sắp xếp gen RET/PTC | freq 0; src: built as molecular-pathology 'ALK rearrangement = tái sắp xếp gen ALK'; gene names kept | canonical: 0 tài liệu; OK |
| PAX8::PPARG fusion | dung hợp gen PAX8::PPARG | freq 0; src: built as molecular-pathology 'ALK fusion = dung hợp gen ALK' | canonical: 0 tài liệu; OK |
| RAS mutation | đột biến gen RAS | freq 0 exact ('RAS' 2 docs); src: BVNTP-UTTG, BYT1514; form as molecular-pathology 'KRAS mutation' | canonical: 0 tài liệu; LOCAL_MORE |
| germline RET mutation | đột biến dòng mầm gen RET | freq 0; src: built (germline mutation = đột biến dòng mầm, molecular-pathology) | canonical: 0 tài liệu; OK |
| multiple endocrine neoplasia | đa u tuyến nội tiết (MEN) | freq 2 docs; src: BYT1514, BVDHYD-NET | canonical: 2 tài liệu (S1 O1); OK |
| multiple endocrine neoplasia type 1 | đa u tuyến nội tiết týp 1 (MEN1) | freq 2 docs ('MEN1' S); src: BVDHYD-NET, YHCM18-TUC | canonical: 0 tài liệu; OK |
| multiple endocrine neoplasia type 2 | đa u tuyến nội tiết týp 2 (MEN2) | freq 2 docs ('MEN 2'); src: BVNTP-UTTG, BYT1514 | canonical: 0 tài liệu; OK |
| parathyroid gland | tuyến cận giáp | freq 4 docs (S3 O1); src: YHCM18-CCG, BVNTP-GPB3, BYT1514 | canonical: 6 tài liệu (S3 N2 O1); LOCAL_MORE |
| parathyroid adenoma | u tuyến cận giáp | freq 2 docs (S1 N1) vs 'adenoma tuyến cận giáp' 1 (S); src: YHCM18-CCG, TCNCYH-CCG; parent adenoma = u tuyến | canonical: 2 tài liệu (S1 N1); OK x2 |
| parathyroid hyperplasia | tăng sản tuyến cận giáp | freq 1 doc; src: TCNCYH-CCG | canonical: 1 tài liệu (N1); OK |
| atypical parathyroid tumour | u tuyến cận giáp không điển hình | freq 0; src: built (WHO 2022; atypical = không điển hình, parent); LOW | canonical: 0 tài liệu; OK |
| parathyroid carcinoma | carcinôm tuyến cận giáp | freq 0 exact ('ung thư tuyến cận giáp' 1, N); src: TCNCYH-CCG; house form; LOW | canonical: 0 tài liệu; LOCAL_MORE |
| primary hyperparathyroidism | cường cận giáp nguyên phát | freq 2 docs (S1 N1, 35 hits); src: YHCM18-CCG, TCNCYH-CCG | canonical: 2 tài liệu (S1 N1); OK |
| secondary hyperparathyroidism | cường cận giáp thứ phát | freq 1 doc; src: YHCM18-CCG | canonical: 1 tài liệu (S1); OK |
| hyperparathyroidism | cường cận giáp | freq 3 docs; src: YHCM18-CCG, TCNCYH-CCG, BV103-UTTG | canonical: 3 tài liệu (S1 N2); OK |
| hypoparathyroidism | suy cận giáp | freq 3 docs (S2 N1) vs 'suy tuyến cận giáp' 1 (TCNCYH-PT); src: BVNTP-HASHI, YHCM18-RFA, BV103-UTTG | canonical: 3 tài liệu (S2 N1); OK x2 |
| hypocalcemia | hạ canxi máu | freq 2 docs (S1 N1) vs 'hạ calci máu' 1 (BYT1514); src: YHCM21-CR120, TCNCYH-PT | canonical: 2 tài liệu (S1 N1); OK x2 |
| hypocalcaemia | hạ canxi máu | freq 2 docs; src: YHCM21-CR120, TCNCYH-PT; British spelling | canonical: 2 tài liệu (S1 N1); OK |
| chief cell | tế bào chính | freq 2 docs; src: BVNTP-UTTG, BYT1514; LOW | canonical: 2 tài liệu (S1 O1); OK |
| adrenal gland | tuyến thượng thận | freq 15 docs (S11 N3 O1); src: YHCM16-USPM, BVNTP-UTTT, JMPM-TTT; = pathology-kidney | canonical: 13 tài liệu (S10 N2 O1); LOCAL_LESS; kho nội tiết có 13 (S10 N2 O1), không phải 15 |
| adrenal cortex | vỏ thượng thận | freq 4 docs (S2 N1 O1); src: BVNTP-ACC, BVNTP-UTTT, BYT1514 | canonical: 4 tài liệu (S2 N1 O1); OK |
| adrenal medulla | tủy thượng thận | freq 4 docs (S2 N1 O1); src: BVNTP-PHEO, BVNTP-UTTT, JMPM-TTT | canonical: 4 tài liệu (S2 N1 O1); OK |
| adrenal cortical adenoma | u tuyến vỏ thượng thận | freq 1 doc exact + 'u tuyến thượng thận' 2 docs; src: JMPM-TTT, YHCM16-USPM; parent adenoma = u tuyến | canonical: 1 tài liệu (N1); OK, OK_WIDER |
| adrenocortical adenoma | u tuyến vỏ thượng thận | freq 1 doc exact; src: JMPM-TTT | canonical: 1 tài liệu (N1); OK |
| adrenal cortical carcinoma | carcinôm vỏ thượng thận (ACC) | freq 0 exact; src: BVNTP-ACC ('ung thư biểu mô vỏ thượng thận' x16), BVNTP-UTTT + BYT1514 ('ung thư vỏ thượng thận' 2 docs); house form carcinôm; DECISION | canonical: 0 tài liệu; OK x2 |
| adrenocortical carcinoma | carcinôm vỏ thượng thận (ACC) | freq 0 exact; src: BVNTP-ACC, BVNTP-UTTT, BYT1514; as the row above | canonical: 0 tài liệu; OK |
| Weiss criteria | tiêu chuẩn Weiss | freq 0 (adrenal sense); src: none; built, name kept | canonical: 0 tài liệu; OK |
| pheochromocytoma | u tế bào ưa crom (pheochromocytoma) | freq 2 docs ('u tế bào ưa crom': BYT1514 x20, BVNTP-UTTT x20) vs 'u tủy thượng thận' 1 (BVNTP-PHEO title), 'u sắc bào' 1 (JMPM-TTT, N); src: BVNTP-UTTT, BYT1514, BVNTP-PHEO; EN kept in brackets (BVNTP-PHEO x16) | canonical: 2 tài liệu (S1 O1); OK x3 |
| paraganglioma | u cận hạch (paraganglioma) | freq 1 doc (Southern GPB x3); src: YHCM16-USPM; BVNTP-PHEO 'u hạch cận giao cảm'; LOW | canonical: 1 tài liệu (S1); OK |
| neuroblastoma | u nguyên bào thần kinh | freq 4 docs (S2 N1 O1); src: YHCM16-ARID1B, TCNCYH-NB, BYT1514 | canonical: 3 tài liệu (S1 N1 O1); OK_WIDER |
| Cushing syndrome | hội chứng Cushing | freq 6 docs; src: BVNTP-ACC, BVDHYD-NET, BYT1514 | canonical: 5 tài liệu (S4 O1); OK_WIDER |
| adrenal incidentaloma | u tuyến thượng thận phát hiện tình cờ | freq 1 doc ('bướu tuyến thượng thận phát hiện tình cờ', + EN incidentaloma); src: JMPM-TTT; LOW | canonical: 0 tài liệu; OK |
| pituitary gland | tuyến yên | freq 5 docs; src: BVNTP-PIT, YHCM16-SG, BYT1514 | canonical: 5 tài liệu (S4 O1); OK |
| pituitary adenoma | u tuyến yên | freq 3 docs (S2 O1); src: BVNTP-PIT, YHCM16-SG, BYT1514 | canonical: 3 tài liệu (S2 O1); OK |
| pituitary neuroendocrine tumour | u thần kinh nội tiết tuyến yên (PitNET) | freq 0; src: none (WHO 2022 name); built from the NET row (= pathology-gi 'u thần kinh nội tiết'); UNRESOLVED | canonical: 0 tài liệu; OK |
| pituitary neuroendocrine tumor | u thần kinh nội tiết tuyến yên (PitNET) | freq 0; src: none; as the row above (US spelling) | canonical: 0 tài liệu; OK |
| PitNET | PitNET | freq 0 VN form; src: none; kept English | canonical: 0 tài liệu; OK |
| prolactinoma | u tuyến yên tiết prolactin | freq 1 doc ('u tiết prolactin' x4); src: BVNTP-PIT | canonical: 0 tài liệu; OK |
| acromegaly | bệnh to đầu chi | freq 1 doc; src: BVNTP-PIT | canonical: 1 tài liệu (S1); OK |
| craniopharyngioma | u sọ hầu | freq 2 docs (S1 O1); src: BVNTP-PIT, BYT1514 | canonical: 2 tài liệu (S1 O1); OK |
| neuroendocrine tumour | u thần kinh nội tiết (NET) | freq 2 docs (S1 O1, 72 hits); src: BVDHYD-NET, BYT1514; = pathology-gi (sibling value) | canonical: 2 tài liệu (S1 O1); OK |
| neuroendocrine tumor | u thần kinh nội tiết (NET) | freq 2 docs; src: BVDHYD-NET, BYT1514; = pathology-gi | canonical: 2 tài liệu (S1 O1); OK |
| well-differentiated neuroendocrine tumour | u thần kinh nội tiết biệt hóa tốt | freq 1 doc ('NET ... biệt hóa tốt'); src: BVDHYD-NET | canonical: 0 tài liệu; OK_MANUAL; BVDHYD-NET có 'biệt hóa tốt' 7 lần cùng NET |
| neuroendocrine carcinoma | ung thư biểu mô thần kinh nội tiết (NEC) | freq 0 exact ('carcinoma thần kinh nội tiết' 1 doc, 'ung thư thần kinh nội tiết' 1); src: BVDHYD-NET; = pathology-gi value (siblings must agree); house form not applied here, see MINING_REPORT | canonical: 0 tài liệu; LOCAL_MORE |
| neuroendocrine neoplasm | tân sinh thần kinh nội tiết (NEN) | freq 0; src: built (neoplasm = tân sinh, parent; 'thần kinh nội tiết' 6 docs vs 'nội tiết thần kinh' 1) | canonical: 0 tài liệu; OK x2, OK_WIDER |
| Ki-67 index | chỉ số Ki-67 | freq 1 doc (10 hits); src: BVDHYD-NET; = pathology-breast / pathology-hpb | canonical: 1 tài liệu (S1); OK |
| Ki-67 proliferation index | chỉ số tăng sinh Ki-67 | freq 1 doc ('chỉ số tăng sinh'); src: BVDHYD-NET | canonical: 1 tài liệu (S1); OK |
| mitotic count | số phân bào | freq 1 doc (3 hits); src: BVDHYD-NET; = pathology-breast | canonical: 1 tài liệu (S1); OK |
| chromogranin A | chromogranin A | freq 4 docs; src: BVDHYD-NET, TCNCYH-NB, BYT1514; kept English | canonical: 3 tài liệu (S1 N1 O1); OK_WIDER |
| synaptophysin | synaptophysin | freq 4 docs; src: BVDHYD-NET, TCNCYH-NB, BYT1514; kept English | canonical: 3 tài liệu (S1 N1 O1); OK_WIDER |
| INSM1 | INSM1 | freq 1 doc; src: BVDHYD-NET; kept English | canonical: 1 tài liệu (S1); OK |
| somatostatin receptor | thụ thể somatostatin (SSTR) | freq 1 doc; src: BVDHYD-NET | canonical: 1 tài liệu (S1); OK |
