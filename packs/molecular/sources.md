# sources.md: molecular (Sinh học phân tử), draft 0.1.0

Nguồn bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm và mã trích dẫn; không chép câu nào từ bài báo.

## Cách đếm

- Kho: 40 tài liệu toàn văn tải bằng `tools/corpus_fetch.py` (run `wave1-molecular`, 56 request) vào `D:/vitranslate-corpus/raw/`, trích chữ bằng PyMuPDF, chuẩn hóa NFC, gộp dấu kiểu cũ (hoá = hóa), không phân biệt hoa / thường, khớp nguyên từ (không khớp bên trong từ khác).
- Vùng: **S** = tạp chí phía Nam (Tạp chí Y học TP.HCM, 21 tài liệu); **N** = Hà Nội / toàn quốc (TCNCYH 11, VJBT / TC KH&CN 7); **O** = văn bản chính thức (QĐ 3336/QĐ-BYT, bản sao vnras.com). Chưa có tài liệu miền Trung đọc được (JCMHCH yêu cầu đăng nhập để tải).
- "freq N docs (S.. N.. O..)" = số tài liệu có biến thể; "hits" = tổng số lần xuất hiện. Số thô, có lẫn phần tài liệu tham khảo; đã loại bằng tay các khớp sai đã biết (vd "toàn bộ gen" khi đếm "bộ gen"; "TMB" là cơ chất ELISA trong QĐ 3336).
- "low" = dưới 2 tài liệu hoặc dạng ghép từ quy ước; "UNRESOLVED" = không có dạng tiếng Việt nào trong kho và trong tìm kiếm có giới hạn tên miền.
- Không dùng số đếm của ô tìm kiếm OJS (bỏ từ dưới 3 chữ cái); không dùng MedEV.
- Luật chọn: dạng dùng nhiều nhất trong y văn bình duyệt, ưu tiên nguồn phía Nam; khi phía Nam không có dạng riêng thì lấy dạng toàn quốc. Hàng trùng khóa với pack `pathology` / `pathology-*` giữ đúng giá trị của pack đó (luật sở hữu); chỗ bằng chứng ngược lại được ghi "USER DECISION".

## Mã trích dẫn

| Mã | Bài | Tạp chí | Năm | Vùng | URL |
|---|---|---|---|---|---|
| YHCM21-LB | So sánh kiểu đột biến gen giữa mẫu sinh thiết lỏng và sinh thiết mô ở bệnh nhân ung thư đại trực tràng giai đoạn sớm | Y học TP.HCM 25(1):112 (chuyên đề CĐHA - SHPT) | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/112.pdf |
| YHCM21-NGSCRC | Khảo sát phổ đột biến ở bệnh nhân ung thư đại trực tràng giai đoạn sớm bằng kỹ thuật giải trình tự thế hệ mới | Y học TP.HCM 25(1):118 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/118.pdf |
| YHCM21-21GEN | Thiết lập quy trình khảo sát đột biến 21 gen ở bệnh nhân ung thư đại trực tràng trẻ tuổi bằng giải trình tự thế hệ mới | Y học TP.HCM 25(1):126 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/126.pdf |
| YHCM21-EGFR | Áp dụng sinh thiết lỏng phát hiện đột biến gen EGFR trên bệnh nhân ung thư phổi không tế bào nhỏ | Y học TP.HCM 25(1):138 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/138.pdf |
| YHCM21-MLPA | Ứng dụng kỹ thuật MLPA khảo sát nhóm gen gây bệnh thần kinh di truyền Charcot-Marie-Tooth | Y học TP.HCM 25(1):144 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/144.pdf |
| YHCM21-CML | Khảo sát các bất thường nhiễm sắc thể trên bệnh bạch cầu mạn dòng tủy | Y học TP.HCM 25(1):151 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/151.pdf |
| YHCM21-PROS1 | Tình trạng đột biến gen PROS1 trên bệnh nhân huyết khối tĩnh mạch sâu vô căn | Y học TP.HCM 25(1):158 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/158.pdf |
| YHCM21-MSC | Thiết lập quy trình thu nhận tế bào gốc trung mô từ mô mỡ thỏ | Y học TP.HCM 25(1):163 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/163.pdf |
| YHCM21-APOE | Tương quan kiểu gen, kiểu hình trong bệnh Alzheimer | Y học TP.HCM 25(1):171 | 2021 | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/171.pdf |
| YHCM16-EGFR | Xác định đột biến EGFR ở bệnh nhân ung thư phổi không tế bào nhỏ | Y học TP.HCM, Phụ bản 20(1) (Nội khoa I):104 | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%201cd%20noikhoa%20I/104.pdf |
| YHCM16-ARID1B | Làm giàu trình tự toàn bộ exon của gen ARID1B trong u nguyên bào thần kinh | Y học TP.HCM, Phụ bản 20(1) (Nội khoa II):144 | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%201cd%20noikhoa%202/144.pdf |
| YHCM16-PNT | Xác định đột biến gen EGFR và gen KRAS quyết định tính đáp ứng thuốc trong điều trị ung thư phổi không tế bào nhỏ (HNKH ĐH Y khoa Phạm Ngọc Thạch; đồng tác giả Hà Nội) | Y học TP.HCM, Phụ bản 20(2):241 | 2016 | S | https://tapchiyhoctphcm.vn/upload/2016/20%202phamngocthach/241.pdf |
| YHCM18-RAS | Phát hiện đột biến gen KRAS - NRAS (HNKH BV Bình Dân) | Y học TP.HCM, Phụ bản 22(2):255 | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/255.pdf |
| YHCM18-351 | Nghiên cứu ung thư tuyến giáp BV Bình Dân 2014-2016 | Y học TP.HCM, Phụ bản 22(2):351 | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/351.pdf |
| YHCM18-30 | Cập nhật chẩn đoán và vai trò của ung bướu nội khoa trong điều trị bướu biểu mô tuyến ức (tổng quan) | Y học TP.HCM, Phụ bản 22(2):30 | 2018 | S | https://tapchiyhoctphcm.vn/upload/2018/22%202%20binhdan/30.pdf |
| YHCM19-PDL1 | Tiến bộ trong điều trị ung thư trực tràng (tổng quan, HNKH ĐH Y khoa Phạm Ngọc Thạch) | Y học TP.HCM, Phụ bản 23(3):11 | 2019 | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20pnt/11.pdf |
| YHCM22-98 | Vai trò của cộng hưởng từ khuếch tán (chuyên đề CĐHA - YTCC; ngoài chủ đề, chỉ dùng cho 'tiên đoán') | Y học TP.HCM 26(2):98 | 2022 | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/98.pdf |
| YHCMD16-REV | Cập nhật khuyến cáo chẩn đoán và điều trị suy giáp 2016 (ngoài chủ đề) | Y học TP.HCM, Phụ bản 20(6):1 | 2016 | S | https://duoc.tapchiyhoctphcm.vn/upload/2016/20%206ndgd/001.pdf |
| YHCM25-MPI | Đột biến gene MPI và FOXP3 trên trẻ tiêu chảy kéo dài (BV Nhi Đồng Thành phố) | Y học TP.HCM 28(7):185 | 2025 | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S7/185.pdf |
| YHCM26-BRCA | Tỷ lệ đột biến gen BRCA trong ung thư tuyến tiền liệt giai đoạn tiến xa (ĐH Y Dược TP.HCM / BV Chợ Rẫy) | Y học TP.HCM 29(1):121 | 2026 | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S1/121.pdf |
| YHCM26-MRD | Khảo sát bệnh tồn lưu đo được trước và sau ghép (BV Truyền máu Huyết học TP.HCM) | Y học TP.HCM 29(11):111 | 2026 | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S11/111.pdf |
| TCNCYH21-REV | Kỷ nguyên mới của xét nghiệm di truyền | Nghiên cứu Y học 147(11) | 2021 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/508/273/5481 |
| TCNCYH24-MMR | Đặc điểm gen KRAS, BRAF, các gen sửa chữa ghép cặp sai (MMR) và tình trạng biểu hiện protein MMR ở người bệnh ung thư đại trực tràng | Nghiên cứu Y học 181(08) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2706/1776/34667 |
| TCNCYH25-CHKB | Xác định biến thể gây bệnh ở một gia đình mắc loạn dưỡng cơ bẩm sinh ty thể phì đại | Nghiên cứu Y học 195(10) | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3953/2713/54494 |
| TCNCYH-LUNGGEN | Một số bất thường gen ở bệnh nhân ung thư phổi không tế bào nhỏ tại BV ĐH Y Hà Nội | Nghiên cứu Y học 182(9) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2625/1847/35552 |
| TCNCYH-PANEL | Nghiên cứu phát triển bảng gen liên quan điều trị đích ở bệnh nhân ung thư phổi người Việt Nam | Nghiên cứu Y học 179(06) | 2024 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2472/1660/32639 |
| TCNCYH-DEL19 | Kết quả điều trị biến thể gen Del19/L858R trên bệnh nhân ung thư phổi mang đồng thời đột biến EGFR và đột biến gen khác | Nghiên cứu Y học 191(06) | 2025 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3438/2411/46273 |
| TCNCYH-EGFRSEQ | Xác định đột biến gen EGFR bằng kỹ thuật giải trình tự gen trên mẫu mô ung thư biểu mô phổi | Nghiên cứu Y học 160(12V2) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/1307/822/16192 |
| TCNCYH-CARRIER | Xác định người lành mang biến thể gen gây bệnh beta-thalassemia bằng giải trình tự gen Sanger và MLPA | Nghiên cứu Y học 165(4) | 2023 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/1502/1081/19072 |
| TCNCYH-NB | Tiếp cận đa chiều chẩn đoán u nguyên bào thần kinh từ một trường hợp đau khớp tái diễn ở trẻ nhỏ | Nghiên cứu Y học 198(01) | 2026 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4427/3056/60864 |
| TCNCYH-PDL1 | Đặc điểm bộc lộ PD-L1 trong ung thư biểu mô tuyến dạ dày | Nghiên cứu Y học 152(4) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/670/502/8753 |
| TCNCYH-MESO | U trung biểu mô màng phổi ác tính: tổng quan tài liệu và báo cáo ca bệnh | Nghiên cứu Y học 155(7) | 2022 | N | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/914/615/9292 |
| VJBT17-NGS | Ứng dụng công nghệ giải trình tự gen thế hệ mới và các phần mềm tin sinh học trong đánh giá sơ bộ biến thể di truyền ở người bệnh tự kỷ | Công nghệ Sinh học 15(3):433 | 2017 | N | https://vjs.ac.vn/vjbt/article/download/13372/382601/388239 |
| VJBT21-REV | Nghiên cứu phát triển dữ liệu lớn về hệ gen sinh vật và định hướng ứng dụng (tổng quan) | Công nghệ Sinh học 19(3):393 | 2021 | N | https://vjs.ac.vn/vjbt/article/download/16158/384771/408880 |
| VJBT-CLONE | Tách dòng và thiết kế vector chuyển gen mang gen IbOr từ khoai lang | Công nghệ Sinh học 15(2):341 | 2017 | N | https://vjs.ac.vn/vjbt/article/download/12351/381941/383548 |
| VJBT-CAF1 | Tổng hợp và biểu hiện gen caf1 mã hóa kháng nguyên F1 của Yersinia pestis | Công nghệ Sinh học 14(2):353 | 2016 | N | https://vjs.ac.vn/vjbt/article/download/9361/7617/34932 |
| VJBT-CRY2A | Nghiên cứu biểu hiện gen cry2A diệt ấu trùng ruồi nhà của Bacillus thuringiensis | Công nghệ Sinh học 15(3):563 | 2017 | N | https://vjs.ac.vn/vjbt/article/download/13393/382617/388285 |
| VJBT-CRISPR | Thiết kế vector CRISPR/Cas9 mang gRNA định hướng đột biến gen SlIAA9 của cà chua | Công nghệ Sinh học 18(1):147 | 2020 | N | https://vjs.ac.vn/vjbt/article/download/15273/383910 |
| JST13-TEV | Nghiên cứu tách dòng, biểu hiện và tinh chế TEV protease ở vi khuẩn Escherichia coli | Khoa học và Công nghệ 51(4):447 | 2013 | N | https://vjs.ac.vn/jst/article/download/9605/7948 |
| BYT-3336 | QĐ 3336/QĐ-BYT ngày 20/07/2017: Hướng dẫn quy trình kỹ thuật Huyết học - Truyền máu - Miễn dịch - Di truyền - Sinh học phân tử (bản sao) | Bộ Y tế | 2017 | O | https://vnras.com/huong-dan-quy-trinh-ky-thuat-huyet-hoc-truyen-mau-mien-dich-di-truyen-sinh-hoc-phan-tu-theo-bo-y-te-quyet-dinh-so-3336-qd-byt-ngay-20-07-2017/ |
| JCMHCH 1404 | Chẩn đoán tái sắp xếp gen ALK bằng hóa mô miễn dịch trong ung thư phổi loại carcinom tuyến tại BV Phạm Ngọc Thạch (chỉ tiêu đề; toàn văn cần đăng nhập) | Y học lâm sàng BV TW Huế 50 | 2018 | S (tác giả) | https://jcmhch.com.vn/index.php/home/article/view/1404 |

Nguồn khác: bản ghi người dùng đã duyệt trong `translator/glossary/usage_frequency.md` (gen dung hợp 2026-08-11; xác định kiểu gen 2026-08-13); đoạn trích tìm kiếm (snippet) chỉ dùng làm bằng chứng phụ và được ghi rõ.

## Bằng chứng theo thuật ngữ

| EN | VI (canonical) | Biến thể, số đếm, trích dẫn |
|---|---|---|
| gene | gen | freq 30 docs (S14 N15 O1), 2002 hits; alt: 'gene' 27 docs / 155 hits (incl. English references); decision 7; src: YHCM16-PNT, YHCM21-NGSCRC, YHCM18-RAS |
| DNA | DNA | kept EN: freq 25 docs (S13 N11 O1); alt: 'ADN' 3 docs (BYT-3336 73 hits, JST13-TEV, YHCM25-MPI 1); decision 7; src: YHCM21-21GEN, YHCM21-EGFR, YHCM21-LB |
| RNA | RNA | kept EN: freq 8 docs (S2 N5 O1); alt: 'ARN' 1 doc (BYT-3336 only); src: YHCM21-MSC, YHCM25-MPI, VJBT-CRISPR |
| mRNA | mRNA | kept EN: freq 4 docs (S2 N2); alt: 'RNA thông tin' 0; src: YHCM21-PROS1, YHCM21-APOE, TCNCYH21-REV |
| cDNA | cDNA | kept EN: freq 5 docs (S1 N3 O1); src: YHCM21-PROS1, JST13-TEV, VJBT-CLONE |
| complementary DNA | DNA bổ sung (cDNA) | freq 1 doc S; 'cDNA' kept 5 docs; src: YHCM16-EGFR, YHCM21-PROS1; low |
| genomic DNA | DNA bộ gen | freq 1 doc S (2 hits); alt: 'DNA tổng số' 2 docs N (plant papers), 'DNA genome' 1 N; follows genome = bộ gen; src: YHCM21-APOE, VJBT-CRISPR, TCNCYH-LUNGGEN; low |
| genome | bộ gen | freq (genome sense, 'toàn bộ gen' false hits removed) S5 + N5 docs; alt: 'hệ gen' 8 docs, S0 (VJBT21-REV 238 hits, TCNCYH21-REV 16); EN 'genome' 15 docs; Southern-first; USER DECISION (hệ gen vs bộ gen); src: YHCM21-APOE, YHCM25-MPI, YHCM26-BRCA |
| reference genome | bộ gen tham chiếu | freq 2 docs (S1 N1); alt: 'hệ gen tham chiếu' 2 docs N (VJBT), 'bộ gen tham khảo' 1 S; src: YHCM25-MPI, TCNCYH-LUNGGEN, YHCM21-21GEN |
| nucleic acid | acid nucleic | freq 1 doc N; alt: 'axit nucleic' 0 (acid / axit as in 'acid amin' 7:2); src: VJBT21-REV; low |
| nucleic acid extraction | tách chiết acid nucleic | compositional: 'tách chiết' 19 docs (S12) + 'acid nucleic'; see DNA extraction |
| nucleotide | nucleotide | kept EN: freq 16 docs (S6 N10); alt: 'nucleotid' 5, 'nucleotit' 3; src: YHCM16-ARID1B, YHCM21-NGSCRC, YHCM21-21GEN |
| chromosome | nhiễm sắc thể | freq 12 docs (S6 N5 O1); 'NST' is an in-paper abbreviation (YHCM21-CML 187 hits), not a translation; src: YHCM21-CML, YHCM25-MPI, YHCM21-MLPA |
| chromatin | nhiễm sắc chất | freq 1 doc S ('nhiễm sắc chất (chromatin)'); src: YHCM16-ARID1B; low |
| chromatin remodeling | tái cấu trúc nhiễm sắc chất | freq 1 doc S; src: YHCM16-ARID1B; low |
| mutant allele | alen đột biến | freq 3 docs (S1 N2); 'alen' 9 docs (S4 N4 O1) vs 'allele' 3 docs: decision 7 = alen; the bare key 'allele' belongs to pathology (= 'allele') until pathology 0.2.0; src: YHCM16-PNT, TCNCYH25-CHKB, TCNCYH-EGFRSEQ |
| allele frequency | tần suất alen | compositional (alen, decision 7); exact phrase 0 in corpus; low |
| locus | locus | kept EN: freq 1 doc N; alt: 'vị trí gen' 0; src: VJBT21-REV; low |
| exon | exon | = pathology; kept EN 8+ docs; src: YHCM16-EGFR, YHCM21-EGFR, TCNCYH-EGFRSEQ |
| intron | intron | kept EN ('vùng intron'); src: TCNCYH-CARRIER, TCNCYH24-MMR |
| exome | exome | kept EN: freq 6 docs (S1 N5); src: VJBT17-NGS, VJBT21-REV, YHCM16-ARID1B |
| codon | codon | kept EN: freq 8 docs (S5 N3); alt: 'bộ ba' 6 docs (N only, VJBT); Southern-first; src: YHCM16-PNT, YHCM16-EGFR, YHCM21-PROS1 |
| stop codon | mã kết thúc | freq 2 docs N; alt: 'codon kết thúc' 0, 'bộ ba kết thúc' 0; src: TCNCYH-CARRIER, VJBT17-NGS; low |
| reading frame | khung đọc | freq 2 docs N; src: TCNCYH25-CHKB, VJBT17-NGS; low |
| amino acid | acid amin | freq 7 docs (S4 N3); alt: 'axit amin' 2 docs, EN 'amino acid' 7 docs (mostly VJBT); src: YHCM16-EGFR, YHCM21-PROS1, YHCM25-MPI |
| promoter | vùng khởi động (promoter) | EN 'promoter' kept 6 docs (S3 N3); alt: 'vùng khởi động' 1 S, 'vùng promoter' 1 S; same form as pathology 'TERT promoter mutation'; src: YHCM21-PROS1, YHCM25-MPI, VJBT-CLONE |
| transcription | phiên mã | freq 8 docs (S3 N4 O1); alt: 'sao mã' 0; src: YHCM25-MPI, YHCM21-NGSCRC, YHCM16-ARID1B |
| reverse transcription | phiên mã ngược | freq 1 doc (BYT-3336); RT-PCR itself kept EN; low |
| transcription factor | nhân tố phiên mã | freq 2 docs S; alt: 'yếu tố phiên mã' 1 doc S; src: YHCM21-NGSCRC, YHCM16-ARID1B, YHCM25-MPI; low |
| mRNA translation | dịch mã | freq 1 doc N; bare 'translation' is not a key (ordinary English word); src: TCNCYH25-CHKB; low |
| protein translation | dịch mã | as 'mRNA translation' |
| splicing | cắt nối | freq 1 doc S (2 hits) + EN 'splicing' 1 S; 'ghép nối' 2 docs N is ligation, not splicing; src: YHCM25-MPI; low |
| splice site | vị trí cắt nối | freq 0 exact; built on 'cắt nối'; low |
| exon skipping | bỏ qua exon | freq 0 in corpus; low; the gene symbol stays (MET exon 14 skipping) |
| gene expression | biểu hiện gen | freq 8 docs (S2 N6); alt: 'bộc lộ gen' 0; decision 5: compound key, the bare key 'expression' (= bộc lộ, protein / IHC) belongs to pathology; src: YHCM21-MSC, YHCM25-MPI, VJBT-CAF1 |
| mRNA expression | biểu hiện mRNA | decision 5 (gene / mRNA = biểu hiện); exact phrase 0; low |
| gene expression profiling | phân tích biểu hiện gen | TCNCYH21-REV writes 'xét nghiệm phân tích biểu hiện gen'; freq 1; low |
| expression vector | vector biểu hiện | freq 4 docs N; src: VJBT-CAF1, VJBT-CRY2A, JST13-TEV |
| recombinant protein | protein tái tổ hợp | freq 3 docs N; src: VJBT-CRY2A, JST13-TEV, VJBT-CAF1 |
| recombinant protein expression | biểu hiện protein tái tổ hợp | 'biểu hiện protein' in the recombinant sense 3 docs N (VJBT-CRY2A 5, VJBT-CAF1, JST13-TEV); the IHC sense stays 'bộc lộ' (pathology) |
| fusion protein | protein dung hợp | freq 3 docs N; alt: 'protein lai' 1; src: JST13-TEV, VJBT-CAF1, VJBT-CRY2A |
| heterozygous | dị hợp tử | freq 6 docs (S2 N3 O1); short form 'dị hợp' 8 docs; src: YHCM25-MPI, YHCM21-MLPA, TCNCYH25-CHKB |
| homozygous | đồng hợp tử | freq 6 docs (S2 N3 O1); src: YHCM21-MLPA, YHCM25-MPI, TCNCYH25-CHKB |
| hemizygous | bán hợp tử | freq 1 doc S (4 hits); src: YHCM25-MPI; low |
| genotype | kiểu gen | freq 8 docs (S2 N5 O1); alt: 'kiểu gene' 0; src: YHCM21-APOE, YHCM25-MPI, TCNCYH25-CHKB |
| phenotype | kiểu hình | freq 12 docs (S7 N4 O1); src: YHCM21-APOE, YHCM21-CML, YHCM21-MLPA |
| genotyping | xác định kiểu gen (genotyping) | = pathology; freq 1 doc N ('xác định kiểu gen' 2 = 'định kiểu gen' 2); approved by the user 2026-08-13 (translator glossary, GTD deck); EN 'genotyping' kept 2 docs; src: VJBT21-REV, YHCM21-EGFR; low |
| haplotype | haplotype | kept EN: freq 1 doc N; alt: 'kiểu đơn bội' 0; src: VJBT-CRY2A; low |
| mutation | đột biến | freq 27 docs (S13 N13 O1); src: YHCM16-PNT, YHCM16-EGFR, YHCM21-EGFR |
| variant | biến thể | freq 13 docs (S5 N8); alt: 'biến dị' 3; germline papers say 'biến thể', tumour papers 'đột biến': translate the source word; src: YHCM21-APOE, YHCM21-21GEN, YHCM25-MPI |
| genetic variant | biến thể di truyền | freq 2+ docs S; src: YHCM25-MPI, YHCM21-21GEN |
| genetic alteration | biến đổi di truyền | freq 1 doc S; src: YHCM26-MRD; low |
| point mutation | đột biến điểm | = pathology; freq 9 docs (S4 N5); src: YHCM21-EGFR, YHCM21-NGSCRC, TCNCYH-CARRIER |
| deletion | mất đoạn | = pathology; freq 10 docs (S4 N6); alt: 'xóa đoạn' 5 docs (S2 N3); src: YHCM21-MLPA, YHCM21-EGFR, TCNCYH-CARRIER |
| insertion | chèn đoạn | = pathology (roadmap test); freq 4 docs (S1 N3); alt: 'thêm đoạn' 5 docs (S3 N2): the South prefers 'thêm đoạn' 3:1; USER DECISION; src: YHCM21-EGFR, TCNCYH24-MMR, TCNCYH21-REV |
| duplication | lặp đoạn | freq 3 docs (S1 N2); alt: 'nhân đoạn' 2 docs N; src: YHCM21-MLPA, TCNCYH-CARRIER, TCNCYH-LUNGGEN |
| inversion | đảo đoạn | freq 0 in corpus (standard cytogenetic form); low |
| translocation | chuyển đoạn | = pathology; freq 2 docs S (YHCM21-NGSCRC 10, YHCM26-MRD 2); alt: 'chuyển vị' 1 doc S (YHCM21-CML 28); src: YHCM21-NGSCRC, YHCM26-MRD, YHCM21-CML |
| indel | indel | kept EN: freq 1 doc N; the Southern NGS paper writes 'đột biến mất/thêm đoạn ngắn'; src: VJBT17-NGS, YHCM21-NGSCRC; low |
| missense mutation | đột biến sai nghĩa | freq 5 docs (S2 N3) for 'sai nghĩa'; alt: 'nhầm nghĩa' 1; src: YHCM21-PROS1, YHCM25-MPI, TCNCYH24-MMR |
| missense variant | biến thể sai nghĩa | as 'missense mutation' |
| nonsense mutation | đột biến vô nghĩa | freq 3 docs (S1 N2); src: YHCM21-PROS1, TCNCYH24-MMR, TCNCYH25-CHKB |
| nonsense variant | biến thể vô nghĩa | as 'nonsense mutation' |
| frameshift mutation | đột biến dịch khung | freq 'dịch khung' 2 docs N (7 hits); alt: 'lệch khung' 1 doc N; South 0; src: TCNCYH24-MMR, TCNCYH25-CHKB, VJBT17-NGS; low |
| frameshift variant | biến thể dịch khung | freq 1 doc N ('biến thể dịch khung'); src: TCNCYH25-CHKB |
| synonymous variant | biến thể đồng nghĩa | exact 0 ('đồng nghĩa' 3 docs, generic); low |
| polymorphism | đa hình | freq 5 docs (S1 N3 O1); src: YHCM21-APOE, VJBT21-REV, VJBT17-NGS |
| single nucleotide polymorphism | đa hình đơn nucleotide (SNP) | freq 1 doc N + 'SNP' 2 docs N; src: VJBT21-REV, VJBT17-NGS; low |
| de novo mutation | đột biến de novo | 'de novo' kept 3 docs (S1 N2); alt: 'mới phát sinh' 1 doc N; pathology's bare 'de novo' (= nguyên phát) is the clinical sense; src: YHCM21-NGSCRC, TCNCYH25-CHKB, TCNCYH-CARRIER |
| germline | dòng mầm | = pathology; freq 5 docs (S4 N1); src: YHCM21-21GEN, YHCM26-BRCA, YHCM21-NGSCRC |
| somatic | sinh dưỡng | = pathology; freq 5 docs (S4 N1); alt: 'soma' 2 docs; src: YHCM26-BRCA, YHCM21-LB, YHCM21-21GEN |
| wild-type | kiểu hoang dã | = pathology 'wild type'; corpus: 'kiểu dại' 1 doc (BYT-3336 only), 'kiểu hoang dã' 0, papers write 'không đột biến' (5 docs, S4) or keep 'wild-type'; decision 7 (< 3 docs: kiểu hoang dã (wild-type)); value kept identical to pathology until both packs change |
| loss of function | mất chức năng | freq 1 doc S (2 hits); src: YHCM25-MPI; low |
| gain of function | tăng chức năng | freq 0; paired with 'loss of function'; low |
| methylation | methyl hóa | = pathology; freq 3 docs S; src: YHCM21-LB, YHCM16-ARID1B, YHCM25-MPI |
| DNA methylation | methyl hóa DNA | compositional ('methyl hóa' 3 docs S); = pathology 'DNA methylation profiling' pattern |
| methylation-specific PCR | PCR đặc hiệu methyl hóa (MSP) | pathology note of 'methylation'; corpus 0; low |
| CpG island | đảo CpG | freq 0; low |
| epigenetics | biểu sinh | = pathology; freq 1 doc N; alt: 'ngoại di truyền' 1 doc S (YHCM16-ARID1B 2); src: TCNCYH25-CHKB, YHCM16-ARID1B; low |
| microsatellite | vi vệ tinh | = pathology; src: TCNCYH24-MMR |
| tyrosine kinase | tyrosine kinase | kept EN: freq 8 docs (S5 N3); src: YHCM16-EGFR, YHCM21-EGFR, TCNCYH-DEL19 |
| receptor tyrosine kinase | thụ thể tyrosine kinase | 'thụ thể' 8 docs (S3) + kept 'tyrosine kinase' |
| signaling pathway | con đường tín hiệu | freq 4 docs (S3 N1); alt: 'đường dẫn truyền tín hiệu' 2, 'con đường dẫn truyền tín hiệu' 1; src: YHCM21-NGSCRC, YHCM21-EGFR, YHCM16-ARID1B |
| signalling pathway | con đường tín hiệu | as 'signaling pathway' |
| cell cycle | chu kỳ tế bào | freq 0 in corpus (standard form); low |
| DNA repair | sửa chữa DNA | freq 2 docs S; src: YHCM26-BRCA, YHCM21-NGSCRC |
| molecular biology | sinh học phân tử | journal section title (YHCM T25 S1, chuyên đề SHPT) + BYT-3336 title |
| molecular marker | chỉ thị phân tử | Southern snippet: Can Tho University journal title 'Chỉ thị phân tử là gen chức năng' (sj.ctu.edu.vn); plan 4.2 unverified; GPB 'marker' stays 'dấu ấn'; low (snippet only) |
| polymerase chain reaction | phản ứng chuỗi polymerase (PCR) | freq 1 doc (BYT-3336, 4 hits); papers write 'PCR' (25 docs); src: BYT-3336 |
| PCR | PCR | kept EN: freq 25 docs (S12 N12 O1); src: YHCM16-ARID1B, YHCM21-21GEN, YHCM21-MSC |
| real-time PCR | real-time PCR | kept EN: 'real-time PCR' 3 docs (S1 N1 O1), 'realtime PCR' 3 docs; 'PCR thời gian thực' 0; src: YHCM16-PNT, TCNCYH-EGFRSEQ, BYT-3336 |
| quantitative PCR | PCR định lượng (qPCR) | freq 1 doc S + 'qPCR' 2 docs; src: YHCM26-MRD, BYT-3336; low |
| qPCR | qPCR | kept EN: freq 2 docs (S1 O1); src: YHCM26-MRD, BYT-3336 |
| RT-PCR | RT-PCR | kept EN: freq 6 docs (S2 N3 O1); alt: 'PCR phiên mã ngược' 0; src: YHCM21-MSC, YHCM21-CML, BYT-3336 |
| RT-qPCR | RT-qPCR | kept EN: freq 1 doc S; src: YHCM26-MRD |
| digital PCR | PCR kỹ thuật số | = pathology; corpus 0 (YHCM26-MRD writes 'dPCR'); low |
| droplet digital PCR | PCR kỹ thuật số dạng giọt (ddPCR) | corpus 0; 'ddPCR' kept (= pathology); low |
| ddPCR | ddPCR | = pathology; kept EN |
| multiplex PCR | multiplex PCR | kept EN: 'multiplex' 7 docs (S4 N3); 'PCR đa mồi' 0 in corpus; low |
| colony PCR | colony PCR | kept EN: freq 1 doc N (13 hits); alt: 'PCR trực tiếp từ khuẩn lạc' 2 docs N; src: VJBT-CLONE, VJBT-CRY2A |
| primer | mồi | freq 19 docs (S7 N11 O1); alt: 'đoạn mồi' 5 docs; src: YHCM16-ARID1B, YHCM21-MSC, YHCM21-21GEN |
| primer pair | cặp mồi | freq 14 docs (S5 N8 O1); src: YHCM16-ARID1B, YHCM21-21GEN, YHCM16-PNT |
| forward primer | mồi xuôi | freq 10 docs (S3 N6 O1); alt: 'mồi thuận' 0; src: YHCM21-MSC, YHCM16-EGFR, TCNCYH-PANEL |
| reverse primer | mồi ngược | freq 10 docs (S3 N6 O1); alt: 'mồi nghịch' 0; src: YHCM21-MSC, YHCM16-ARID1B, TCNCYH-PANEL |
| annealing | bắt cặp | freq 6 docs (S3 N3); alt: 'gắn mồi' 2 docs (S1 N1), 'ủ mồi' 0; src: YHCM16-ARID1B, YHCM21-NGSCRC, YHCM16-EGFR |
| annealing temperature | nhiệt độ bắt cặp | freq 2 docs S; alt: 'nhiệt độ gắn mồi' 1 doc N; src: YHCM16-EGFR, YHCM16-ARID1B, VJBT-CRISPR |
| denaturation | biến tính | freq 8 docs (S4 N3 O1); src: YHCM16-EGFR, YHCM21-NGSCRC, YHCM21-MLPA |
| amplification | khuếch đại | freq 17 docs (S9 N7 O1); alt: 'nhân bản' 4; src: YHCM16-ARID1B, YHCM16-EGFR, YHCM21-21GEN |
| amplicon | amplicon | kept EN: freq 3 docs (S2 O1); alt: 'sản phẩm khuếch đại' 3 docs; src: YHCM21-21GEN, YHCM16-ARID1B, BYT-3336 |
| PCR product | sản phẩm PCR | freq 14 docs (S6 N7 O1); src: YHCM16-ARID1B, YHCM21-MSC, YHCM21-21GEN |
| template DNA | DNA khuôn | freq 1 doc N + 'khuôn' 7 docs (N6 O1); src: VJBT-CRY2A, VJBT-CRISPR; low |
| thermal cycler | máy luân nhiệt | freq 1 doc (BYT-3336); alt: 'máy PCR' 1 (BYT); low |
| melting temperature | nhiệt độ nóng chảy (Tm) | freq 1 doc N; src: TCNCYH-PANEL; low |
| high-resolution melting | phân tích nóng chảy độ phân giải cao (HRM) | corpus 0; JSTD (VNU-HCM) title snippet keeps 'PCR HRM'; low |
| cycle threshold | chu kỳ ngưỡng (Ct) | corpus 0; low |
| TaqMan probe | mẫu dò TaqMan | decision 7 (PCR / NGS probe = mẫu dò): 'mẫu dò' 8 docs (S5 N2 O1) vs 'đầu dò' 3 docs; counterexample: YHCM26-MRD writes 'mồi và đầu dò' for dPCR; bare 'probe' forbidden (owners.csv); src: YHCM21-EGFR, YHCM21-APOE, BYT-3336 |
| hydrolysis probe | mẫu dò thủy phân | decision 7; exact phrase 0; low |
| hybridization probe | mẫu dò lai | decision 7; exact phrase 0; low |
| capture probe | mẫu dò bắt giữ | decision 7; Southern NGS papers write 'hỗn hợp mẫu dò' (YHCM21-LB, YHCM21-EGFR); exact phrase 0; low |
| FISH probe | đầu dò FISH | decision 7 (FISH probe = đầu dò); BYT-3336 FISH chapter: 'probe' 33, 'đầu dò' 4; = pathology break-apart / fusion probe |
| fluorescence | huỳnh quang | freq 5 docs (S2 N2 O1); src: YHCM21-NGSCRC, YHCM16-EGFR, BYT-3336 |
| fluorescent dye | chất nhuộm huỳnh quang | freq 1 doc S; alt: 'màu huỳnh quang' 2 docs (S1 O1); src: YHCM21-NGSCRC, YHCM16-EGFR; low |
| electrophoresis | điện di | freq 15 docs (S7 N7 O1); src: YHCM21-MLPA, YHCM16-ARID1B, YHCM16-EGFR |
| gel electrophoresis | điện di trên gel | freq 7 docs (S3 N3 O1); alt: 'điện di gel' 1; src: YHCM21-LB, YHCM21-NGSCRC, YHCM21-MSC |
| agarose gel | gel agarose | freq 9 docs (S3 N5 O1); alt: 'thạch agarose' 1 S; src: YHCM21-LB, YHCM21-NGSCRC, YHCM21-MSC |
| agarose gel electrophoresis | điện di trên gel agarose | compositional; src: JST13-TEV, VJBT-CRISPR, YHCM21-MSC |
| capillary electrophoresis | điện di mao quản | freq 2 docs (S1 N1); src: YHCM21-MLPA, TCNCYH-CARRIER |
| polyacrylamide gel | gel polyacrylamide | freq 1 doc N; src: JST13-TEV; low |
| SDS-PAGE | SDS-PAGE | kept EN: freq 2 docs N; src: VJBT-CRY2A, VJBT-CAF1 |
| DNA band | băng DNA | 'băng' 9 docs (S3 N5 O1); alt: 'vạch' 5 docs (BYT-3336 37 hits); src: YHCM16-ARID1B, VJBT-CLONE, VJBT-CAF1 |
| DNA ladder | thang DNA | freq 2 docs N; alt: 'thang chuẩn' 2; src: VJBT-CAF1, VJBT-CLONE; low |
| DNA extraction | tách chiết DNA | freq 11 docs (S8 N3); alt: 'ly trích DNA' 3 docs (S3), 'tách DNA' 1; 'tách chiết' alone 19 docs (S12) vs 'ly trích' 5 (S5); src: YHCM21-EGFR, YHCM21-MLPA, YHCM21-APOE |
| RNA extraction | tách chiết RNA | freq 1 doc S; as DNA extraction; src: YHCM21-MSC; low |
| purification | tinh sạch | freq 16 docs (S6 N9 O1); alt: 'tinh chế' 2 docs; src: YHCM21-21GEN, YHCM21-MLPA, YHCM16-EGFR |
| DNA purity | độ tinh sạch DNA | 'độ tinh sạch' 7 docs (S3 N3 O1); src: YHCM21-MLPA, YHCM16-EGFR, TCNCYH-EGFRSEQ |
| quantification | định lượng | freq 14 docs (S11 N2 O1); src: YHCM26-MRD, YHCM21-PROS1, YHCM25-MPI |
| sequencing | giải trình tự | freq 28 docs (S12 N15 O1); alt: 'xác định trình tự' 6 docs N (VJBT), 'đọc trình tự' 5; src: YHCM21-NGSCRC, YHCM21-21GEN, YHCM16-ARID1B |
| DNA sequencing | giải trình tự DNA | compositional; src: TCNCYH-CARRIER |
| gene sequencing | giải trình tự gen | compositional; TCNCYH-EGFRSEQ title |
| Sanger sequencing | giải trình tự Sanger | freq 7 docs (S4 N3); alt: 'giải trình tự gen Sanger' 2 docs N; src: YHCM21-21GEN, YHCM16-ARID1B, TCNCYH-CARRIER |
| next generation sequencing | giải trình tự thế hệ mới (NGS) | = pathology; 'giải trình tự thế hệ mới' 12 docs (S8 N4) vs 'giải trình tự gen thế hệ mới' 14 docs (S7 N7): tie, South slightly without 'gen'; src: YHCM21-APOE, YHCM21-21GEN, YHCM21-LB |
| NGS | NGS | kept EN: freq 15 docs (S8 N7); src: YHCM21-21GEN, YHCM21-EGFR, YHCM26-BRCA |
| targeted sequencing | giải trình tự vùng gen mục tiêu | Southern NGS paper: 'vùng gen mục tiêu được làm giàu' (YHCM21-NGSCRC); exact phrase 0; low |
| whole-exome sequencing | giải trình tự toàn bộ exon (WES) | S1 doc ('giải trình tự toàn bộ exon (WES)', YHCM21-NGSCRC); alt N: 'giải trình tự (toàn bộ) vùng mã hóa' 2 docs, 'giải trình tự hệ gen mã hóa' 1 (TCNCYH21-REV); Southern-first; low |
| whole-genome sequencing | giải trình tự toàn thể bộ gen (WGS) | S1 doc ('giải trình tự toàn thể bộ gen (WGS)', YHCM21-NGSCRC); alt N: 'giải trình tự toàn bộ hệ gen' 1 doc (TCNCYH21-REV 3); follows genome = bộ gen; low |
| pyrosequencing | pyrosequencing | kept EN: freq 1 doc S (16 hits); src: YHCM16-EGFR |
| library preparation | chuẩn bị thư viện | freq 7 docs (S5 N1 O1); alt: 'tạo thư viện' 5 docs (S4 N1), 'xây dựng thư viện' 2; src: YHCM21-EGFR, YHCM21-LB, YHCM21-NGSCRC |
| sequencing library | thư viện giải trình tự | 'thư viện' 10 docs (S5 N4 O1); compositional |
| adapter | adapter | kept EN: freq 3 docs (S2 N1) + 'adaptor' 2; src: YHCM21-21GEN, YHCM21-EGFR, VJBT17-NGS |
| hybrid capture | lai và bắt giữ (hybrid capture) | freq 1 doc S ('lai và bắt giữ'), 'bắt giữ' 2 docs S; src: YHCM21-APOE, YHCM21-NGSCRC; low |
| enrichment | làm giàu | freq 6 docs (S5 N1); src: YHCM21-NGSCRC, YHCM21-EGFR, YHCM16-ARID1B |
| sequencing platform | hệ thống giải trình tự | freq 4 docs S; alt: 'máy giải trình tự' 5 docs (S3 N2); src: YHCM21-APOE, YHCM21-NGSCRC, YHCM16-ARID1B |
| sequencer | máy giải trình tự | freq 5 docs (S3 N2); src: YHCM21-21GEN, YHCM21-EGFR, VJBT17-NGS |
| hybridization | phản ứng lai | freq 4 docs (S2 N1 O1); alt: 'lai phân tử' 2 docs N; src: YHCM21-MLPA, YHCM21-APOE, BYT-3336 |
| in situ hybridization | lai tại chỗ (ISH) | = pathology-breast; corpus 1 doc N ('lai tại chỗ'); src: TCNCYH21-REV |
| FISH | lai tại chỗ huỳnh quang (FISH) | = pathology; corpus: 'lai tại chỗ huỳnh quang' 1 doc N vs 'lai huỳnh quang tại chỗ' 2 docs (BYT-3336, TCNCYH-LUNGGEN), 'FISH' kept 6 docs; word order open (plan 4.2): USER DECISION with pathology 0.2.0 |
| fluorescence in situ hybridization | lai tại chỗ huỳnh quang (FISH) | as 'FISH' |
| Western blot | Western blot | kept EN: freq 2 docs N; src: VJBT-CAF1, VJBT-CRY2A |
| ELISA | ELISA | kept EN: freq 2 docs (S1 O1); src: YHCM21-PROS1, BYT-3336 |
| flow cytometry | đếm tế bào dòng chảy (flow cytometry) | = pathology; BYT-3336 keeps 'flow cytometry' 37 hits + 'tế bào dòng chảy' 11 |
| MLPA | MLPA | kept EN: freq 3 docs (S1 N2); src: YHCM21-MLPA, TCNCYH-CARRIER, TCNCYH21-REV |
| multiplex ligation-dependent probe amplification | multiplex ligation-dependent probe amplification (MLPA) | the Southern paper keeps the full English name (YHCM21-MLPA title); src: YHCM21-MLPA, TCNCYH-CARRIER |
| microarray | microarray | kept EN: freq 2 docs N; src: TCNCYH21-REV, VJBT21-REV |
| cell culture | nuôi cấy tế bào | freq 5 docs (S2 N2 O1); src: YHCM21-MSC, YHCM21-CML, VJBT-CAF1 |
| cell line | dòng tế bào | freq 10 docs (S6 N3 O1); src: YHCM21-MSC, YHCM21-21GEN, BYT-3336 |
| culture medium | môi trường nuôi cấy | freq 2 docs N; src: VJBT-CAF1, VJBT-CRISPR |
| stem cell | tế bào gốc | freq 6 docs (S4 N1 O1); src: YHCM21-MSC, YHCM21-LB, YHCM25-MPI |
| mesenchymal stem cell | tế bào gốc trung mô | freq 1 doc S (24 hits); src: YHCM21-MSC |
| transfection | chuyển nhiễm | corpus 0 (VJBT 'chuyển gen' is plant transformation); standard form; low |
| transgenic | chuyển gen | freq 4 docs N; src: VJBT-CLONE, VJBT-CRISPR, VJBT-CRY2A |
| bacterial transformation | biến nạp | freq 5 docs N ('biến nạp'); alt: 'chuyển dạng' 1 (malignant sense only); the bare key 'transformation' is forbidden (owners.csv); src: VJBT-CLONE, VJBT-CAF1, VJBT-CRISPR |
| cloning | tách dòng | freq 4 docs N (46 hits); alt: 'nhân dòng' 4 docs (7 hits), 'tạo dòng' 1, 'dòng hóa' 1; South 0; src: VJBT-CLONE, JST13-TEV, VJBT-CRY2A |
| gene cloning | tách dòng gen | freq 4 docs N; src: VJBT-CLONE, VJBT-CRY2A, JST13-TEV |
| cloning vector | vector tách dòng | freq 3 docs N; src: VJBT-CLONE, VJBT-CAF1, VJBT-CRY2A |
| plasmid | plasmid | kept EN: freq 4 docs N; src: VJBT-CRISPR, JST13-TEV, VJBT-CLONE |
| recombinant | tái tổ hợp | freq 6 docs (N5 O1); src: JST13-TEV, VJBT-CRY2A, VJBT-CAF1 |
| competent cells | tế bào khả biến | freq 2 docs N; src: VJBT-CRISPR, VJBT-CLONE |
| bacterial colony | khuẩn lạc | freq 5 docs N; src: VJBT-CLONE, VJBT-CRISPR, JST13-TEV |
| restriction enzyme | enzyme giới hạn | freq 4 docs N; alt: 'enzyme cắt giới hạn' 1; src: VJBT-CLONE, VJBT-CAF1, JST13-TEV |
| ligase | ligase | kept EN: freq 6 docs (S2 N4); src: YHCM21-MLPA, YHCM21-21GEN, VJBT-CLONE |
| DNA polymerase | DNA polymerase | kept EN: 'polymerase' 7 docs (S3 N3 O1); src: YHCM16-EGFR, YHCM16-ARID1B, BYT-3336 |
| enzyme | enzyme | freq 14 docs (S6 N7 O1); alt: 'enzym' 6 docs; src: YHCM21-MSC, YHCM25-MPI, YHCM21-MLPA |
| reverse transcriptase | enzyme phiên mã ngược | corpus: EN 1 doc N; built on 'phiên mã ngược'; low |
| CRISPR/Cas9 | CRISPR/Cas9 | kept EN: freq 1 doc N (31 hits); src: VJBT-CRISPR |
| guide RNA | RNA dẫn đường (gRNA) | freq 1 doc N + 'gRNA' kept 25 hits; src: VJBT-CRISPR; low |
| gene editing | chỉnh sửa gen | freq 1 doc N (4 hits); src: VJBT-CRISPR; low |
| gene knockout | bất hoạt gen (knockout) | freq 1 doc N ('bất hoạt gen' 4); src: VJBT-CRISPR; low |
| RNA interference | can thiệp RNA (RNAi) | freq 1 doc N; src: VJBT-CRISPR; low |
| microRNA | microRNA (miRNA) | kept EN: 'miRNA' 1 doc S; src: YHCM16-ARID1B; low |
| mitochondrial DNA | DNA ty thể (mtDNA) | 'mtDNA' 1 doc N; VN form 0 in corpus; low |
| negative control | chứng âm | freq 5 docs (S2 N2 O1); alt: 'đối chứng âm' 2 docs N; src: YHCM16-ARID1B, YHCM21-MSC, BYT-3336 |
| positive control | chứng dương | freq 4 docs (S2 N1 O1); alt: 'đối chứng dương' 1 N; src: YHCM21-21GEN, YHCM21-EGFR, BYT-3336 |
| internal control | chứng nội | freq 2 docs (S1 O1); src: YHCM25-MPI, BYT-3336; low |
| limit of detection | ngưỡng phát hiện (LOD) | freq 1 doc S ('ngưỡng phát hiện') + 'LOD (limit of detection)' 1 doc S; 'giới hạn phát hiện' 0; src: YHCM21-21GEN, YHCM21-EGFR; low |
| analytical sensitivity | độ nhạy phân tích | freq 1 doc S; src: YHCM26-MRD; low |
| sensitivity | độ nhạy | freq 9 docs (S5 N4); plan: molecular owns the bare key; src: YHCM21-EGFR, YHCM21-21GEN, YHCM16-PNT |
| specificity | độ đặc hiệu | freq 4 docs (S2 N2); src: YHCM21-EGFR, YHCM21-21GEN, TCNCYH24-MMR |
| cross-contamination | nhiễm chéo | freq 1 doc (BYT-3336 3); low |
| commercial kit | bộ kit thương mại | 'bộ kit' 16 docs (S8 N7 O1); alt: 'bộ hóa chất' 5 (S4), 'bộ sinh phẩm' 1 (BYT); no bare key 'kit': keys are case-insensitive and 'kit' = the gene KIT; src: YHCM21-EGFR, YHCM21-APOE, YHCM21-LB |
| extraction kit | bộ kit tách chiết | as 'commercial kit'; src: YHCM21-EGFR, YHCM21-LB |
| reagent | hóa chất | freq 9 docs (S7 N1 O1); alt: 'thuốc thử' and 'sinh phẩm' in BYT-3336 only; src: YHCM21-LB, YHCM21-EGFR, YHCM16-PNT |
| buffer | dung dịch đệm | freq 4 docs (S1 N2 O1); src: YHCM16-EGFR, BYT-3336, VJBT-CRY2A |
| whole blood | máu toàn phần | freq 5 docs (S2 N2 O1); src: YHCM21-LB, YHCM21-PROS1, TCNCYH-CARRIER |
| peripheral blood | máu ngoại vi | freq 7 docs (S4 N2 O1); src: YHCM21-APOE, YHCM21-21GEN, YHCM21-EGFR |
| bioinformatics | tin sinh học | freq 2 docs N; src: VJBT21-REV, VJBT17-NGS |
| sequence alignment | sắp gióng trình tự | S1 doc ('sắp gióng cột các trình tự', YHCM21-21GEN) vs N 'gióng hàng' 1 doc (VJBT17-NGS 11); bare 'alignment' forbidden; Southern-first; USER DECISION (bioinformatics pack); low |
| sequencing read | trình tự đọc | freq 2 docs (S1 N1); alt: 'đoạn đọc' 2 docs (N1 O1); Southern-first; src: YHCM21-21GEN, VJBT17-NGS |
| variant calling | phát hiện biến thể (variant calling) | 'phát hiện biến thể' 5 docs (S3 N2); alt: 'xác định biến thể' 2; low |
| variant annotation | chú giải biến thể | 'chú giải' 2 docs N; alt: 'chú thích' 2; src: VJBT21-REV, VJBT17-NGS; low |
| mutation detection | phát hiện đột biến | freq 16 docs (S9 N6 O1); src: YHCM26-BRCA, YHCM21-21GEN, YHCM21-EGFR |
