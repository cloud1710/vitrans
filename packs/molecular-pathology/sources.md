# sources.md: molecular-pathology (Bệnh học phân tử ung thư), draft 0.1.0

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
| molecular pathology | bệnh học phân tử | pack scope (plan 1.2); journal usage 'sinh học phân tử' for the technique; low |
| molecular diagnosis | chẩn đoán phân tử | compositional; low |
| molecular testing | xét nghiệm sinh học phân tử | freq 1 doc (BYT-3336 2 hits); alt: 'xét nghiệm phân tử' 1 doc N; papers mostly write 'xét nghiệm (đột biến) gen' (9 docs); low |
| mutation testing | xét nghiệm đột biến gen | freq 8 docs (S3 N5); src: YHCM16-PNT, YHCM21-EGFR, TCNCYH24-MMR |
| molecular classification | phân loại phân tử | compositional; low |
| molecular subtype | phân nhóm phân tử | compositional; low |
| integrated diagnosis | chẩn đoán tích hợp | WHO 5th edition concept (plan 1.2); corpus 0; low |
| somatic mutation | đột biến sinh dưỡng | freq 4 docs (S4); alt: 'đột biến soma' 2 docs (S1 N1); = pathology 'somatic'; src: YHCM26-BRCA, YHCM21-21GEN, YHCM21-LB |
| germline mutation | đột biến dòng mầm | freq 4 docs (S3 N1); alt: 'đột biến di truyền' 2, 'đột biến mầm' 1; src: YHCM21-21GEN, YHCM26-BRCA, YHCM21-NGSCRC |
| somatic variant | biến thể sinh dưỡng | compositional (somatic = sinh dưỡng, variant = biến thể); low |
| germline variant | biến thể dòng mầm | compositional; low |
| driver mutation | đột biến điều khiển (driver mutation) | = pathology; corpus: no Vietnamese form (0 of 40 docs); snippet of a BV K paper (JCMHCH 2393) has 'đột biến gen dẫn đường'; USER DECISION |
| co-mutation | đồng đột biến | freq 1 doc N; alt: 'đột biến đi kèm' 1 doc N; src: TCNCYH-DEL19; low |
| actionable | có thể điều trị nhắm trúng đích | no Vietnamese term in the corpus ('actionable' only in English references, 2 docs); Southern papers paraphrase with 'có thuốc điều trị' (YHCM21-21GEN, YHCM21-EGFR) and 'điều trị nhắm trúng đích' (5 docs, S4); USER DECISION |
| actionable mutation | đột biến có thể điều trị nhắm trúng đích | as 'actionable' |
| sensitizing mutation | đột biến nhạy cảm | freq 1 doc N (+ 'đột biến nhạy' 1); roadmap test; src: TCNCYH-LUNGGEN; low |
| resistance mutation | đột biến kháng thuốc | freq 1 doc S (3 hits); src: YHCM16-PNT |
| acquired resistance | kháng thuốc thứ phát | S1 doc ('kháng thuốc thứ phát', YHCM16-PNT); 'kháng thuốc mắc phải' 0 in corpus (JCMHCH snippet 'T790M thứ phát/mắc phải'); roadmap suggested 'mắc phải': USER DECISION; low |
| primary resistance | kháng thuốc nguyên phát | freq 1 doc S (2 hits); src: YHCM16-PNT |
| tumor mutational burden | gánh nặng đột biến khối u (TMB) | UNRESOLVED: no Vietnamese form in 40 docs or 2 targeted searches (BYT-3336 'TMB' is the ELISA substrate); roadmap seed form; TMB stays |
| tumour mutational burden | gánh nặng đột biến khối u (TMB) | as 'tumor mutational burden' |
| TMB | TMB | kept EN |
| TMB-high | TMB cao | compositional; low |
| microsatellite instability | mất ổn định vi vệ tinh (MSI) | = pathology-gi (freq 6 + BYT 4); corpus here 1 doc N; src: TCNCYH24-MMR |
| microsatellite instability-high | mất ổn định vi vệ tinh mức độ cao (MSI-H) | freq 1 doc N; src: TCNCYH24-MMR |
| MSI-H | MSI-H | kept EN; src: TCNCYH24-MMR |
| microsatellite stable | ổn định vi vệ tinh (MSS) | freq 1 doc N; src: TCNCYH24-MMR |
| MSS | MSS | kept EN; src: TCNCYH24-MMR |
| mismatch repair | sửa chữa ghép cặp sai | freq 1 doc N (5 hits) vs 'bắt cặp sai' 1; = pathology-gi; src: TCNCYH24-MMR |
| mismatch repair deficiency | thiếu hụt hệ thống sửa chữa ghép cặp sai (dMMR) | = pathology-gi; TCNCYH24-MMR writes 'mất biểu hiện protein MMR (dMMR)' 14x for the IHC result (decision 5 keeps 'bộc lộ') |
| mismatch repair-deficient | thiếu hụt hệ thống sửa chữa ghép cặp sai (dMMR) | as 'mismatch repair deficiency' |
| dMMR | dMMR | kept EN: freq 1 doc N (17 hits); src: TCNCYH24-MMR |
| mismatch repair-proficient | bảo toàn protein MMR (pMMR) | freq 1 doc N ('Bảo toàn protein MMR (pMMR)'); src: TCNCYH24-MMR; low |
| pMMR | pMMR | kept EN: freq 1 doc N; src: TCNCYH24-MMR |
| mismatch repair protein | protein sửa chữa ghép cặp sai (MMR) | = pathology-gi |
| loss of MMR protein expression | mất bộc lộ protein MMR | decision 5 + pathology 'loss of expression' = mất bộc lộ; evidence against: TCNCYH24-MMR 'mất biểu hiện protein MMR' 14 vs 'bộc lộ' 1 (GPB + genetics authors, Hanoi); no Southern count; USER DECISION |
| Lynch syndrome | hội chứng Lynch | = pathology-gi |
| homologous recombination repair | sửa chữa tái tổ hợp tương đồng (HRR) | freq 1 doc S (5 hits, Chợ Rẫy / UMP); src: YHCM26-BRCA |
| HRR | HRR | kept EN; src: YHCM26-BRCA |
| homologous recombination deficiency | thiếu hụt tái tổ hợp tương đồng (HRD) | UNRESOLVED: 0 in corpus and 1 targeted search; built from HRR (S) + 'thiếu hụt' (dMMR pattern) |
| HRD | HRD | kept EN |
| PARP inhibitor | thuốc ức chế PARP | freq 1 doc S; src: YHCM26-BRCA |
| BRCA mutation | đột biến gen BRCA | freq 1 doc S (8 hits) = 'đột biến BRCA' (9, same doc); pattern of 'đột biến gen EGFR'; src: YHCM26-BRCA |
| genomic instability | mất ổn định bộ gen | freq 1 doc S ('mất ổn định của bộ gen'); src: YHCM26-BRCA; low |
| loss of heterozygosity | mất dị hợp tử | = pathology |
| LOH | LOH | kept EN (= pathology note) |
| copy number | số lượng bản sao | freq 3 docs (S1 N2); alt: 'số bản sao' 2 docs (S1 N1); = pathology 'copy number alteration'; src: YHCM26-MRD, TCNCYH-LUNGGEN, VJBT21-REV |
| copy number variation | biến thể số lượng bản sao (CNV) | alt: 'biến thể số bản sao' 1 doc N (TCNCYH21-REV 3), 'biến đổi số lượng bản sao' 1 doc N; built on 'số lượng bản sao'; low |
| copy number variant | biến thể số lượng bản sao (CNV) | as 'copy number variation' |
| copy number alteration | biến đổi số lượng bản sao | = pathology |
| copy number gain | tăng số lượng bản sao | compositional; low |
| copy number loss | giảm số lượng bản sao | compositional; low |
| CNV | CNV | kept EN: freq 1 doc N; src: TCNCYH21-REV |
| gene amplification | khuếch đại gen | = pathology; freq 3 docs (S1 N2) |
| MET amplification | khuếch đại gen MET | compositional (gene amplification = khuếch đại gen); MET kept |
| HER2 amplification | khuếch đại gen HER2 | plan 4.2 snippet 'khuếch đại gen HER2'; compositional |
| MYCN amplification | khuếch đại gen MYCN | compositional; MYCN kept; src: TCNCYH-NB |
| fusion | dung hợp | = pathology; freq 7 docs (S1 N6) |
| gene fusion | dung hợp gen | = pathology; freq 2 docs N (21 hits) |
| fusion gene | gen dung hợp | approved by the user 2026-08-11 (translator usage_frequency, a private deck); Southern haematology writes 'tổ hợp gen BCR::ABL1' (YHCM21-CML, YHCM26-MRD): for the haematology pack to decide |
| fusion transcript | bản phiên mã dung hợp | = pathology |
| fusion partner | đối tác dung hợp | = pathology |
| rearrangement | tái sắp xếp | = pathology; freq 2 docs (S1 N1); alt: 'sắp xếp lại' 1 N |
| ALK rearrangement | tái sắp xếp gen ALK | = pathology-respiratory; + JCMHCH 1404 title (BV Phạm Ngọc Thạch, TP.HCM) |
| ALK fusion | dung hợp gen ALK | = pathology-respiratory; freq 2 docs N; src: TCNCYH-LUNGGEN, TCNCYH-PANEL |
| ROS1 rearrangement | tái sắp xếp gen ROS1 | = pathology-respiratory |
| ROS1 fusion | dung hợp gen ROS1 | compositional (as ALK fusion) |
| RET fusion | dung hợp gen RET | compositional |
| NTRK fusion | dung hợp gen NTRK | compositional |
| exon 19 deletion | mất đoạn exon 19 | freq 3 docs (S1 N2); alt: 'xóa đoạn exon 19' 1 doc N (9 hits); src: YHCM21-EGFR, TCNCYH-PANEL, TCNCYH-DEL19 |
| exon 20 insertion | chèn đoạn exon 20 | S: 'chèn đoạn exon 20' and 'thêm đoạn trên exon 20' (both in YHCM21-EGFR); N: 'thêm đoạn exon 20' 1 (TCNCYH-EGFRSEQ); follows insertion = chèn đoạn (USER DECISION) |
| exon 14 skipping | bỏ qua exon 14 | corpus 0; low; MET kept |
| EGFR mutation | đột biến gen EGFR | = pathology-respiratory; freq 6 docs vs 'đột biến EGFR' 7 docs (S3 each) |
| EGFR-mutant | có đột biến gen EGFR | compositional |
| KRAS mutation | đột biến gen KRAS | freq 7 docs (S5 N2); alt: 'đột biến KRAS' 6 docs (S4 N2); src: YHCM18-RAS, YHCM16-PNT, YHCM21-21GEN |
| KRAS-mutant | có đột biến gen KRAS | compositional |
| BRAF mutation | đột biến gen BRAF | compositional (as KRAS mutation) |
| KRAS G12C mutation | đột biến KRAS G12C | = pathology-respiratory |
| KRAS G12C | KRAS G12C | kept EN |
| BRAF V600E | BRAF V600E | kept EN; src: YHCM21-21GEN |
| T790M | T790M | kept EN; src: YHCM16-PNT, YHCM21-EGFR |
| L858R | L858R | kept EN; src: YHCM21-EGFR, TCNCYH-DEL19 |
| tyrosine kinase inhibitor | thuốc ức chế tyrosine kinase (TKI) | freq 3 docs (S1 N2) + 'TKI(s)' kept 5 docs; src: YHCM21-EGFR, TCNCYH-DEL19, TCNCYH-LUNGGEN |
| TKI | TKI | kept EN: freq 5 docs (S4 N1) |
| liquid biopsy | sinh thiết lỏng | freq 3 docs (S2 N1); src: YHCM21-EGFR, YHCM21-LB, TCNCYH-LUNGGEN |
| liquid biopsy sample | mẫu sinh thiết lỏng | freq 3 docs (S2 N1); src: YHCM21-EGFR, YHCM21-LB, TCNCYH-LUNGGEN |
| tissue biopsy | sinh thiết mô | freq 2 docs S; src: YHCM21-EGFR, YHCM21-LB |
| tumor tissue sample | mẫu mô u | freq 5 docs (S4 N1); src: YHCM21-EGFR, YHCM21-LB, YHCM21-NGSCRC |
| tumour tissue sample | mẫu mô u | as 'tumor tissue sample' |
| plasma sample | mẫu huyết tương | freq 2 docs (S1 O1); src: YHCM21-EGFR, BYT-3336 |
| cell-free DNA | DNA ngoại bào (cfDNA) | S tie: 'DNA ngoại bào (cell free DNA - cfDNA)' YHCM21-LB vs 'DNA tự do (Cell Free DNA-cfDNA)' YHCM21-EGFR, 1 doc each; roadmap test form; 'cfDNA' kept 2 docs S; USER DECISION if needed |
| cfDNA | cfDNA | kept EN: freq 2 docs S; src: YHCM21-LB, YHCM21-EGFR |
| circulating tumor DNA | DNA khối u lưu hành (ctDNA) | S1 doc ('DNA khối u lưu hành trong máu (Circulating Tumor DNA - ctDNA)', YHCM21-EGFR, 2 hits); 'DNA khối u tuần hoàn' 0; Southern-first |
| circulating tumour DNA | DNA khối u lưu hành (ctDNA) | as 'circulating tumor DNA' |
| ctDNA | ctDNA | kept EN: freq 2 docs S (26 hits); src: YHCM21-LB, YHCM21-EGFR |
| circulating tumor cell | tế bào khối u lưu hành (CTC) | corpus: 'CTC' 1 doc S; Vietnamese form 0; parallel to ctDNA; low |
| mutant allele frequency | tần suất đột biến (MAF) | S2 docs: YHCM21-LB 'tần suất đột biến (MAF: mutation allelle fraction)', YHCM21-EGFR 'MAF (Mutant Allen Fraction)'; low |
| mutant allele fraction | tần suất đột biến (MAF) | as 'mutant allele frequency' |
| MAF | MAF | kept EN: freq 2 docs S |
| variant allele frequency | tần suất alen biến thể (VAF) | UNRESOLVED: 0 in corpus ('tỷ lệ alen đột biến' 1 doc N); built on alen (decision 7) + biến thể; VAF stays |
| variant allele fraction | tần suất alen biến thể (VAF) | as 'variant allele frequency' |
| VAF | VAF | kept EN |
| mutation frequency | tần suất đột biến | freq 6 docs (S5 N1); src: YHCM21-LB, YHCM21-NGSCRC, YHCM21-EGFR |
| mutation rate | tỷ lệ đột biến | freq 10 docs (S5 N5); alt: 'tỉ lệ đột biến' 4 docs (decision 8: tỷ lệ); src: YHCM18-RAS, YHCM16-PNT, YHCM16-EGFR |
| mutation detection rate | tỷ lệ phát hiện đột biến | freq 3 docs (S1 N2); src: YHCM26-BRCA, TCNCYH-EGFRSEQ, TCNCYH-LUNGGEN |
| mutation spectrum | phổ đột biến | freq 2 docs S (YHCM21-NGSCRC title); src: YHCM21-NGSCRC, YHCM16-EGFR |
| mutation type | kiểu đột biến | freq 7 docs (S5 N2); src: YHCM21-LB, YHCM21-EGFR, YHCM16-EGFR |
| mutational profile | đặc điểm đột biến | freq 2 docs (S1 N1); src: YHCM21-21GEN, TCNCYH-LUNGGEN; low |
| sequencing depth | độ sâu giải trình tự | 'độ sâu' 4 docs (S3 O1: YHCM21-EGFR 11 hits); roadmap test |
| read depth | độ sâu đọc | compositional; low |
| mean coverage | độ phủ trung bình | freq 3 docs S; src: YHCM21-21GEN, YHCM21-LB, YHCM25-MPI |
| sequencing coverage | độ phủ giải trình tự | 'độ phủ' 3 docs S; alt: 'độ bao phủ' 1 S; compositional |
| hotspot mutation | đột biến hotspot | 'hotspot' kept 3 docs S; 'điểm nóng' 0; src: YHCM25-MPI, YHCM21-LB, YHCM18-RAS; low |
| gene panel | panel gen | freq 4 docs (S1 N3); alt: 'bảng gen' 3 docs (S1 N2; TCNCYH-PANEL title 16 hits), bare 'panel' 10 docs; near tie; src: YHCM21-NGSCRC, TCNCYH-PANEL, TCNCYH-LUNGGEN |
| multigene panel | panel đa gen | compositional; low |
| NGS panel | panel NGS | kept EN parts |
| biomarker | dấu ấn sinh học | freq 3 docs (S2 N1); EN 'biomarker' 1; pathology 'marker' = dấu ấn; src: YHCM21-21GEN, YHCM21-APOE, TCNCYH24-MMR |
| predictive biomarker | dấu ấn sinh học dự đoán | 'dự đoán' 15 docs (S6) vs 'tiên đoán' 6 docs (S5, 19 of 28 hits in an imaging paper); low |
| prognostic biomarker | dấu ấn sinh học tiên lượng | 'tiên lượng' 15 docs (S8); compositional |
| companion diagnostic | xét nghiệm chẩn đoán đồng hành | UNRESOLVED: 0 in corpus and 1 targeted search; roadmap form |
| level of evidence | mức độ chứng cứ | S1 doc ('mức độ chứng cứ', ACMG context, YHCM25-MPI); 'mức bằng chứng' 0; low |
| variant of uncertain significance | biến thể chưa rõ ý nghĩa (VUS) | 'chưa rõ ý nghĩa' 1 doc N + 'VUS' 1 doc S; src: TCNCYH-PANEL, YHCM21-APOE; low |
| variant of unknown significance | biến thể chưa rõ ý nghĩa (VUS) | as 'variant of uncertain significance' |
| pathogenic variant | biến thể gây bệnh | freq 3 docs N (TCNCYH25-CHKB 19 hits); src: TCNCYH25-CHKB, TCNCYH24-MMR, TCNCYH-CARRIER |
| likely pathogenic | có khả năng gây bệnh | freq 1 doc S; src: YHCM25-MPI; low |
| likely benign | có khả năng lành tính | compositional; low |
| clinical significance | ý nghĩa lâm sàng | freq 5 docs (S2 N3); src: YHCM21-CML, TCNCYH-LUNGGEN, TCNCYH24-MMR |
| genetic alteration | biến đổi di truyền | freq 1 doc S; = molecular; src: YHCM26-MRD; low |
| genomic alteration | biến đổi bộ gen | compositional (genome = bộ gen); low |
| precision medicine | y học chính xác | freq 2 docs N; src: VJBT21-REV, TCNCYH24-MMR |
| personalized medicine | y học cá thể hóa | freq 2 docs (S1 N1); 'cá thể hóa' 5 docs vs 'cá nhân hóa' 1; src: YHCM21-NGSCRC, VJBT21-REV |
| personalized treatment | điều trị cá thể hóa | freq 2 docs N; src: TCNCYH24-MMR, TCNCYH-PANEL |
| tumor heterogeneity | tính không đồng nhất của khối u | 'không đồng nhất' 8 docs (S6 N2); low |
| tumour heterogeneity | tính không đồng nhất của khối u | as 'tumor heterogeneity' |
| tumor cell content | tỷ lệ tế bào ung thư | freq 2 docs (S1 N1); src: YHCM16-EGFR, TCNCYH-EGFRSEQ; low |
| tumour cell content | tỷ lệ tế bào ung thư | as 'tumor cell content' |
| formalin-fixed paraffin-embedded | cố định formalin và vùi nến (FFPE) | 'vùi nến' 2 docs S; alt: 'vùi paraffin' 1 N, 'khối nến' 2 N; 'FFPE' kept 8 docs (S5 N3); src: YHCM21-21GEN, YHCM16-EGFR |
| FFPE | FFPE | = pathology; kept EN 8 docs |
| fresh tissue | mô tươi | freq 1 doc S; src: YHCM16-ARID1B; low |
| measurable residual disease | bệnh tồn lưu đo được (MRD) | freq 1 doc S (4 hits; 'tồn lưu' 11; BV Truyền máu Huyết học TP.HCM); src: YHCM26-MRD |
| minimal residual disease | bệnh tồn lưu tối thiểu (MRD) | Southern 'tồn lưu' (YHCM26-MRD); 'tồn dư' 0 in corpus; the haematology pack must use the same value |
| MRD | MRD | kept EN: freq 1 doc S (74 hits) |
| immune checkpoint | điểm kiểm soát miễn dịch | freq 2 docs (S1 N1); src: YHCM18-30, TCNCYH-PDL1 |
| immune checkpoint inhibitor | thuốc ức chế điểm kiểm soát miễn dịch | freq 2 docs (S1 N1); the oncology pack must use the same value; src: YHCM18-30, TCNCYH-PDL1 |
| PD-L1 expression | bộc lộ PD-L1 | decision 5 (protein / IHC = bộc lộ): TCNCYH-PDL1 (GPB authors) 48 hits vs 'biểu hiện PD-L1' 2 docs (S1 review YHCM19-PDL1, N1); = pathology-respiratory note (10 vs 9) |
| tumor proportion score | điểm tỷ lệ tế bào u (TPS) | = pathology-respiratory 'PD-L1 tumour proportion score' |
| combined positive score | điểm dương tính kết hợp (CPS) | freq 1 doc N; src: TCNCYH-PDL1 |
| oncogene | gen sinh ung | = pathology; S1 'gen sinh ung' (YHCM21-NGSCRC); alt: 'gen ung thư' 6 docs, 'gen gây ung thư' 2 |
| proto-oncogene | gen tiền ung thư | pathology note of 'oncogene'; corpus 0; low |
| tumor suppressor gene | gen ức chế khối u | = pathology; freq 4 docs (S3 N1); src: YHCM21-NGSCRC, YHCM21-21GEN, YHCM16-ARID1B |
| tumour suppressor gene | gen ức chế khối u | as 'tumor suppressor gene' |
| MGMT promoter methylation | methyl hóa vùng khởi động MGMT | compositional (methylation = methyl hóa, promoter = vùng khởi động); low |
| MLH1 promoter methylation | methyl hóa vùng khởi động MLH1 | compositional; low |
| concordance rate | tỷ lệ tương đồng | S2 docs ('tỷ lệ tương đồng' YHCM16-PNT, 'tỉ lệ tương đồng' YHCM21-LB); pathology bare 'concordance' = 'đồng thuận' (inter-observer sense) |
| EGFR | EGFR | kept EN (HGNC symbol): freq 12 docs (S7 N5) |
| KRAS | KRAS | kept EN: freq 14 docs (S8 N6) |
| NRAS | NRAS | kept EN: freq 10 docs (S5 N5) |
| BRAF | BRAF | kept EN: freq 12 docs (S7 N5) |
| ALK | ALK | kept EN: freq 7 docs (S3 N4) |
| ROS1 | ROS1 | kept EN: freq 5 docs (S1 N4) |
| RET | RET | kept EN: freq 1 doc N |
| NTRK | NTRK | kept EN (HGNC family symbol); not counted |
| ERBB2 | ERBB2 | kept EN: freq 1 doc N |
| HER2 | HER2 | = pathology-breast; kept EN 2 docs N |
| PIK3CA | PIK3CA | kept EN: freq 6 docs (S3 N3) |
| TP53 | TP53 | kept EN: freq 5 docs (S2 N3) |
| BRCA1 | BRCA1 | kept EN: freq 2 docs (S1 N1) |
| BRCA2 | BRCA2 | kept EN: freq 2 docs (S1 N1) |
| PTEN | PTEN | kept EN: freq 2 docs (S1 N1) |
| APC | APC | kept EN: freq 5 docs (S3 N1 O1) |
| PDGFRA | PDGFRA | kept EN; not counted |
| IDH1 | IDH1 | kept EN; not counted |
| IDH2 | IDH2 | kept EN; not counted |
| FGFR2 | FGFR2 | kept EN; not counted |
| FGFR3 | FGFR3 | kept EN; not counted |
| MYCN | MYCN | kept EN: freq 1 doc S; src: YHCM16-ARID1B |
| CDKN2A | CDKN2A | kept EN: freq 1 doc N; src: TCNCYH-MESO |
| BAP1 | BAP1 | kept EN: freq 1 doc N; src: TCNCYH-MESO |
| MLH1 | MLH1 | = pathology-gi; freq 3 docs (S1 N2) |
| MSH2 | MSH2 | = pathology-gi; freq 3 docs (S1 N2) |
| MSH6 | MSH6 | = pathology-gi; freq 2 docs (S1 N1) |
| PMS2 | PMS2 | = pathology-gi; freq 2 docs (S1 N1) |
