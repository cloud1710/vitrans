# sources.md: pathology-gi (draft 0.1.0)

Nguồn bằng chứng cho từng thuật ngữ của pack Giải phẫu bệnh tiêu hóa. File chỉ ghi cặp thuật ngữ, số đếm và trích dẫn; không chép câu từ bài báo.

## Cách đọc số đếm

| Ký hiệu | Kho dữ liệu | Ghi chú |
|---|---|---|
| **VJOL** | `vjol.info.vn`: tìm cụm từ chính xác (có ngoặc kép) trên toàn bộ kho OJS | Gồm Tạp chí Y học Việt Nam, Nghiên cứu Y học, Y dược lâm sàng 108, Y Dược học Cần Thơ, Y Dược Huế, Y học TP.HCM (Y học), Ung thư học VN, Khoa học Tiêu hóa VN, Y học lâm sàng BV TW Huế, Y học Quân sự và nhiều tạp chí khác. Đếm theo tiêu đề, tóm tắt và từ khóa; tối đa 500. VJOL có cả tạp chí ngoài y khoa nên các cụm từ chung (vd "lớp đệm") bị lẫn. |
| **VMJ** | Ô tìm kiếm riêng của `tapchiyhocvietnam.vn` | Tên bài được đọc qua WebFetch. Trang kết quả không hiện năm. |
| **OJS3** | Ô tìm kiếm riêng của TCNCYH (`tapchinghiencuuyhoc.vn`), CTUMP (`tapchi.ctump.edu.vn`) và YDLS108 (`tcydls108.benhvien108.vn`) | Phần lớn trùng với VJOL. Chỉ dùng để kiểm tra chéo, không cộng dồn với VJOL. |
| **BYT-CRC18** | QĐ 2549/QĐ-BYT ngày 19/4/2018: *Hướng dẫn chẩn đoán và điều trị ung thư đại - trực tràng* | Đọc toàn văn bản .doc (bản đăng tại files01.duytan.edu.vn) |
| **BYT-GC20** | QĐ 3127/QĐ-BYT ngày 17/7/2020: *Hướng dẫn chẩn đoán và điều trị ung thư dạ dày* | Bản PDF tại vnras.com |
| **BYT-QTKT21** | Bộ Y tế: *Hướng dẫn quy trình kỹ thuật nội khoa chuyên ngành Tiêu hóa* | kcb.vn/upload/2005611/20210723/Huong-dan-QTKT-Tieu-Hoa.pdf |

**Lưu ý kỹ thuật (quan trọng):** công cụ tìm kiếm OJS **bỏ qua mọi từ dưới 3 ký tự**, như "u", "mô", "tế", "cơ", "bờ", "đa", "xạ", "bổ", "dạ", "ổ", "ít", "lý". Vì vậy:
- Hai biến thể chỉ khác nhau ở một từ ngắn sẽ có cùng số đếm. Ví dụ: "nảy chồi u" = "u nảy chồi" = 36, "cắt toàn bộ / cắt bỏ toàn bộ mạc treo trực tràng" = 10, "bệnh viêm ruột" = "bệnh lý viêm ruột" = 41.
- Số có dấu `*` là số đếm thô. Với các thuật ngữ này, tôi đối chiếu lại bằng **tiêu đề bài** (title-level) trước khi chọn.
- Một số truy vấn dài gồm toàn từ phổ biến (vd "ung thư biểu mô tuyến đại trực tràng") bị máy chủ VJOL trả lỗi 500 hoặc hết thời gian chờ. Các trường hợp đó dùng OJS3 + VMJ thay thế.

## Mã trích dẫn

Năm ghi theo ngày xuất bản mà VJOL hiển thị. Với bài VMJ, năm không hiển thị trên trang tìm kiếm nên ghi "n.d.".

| Mã | Bài | Tạp chí | Năm | URL |
|---|---|---|---|---|
| HB26 | Đặc điểm lâm sàng, hình ảnh nội soi dạ dày thực quản trên bệnh nhân người cao tuổi có bệnh lý trào ngược... BV Thống Nhất | TC Khoa học ĐH Quốc tế Hồng Bàng | 2026 | https://vjol.info.vn/tckhtruongdaihocquoctehongbang/vi/article/view/168763 |
| VMJ-10843 | Đặc điểm lâm sàng, nội soi, mô bệnh học ở bệnh trào ngược dạ dày - thực quản | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/10843 |
| YDH23-Kimura | Mối liên quan giữa teo niêm mạc dạ dày trên nội soi theo phân loại Kimura-Takemoto với đặc điểm mô bệnh học... | TC Y Dược Huế | 2023 | https://vjol.info.vn/jmp/vi/article/view/197846 |
| TCNCYH26-NBI | Nghiên cứu giá trị nội soi nhuộm màu liên kết trong chẩn đoán dị sản ruột... | TC Nghiên cứu Y học | 2026 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/170263 |
| YHCM26-mucin | Phân loại kiểu hình chất nhầy của tân sinh trong biểu mô tuyến và ung thư dạ dày sớm | TC Y học TP.HCM – Y học | 2026 | https://vjol.info.vn/Yhcm_yhoc/vi/article/view/249325 |
| KHSK26-EMR | Polyp đại tràng ngang kích thước lớn điều trị bằng EMR nhiều mảnh: báo cáo ca lâm sàng | TC Khoa học Sức khỏe | 2026 | https://vjol.info.vn/khoahocsuckhoe-HPMU/vi/article/view/270496 |
| YDLS25-NBI | Giá trị của nội soi ánh sáng dải tần hẹp kết hợp phóng đại trong chẩn đoán tổn thương loạn sản độ cao và ung thư sớm dạ dày | TC Y dược lâm sàng 108 | 2025 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192780 |
| YHQS26-Mandard | Đáp ứng mô bệnh học theo hệ thống Mandard... 65 bệnh nhân ung thư biểu mô tế bào vảy thực quản hóa xạ trị tiền phẫu | TC Y học Quân sự | 2026 | https://vjol.info.vn/yhocquansu/vi/article/view/265732 |
| YHLS25-ESCC | Kết quả xạ hoá đồng thời triệt căn ung thư biểu mô tế bào vảy thực quản giai đoạn muộn | TC Y học lâm sàng BV TW Huế | 2025 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/143997 |
| UTH26-ESCC | Kết quả hóa xạ trị đồng thời ung thư biểu mô vảy thực quản giai đoạn III-IVA... BV Ung bướu Nghệ An | TC Ung thư học Việt Nam | 2026 | https://vjol.info.vn/tcungthuhocvietnam/vi/article/view/227893 |
| YDHCT23-HP | Nghiên cứu đột biến kháng clarithromycin và levofloxacin của Helicobacter pylori ở bệnh nhân viêm dạ dày... | TC Y Dược học Cần Thơ | 2023 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/251957 |
| KHTH26-Kyoto | Phân loại nội soi Kyoto trong nhiễm Helicobacter pylori và đánh giá nguy cơ ung thư dạ dày | TC Khoa học Tiêu hóa VN | 2026 | https://vjol.info.vn/tckhtieuhoavietnam/vi/article/view/210743 |
| YHLS15-pepsinogen | Nghiên cứu nồng độ pepsinogen I, II... ở bệnh nhân viêm dạ dày mạn teo | TC Y học lâm sàng BV TW Huế | 2015 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/159469 |
| YHCD26-PPI | Khảo sát tình trạng viêm teo dạ dày ở người sử dụng thuốc ức chế bơm proton... | TC Y học Cộng đồng | 2026 | https://vjol.info.vn/tcyhoccongdong/vi/article/view/149123 |
| YHQS26-Kimura | Một số đặc điểm và yếu tố liên quan đến viêm teo niêm mạc dạ dày trên nội soi theo phân loại Kimura-Takemoto... | TC Y học Quân sự | 2026 | https://vjol.info.vn/yhocquansu/vi/article/view/265735 |
| YHLS21-OLGA | Mối liên quan giữa nồng độ pepsinogen huyết thanh và viêm teo niêm mạc dạ dày theo phân loại OLGA | TC Y học lâm sàng (BV Bạch Mai) | 2021 | https://vjol.info.vn/yhlsbvbm/vi/article/view/59642 |
| KHCNVN21-teo | Nhận xét thói quen ăn uống, lâm sàng ở bệnh nhân viêm teo niêm mạc dạ dày | TC Khoa học và Công nghệ Việt Nam B | 2021 | https://vjol.info.vn/most/vi/article/view/59153 |
| TNU23-HER2 | Sự biểu lộ của HER2 trong ung thư biểu mô tuyến dạ dày | TC KH&CN ĐH Thái Nguyên | 2023 | https://vjol.info.vn/tnu/vi/article/view/157437 |
| YDLS22-IHC | Nghiên cứu sự đồng biểu hiện một số dấu ấn hóa mô miễn dịch của ung thư biểu mô tuyến dạ dày | TC Y dược lâm sàng 108 | 2022 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/191934 |
| TNU23-hangvi | Đặc điểm lâm sàng, nội soi và mô bệnh học của bệnh nhân ung thư biểu mô tuyến hang vị dạ dày | TC KH&CN ĐH Thái Nguyên | 2023 | https://vjol.info.vn/tnu/vi/article/view/80467 |
| YHCM26-catenin | Nghiên cứu đặc điểm biểu hiện của dấu ấn beta-catenin trong carcinôm tuyến dạ dày | TC Y học TP.HCM – Y học | 2026 | https://vjol.info.vn/Yhcm_yhoc/vi/article/view/249324 |
| VMJ-17951 | Tối ưu hóa quy trình giải trình tự vùng promotor gen MMP-9... carcinôm dạ dày loại tế bào kém kết dính | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/17951 |
| VMJ-17931 | Tối ưu hóa quy trình hóa mô miễn dịch với dấu ấn chất nhầy (MUC2, MUC5AC, MUC6) và CD10 trong carcinôm tuyến dạ dày | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/17931 |
| VMJ25-CRCTN | Đặc điểm cận lâm sàng của bệnh nhân ung thư đại trực tràng tại BV TW Thái Nguyên | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/259231 |
| VMJ-9125 | U lympho mô bạch huyết liên quan đến niêm mạc thực quản nguyên phát: báo cáo ca lâm sàng | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/9125 |
| YHCM26-MALT | Tổng quan về u lympho nguyên phát tại phổi vùng rìa ngoài hạch của các mô lympho liên kết niêm mạc | TC Y học TP.HCM – Y học | 2026 | https://vjol.info.vn/Yhcm_yhoc/vi/article/view/186571 |
| YHLS20-MALT | Nhân một trường hợp bệnh MALT lymphoma dạ dày | TC Y học lâm sàng BV TW Huế | 2020 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/153804 |
| YDH23-GIlym | Nghiên cứu chẩn đoán, phân loại u lympho dạ dày - ruột bằng mô bệnh học và hóa mô miễn dịch | TC Y Dược Huế | 2023 | https://vjol.info.vn/jmp/vi/article/view/178653 |
| YDH25-DLBCL | Nghiên cứu một số đặc điểm lâm sàng và giải phẫu bệnh của u lympho tế bào B lớn lan tỏa ở dạ dày - ruột | TC Y Dược Huế | 2025 | https://vjol.info.vn/jmp/vi/article/view/178427 |
| UTH26-NHL | Kết quả điều trị u lympho không Hodgkin tế bào B CD20(+) bằng phác đồ R-CHOP... | TC Ung thư học Việt Nam | 2026 | https://vjol.info.vn/tcungthuhocvietnam/vi/article/view/227601 |
| YDHCT23-lymphom | Đặc điểm lâm sàng... kết quả điều trị lymphôm không Hodgkin tế bào B bằng R-CHOP... BV Ung bướu Cần Thơ | TC Y Dược học Cần Thơ | 2023 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/175456 |
| VMJ26-Burkitt | Đặc điểm mô bệnh học và hóa mô miễn dịch của lymphôm Burkitt: nghiên cứu đa trung tâm tại TP.HCM | TC Y học Việt Nam | 2026 | https://vjol.info.vn/yhocvietnam/vi/article/view/260054 |
| PNT25-GIST | Nghiên cứu vai trò X quang cắt lớp vi tính trong chẩn đoán u mô đệm đường tiêu hóa | TC Y Dược học Phạm Ngọc Thạch | 2025 | https://vjol.info.vn/pnt/vi/article/view/108178 |
| KHSK26-GIST | Nhân một trường hợp u mô đệm đường tiêu hóa (GIST) trực tràng tại BV Hữu nghị Việt Tiệp | TC Khoa học Sức khỏe | 2026 | https://vjol.info.vn/khoahocsuckhoe-HPMU/vi/article/view/189810 |
| VMJ-10227 | Tương quan giữa đặc điểm hình ảnh CLVT đa dãy và phân tầng nguy cơ mô bệnh học của u mô đệm đường tiêu hoá tại dạ dày | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/10227 |
| VMJ25-NET | Đặc điểm mô bệnh học và hóa mô miễn dịch u thần kinh nội tiết ống tiêu hóa theo phân loại TCYTTG 2022 tại BV Bạch Mai | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/259662 |
| YHLS26-NETbuou | Bướu tân sinh thần kinh nội tiết: nhân 3 trường hợp biểu hiện ở trực tràng | TC Y học lâm sàng BV TW Huế | 2026 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/260942 |
| YHCM26-celiac | Hội chứng đa tuyến nội tiết tự miễn tuýp 2 kèm bệnh Celiac... | TC Y học TP.HCM – Y học | 2026 | https://vjol.info.vn/Yhcm_yhoc/vi/article/view/162731 |
| YHCM26-EoC | Viêm đại tràng tăng bạch cầu ái toan giả dạng ung thư đại tràng | TC Y học TP.HCM (T29 S3) | 2026 | https://tapchiyhoctphcm.vn/upload/2026/T29%20S3/216.pdf |
| KHCNVN23-sonde | Thực trạng của người bệnh nuôi ăn qua sonde tại BV Hữu nghị Đa khoa Nghệ An | TC Khoa học và Công nghệ Việt Nam B | 2023 | https://vjol.info.vn/most/vi/article/view/79590 |
| TCNCYH25-Crohn | Kết quả điều trị bệnh Crohn ở trẻ em bằng liệu pháp sinh học tại BV Nhi Trung ương | TC Nghiên cứu Y học | 2025 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/171025 |
| KHTH26-Crohn | Ca lâm sàng: loét hạ hồi do bệnh Crohn biến chứng chảy máu nặng... | TC Khoa học Tiêu hóa VN | 2026 | https://vjol.info.vn/tckhtieuhoavietnam/vi/article/view/210737 |
| KHTH26-SCCAI | Nghiên cứu ứng dụng thang điểm SCCAI trong đánh giá mức độ nặng của bệnh viêm loét đại trực tràng chảy máu | TC Khoa học Tiêu hóa VN | 2026 | https://vjol.info.vn/tckhtieuhoavietnam/vi/article/view/210762 |
| YHLS24-UC | Viêm loét đại tràng ở trẻ 12 tháng tuổi: nhân một trường hợp lâm sàng | TC Y học lâm sàng BV TW Huế | 2024 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/144102 |
| VMJ25-UC | Tỷ lệ lo âu và các yếu tố liên quan ở bệnh nhân viêm loét đại tràng mạn tính... BV Bạch Mai | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/259275 |
| YHCD26-IBD | Tình trạng dinh dưỡng của người bệnh viêm ruột mạn tính tại BV ĐH Y Hà Nội năm 2024-2025... | TC Y học Cộng đồng | 2026 | https://vjol.info.vn/tcyhoccongdong/vi/article/view/149342 |
| YDLS23-IBD | Biểu hiện lâm sàng tại ruột và ngoài ruột của bệnh nhân viêm ruột mạn tại BV TWQĐ 108 | TC Y dược lâm sàng 108 | 2023 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192254 |
| YDHCT20-ro | Đặc điểm lâm sàng và kết quả điều trị rò hậu môn phức tạp tại BV Trường ĐH Y Dược Cần Thơ | TC Y Dược học Cần Thơ | 2020 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/252693 |
| VMJ26-ro | Đặc điểm lâm sàng, cận lâm sàng và điều trị phẫu thuật rò tiêu hóa tự phát (không do phẫu thuật) | TC Y học Việt Nam | 2026 | https://vjol.info.vn/yhocvietnam/vi/article/view/257449 |
| YHQS26-polyp | Đặc điểm hình ảnh nội soi, mô bệnh học polyp đại trực tràng kích thước ≥ 2 cm... BV TWQĐ 108 | TC Y học Quân sự | 2026 | https://vjol.info.vn/yhocquansu/vi/article/view/265868 |
| KHSK26-polyp | Đặc điểm lâm sàng, hình ảnh nội soi và mô bệnh học polyp đại trực tràng tại BV ĐH Y Hải Phòng 2025-2026 | TC Khoa học Sức khỏe | 2026 | https://vjol.info.vn/khoahocsuckhoe-HPMU/vi/article/view/269751 |
| YDH22-polyp | Nghiên cứu một số đặc điểm lâm sàng, nội soi và phân loại mô bệnh học polyp ống tiêu hóa | TC Y Dược Huế | 2022 | https://vjol.info.vn/jmp/vi/article/view/197733 |
| KHTH26-SSL | Báo cáo ca lâm sàng: hình thái nội soi của tổn thương răng cưa không cuống có loạn sản | TC Khoa học Tiêu hóa VN | 2026 | https://vjol.info.vn/tckhtieuhoavietnam/vi/article/view/210724 |
| TCNCYH26-PJ | Kết quả phẫu thuật lồng ruột do polyp Peutz-Jeghers ở trẻ em | TC Nghiên cứu Y học | 2026 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/170314 |
| VMJ26-FAP | Đặc điểm lâm sàng và hình ảnh nội soi của hội chứng đa polyp tuyến gia đình | TC Y học Việt Nam | 2026 | https://vjol.info.vn/yhocvietnam/vi/article/view/259094 |
| VMJ25-CDX2 | Đặc điểm biểu hiện của CDX2 ở bệnh nhân carcinôm tuyến đại - trực tràng tại Việt Nam | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/260045 |
| VMJ25-SATB2 | Đánh giá biểu hiện dấu ấn SATB2 trên u nguyên phát và hạch di căn tương ứng của carcinôm tuyến đại tràng | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/259913 |
| VMJ-14726 | Nghiên cứu đặc điểm của nảy chồi u trong ung thư biểu mô tuyến đại trực tràng | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/14726 |
| VMJ-6797 | Đánh giá mức độ nảy chồi u và mối liên quan với một số đặc điểm mô bệnh học trong ung thư biểu mô dạ dày | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/6797 |
| VMJ-12193 | Tình trạng nảy chồi bướu trong ung thư tế bào gai hốc miệng | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/12193 |
| YDLS24-CRC | Đặc điểm mô bệnh học của bệnh ung thư đại trực tràng tại BV TWQĐ 108 từ 2017 đến 2020 | TC Y dược lâm sàng 108 | 2024 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192731 |
| YDHCT26-MMR | Đặc điểm mô bệnh học và tình trạng biểu hiện protein MLH1, MSH2, MSH6, PMS2 trong ung thư biểu mô tuyến đại - trực tràng... | TC Y Dược học Cần Thơ | 2026 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/252486 |
| YDLS22-bud | Nghiên cứu tình trạng nảy chồi u trong ung thư đại trực tràng | TC Y dược lâm sàng 108 | 2022 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192088 |
| YDLS26-pT1 | So sánh... nhóm không hiện diện nảy chồi u (Bd0) và nhóm nảy chồi u độ thấp trong polyp đại - trực tràng ác tính pT1 | TC Y dược lâm sàng 108 | 2026 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/193341 |
| YHLS21-bud | Nảy chồi u: một yếu tố mô bệnh học mới trong ung thư biểu mô đại trực tràng | TC Y học lâm sàng (BV Bạch Mai) | 2021 | https://vjol.info.vn/yhlsbvbm/vi/article/view/59651 |
| YDHCT24-bud | Đặc điểm lâm sàng, sự nảy chồi u và mô bệnh học của ung thư biểu mô đại - trực tràng... Cần Thơ 2022-2023 | TC Y Dược học Cần Thơ | 2024 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/251528 |
| YHLS25-buou | Nghiên cứu đặc điểm nảy chồi bướu và một số yếu tố liên quan trong ung thư biểu mô đại trực tràng | TC Y học lâm sàng BV TW Huế | 2025 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/143936 |
| YDLS25-PDL1 | Đặc điểm bộc lộ PD-L1 trong ung thư biểu mô tuyến đại trực tràng | TC Y dược lâm sàng 108 | 2025 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192924 |
| YDHCT26-PDL1 | Biểu hiện PD-L1 và mối liên quan với đặc điểm mô bệnh học trong ung thư biểu mô tuyến đại - trực tràng | TC Y Dược học Cần Thơ | 2026 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/250907 |
| YDLS26-HSP110 | Đặc điểm nồng độ protein HSP110 trong mô... ung thư đại trực tràng | TC Y dược lâm sàng 108 | 2026 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/193350 |
| VMJ26-K | Đặc điểm di căn hạch của bệnh nhân ung thư biểu mô tuyến dạ dày được phẫu thuật nội soi tại BV K | TC Y học Việt Nam | 2026 | https://vjol.info.vn/yhocvietnam/vi/article/view/260508 |
| YDHCT24-EMVI | Xâm lấn mạch máu, thần kinh và kết quả sớm của phẫu thuật nội soi trong ung thư trực tràng | TC Y Dược học Cần Thơ | 2024 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/251193 |
| VMJ25-TNT | Kết quả hoá xạ trị tân bổ trợ toàn phần ung thư trực tràng giai đoạn II, III tại BV K | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/259538 |
| YDLS23-TME | Kết quả điều trị ung thư trực tràng được xạ trị ngắn ngày trước mổ kết hợp phẫu thuật nội soi cắt toàn bộ mạc treo trực tràng | TC Y dược lâm sàng 108 | 2023 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192336 |
| YHLS18-TaTME | Phẫu thuật nội soi cắt toàn bộ mạc treo trực tràng qua đường hậu môn (TaTME)... | TC Y học lâm sàng BV TW Huế | 2018 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/157195 |
| YDHCT22-CRM | Diện cắt vòng quanh và kết quả sớm của phẫu thuật nội soi trong ung thư đại tràng | TC Y Dược học Cần Thơ | 2022 | https://vjol.info.vn/tcyduochoccanthotiengviet/vi/article/view/174359 |
| VMJ-9998 | Vai trò hội chẩn đa mô thức trong điều trị ung thư trực tràng T3, diện cắt vòng quanh âm tính | TC Y học Việt Nam | n.d. | https://tapchiyhocvietnam.vn/index.php/vmj/article/view/9998 |
| TCNCYH25-TRG | Nghiên cứu tình trạng thoái triển u trên mô bệnh học của bệnh nhân ung thư biểu mô tuyến trực tràng hóa xạ trị tiền phẫu | TC Nghiên cứu Y học | 2025 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/171168 |
| YDHQS26-TNT | Đánh giá tình trạng đáp ứng với điều trị tân bổ trợ của ung thư trực tràng trên giải phẫu bệnh | TC Y Dược học Quân sự | 2026 | https://vjol.info.vn/ydhqs/vi/article/view/146728 |
| YDLS23-HXTTP | Kết quả của hóa xạ trị tiền phẫu ung thư thực quản giai đoạn II, III tại BV Ung bướu TP.HCM | TC Y dược lâm sàng 108 | 2023 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192304 |
| UTH26-HXTTP | Kết quả hóa xạ trị tiền phẫu ung thư thực quản 1/3 giữa - dưới giai đoạn cT3N0-2M0... | TC Ung thư học Việt Nam | 2026 | https://vjol.info.vn/tcungthuhocvietnam/vi/article/view/223718 |
| TCNCYH21-MMR | Bộc lộ protein sửa chữa ghép cặp sai ở bệnh nhân ung thư dạ dày điều trị hóa chất bổ trợ phác đồ XELOX | TC Nghiên cứu Y học | 2021 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/170220 |
| YDH23-MMR | Tình trạng bộc lộ protein sửa chữa ghép cặp sai (MMR) ở bệnh nhân ung thư biểu mô dạ dày | TC Y Dược Huế | 2023 | https://vjol.info.vn/jmp/vi/article/view/197860 |
| TCNCYH24-MMR | Đặc điểm gen KRAS, BRAF, các gen sửa chữa ghép cặp sai (MMR) và tình trạng biểu hiện protein MMR ở người bệnh ung thư đại trực tràng | TC Nghiên cứu Y học | 2024 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/171988 |
| YHLS23-MMRD | Đánh giá tình trạng mất biểu hiện protein sửa chữa bắt cặp sai (MMRD)... ung thư biểu mô nội mạc tử cung | TC Y học lâm sàng BV TW Huế | 2023 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/153012 |
| YDLS23-MSI | Nghiên cứu sự mất ổn định vi vệ tinh trong ung thư biểu mô tuyến đại trực tràng bằng phương pháp hóa mô miễn dịch | TC Y dược lâm sàng 108 | 2023 | https://vjol.info.vn/Yduonglamsang108/vi/article/view/192211 |
| VMJ26-MSI | Nghiên cứu ảnh hưởng tình trạng mất ổn định vi vệ tinh (MSI) và HPV trên ung thư đại trực tràng | TC Y học Việt Nam | 2026 | https://vjol.info.vn/yhocvietnam/vi/article/view/260346 |
| YHLS18-Lynch | Vai trò của sinh học phân tử trong hội chứng ung thư di truyền | TC Y học lâm sàng BV TW Huế | 2018 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/157183 |
| VMJ25-LAMN | Báo cáo ca lâm sàng: phẫu thuật nội soi cắt vát manh tràng điều trị u tân sinh nhầy ruột thừa độ thấp | TC Y học Việt Nam | 2025 | https://vjol.info.vn/yhocvietnam/vi/article/view/259166 |
| TCNCYH24-LAMN | U nhầy ruột thừa: thông báo lâm sàng và tổng quan y văn (Trần Quế Sơn, Nguyễn Tuấn Thành) | TC Nghiên cứu Y học 183(10) | 2024 | https://vjol.info.vn/tcnghiencuuyhoc/vi/article/view/172025 |
| YHLS26-ESD | Đặc điểm mô bệnh học các thương tổn đường tiêu hóa trong cắt tách dưới niêm mạc qua nội soi tại BV TW Thái Nguyên | TC Y học lâm sàng BV TW Huế | 2026 | https://vjol.info.vn/tcyhlsbvh/vi/article/view/260943 |
| Vinmec-EoE | Các bài Vinmec về "viêm thực quản tăng bạch cầu ái toan" (3) và "viêm thực quản bạch cầu ái toan" (3) | vinmec.com (không phải tạp chí) | n.d. | https://www.vinmec.com/vie/bai-viet/viem-thuc-quan-tang-bach-cau-ai-toan-khi-nao-can-nghi-ngo-va-tai-sao-nen-dieu-tri-bang-thuoc-uc-che-bom-proton-vi |
| Vinmec-MC | Tiếp cận chẩn đoán viêm đại tràng vi thể | vinmec.com (không phải tạp chí) | n.d. | https://www.vinmec.com/vie/bai-viet/tiep-can-chan-doan-viem-dai-trang-vi-the-vi |
| Vinmec-UC | Đặc điểm mô học của bệnh viêm loét đại tràng dưới kính hiển vi | vinmec.com (không phải tạp chí) | n.d. | https://www.vinmec.com/vie/bai-viet/dac-diem-mo-hoc-cua-benh-viem-loet-dai-trang-duoi-kinh-hien-vi |
| Vinmec-PMC | Biến chứng của viêm đại tràng giả mạc | vinmec.com (không phải tạp chí) | n.d. | https://www.vinmec.com/vie/bai-viet/bien-chung-cua-viem-dai-trang-gia-mac-vi |
| LC-PMC | Viêm đại tràng giả mạc là bệnh gì | nhathuoclongchau.com.vn (không phải tạp chí) | n.d. | https://nhathuoclongchau.com.vn/bai-viet/viem-dai-trang-gia-mac-la-benh-gi-40802.html |
| BVNTP-PMP | Giải phẫu bệnh học bệnh lý ruột thừa / U nhầy ruột thừa | bvnguyentriphuong.com.vn (bệnh viện) | n.d. | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-ruot-thua |

## Theo từng thuật ngữ

Định dạng: **EN → canonical**, sau đó là các biến thể và số đếm (VJOL trừ khi ghi khác). `*` = không tin được vì OJS bỏ từ ngắn.

### Thực quản
- **Barrett esophagus → Barrett thực quản**. Biến thể: "Barrett thực quản": VJOL 1, BYT-QTKT21 3. "thực quản Barrett": VJOL 0, VMJ 1. "bệnh Barrett": 0. Trích dẫn: BYT-QTKT21, HB26, VMJ-10843.
- **intestinal metaplasia → dị sản ruột**. "dị sản ruột": 12; OJS3: TCNCYH 3, CTUMP 1, YDLS 1; BYT-GC20 1; BYT-QTKT21 3. "chuyển sản ruột": 0 ở mọi kho. Trích dẫn: YDH23-Kimura, TCNCYH26-NBI, BYT-GC20.
- **low-grade dysplasia → loạn sản độ thấp**. "loạn sản độ thấp" 13; "loạn sản mức độ thấp" 2; "loạn sản nhẹ" 2; "loạn sản grade thấp" 0. Trích dẫn: YHCM26-mucin, KHSK26-EMR.
- **high-grade dysplasia → loạn sản độ cao**. "loạn sản độ cao" 15; "loạn sản nặng" 3 (BYT-QTKT21 có 4); "loạn sản mức độ cao" 1; "loạn sản grade cao" 0. Trích dẫn: YDLS25-NBI, KHSK26-EMR.
- **esophageal squamous cell carcinoma → ung thư biểu mô tế bào vảy thực quản**. "ung thư biểu mô tế bào vảy thực quản" 6; "ung thư biểu mô vảy thực quản" 6; "ung thư thực quản tế bào vảy" 1; "ung thư biểu mô tế bào gai thực quản" 0; "carcinôm tế bào gai thực quản" 1. Gộp: "vảy thực quản" 12 vs "tế bào gai thực quản" 1. Không giới hạn cơ quan: "UTBM tế bào vảy" 33 + "UTBM vảy" 37 vs "UTBM tế bào gai" 14 + "carcinôm tế bào gai" 7. OJS3: vảy 18 vs gai 6, trong đó gai tập trung ở CTUMP (Cần Thơ). Trích dẫn: YHQS26-Mandard, YHLS25-ESCC, UTH26-ESCC.
- **esophageal adenocarcinoma → ung thư biểu mô tuyến thực quản**. Truy vấn VJOL bị lỗi 500/timeout; "tuyến thực quản" 0; OJS3 0; "carcinôm tuyến thực quản" 0. Dạng này ghép theo mẫu dạ dày/đại trực tràng.
- **eosinophilic esophagitis → viêm thực quản tăng bạch cầu ái toan**. Tạp chí: mọi biến thể đều 0 ("viêm thực quản ái toan" 1* là kết quả nhiễu). Lay (Vinmec): "tăng bạch cầu ái toan" 3 = "bạch cầu ái toan" 3. Bài tạp chí cùng mẫu: YHCM26-EoC ("viêm đại tràng tăng bạch cầu ái toan").
- **eosinophil → bạch cầu ái toan**. 78 vs "bạch cầu ưa acid" 3, "ưa axit" 0.

### Dạ dày
- **Helicobacter pylori gastritis → viêm dạ dày do Helicobacter pylori**. "viêm dạ dày do H. pylori" 3; các dạng viết đủ tên vi khuẩn 0. Trích dẫn: YDHCT23-HP, KHTH26-Kyoto.
- **chronic atrophic gastritis → viêm dạ dày mạn teo**. 1 + tiêu đề YHLS15. "viêm teo dạ dày" 1 (YHCD26-PPI); "viêm dạ dày teo" 1; "viêm dạ dày mạn tính teo" 0; "viêm dạ dày mạn thể teo" 0.
- **atrophic gastritis → viêm teo niêm mạc dạ dày**. 4 + tiêu đề YHQS26-Kimura, YHLS21-OLGA, KHCNVN21-teo. Thuật ngữ này thường gặp trong ngữ cảnh nội soi (Kimura-Takemoto).
- **OLGA / OLGIM staging → phân giai đoạn OLGA / OLGIM**. "OLGA" 18*, phần lớn là kết quả ngoài y khoa (phần mềm OLGA). "phân loại OLGA" 1 (YHLS21-OLGA). "giai đoạn OLGA" 0, "hệ thống OLGA" 0, "OLGIM" 0.
- **gastric adenocarcinoma → ung thư biểu mô tuyến dạ dày**. 25; OJS3: TCNCYH 4, CTUMP 1, YDLS 5. "carcinôm tuyến dạ dày" 4 (YHCM26-catenin, YHCM26-mucin, VMJ-17931; OJS3 0). "ung thư dạ dày thể tuyến" 0. Trích dẫn: TNU23-HER2, YDLS22-IHC, BYT-GC20.
- **intestinal type / diffuse type (Lauren) → thể ruột / thể lan tỏa**. "thể ruột" 10; "thể lan tỏa" 10 (dạng "toả" 0); "typ ruột" 1; "typ lan toả" 1; "týp/típ" 0. BYT-GC20 dùng "típ ruột / típ lan toả". "loại ruột" 1. Lưu ý: "thể lan tỏa" cũng xuất hiện ngoài GPB tiêu hóa.
- **poorly cohesive carcinoma → ung thư biểu mô kém kết dính**. "kém kết dính": VJOL 3, VMJ 7 (toàn bộ là dạ dày). "ít kết dính": OJS3 1 (VJOL 259* vô nghĩa do OJS bỏ từ "ít"). "carcinôm kém kết dính" 0. BYT-GC20 ghi "ung thư biểu mô tế bào kém kết dính (bao gồm típ tế bào nhẫn...)". Trích dẫn: VMJ-17951, YHCM26-catenin.
- **signet ring cell carcinoma → ung thư biểu mô tế bào nhẫn**. Đúng dạng: 1 (VMJ25-CRCTN). "tế bào nhẫn" 11*; "tế bào hình nhẫn" 0; "carcinôm tế bào nhẫn" 0; "tế bào mặt nhẫn" 0 (chỉ gặp ở bài lay của Vinmec). BYT-GC20 1.
- **MALT lymphoma / gastric MALT lymphoma → u lympho MALT / u lympho MALT dạ dày**. "u lympho MALT" 0; "lymphôm MALT" 0; "lymphoma MALT" 1 (UTH26, tiếng Anh). Tiêu đề: VMJ-9125 "u lympho mô bạch huyết liên quan đến niêm mạc"; YHCM26-MALT "u lympho... vùng rìa ngoài hạch của các mô lympho liên kết niêm mạc"; YHLS20-MALT "Malt lymphoma dạ dày"; YDH23-GIlym "u lympho dạ dày - ruột" (2 bài). Họ từ lymphoma: "u lympho không Hodgkin" 23 vs "lymphôm không Hodgkin" 2; "u lympho tế bào B" 57 vs "lymphôm tế bào B" 3; "u lympho Hodgkin" 8 vs "lymphôm Hodgkin" 2. OJS3: u lympho 16 vs lymphôm 2 (cả 2 đều ở CTUMP). Trong 3 kết quả tìm "MALT" của VMJ, cả 3 dùng "u lympho".
- **gastrointestinal stromal tumour → u mô đệm đường tiêu hóa (GIST)**. 11 ("hóa") + 2 ("hoá"). VMJ: 19 kết quả, mọi tiêu đề GIST đều là "u mô đệm đường tiêu hóa". "u mô đệm dạ dày ruột" 0 (một tiêu đề cũ trên VMJ có dùng). "bướu mô đệm" 1. Trích dẫn: PNT25-GIST, KHSK26-GIST, VMJ-10227.

### Thần kinh nội tiết
- **neuroendocrine tumour → u thần kinh nội tiết (NET)**. 28* vs "u nội tiết thần kinh" 12*. BYT-GC20 5. "u carcinoid" 4. "bướu tân sinh thần kinh nội tiết" 1 (YHLS26-NETbuou). Trích dẫn: VMJ25-NET.
- **neuroendocrine carcinoma → ung thư biểu mô thần kinh nội tiết (NEC)**. 2; "ung thư thần kinh nội tiết" 2; "carcinôm thần kinh nội tiết" 0. Bằng chứng thấp.

### Ruột non
- **celiac disease → bệnh celiac**. 1 (YHCM26-celiac). "không dung nạp gluten" 0.
- **Marsh classification → phân loại Marsh**. Không có kết quả y khoa nào.
- **intraepithelial lymphocytes → lympho bào trong biểu mô**. Cả 5 biến thể đều 0. Vinmec-MC chỉ mô tả, không đặt thành thuật ngữ.
- **villous atrophy → teo nhung mao**. 1 (KHCNVN23-sonde); "teo lông ruột" 0.
- **villous → nhung mao**. Xem mục Xung đột trong MINING_REPORT.

### Viêm ruột / viêm đại tràng
- **Crohn disease → bệnh Crohn**. 15; BYT-CRC18 2; BYT-QTKT21 7. Trích dẫn: TCNCYH25-Crohn, KHTH26-Crohn.
- **ulcerative colitis → viêm loét đại tràng**. "viêm loét đại tràng" 16; "viêm loét đại trực tràng" 8 (gồm cả "...chảy máu" 7); "viêm đại tràng loét" 0; "viêm loét đại tràng chảy máu" 1. OJS3: "viêm loét đại tràng" 6 vs "VLĐTTCM" 3. BYT-QTKT21: "viêm loét đại trực tràng chảy máu" 5. BYT-CRC18: "viêm loét đại trực tràng" 1. Trích dẫn: YHLS24-UC, VMJ25-UC, KHTH26-SCCAI.
- **inflammatory bowel disease → bệnh viêm ruột mạn tính**. "viêm ruột mạn tính" 7; "bệnh viêm ruột mạn tính" 3; "bệnh viêm ruột" 41* (lẫn bệnh thú y). Tiêu đề: YHCD26-IBD, YDLS23-IBD.
- **crypt / crypt abscess / crypt distortion → khe tuyến / áp xe khe tuyến / biến dạng khe tuyến**. "khe tuyến" 2 và "áp xe khe tuyến" 2, đều trong ngữ cảnh khe/tuyến hậu môn (YDHCT20-ro; Y học TP.HCM 2026). "hẽm tuyến", "hốc tuyến", "khe Lieberkühn" đều 0. "biến dạng tuyến" 2; các dạng "biến dạng/méo mó khe tuyến" đều 0. Lay: Vinmec-MC "cấu trúc khe tuyến"; Vinmec-UC "áp xe trong các khe hốc", "áp xe hốc".
- **granuloma → u hạt**. Theo pack cha.
- **microscopic / collagenous / lymphocytic colitis → viêm đại tràng vi thể / collagen / lympho bào**. Tạp chí: 0 cho mọi biến thể. Vinmec-MC (5 bài) dùng "viêm đại tràng vi thể", "viêm đại tràng collagen", "viêm đại tràng lympho" / "tế bào lympho".
- **pseudomembranous colitis → viêm đại tràng giả mạc**. Tạp chí 0. Lay: Vinmec-PMC, LC-PMC, Vinmec (C. difficile) = 3; Pharmacity "viêm đại tràng màng giả" 1.
- **ischemic colitis → viêm đại tràng do thiếu máu cục bộ**. "viêm đại tràng thiếu máu" 1 = "viêm đại tràng do thiếu máu" 1 (cùng bài VMJ26-ro); "... thiếu máu cục bộ" 0.

### Polyp
- **tubular adenoma → u tuyến ống**. Số đếm "u tuyến ống" 23* là của cụm "tuyến ống", phần lớn là đường ống dẫn khí. OJS3: "u tuyến ống" 5* vs "polyp tuyến ống" 2. VJOL: "polyp tuyến ống" 2; "u tuyến thể ống" 1; "polyp u tuyến" 16*. Trích dẫn: YHQS26-polyp, BYT-CRC18 ("u tuyến").
- **tubulovillous adenoma → u tuyến ống nhung mao**. 1 (KHSK26-EMR). **villous adenoma → u tuyến nhung mao**: 0.
- **sessile serrated lesion → tổn thương răng cưa không cuống**. 1 (KHTH26-SSL). "polyp răng cưa" 1. **traditional serrated adenoma → u tuyến răng cưa truyền thống**: 0.
- **hyperplastic polyp → polyp tăng sản**. 5 vs "polyp quá sản" 1 (YDH22-polyp). Trích dẫn: KHSK26-polyp.
- **juvenile polyp → polyp thiếu niên**. 0. "polyp trẻ em" 1 (kết quả không liên quan, là polyp mũi).
- **Peutz-Jeghers polyp → polyp Peutz-Jeghers**. 2; "hội chứng Peutz-Jeghers" 3. Trích dẫn: TCNCYH26-PJ.
- **familial adenomatous polyposis → bệnh đa polyp tuyến gia đình (FAP)**. "đa polyp tuyến gia đình" 2 (VMJ26-FAP: "hội chứng..."); "đa polyp đại trực tràng gia đình" 0 (BYT-CRC18 dùng "bệnh đa polyp đại trực tràng gia đình (FAP)").

### Ung thư đại trực tràng
- **colorectal adenocarcinoma → ung thư biểu mô tuyến đại trực tràng**. VJOL lỗi 500. OJS3: 10 (TCNCYH 1, CTUMP 3, YDLS 6). VMJ: nhiều tiêu đề (vd VMJ-14726). "carcinôm tuyến đại trực tràng" 3 + CTUMP 1 (VMJ25-CDX2, VMJ25-SATB2, YDHCT21). "ung thư biểu mô tuyến trực tràng" 5. Trích dẫn: YDLS23-MSI, YDHCT26-MMR, VMJ-14726.
- **adenocarcinoma (chung) → ung thư biểu mô tuyến**. 183 vs "carcinôm tuyến" 20 + "carcinom tuyến" 3. "carcinôm tuyến" gặp ở Y học TP.HCM, TC Y Dược học Cần Thơ và các bài của nhóm TP.HCM đăng trên VMJ. VMJ "carcinôm tuyến": 8 kết quả, 4 thuộc tiêu hóa.
- **mucinous adenocarcinoma → ung thư biểu mô tuyến nhầy**. "ung thư biểu mô tuyến nhầy": VJOL 0, YDLS 1; BYT-GC20; TCNCYH24-LAMN. "tuyến nhày" 2 (YDLS24-CRC); "tuyến dạng nhầy" 1 + CTUMP 1; "tiết nhầy" 0. BYT-CRC18 dùng "u dạng nhầy". Chính tả: "chất nhầy" 21 vs "chất nhày" 2.
- **medullary carcinoma → ung thư biểu mô thể tủy**. Tiêu hóa 0. "thể tủy" 7, chủ yếu tuyến giáp.
- **intramucosal carcinoma → ung thư biểu mô trong niêm mạc**. 0 cho cả 4 biến thể.
- **tumour budding → nảy chồi u**. Số đếm cụm 36* (không phân biệt "u"/"bướu"). Tiêu đề VJOL: "nảy chồi u" 4 (YDLS22-bud, YDLS26-pT1, YHLS21-bud, YDHCT24-bud) vs "nảy chồi bướu" 1 (YHLS25-buou) + 1 hốc miệng. VMJ: "nảy chồi u" 3 (VMJ-14726, VMJ-6797, vú) vs "nảy chồi bướu" 1 (VMJ-12193, hốc miệng). OJS3: CTUMP 2, YDLS 2.
- **perineural invasion → xâm nhập quanh thần kinh**. "xâm nhập quanh thần kinh" 3 (YHCM26-catenin, YDLS25-PDL1, YDHCT26-PDL1); "xâm lấn quanh thần kinh" 1; "xâm nhập thần kinh" 6 (YDLS24-CRC, YDLS26-HSP110); "xâm lấn thần kinh" 5 (một phần ngoài tiêu hóa). OJS3: xâm nhập 5 vs xâm lấn 1. BYT-CRC18: "xâm lấn thần kinh" 1.
- **lymphovascular invasion → xâm nhập mạch bạch huyết**. "xâm nhập mạch" 20 (trong đó "xâm nhập mạch máu" 7); "xâm lấn mạch" 22 (trong đó "xâm lấn mạch máu" 19). "xâm nhập mạch bạch huyết" 1; "xâm nhập mạch lympho" 1 (VMJ26-K); "xâm lấn mạch bạch huyết" 0; "xâm lấn mạch lympho" 0. BYT-GC20: "xâm nhập mạch bạch huyết" 2. BYT-CRC18: "xâm lấn mạch bạch huyết" 2. TCNCYH25-TRG: "xâm nhập mạch".
- **extramural venous invasion → xâm lấn mạch máu ngoài thành (EMVI)**. 2 (YDHCT24-EMVI); "xâm lấn tĩnh mạch ngoài thành" 0; "EMVI" 5 (y văn cộng hưởng từ, vd VMJ25-TNT, VMJ26-MRI).
- **tumour deposit → nhân lắng đọng**. BYT-CRC18 (N1c) có 1. Tạp chí: "nhân lắng đọng" 0, "nhân lắng đọng u" 0, "nốt lắng đọng (khối) u" 0. "lắng đọng u" 224* và "nốt u" 238* vô nghĩa (OJS bỏ từ "u"). "nhân vệ tinh" 31, nhưng không có tiêu đề ung thư đại trực tràng nào dùng cụm này.
- **circumferential resection margin → diện cắt vòng quanh (CRM)**. "diện cắt vòng quanh" 6 (YDHCT22-CRM và 2 bài khác của Cần Thơ); CTUMP 5; VMJ-9998. "diện cắt chu vi" 4 (YDLS23-TME...); YDLS 4; BYT-GC20 2 (dùng cho diện cắt ngang/HM trong ESD dạ dày, không phải CRM). "bờ cắt chu vi" 5* (thực chất ≈1). "diện cắt quanh chu vi" 0. BYT-CRC18: "diện cắt xung quanh u".
- **total mesorectal excision → cắt toàn bộ mạc treo trực tràng (TME)**. 10 (gộp cả "cắt bỏ toàn bộ"). BYT-CRC18 1. Trích dẫn: YDLS23-TME, YHLS18-TaTME.
- **tumour regression grade → độ thoái triển u (TRG)**. Tiêu đề: TCNCYH25-TRG ("thoái triển u", trong tóm tắt ghi "phân độ thoái triển u theo Dworak"). "đáp ứng mô bệnh học" 10* (YHQS26-Mandard; YDLS 5). "mức độ thoái triển u" 2*. YDHQS26-TNT ghi "đáp ứng với điều trị tân bổ trợ... trên giải phẫu bệnh".
- **neoadjuvant chemoradiotherapy → hóa xạ trị tiền phẫu**. Tiêu đề: TCNCYH25-TRG, YHQS26-Mandard, YDLS23-HXTTP, UTH26-HXTTP. "hóa xạ trị tân bổ trợ" 1 tiêu đề (VMJ25-TNT, "toàn phần"). BYT-CRC18: "hóa xạ trị tiền phẫu". Số VJOL (tân bổ trợ 40 vs tiền phẫu 25) không dùng được: OJS bỏ "xạ" và "bổ", nên đếm cả hóa trị đơn thuần.
- **mismatch repair deficiency / MMR protein → thiếu hụt hệ thống sửa chữa ghép cặp sai (dMMR) / protein sửa chữa ghép cặp sai (MMR)**. "sửa chữa ghép cặp sai" 3 (TCNCYH21-MMR, YDH23-MMR, TCNCYH24-MMR); OJS3 2. "sửa chữa bắt cặp sai" 2 (YHLS23-MMRD, nội mạc tử cung). "sửa lỗi bắt cặp sai" 1. Các dạng "không phù hợp" 0. BYT-GC20: "thiếu hụt hệ thống sửa chữa ghép cặp sai (dMMR)" 4. BYT-CRC18: "sửa chữa bắt cặp sai" 1.
- **microsatellite instability → mất ổn định vi vệ tinh (MSI)**. 6 (YDLS23-MSI, VMJ26-MSI); BYT-CRC18 1; BYT-GC20 3. "bất ổn định vi vệ tinh" 1; "mất ổn định tiểu vệ tinh" 0.
- **loss of expression → mất biểu hiện**. 8 (YHLS23-MMRD, YDHCT26-MMR). "mất bộc lộ" 2*. Lưu ý: khi nói về biểu hiện protein MMR, tiêu đề dùng cả "biểu hiện" (YDHCT26, TCNCYH24) lẫn "bộc lộ" (TCNCYH21, YDH23).
- **Lynch syndrome → hội chứng Lynch**. 2; BYT-CRC18 1; MPR25 (tiếng Anh).
- **MLH1 / PMS2 / MSH2 / MSH6**: giữ nguyên (YDHCT26-MMR).

### Ruột thừa / phúc mạc
- **low-grade appendiceal mucinous neoplasm → u tân sinh nhầy ruột thừa độ thấp (LAMN)**. Tiêu đề VMJ25-LAMN: "u tân sinh nhầy ruột thừa độ thấp". TCNCYH24-LAMN: "u nhầy ruột thừa độ thấp (LAMN)", "u nhầy độ cao (HAMN)", "u tân sinh chế nhầy ruột thừa"; trong tài liệu tham khảo của bài này có một bài VMJ tên "tân sinh chế nhày ruột thừa". VJOL: "u nhầy ruột thừa độ thấp" 2* (gồm cả 2 bài trên); "tân sinh nhầy ruột thừa" 1; "u nhầy ruột thừa" 2.
- **pseudomyxoma peritonei → giả u nhầy phúc mạc**. TCNCYH24-LAMN (cùng bài có 1 lần "giả nhầy phúc mạc"); Vinmec; BVNTP-PMP. VJOL: 0 cho mọi dạng.

### Ống hậu môn
- **anal squamous intraepithelial lesion → tổn thương nội biểu mô vảy ống hậu môn**. "tổn thương nội biểu mô vảy" 1 (cổ tử cung); "tổn thương nội biểu mô gai" 1. Dạng này theo pack cha.
- **haemorrhoid → trĩ**. "bệnh trĩ" 24; "trĩ nội" 9; "búi trĩ" 4; BYT-QTKT21 35.
- **polypectomy margin → diện cắt polyp**. 0. "bờ cắt polyp" 26* là số đếm của cụm "cắt polyp". Pack cha: resection margin = diện cắt.

### Các lớp thành ống tiêu hóa
- **lamina propria → lớp đệm**. 21*, lẫn kỹ thuật/vật liệu. "mô đệm niêm mạc" 1. Vinmec-MC: "lớp đệm niêm mạc".
- **muscularis mucosae → lớp cơ niêm**. BYT-CRC18 1, BYT-QTKT21 1, YDLS 1. BYT-GC20: "cơ niêm". Số VJOL 15* không dùng được.
- **submucosa → lớp dưới niêm mạc**. 9; tiêu đề "dưới niêm mạc" 11 (u dưới niêm mạc, cắt tách dưới niêm mạc...). "lớp hạ niêm mạc": BYT-GC20 2, BYT-CRC18 1, YDLS 1. BYT-CRC18 TNM T1: "lớp dưới niêm mạc".
- **muscularis propria → lớp cơ thực sự**. OJS3: TCNCYH 1, YDLS 1 (*). "lớp cơ riêng" 0. BYT-CRC18 TNM T2 chỉ ghi "lớp cơ". Số VJOL không dùng được.
- **subserosa → lớp dưới thanh mạc**. "dưới thanh mạc" 6; BYT-CRC18 2 ("lớp dưới thanh mạc").
- **mucin → chất nhầy**. 21 vs "chất nhày" 2; "chế nhầy" 3.
