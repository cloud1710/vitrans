# sources.md: radiology (Chẩn đoán hình ảnh), draft 0.1.0

Nguồn bằng chứng cho từng thuật ngữ. File chỉ ghi cặp thuật ngữ, số đếm, mã trích dẫn và URL; không chép câu nào từ bài báo.

## Cách đếm

- Kho: `D:/vitranslate-corpus` (dùng chung). Run `pack-2026-10-15-radiology` tải 30 / 40 request qua `tools/corpus_fetch.py`
  (27 PDF + 1 robots.txt mới + 2 robots.txt lấy từ cache). Cộng với các tệp đã có của các run trước (wave1-thyroid,
  wave1-kidney, wave1-molecular, pathology-core, nutrition, và các run song song cùng đêm: surgery, obgyn, medicine,
  pathology-hemato), tổng cộng 263 văn bản tiếng Việt được đếm. Các nguồn tiếng Anh (EBI, NCBI, IDDSI) không tính.
- Trích chữ bằng pypdf (env `vitranslate`), NFC, chữ thường, gộp dấu kiểu cũ (hoá = hóa). PDF của Y học TP.HCM bị lỗi font:
  "{" = á, "|" = à, "}" = â, và chèn khoảng trắng giữa chữ. Vì vậy cụm nhiều từ được đếm sau khi bỏ mọi khoảng trắng
  (cả trong mẫu lẫn văn bản); từ đơn đếm theo ranh giới từ.
- Đếm theo **số tài liệu** có ít nhất một lần xuất hiện. "S" = số tài liệu phía Nam: Y học TP.HCM (mọi chuyên đề),
  BV Bình Dân, BV Nguyễn Tri Phương, BV ĐH Y Dược, TC Y Dược học Cần Thơ. Các nguồn còn lại: TC Điện quang & Y học hạt nhân
  Việt Nam (vjrnm.edu.vn, toàn quốc), TCNCYH, BV 103, YDLS 108 (Bắc), TC Y Dược học Huế (Trung).
- Quy tắc chọn: dạng có nhiều tài liệu phía Nam nhất; không có dạng phía Nam thì dạng toàn quốc / Bắc; giữ tiếng Anh khi y
  văn giữ (RADS, RECIST, SUVmax, T1W / T2W, PET/CT). Dòng "BUILT" ghép từ thành tố đã có bằng chứng (ví dụ "bắt thuốc" +
  "viền"); "LOW" = dưới 2 tài liệu hoặc chỉ có bằng chứng web.
- Bằng chứng web (WebSearch, không có tệp trong kho): O-RADS (vnras.com, tapchiyhcd.vn: tên bài giữ "O-RADS"), Lung-RADS
  và "nốt bán đặc" (vnras.com, jmp.huemed), "bờ tua gai" (không có kết quả nào). Danh mục bài của số chuyên đề Chẩn đoán hình
  ảnh - Y tế công cộng, Y học TP.HCM tập 26 số 2 (2022), lấy bằng 1 WebFetch: các tên bài được dùng làm bằng chứng phụ
  ("bắt thuốc thì muộn", "cộng hưởng từ chức năng", "chụp cắt lớp vi tính mạch máu", "giả phình").
- Seed thủ thuật: ICD-9-CM bản QĐ 387/QĐ-BYT 2026 chương 87-88, 92 (đã có trong kho, 0 request): "chụp x-quang ... có cản
  quang", "siêu âm chẩn đoán", "xạ hình", "chụp động mạch", "qua da". Văn phong mã hóa, chỉ dùng làm ứng viên.
- Không dùng MedEV; không dùng số đếm của ô tìm kiếm OJS.

## Bảng thuật ngữ

Cột: khóa tiếng Anh | tiếng Việt đã chọn | số tài liệu (phía Nam) của dạng đã chọn | biến thể khác: số tài liệu (phía Nam) | mã nguồn (tối đa 3).

| EN | VI | Docs (S) | Biến thể khác | Nguồn |
|---|---|---|---|---|
| radiology | chẩn đoán hình ảnh | 69 (43) | - | BVBD-PDUB2020, YHCM22-CDHA98 |
| diagnostic imaging | chẩn đoán hình ảnh | 69 (43) | - | BVBD-PDUB2020, YHCM22-CDHA98 |
| interventional radiology | điện quang can thiệp | 2 (1) | 'X quang can thiệp' 1 (S 1) | BVBD-PDUB2020, DQYHHN-1302 |
| radiologist | bác sĩ chẩn đoán hình ảnh | 7 (5) | - | DQYHHN-1110, DQYHHN-574, YHCM22-CDHA189 |
| nuclear medicine | y học hạt nhân | 8 (2) | - | BV103-UTTG, BVBD-PDUB2020, CTUMP-709 |
| imaging features | đặc điểm hình ảnh | 33 (21) | - | CTUMP-2755, DQYHHN-1418, YHCM22-CDHA138 |
| imaging findings | đặc điểm hình ảnh | 33 (21) | - | CTUMP-2755, DQYHHN-1418, YHCM22-CDHA138 |
| computed tomography | cắt lớp vi tính | 50 (27) | 'CLVT' 34 (S 17) | BVBD-PDUB2020, CTUMP-2755, CTUMP-582 |
| CT scan | chụp cắt lớp vi tính | 42 (25) | 'chụp CLVT' 23 (S 13), 'chụp CT' 17 (S 11) | BVBD-PDUB2020, CTUMP-2077, CTUMP-582 |
| CT scanner | máy chụp cắt lớp vi tính | 8 (4) | - | BVBD-PDUB2020, DQYHHN-1418, VNRAS-huong-dan-quy-tr |
| contrast-enhanced CT | cắt lớp vi tính có tiêm thuốc cản quang | 9 (5) | 'tiêm thuốc tương phản' 9 (S 8) | BVBD-PDUB2020, CTUMP-612, DQYHHN-413 |
| contrast-enhanced computed tomography | cắt lớp vi tính có tiêm thuốc cản quang | 9 (5) | - | BVBD-PDUB2020, CTUMP-612, DQYHHN-413 |
| non-contrast CT | cắt lớp vi tính không tiêm thuốc cản quang | 7 (4) | - | BVBD-PDUB2020, DQYHHN-1110, YHCM22-CDHA189 |
| unenhanced CT | cắt lớp vi tính không tiêm thuốc cản quang | 7 (4) | - | BVBD-PDUB2020, DQYHHN-1110, YHCM22-CDHA189 |
| multidetector CT | cắt lớp vi tính đa dãy đầu thu (MDCT) | 5 (3) | 'đa dãy đầu thu' 2 (S 1), 'đa lát cắt' 2 (S 2) | BVBD-PDUB2020, DQYHHN-1387, DQYHHN-48 |
| multidetector computed tomography | cắt lớp vi tính đa dãy đầu thu (MDCT) | 5 (3) | - | BVBD-PDUB2020, DQYHHN-1387, DQYHHN-48 |
| 64-slice CT | cắt lớp vi tính 64 dãy | 3 (0) | '128 dãy' 1 (S 1) | JMPM-666, VJOL-79831, YDHUE20-03017-15_2_25 |
| CT angiography | chụp cắt lớp vi tính mạch máu (CTA) | 2 (1) | - | DQYHHN-48, YHCM22-CDHA67 |
| dual-energy CT | cắt lớp vi tính hai mức năng lượng | 1 (1) | 'năng lượng kép' 1 (S 1) | YHCM22-CDHA21 |
| low-dose CT | cắt lớp vi tính liều thấp | 2 (0) | 'CLVT liều thấp' 1 (S 0) | YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| magnetic resonance imaging | cộng hưởng từ | 27 (16) | 'CHT' 13 (S 10) | BVBD-PDUB2020, DQYHHN-574, YHCM22-CDHA98 |
| MRI scan | chụp cộng hưởng từ | 15 (10) | 'chụp CHT' 7 (S 6) | BVBD-PDUB2020, DQYHHN-1385, DQYHHN-574 |
| contrast-enhanced MRI | cộng hưởng từ có tiêm thuốc tương phản | 9 (8) | - | DQYHHN-574, YHCM22-CDHA159, YHCM22-CDHA189 |
| multiparametric MRI | cộng hưởng từ đa thông số (mpMRI) | 1 (0) | - | DQYHHN-1385 |
| diffusion-weighted imaging | cộng hưởng từ khuếch tán (DWI) | 5 (4) | 'xung khuếch tán' 3 (S 1) | YHCM22-CDHA8, YHCM22-CDHA98 |
| diffusion-weighted MRI | cộng hưởng từ khuếch tán (DWI) | 5 (4) | - | YHCM22-CDHA8, YHCM22-CDHA98 |
| dynamic contrast-enhanced MRI | cộng hưởng từ động học bắt thuốc (DCE-MRI) | 4 (3) | 'động học ngấm thuốc' 1 (S 0) | DQYHHN-574, YHCM22-CDHA98 |
| time-intensity curve | đường cong động học | 2 (1) | - | DQYHHN-574, YHCM22-CDHA8 |
| kinetic curve | đường cong động học | 2 (1) | - | DQYHHN-574, YHCM22-CDHA8 |
| perfusion imaging | hình ảnh tưới máu | 17 (12) | - | BVBD-PDUB2020, YHCM16-S35, YHCM26-S56 |
| perfusion | tưới máu | 17 (12) | - | BVBD-PDUB2020, YHCM16-S35, YHCM26-S56 |
| hypoperfusion | giảm tưới máu | 7 (5) | - | BVBD-PDUB2020, HOSREM-13.pdf, YHCM26-S56 |
| functional MRI | cộng hưởng từ chức năng (fMRI) | 0 (0) | - | - |
| MR spectroscopy | cộng hưởng từ phổ | 1 (1) | - | BVBD-PDUB2020 |
| magnetic resonance angiography | chụp cộng hưởng từ mạch máu (MRA) | 0 (0) | - | - |
| MR angiography | chụp cộng hưởng từ mạch máu (MRA) | 0 (0) | - | - |
| magnetic resonance cholangiopancreatography | chụp cộng hưởng từ mật tụy (MRCP) | 0 (0) | - | - |
| ultrasound | siêu âm | 99 (57) | - | BVBD-PDUB2020, DQYHHN-413, ELIB-d06c3841337245a3 |
| ultrasonography | siêu âm | 99 (57) | - | BVBD-PDUB2020, DQYHHN-413, ELIB-d06c3841337245a3 |
| Doppler ultrasound | siêu âm Doppler | 10 (4) | - | BVBD-PDUB2020, DQYHHN-1110, ELIB-d06c3841337245a3 |
| color Doppler | Doppler màu | 4 (1) | - | BVBD-PDUB2020, DQYHHN-1110, YDHUE20-03016-15_59_25 |
| contrast-enhanced ultrasound | siêu âm có tiêm thuốc tương phản (CEUS) | 0 (0) | - | - |
| elastography | siêu âm đàn hồi | 0 (0) | 'đàn hồi mô' 0 (S 0) | - |
| endoscopic ultrasound | siêu âm nội soi (EUS) | 2 (2) | - | BVBD-PDUB2020, BVNTP-phau-thuat-cat-ban-phan-da-day-noi-soi-va-nao-ve |
| transducer | đầu dò | 15 (9) | - | BVBD-PDUB2020, VNRAS-huong-dan-quy-tr, YHCM25-S68 |
| radiography | chụp X quang | 9 (6) | 'chụp X-quang' 2 (S 1) | BVBD-PDUB2020, BVNTP-ung-thu-tuyen-giap-phan-2, YHCM16-S116 |
| radiograph | phim X quang | 4 (1) | 'phim chụp' 12 (S 6) | BVBD-PDUB2020, YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| plain radiograph | phim X quang thường quy | 1 (1) | 'X quang quy ước' 1 (S 1) | BVBD-PDUB2020 |
| chest X-ray | X quang ngực | 8 (7) | 'X quang phổi' 9 (S 7) | BVBD-PDUB2020, CTUMP-1250, YHCM16-S116 |
| chest radiograph | phim X quang ngực | 8 (7) | - | BVBD-PDUB2020, CTUMP-1250, YHCM16-S116 |
| angiography | chụp mạch | 16 (8) | - | BVBD-PDUB2020, DQYHHN-48, YHCM22-CDHA67 |
| digital subtraction angiography | chụp mạch số hóa xóa nền (DSA) | 2 (2) | 'số hóa xóa nền' 24 (S 23) | BVBD-PDUB2020, YHCM22-CDHA67 |
| positron emission tomography | chụp cắt lớp phát xạ positron (PET) | 0 (0) | - | - |
| PET/CT | PET/CT | 6 (3) | 'PET-CT' 5 (S 3) | BVBD-PDUB2020, DQYHHN-36, TCNCYH-914 |
| standardized uptake value | giá trị hấp thu chuẩn (SUV) | 0 (0) | - | - |
| SUVmax | SUVmax | 1 (0) | - | DQYHHN-36 |
| FDG-avid | tăng hấp thu FDG | 2 (1) | - | BVBD-PDUB2020, DQYHHN-36 |
| hypermetabolic | tăng chuyển hóa | 5 (2) | - | BVBD-PDUB2020, ELIB-d06c3841337245a3, TCNCYH-969 |
| scintigraphy | xạ hình | 17 (12) | - | BV103-UTTG, BVBD-PDUB2020, TCNCYH-666 |
| bone scan | xạ hình xương | 5 (4) | - | BV103-UTTG, BVBD-PDUB2020, YHCM26-S121 |
| bone scintigraphy | xạ hình xương | 5 (4) | - | BV103-UTTG, BVBD-PDUB2020, YHCM26-S121 |
| single-photon emission computed tomography | chụp cắt lớp vi tính đơn photon (SPECT) | 0 (0) | - | - |
| radiotracer | dược chất phóng xạ | 1 (1) | - | BVBD-PDUB2020 |
| radiopharmaceutical | dược chất phóng xạ | 1 (1) | - | BVBD-PDUB2020 |
| attenuation | đậm độ | 15 (13) | 'tỷ trọng' 10 (S 2), 'tỉ trọng' 3 (S 0) | CTUMP-612, YHCM22-CDHA125, YHCM22-CDHA189 |
| hypodense | giảm đậm độ | 3 (3) | 'giảm tỷ trọng' 3 (S 1) | CTUMP-612, YHCM16-S116, YHCM22-CDHA125 |
| hyperdense | tăng đậm độ | 5 (4) | 'tăng tỷ trọng' 5 (S 1) | CTUMP-612, YHCM22-CDHA159, YHCM22-CDHA34 |
| isodense | đồng đậm độ | 3 (3) | 'đồng tỷ trọng' 2 (S 1) | BVBD-PDUB2020, CTUMP-612, YHCM16-S116 |
| hypoattenuating | giảm đậm độ | 3 (3) | 'giảm tỷ trọng' 3 (S 1) | CTUMP-612, YHCM16-S116, YHCM22-CDHA125 |
| hyperattenuating | tăng đậm độ | 5 (4) | 'tăng tỷ trọng' 5 (S 1) | CTUMP-612, YHCM22-CDHA159, YHCM22-CDHA34 |
| isoattenuating | đồng đậm độ | 3 (3) | 'đồng tỷ trọng' 2 (S 1) | BVBD-PDUB2020, CTUMP-612, YHCM16-S116 |
| low attenuation | đậm độ thấp | 3 (2) | 'tỷ trọng thấp' 2 (S 0) | TAPCHIYHOCTPHCM-10418, YDHUE20-03016-16_9_7, YHCM16-S116 |
| Hounsfield unit | đơn vị Hounsfield (HU) | 2 (1) | 'HU' 56 (S 46) | BVBD-PDUB2020, DQYHHN-48 |
| unenhanced attenuation | đậm độ trước tiêm thuốc | 0 (0) | 'đậm độ thì không tiêm' 0 (S 0) | - |
| fat attenuation | đậm độ mỡ | 0 (0) | 'tỷ trọng mỡ' 1 (S 0) | - |
| fluid attenuation | đậm độ dịch | 0 (0) | 'tỷ trọng dịch' 0 (S 0) | - |
| soft-tissue attenuation | đậm độ mô mềm | 1 (0) | 'tỷ trọng mô mềm' 0 (S 0) | DQYHHN-1418 |
| signal intensity | cường độ tín hiệu | 2 (1) | 'tín hiệu' 32 (S 19) | VNRAS-huong-dan-quy-tr, YHCM22-CDHA8 |
| hyperintense | tín hiệu cao | 7 (5) | 'tăng tín hiệu' 7 (S 3) | YHCM22-CDHA86, YHCM22-CDHA98 |
| hypointense | tín hiệu thấp | 7 (5) | 'giảm tín hiệu' 5 (S 2) | DQYHHN-574, YHCM22-CDHA98 |
| isointense | đồng tín hiệu | 3 (1) | - | BVBD-PDUB2020, DQYHHN-356, DQYHHN-574 |
| hyperintensity | tín hiệu cao | 7 (5) | 'tăng tín hiệu' 7 (S 3) | YHCM22-CDHA86, YHCM22-CDHA98 |
| hypointensity | tín hiệu thấp | 7 (5) | 'giảm tín hiệu' 5 (S 2) | DQYHHN-574, YHCM22-CDHA98 |
| T1-weighted | T1W | 8 (5) | 'xung T1' 2 (S 1) | DQYHHN-1110, DQYHHN-574, YHCM22-CDHA86 |
| T2-weighted | T2W | 8 (5) | 'xung T2' 4 (S 2) | DQYHHN-574, YHCM22-CDHA98 |
| pulse sequence | chuỗi xung | 13 (8) | - | DQYHHN-574, YHCM22-CDHA16, YHCM22-CDHA8 |
| fat-suppressed | xóa mỡ | 4 (3) | 'ức chế mỡ' 0 (S 0) | DQYHHN-574, YHCM22-CDHA98 |
| fat suppression | xóa mỡ | 4 (3) | 'ức chế mỡ' 0 (S 0) | DQYHHN-574, YHCM22-CDHA98 |
| fat-saturated | xóa mỡ | 4 (3) | - | DQYHHN-574, YHCM22-CDHA98 |
| in-phase | trong pha | 1 (0) | - | DQYHHN-1302 |
| opposed-phase | lệch pha | 0 (0) | 'ngoài pha' 0 (S 0) | - |
| chemical shift imaging | chuỗi xung dịch chuyển hóa học | 1 (1) | - | YHCM22-CDHA79 |
| restricted diffusion | hạn chế khuếch tán | 6 (4) | 'khuếch tán hạn chế' 0 (S 0) | DQYHHN-1385, YHCM22-CDHA79, YHCM22-CDHA98 |
| diffusion restriction | hạn chế khuếch tán | 6 (4) | - | DQYHHN-1385, YHCM22-CDHA79, YHCM22-CDHA98 |
| apparent diffusion coefficient | hệ số khuếch tán biểu kiến (ADC) | 2 (1) | - | DQYHHN-1385, YHCM22-CDHA8 |
| ADC map | bản đồ ADC | 6 (5) | - | DQYHHN-1385, YHCM22-CDHA79, YHCM22-CDHA8 |
| ADC value | giá trị ADC | 8 (5) | - | DQYHHN-1385, YHCM22-CDHA79, YHCM22-CDHA86 |
| b-value | giá trị b | 18 (10) | - | BVBD-PDUB2020, DQYHHN-1385, HSA-TS-Nguyen-Van-Ch |
| gadolinium-based contrast agent | thuốc tương phản chứa gadolinium (GBCA) | 15 (11) | 'thuốc đối quang từ' 2 (S 1), 'thuốc tương phản từ' 1 (S 1) | YHCM22-CDHA189, YHCM22-CDHA98 |
| gadolinium contrast | thuốc tương phản chứa gadolinium | 15 (11) | - | YHCM22-CDHA189, YHCM22-CDHA98 |
| hepatobiliary phase | thì gan mật | 1 (0) | 'pha gan mật' 0 (S 0) | DQYHHN-356 |
| late gadolinium enhancement | bắt thuốc thì muộn (LGE) | 0 (0) | 'ngấm thuốc muộn' 0 (S 0) | - |
| artifact | ảnh giả | 14 (10) | 'xảo ảnh' 2 (S 1), 'nhiễu ảnh' 1 (S 1) | CTUMP-1904, TCNCYH-4427, YDHUE20-03017-15_2_25 |
| artefact | ảnh giả | 14 (10) | - | CTUMP-1904, TCNCYH-4427, YDHUE20-03017-15_2_25 |
| motion artifact | ảnh giả do chuyển động | 14 (10) | - | CTUMP-1904, TCNCYH-4427, YDHUE20-03017-15_2_25 |
| susceptibility artifact | ảnh giả nhiễu từ | 14 (10) | - | CTUMP-1904, TCNCYH-4427, YDHUE20-03017-15_2_25 |
| spatial resolution | độ phân giải không gian | 13 (9) | - | BVBD-PDUB2020, YHCM19-S255, YHCM22-CDHA16 |
| echogenicity | độ hồi âm | 4 (3) | 'độ hồi âm' 1 (S 1) | CTUMP-1904, DQYHHN-1302, YHCM18-S001 |
| hypoechoic | giảm âm | 12 (5) | 'giảm hồi âm' 0 (S 0), 'echo kém' 0 (S 0) | CTUMP-1904, DQYHHN-413, TCNCYH-2613 |
| markedly hypoechoic | rất giảm âm | 1 (1) | - | CTUMP-1904 |
| hyperechoic | tăng âm | 8 (2) | 'tăng hồi âm' 0 (S 0) | DQYHHN-1302, DQYHHN-413, HOSREM-13.pdf |
| isoechoic | đồng âm | 3 (1) | - | CTUMP-1904, DQYHHN-1302, DQYHHN-413 |
| anechoic | trống âm | 2 (2) | - | BVBD-PDUB2020, CTUMP-1904 |
| heterogeneous echotexture | cấu trúc âm không đồng nhất | 1 (0) | 'không đồng nhất' 31 (S 16) | ELIB-d06c3841337245a3 |
| echogenic foci | chấm tăng âm | 0 (0) | 'nốt tăng âm' 1 (S 0) | - |
| posterior acoustic shadowing | bóng lưng | 1 (1) | 'bóng cản' 0 (S 0) | YHCM25-S68 |
| acoustic shadowing | bóng lưng | 1 (1) | - | YHCM25-S68 |
| posterior acoustic enhancement | tăng âm phía sau | 0 (0) | 'tăng âm sau' 0 (S 0) | - |
| comet-tail artifact | ảnh giả đuôi sao chổi | 1 (1) | - | CTUMP-1904 |
| taller-than-wide | chiều cao lớn hơn chiều rộng | 2 (2) | 'cao hơn rộng' 0 (S 0) | BVBD-PDUB2020, BVNTP-chan-doan-va-dieu-tri-ung-thu-tuyen-giap |
| hypervascular | tăng sinh mạch | 15 (6) | 'giàu mạch' 4 (S 1) | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-413 |
| hypovascular | nghèo mạch | 3 (3) | - | YHCM22-CDHA138, YHCM22-CDHA98 |
| resistive index | chỉ số kháng (RI) | 0 (0) | - | - |
| peak systolic velocity | vận tốc đỉnh tâm thu (PSV) | 1 (0) | - | VJOG-71 |
| solid component | thành phần đặc | 4 (3) | - | BV103-UTTG, YHCM18-S001, YHCM22-CDHA79 |
| cystic component | thành phần nang | 0 (0) | 'dạng nang' 14 (S 12) | - |
| septation | vách | 18 (14) | - | BVBD-PDUB2020, CTUMP-582, ELIB-d06c3841337245a3 |
| mural nodule | nốt thành | 2 (2) | - | YHCM22-CDHA98 |
| simple cyst | nang đơn thuần | 2 (0) | - | BV103-UTTG, YDHUE20-06029-17_23_11 |
| complex cyst | nang phức tạp | 0 (0) | - | - |
| ultrasound-guided | dưới hướng dẫn siêu âm | 13 (7) | 'dưới hướng dẫn của siêu âm' 6 (S 3) | BVBD-PDUB2020, TCNCYH-4341, huejmp.vn-343 |
| ultrasound-guided biopsy | sinh thiết dưới hướng dẫn siêu âm | 13 (7) | - | BVBD-PDUB2020, TCNCYH-4341, huejmp.vn-343 |
| ultrasound-guided fine needle aspiration | chọc hút tế bào bằng kim nhỏ dưới hướng dẫn siêu âm | 13 (7) | - | BVBD-PDUB2020, TCNCYH-4341, huejmp.vn-343 |
| mass | khối | 153 (84) | - | BVBD-PDUB2020, ELIB-d06c3841337245a3, YHCM25-S59 |
| nodule | nốt | 25 (15) | - | CTUMP-1904, YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| solid nodule | nốt đặc | 4 (1) | - | BVBD-PDUB2020, YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| part-solid nodule | nốt bán đặc | 0 (0) | 'bán đặc' 0 (S 0) | - |
| subsolid nodule | nốt bán đặc | 0 (0) | - | - |
| ground-glass nodule | nốt kính mờ | 2 (0) | - | YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| ground-glass opacity | kính mờ | 3 (1) | - | YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25, YHCM22-CDHA34 |
| pulmonary nodule | nốt phổi | 1 (1) | - | YHCM16-S116 |
| lung nodule | nốt phổi | 1 (1) | - | YHCM16-S116 |
| cavitation | tạo hang | 4 (2) | - | YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25, YHCM18-S10 |
| space-occupying lesion | tổn thương choán chỗ | 1 (1) | - | YHCM22-CDHA79 |
| mass effect | hiệu ứng khối | 2 (1) | 'đè đẩy' 2 (S 1) | BVBD-PDUB2020, YDHUE20-06029-17_23_11 |
| midline shift | di lệch đường giữa | 0 (0) | - | - |
| peritumoral edema | phù quanh u | 1 (1) | 'phù quanh tổn thương' 0 (S 0) | BVBD-PDUB2020 |
| fat stranding | thâm nhiễm mỡ | 4 (3) | - | DQYHHN-1110, YHCM16-S116, YHCM22-CDHA125 |
| enlarged lymph node | hạch to | 8 (5) | - | BVBD-PDUB2020, BVNTP-giai-phau-benh-hoc-benh-ly-hach-limphop3, TCNCYH-5667 |
| fatty hilum | rốn hạch mỡ | 1 (1) | - | BVNTP-giai-phau-benh-hoc-benh-ly-hach-limpho-p1 |
| loss of fatty hilum | mất rốn hạch mỡ | 1 (1) | 'mất rốn hạch' 0 (S 0) | BVNTP-giai-phau-benh-hoc-benh-ly-hach-limpho-p1 |
| central necrosis | hoại tử trung tâm | 3 (1) | - | BVBD-PDUB2020, VJOL-79831, YDHUE20-03016-16_9_7 |
| wall thickening | dày thành | 6 (5) | - | DQYHHN-1418, YHCM22-CDHA138, YHCM22-CDHA159 |
| free fluid | dịch tự do | 1 (1) | 'dịch tự do ổ bụng' 1 (S 1) | BVBD-PDUB2020 |
| air-fluid level | mức khí dịch | 1 (1) | 'mức khí dịch' 0 (S 0) | CTUMP-2755 |
| biliary dilatation | giãn đường mật | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| bile duct dilatation | giãn đường mật | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| intrahepatic bile duct dilatation | giãn đường mật trong gan | 0 (0) | - | - |
| portal vein thrombosis | huyết khối tĩnh mạch cửa | 5 (3) | - | BVBD-PDUB2020, CTUMP-612, DQYHHN-1387 |
| filling defect | khuyết thuốc | 2 (2) | - | CTUMP-612, YHCM18-S95 |
| osteolytic lesion | tổn thương hủy xương | 6 (6) | - | BVBD-PDUB2020, BVNTP-u-tuyen-yen-pituitary-adenoma, YHCM16-S125 |
| osteoblastic lesion | tổn thương tạo xương | 3 (3) | 'đặc xương' 1 (S 1) | BVBD-PDUB2020, YHCM16-S125, YHCM21-CDHA163 |
| periosteal reaction | phản ứng màng xương | 1 (1) | - | BVBD-PDUB2020 |
| coarse calcification | vôi hóa thô | 1 (1) | - | CTUMP-1904 |
| macrocalcification | vôi hóa thô | 1 (1) | - | CTUMP-1904 |
| rim calcification | vôi hóa viền | 1 (1) | - | CTUMP-1904 |
| peripheral calcification | vôi hóa viền | 1 (1) | - | CTUMP-1904 |
| punctate calcification | vôi hóa dạng chấm | 1 (0) | - | DQYHHN-48 |
| microcalcification | vi vôi hóa | 8 (4) | 'vi canxi hóa' 0 (S 0) | TCNCYH-2613, TCNCYH-2641, YDHUE20-03016-16_9_7 |
| well-defined | ranh giới rõ | 7 (1) | 'giới hạn rõ' 9 (S 7), 'bờ rõ' 1 (S 1) | BVBD-PDUB2020, ELIB-d06c3841337245a3, TCNCYH-666 |
| ill-defined | ranh giới không rõ | 7 (3) | 'giới hạn không rõ' 2 (S 1), 'bờ không rõ' 1 (S 0) | BVBD-PDUB2020, ELIB-d06c3841337245a3, TCNCYH-2613 |
| circumscribed margin | bờ rõ | 1 (1) | 'ranh giới rõ' 7 (S 1) | BVBD-PDUB2020 |
| smooth margin | bờ đều | 7 (4) | - | CTUMP-1904, DQYHHN-574, YHCM16-S116 |
| irregular margin | bờ không đều | 11 (6) | - | BVBD-PDUB2020, CTUMP-1904, VJOL-79831 |
| spiculated margin | bờ tua gai | 1 (0) | 'tua gai' 4 (S 2), 'bờ gai' 1 (S 1), 'dạng gai' 1 (S 1) | YDHUE20-03016-16_9_7 |
| spiculated | tua gai | 4 (2) | - | BVBD-PDUB2020, CTUMP-1904, YDHUE20-03016-16_9_7 |
| lobulated margin | bờ đa cung | 3 (1) | 'đa cung' 4 (S 2), 'bờ chia thùy' 0 (S 0) | YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25, YHCM22-CDHA79 |
| indistinct margin | bờ không rõ | 1 (0) | - | ELIB-d06c3841337245a3 |
| oval shape | hình bầu dục | 7 (6) | - | BVNTP-choc-hut-te-bao-tuyen-giap-bang-kim-nho-fna-tuye, TCNCYH-666, YHCM22-CDHA8 |
| round shape | hình tròn | 10 (7) | - | BVBD-PDUB2020, BVNTP-giai-phau-benh-hoc-benh-ly-tuyen-giap-p3, YHCM16-S160 |
| irregular shape | hình dạng không đều | 2 (2) | - | BVNTP-giai-phau-benh-hoc-benh-ly-hach-limpho-p1, YHCM22-CDHA8 |
| contrast enhancement | bắt thuốc | 13 (10) | 'ngấm thuốc' 16 (S 5), 'tăng quang' 5 (S 4) | DQYHHN-574, YHCM22-CDHA98 |
| contrast-enhancing | bắt thuốc | 13 (10) | 'ngấm thuốc' 16 (S 5) | DQYHHN-574, YHCM22-CDHA98 |
| enhancing lesion | tổn thương bắt thuốc | 13 (10) | - | DQYHHN-574, YHCM22-CDHA98 |
| enhancing mass | khối bắt thuốc | 13 (10) | - | DQYHHN-574, YHCM22-CDHA98 |
| nonenhancing | không bắt thuốc | 2 (1) | 'không ngấm thuốc' 4 (S 1) | CTUMP-612, DQYHHN-1418 |
| non-enhancing | không bắt thuốc | 2 (1) | 'không ngấm thuốc' 4 (S 1) | CTUMP-612, DQYHHN-1418 |
| homogeneous enhancement | bắt thuốc đồng nhất | 0 (0) | 'ngấm thuốc đồng nhất' 0 (S 0) | - |
| heterogeneous enhancement | bắt thuốc không đồng nhất | 3 (2) | 'ngấm thuốc không đồng nhất' 3 (S 1) | CTUMP-2755, VJOL-79831, YHCM22-CDHA8 |
| rim enhancement | bắt thuốc viền | 0 (0) | 'ngấm thuốc viền' 0 (S 0), 'bắt thuốc dạng viền' 0 (S 0) | - |
| ring enhancement | bắt thuốc viền | 0 (0) | - | - |
| marked enhancement | bắt thuốc mạnh | 3 (2) | 'ngấm thuốc mạnh' 7 (S 2) | TAPCHIYHOCTPHCM-10418, VJOL-79831, YHCM22-CDHA8 |
| avid enhancement | bắt thuốc mạnh | 3 (2) | 'ngấm thuốc mạnh' 7 (S 2) | TAPCHIYHOCTPHCM-10418, VJOL-79831, YHCM22-CDHA8 |
| enhancement pattern | kiểu bắt thuốc | 1 (0) | 'kiểu bắt thuốc' 1 (S 1) | DQYHHN-356 |
| hyperenhancement | tăng bắt thuốc | 1 (0) | 'tăng ngấm thuốc' 1 (S 0) | VJOL-79831 |
| hypoenhancement | giảm bắt thuốc | 0 (0) | 'giảm ngấm thuốc' 1 (S 0) | - |
| hypoenhancing | giảm bắt thuốc | 0 (0) | - | - |
| arterial phase hyperenhancement | tăng bắt thuốc thì động mạch (APHE) | 1 (0) | 'ngấm thuốc thì động mạch' 1 (S 0) | DQYHHN-356 |
| delayed enhancement | bắt thuốc thì muộn | 0 (0) | 'ngấm thuốc muộn' 0 (S 0) | - |
| washout | thải thuốc (washout) | 5 (3) | 'washout' 2 (S 2), 'thoát thuốc' 2 (S 2) | CTUMP-612, DQYHHN-1302, DQYHHN-356 |
| washout appearance | hình ảnh thải thuốc (washout) | 5 (3) | - | CTUMP-612, DQYHHN-1302, DQYHHN-356 |
| absolute washout | chỉ số thải tuyệt đối | 1 (1) | 'thải thuốc tuyệt đối' 0 (S 0) | YHCM22-CDHA189 |
| relative washout | chỉ số thải tương đối | 1 (1) | 'thải thuốc tương đối' 0 (S 0) | YHCM22-CDHA189 |
| enhancing capsule | vỏ bao bắt thuốc | 27 (19) | - | BVNTP-giai-phau-benh-hoc-benh-ly-tuyen-giap-p3, CTUMP-612, VJOL-79831 |
| capsule appearance | hình ảnh vỏ bao | 27 (19) | - | BVNTP-giai-phau-benh-hoc-benh-ly-tuyen-giap-p3, CTUMP-612, VJOL-79831 |
| active extravasation | thoát thuốc cản quang | 2 (2) | 'thoát mạch thuốc' 1 (S 1), 'thoát thuốc cản quang' 1 (S 1) | BVBD-PDUB2020, YHCM22-CDHA67 |
| arterial phase | thì động mạch | 5 (3) | 'pha động mạch' 0 (S 0) | CTUMP-612, DQYHHN-1302, DQYHHN-356 |
| late arterial phase | thì động mạch muộn | 1 (0) | - | DQYHHN-1302 |
| portal venous phase | thì tĩnh mạch cửa | 5 (2) | - | BVBD-PDUB2020, CTUMP-612, DQYHHN-1302 |
| venous phase | thì tĩnh mạch | 9 (6) | 'pha tĩnh mạch' 0 (S 0) | CTUMP-612, DQYHHN-356, YHCM22-CDHA21 |
| delayed phase | thì muộn | 2 (0) | 'pha muộn' 1 (S 1) | DQYHHN-356, ELIB-d06c3841337245a3 |
| transitional phase | thì chuyển tiếp | 0 (0) | - | - |
| unenhanced phase | thì không tiêm thuốc | 3 (2) | 'thì trước tiêm' 2 (S 1) | VJOL-79831, YHCM22-CDHA125, YHCM22-CDHA189 |
| non-contrast phase | thì không tiêm thuốc | 3 (2) | - | VJOL-79831, YHCM22-CDHA125, YHCM22-CDHA189 |
| precontrast | trước tiêm thuốc | 2 (1) | 'trước và sau tiêm' 2 (S 2) | DQYHHN-1302, YHCM22-CDHA138 |
| postcontrast | sau tiêm thuốc | 26 (13) | - | BVBD-PDUB2020, WHO-UMC-vietnam.pdf, YHCM22-CDHA8 |
| contrast agent | thuốc cản quang | 24 (10) | 'chất cản quang' 5 (S 5) | BVBD-PDUB2020, ELIB-d06c3841337245a3, YHCM22-CDHA67 |
| contrast medium | thuốc cản quang | 24 (10) | - | BVBD-PDUB2020, ELIB-d06c3841337245a3, YHCM22-CDHA67 |
| contrast material | thuốc cản quang | 24 (10) | - | BVBD-PDUB2020, ELIB-d06c3841337245a3, YHCM22-CDHA67 |
| iodinated contrast | thuốc cản quang chứa iod | 1 (1) | - | BVBD-PDUB2020 |
| iodinated contrast medium | thuốc cản quang chứa iod | 1 (1) | - | BVBD-PDUB2020 |
| intravenous contrast | thuốc cản quang tiêm tĩnh mạch | 15 (8) | 'tiêm thuốc cản quang' 9 (S 5) | BVBD-PDUB2020, ELIB-d06c3841337245a3, WHO-UMC-vietnam.pdf |
| oral contrast | thuốc cản quang đường uống | 0 (0) | 'đường uống' 12 (S 5) | - |
| contrast injection | tiêm thuốc cản quang | 9 (5) | - | BVBD-PDUB2020, CTUMP-612, DQYHHN-413 |
| injection rate | tốc độ tiêm | 3 (2) | - | DQYHHN-1302, YHCM22-CDHA21, YHCM22-CDHA8 |
| bolus tracking | kỹ thuật theo dõi bolus (bolus tracking) | 7 (5) | - | BENHVIENDAKHOABARIA-5481_dai_thao_du, BVBD-PDUB2020, TCNCYH-969 |
| contrast-induced nephropathy | bệnh thận do thuốc cản quang | 0 (0) | 'suy thận do thuốc cản quang' 1 (S 0) | - |
| contrast allergy | dị ứng thuốc cản quang | 1 (1) | - | BVBD-PDUB2020 |
| slice thickness | độ dày lát cắt | 9 (7) | - | DQYHHN-1385, YHCM22-CDHA21, YHCM22-CDHA79 |
| axial plane | mặt phẳng ngang (axial) | 1 (1) | 'axial' 7 (S 5) | BVBD-PDUB2020 |
| coronal plane | mặt phẳng đứng ngang (coronal) | 1 (1) | 'coronal' 5 (S 4) | BVBD-PDUB2020 |
| sagittal plane | mặt phẳng đứng dọc (sagittal) | 0 (0) | 'sagittal' 5 (S 4) | - |
| multiplanar reconstruction | tái tạo đa mặt phẳng (MPR) | 2 (1) | 'MPR' 2 (S 0) | DQYHHN-413, YHCM22-CDHA159 |
| maximum intensity projection | tái tạo cường độ tối đa (MIP) | 0 (0) | 'MIP' 1 (S 1) | - |
| volume rendering | tái tạo thể tích (VR) | 0 (0) | 'VR' 2 (S 0) | - |
| lung window | cửa sổ phổi | 0 (0) | - | - |
| mediastinal window | cửa sổ trung thất | 3 (0) | - | TCNCYH-914, YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| bone window | cửa sổ xương | 1 (1) | - | BVBD-PDUB2020 |
| region of interest | vùng quan tâm (ROI) | 1 (1) | - | YHCM22-CDHA8 |
| radiation dose | liều bức xạ | 2 (1) | 'liều chiếu' 3 (S 1) | BVBD-PDUB2020, YDHUE20-03017-15_2_25 |
| BI-RADS | BI-RADS | 2 (1) | - | DQYHHN-48, YHCM22-CDHA8 |
| TI-RADS | TI-RADS | 2 (1) | 'TIRADS' 6 (S 3) | BV103-UTTG, CTUMP-1904 |
| ACR TI-RADS | ACR TI-RADS | 0 (0) | - | - |
| EU-TIRADS | EU-TIRADS | 1 (1) | - | CTUMP-1904 |
| LI-RADS | LI-RADS | 2 (0) | - | DQYHHN-1302, DQYHHN-356 |
| PI-RADS | PI-RADS | 2 (0) | - | DQYHHN-1385, DQYHHN-48 |
| O-RADS | O-RADS | 0 (0) | - | - |
| Lung-RADS | Lung-RADS | 2 (0) | - | YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |
| CAD-RADS | CAD-RADS | 1 (0) | - | DQYHHN-48 |
| Bosniak classification | phân loại Bosniak | 2 (1) | 'phân loại Bosniak' 0 (S 0) | YDHUE20-06029-17_23_11, YHCM22-CDHA138 |
| RECIST | RECIST | 4 (2) | - | DQYHHN-1302, DQYHHN-1387, YHCM16-S241 |
| mRECIST | mRECIST | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| Deauville score | thang điểm Deauville | 1 (1) | - | BVBD-PDUB2020 |
| complete response | đáp ứng hoàn toàn (CR) | 13 (8) | - | BVBD-PDUB2020, DQYHHN-1387, YHCM18-S289 |
| partial response | đáp ứng một phần (PR) | 8 (5) | - | BVBD-PDUB2020, TCNCYH-3438, YHCM18-S289 |
| stable disease | bệnh ổn định (SD) | 5 (2) | 'bệnh giữ nguyên' 3 (S 2) | BVBD-PDUB2020, BVNTP-ung-thu-tuyen-thuong-than, DQYHHN-1387 |
| progressive disease | bệnh tiến triển (PD) | 17 (12) | - | BVBD-PDUB2020, TCNCYH-3438, YHCM16-S241 |
| target lesion | tổn thương mục tiêu | 1 (1) | 'tổn thương đích' 0 (S 0) | YHCM26-S20 |
| non-target lesion | tổn thương không mục tiêu | 0 (0) | 'tổn thương không đích' 0 (S 0) | - |
| new lesion | tổn thương mới | 5 (3) | - | BVBD-PDUB2020, DQYHHN-1302, YHCM26-S121 |
| measurable lesion | tổn thương đo được | 0 (0) | 'tổn thương có thể đo được' 0 (S 0) | - |
| sum of diameters | tổng đường kính | 0 (0) | 'tổng các đường kính' 0 (S 0) | - |
| longest diameter | đường kính lớn nhất | 3 (3) | 'đường kính dài nhất' 0 (S 0) | BVBD-PDUB2020, YHCM18-S26, YHCM25-S59 |
| short-axis diameter | đường kính trục ngắn | 2 (2) | 'trục ngắn' 2 (S 2) | YHCM18-S95, YHCM22-CDHA16 |
| short axis | trục ngắn | 2 (2) | - | YHCM18-S95, YHCM22-CDHA16 |
| local tumor progression | tiến triển tại chỗ | 5 (4) | - | BVBD-PDUB2020, TCNCYH-2381, YHCM16-S116 |
| embolization | nút mạch | 8 (3) | 'tắc mạch' 17 (S 12) | DQYHHN-1302, DQYHHN-1387, YHCM22-CDHA67 |
| embolisation | nút mạch | 8 (3) | - | DQYHHN-1302, DQYHHN-1387, YHCM22-CDHA67 |
| transarterial chemoembolization | nút mạch hóa chất (TACE) | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| transarterial chemoembolisation | nút mạch hóa chất (TACE) | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| conventional TACE | nút mạch hóa chất thường quy (cTACE) | 2 (0) | - | DQYHHN-1302, DQYHHN-1387 |
| drug-eluting bead TACE | nút mạch hóa chất với hạt vi cầu tải thuốc (DEB-TACE) | 2 (0) | 'hạt vi cầu' 3 (S 1), 'DEB-TACE' 2 (S 0) | DQYHHN-1302, DQYHHN-1387 |
| drug-eluting beads | hạt vi cầu tải thuốc | 2 (0) | 'hạt vi cầu' 3 (S 1) | DQYHHN-1302, DQYHHN-1387 |
| transarterial radioembolization | xạ trị trong chọn lọc (TARE) | 2 (1) | - | BVBD-PDUB2020, DQYHHN-1302 |
| selective internal radiation therapy | xạ trị trong chọn lọc (SIRT) | 2 (1) | - | BVBD-PDUB2020, DQYHHN-1302 |
| radiofrequency ablation | đốt sóng cao tần (RFA) | 5 (5) | 'sóng cao tần' 7 (S 6) | BVBD-PDUB2020, BVNTP-chan-doan-va-dieu-tri-ung-thu-tuyen-giap, BVNTP-phau-thuat-cat-tuyen-vu-vet-hach-nach |
| microwave ablation | đốt vi sóng (MWA) | 0 (0) | 'vi sóng' 3 (S 1) | - |
| cryoablation | áp lạnh | 3 (2) | 'đốt lạnh' 1 (S 1) | BVBD-PDUB2020, BVNTP-choc-hut-te-bao-tuyen-giap-bang-kim-nho-fna-tuye, ELIB-d06c3841337245a3 |
| thermal ablation | đốt nhiệt | 1 (0) | - | ELIB-d06c3841337245a3 |
| percutaneous ethanol injection | tiêm cồn qua da (PEI) | 1 (1) | - | BVBD-PDUB2020 |
| ablation zone | vùng đốt | 1 (1) | - | YHCM18-S001 |
| percutaneous drainage | dẫn lưu qua da | 3 (2) | - | YDHUE20-06029-17_23_11, YHCM22-CDHA159, YHCM22-S157 |
| abscess drainage | dẫn lưu ổ áp xe | 2 (2) | 'chọc dẫn lưu' 2 (S 2) | BVNTP-giai-phau-benh-hoc-benh-ly-tuyen-giap-p1, YHCM22-CDHA125 |
| percutaneous transhepatic biliary drainage | dẫn lưu đường mật xuyên gan qua da (PTBD) | 0 (0) | 'PTBD' 1 (S 1) | - |
| image-guided biopsy | sinh thiết dưới hướng dẫn hình ảnh | 1 (1) | 'dưới hướng dẫn' 20 (S 10) | BVBD-PDUB2020 |
| CT-guided | dưới hướng dẫn cắt lớp vi tính | 0 (0) | 'dưới hướng dẫn CLVT' 1 (S 0) | - |
| CT-guided biopsy | sinh thiết dưới hướng dẫn cắt lớp vi tính | 1 (0) | - | TCNCYH-914 |
| endovascular intervention | can thiệp nội mạch | 5 (4) | - | DQYHHN-1302, YHCM22-CDHA16, YHCM22-CDHA67 |
| microcatheter | vi ống thông | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| guidewire | dây dẫn | 4 (2) | - | BVBD-PDUB2020, TCNCYH-4341, YDHUE20-06029-17_23_11 |
| superselective | siêu chọn lọc | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| superselective embolization | nút mạch siêu chọn lọc | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, DQYHHN-1387 |
| coil embolization | nút mạch bằng vòng xoắn kim loại (coil) | 2 (1) | 'coil' 1 (S 0) | BVBD-PDUB2020, DQYHHN-1302 |
| pseudoaneurysm | giả phình | 2 (1) | - | YDHUE20-06029-17_23_11, YHCM22-CDHA67 |
| feeding artery | động mạch nuôi | 3 (1) | - | BVBD-PDUB2020, DQYHHN-1302, TCNCYH-666 |
| feeding vessel | mạch máu nuôi | 10 (5) | - | BVBD-PDUB2020, DQYHHN-1302, YHCM16-S171 |
| portal vein embolization | nút tĩnh mạch cửa (PVE) | 1 (0) | - | DQYHHN-1302 |
| uterine artery embolization | nút động mạch tử cung (UAE) | 1 (0) | - | ELIB-d06c3841337245a3 |
| bronchial artery embolization | nút động mạch phế quản | 0 (0) | - | - |
| inferior vena cava filter | lưới lọc tĩnh mạch chủ dưới | 1 (1) | - | YHCM26-S70 |
| vertebroplasty | tạo hình thân đốt sống (bơm xi măng) | 0 (0) | 'bơm xi măng' 1 (S 1) | - |
| mechanical thrombectomy | lấy huyết khối cơ học | 0 (0) | 'lấy huyết khối' 2 (S 2) | - |
| technical success | thành công kỹ thuật | 2 (2) | 'thành công về mặt kỹ thuật' 0 (S 0) | YHCM21-CDHA144, YHCM22-CDHA67 |
| impression | kết luận | 214 (124) | - | VNRAS-huong-dan-quy-tr, WHO-UMC-vietnam.pdf, YHCM18-S005 |
| unremarkable | không ghi nhận bất thường | 48 (32) | 'không thấy bất thường' 0 (S 0) | YHCM21-CDHA112, YHCM21-CDHA144, YHCM21-S93 |
| no interval change | không thay đổi so với lần chụp trước | 24 (15) | - | YDHUE20-03016-16_9_7, YHCM22-CDHA98 |
| prior study | lần chụp trước | 0 (0) | 'phim cũ' 3 (S 1), 'lần trước' 5 (S 2) | - |
| follow-up imaging | chụp kiểm tra | 3 (1) | 'chụp lại' 4 (S 1) | DQYHHN-1302, DQYHHN-1387, YHCM16-S66 |
| suggestive of | gợi ý | 76 (51) | 'nghĩ đến' 14 (S 9) | BVBD-PDUB2020, ELIB-d06c3841337245a3, YHCM26-S70 |
| cannot be excluded | không loại trừ | 9 (4) | 'chưa loại trừ' 2 (S 1) | BVBD-PDUB2020, DQYHHN-1418, TCNCYH-4427 |
| incidental finding | phát hiện tình cờ | 10 (5) | - | BVBD-PDUB2020, JMPM-666, TCNCYH-1240 |
| incidentaloma | u phát hiện tình cờ | 0 (0) | - | - |
| clinical correlation | đối chiếu lâm sàng | 3 (3) | - | BVNTP-gioi-thieu-mon-hoc-giai-phau-benh-p2, YHCM19-S209, YHCM22-CDHA183 |
| lung cancer screening | tầm soát ung thư phổi | 50 (32) | 'sàng lọc' 42 (S 13) | BENHVIENDAKHOABARIA-5481_dai_thao_du, YDHUE20-03016-16_9_7, YDHUE20-03017-15_2_25 |

## Mã trích dẫn

Vùng: S = phía Nam; - = Bắc / Trung / toàn quốc. Các mã DQYHHN = TC Điện quang & Y học hạt nhân Việt Nam; YHCM22-CDHA = Y học TP.HCM 26(2) 2022, chuyên đề Chẩn đoán hình ảnh (số sau là trang đầu bài); BVBD-PDUB2020 = Phác đồ Ung bướu BV Bình Dân 2020.

| Mã | Host | Vùng | URL |
|---|---|---|---|
| BENHVIENDAKHOABARIA-5481_dai_thao_du | benhviendakhoabaria.vn | - | https://benhviendakhoabaria.vn/sites/default/files/files/tin-tuc/5481_dai_thao_duong_type_2.pdf |
| BV103-UTTG | www.benhvien103.vn | - | https://www.benhvien103.vn/vanban/CHAN_DOAN_VA_DIEU_TRI_UNG_THU_TUYEN_GIAP.pdf |
| BVBD-PDUB2020 | www.bvbnd.vn | S | https://www.bvbnd.vn/wp-content/uploads/2022/09/Phac-do-Ung-buoi_2020.pdf |
| BVNTP-chan-doan-va-dieu-tri-ung-thu-tuyen-giap | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/ung-buou/chan-doan-va-dieu-tri-ung-thu-tuyen-giap |
| BVNTP-choc-hut-te-bao-tuyen-giap-bang-kim-nho-fna-tuye | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/choc-hut-te-bao-tuyen-giap-bang-kim-nho-fna-tuyen-giap |
| BVNTP-giai-phau-benh-hoc-benh-ly-hach-limpho-p1 | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-hach-limpho-p1 |
| BVNTP-giai-phau-benh-hoc-benh-ly-hach-limphop3 | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-hach-limphop3 |
| BVNTP-giai-phau-benh-hoc-benh-ly-tuyen-giap-p1 | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-tuyen-giap-p1 |
| BVNTP-giai-phau-benh-hoc-benh-ly-tuyen-giap-p3 | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/giai-phau-benh-hoc-benh-ly-tuyen-giap-p3 |
| BVNTP-gioi-thieu-mon-hoc-giai-phau-benh-p2 | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/giai-phau-benh/gioi-thieu-mon-hoc-giai-phau-benh-p2 |
| BVNTP-phau-thuat-cat-ban-phan-da-day-noi-soi-va-nao-ve | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/ngoai-tieu-hoa/phau-thuat-cat-ban-phan-da-day-noi-soi-va-nao-vet-hach-d2 |
| BVNTP-phau-thuat-cat-tuyen-vu-vet-hach-nach | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/ung-buou/phau-thuat-cat-tuyen-vu-vet-hach-nach |
| BVNTP-u-tuyen-yen-pituitary-adenoma | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/noi-tiet/u-tuyen-yen-pituitary-adenoma |
| BVNTP-ung-thu-tuyen-giap-phan-2 | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/noi-tiet/ung-thu-tuyen-giap-phan-2 |
| BVNTP-ung-thu-tuyen-thuong-than | bvnguyentriphuong.com.vn | S | https://bvnguyentriphuong.com.vn/ung-buou/ung-thu-tuyen-thuong-than |
| CTUMP-1250 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/1250/1510/9684 |
| CTUMP-1904 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/1904/1591/10032 |
| CTUMP-2077 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/2077/1732/12480 |
| CTUMP-2755 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/2755/2074/20252 |
| CTUMP-582 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/582/531/1396 |
| CTUMP-612 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/612/1468/9272 |
| CTUMP-709 | tapchi.ctump.edu.vn | S | https://tapchi.ctump.edu.vn/index.php/ctump/article/download/709/604 |
| DQYHHN-1110 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/1110/806/2889 |
| DQYHHN-1302 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/1302/820/3079 |
| DQYHHN-1385 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/1385/884 |
| DQYHHN-1387 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/1387/883 |
| DQYHHN-1418 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/1418/885/3709 |
| DQYHHN-356 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/356/263/666 |
| DQYHHN-36 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/36/26 |
| DQYHHN-413 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/413/314/769 |
| DQYHHN-48 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/48/33 |
| DQYHHN-574 | vjrnm.edu.vn | - | https://vjrnm.edu.vn/index.php/vjrnm/article/download/574/487/1098 |
| ELIB-d06c3841337245a3 | elib.bvdktuthainguyen.gov.vn | - | https://elib.bvdktuthainguyen.gov.vn/uploads/d0/6c/d06c3841337245a338276a861dfcb18c_1605357395.pdf |
| HOSREM-13.pdf | hosrem.org.vn | - | https://hosrem.org.vn/public/frontend/upload/YHSS_47/13.pdf |
| HSA-TS-Nguyen-Van-Ch | hsa.org.vn | - | https://hsa.org.vn/wp-content/uploads/2016/12/TS-Nguyen-Van-Chinh-Danh-gia-do-me-trong-gay-me-tinh-mach-kiem-soat-nong-do-dich.pdf |
| JMPM-666 | jmpm.vn | - | https://jmpm.vn/index.php/jmpm/article/view/666 |
| TAPCHIYHOCTPHCM-10418 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/articles/10418 |
| TCNCYH-1240 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/1240/748 |
| TCNCYH-2381 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2381/1587/30093 |
| TCNCYH-2613 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2613/1811/34882 |
| TCNCYH-2641 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/2641/1812/34883 |
| TCNCYH-3438 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/3438/2411/46273 |
| TCNCYH-4341 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4341/3053/60861 |
| TCNCYH-4427 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/4427/3056/60864 |
| TCNCYH-5667 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/5667/3745/85367 |
| TCNCYH-666 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/666/499/8750 |
| TCNCYH-914 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/914/615/9292 |
| TCNCYH-969 | tapchinghiencuuyhoc.vn | - | https://tapchinghiencuuyhoc.vn/index.php/tcncyh/article/download/969/626 |
| VJOG-71 | vjog.vn | - | https://vjog.vn/journal/issue/view/71 |
| VJOL-79831 | vjol.info.vn | - | https://vjol.info.vn/pnt/vi/article/download/79831/68091/ |
| VNRAS-huong-dan-quy-tr | vnras.com | - | https://vnras.com/huong-dan-quy-trinh-ky-thuat-huyet-hoc-truyen-mau-mien-dich-di-truyen-sinh-hoc-phan-tu-theo-bo-y-te-quyet-dinh-so-3336-qd-byt-ngay-20-07-2017/ |
| WHO-UMC-vietnam.pdf | who-umc.org | - | https://who-umc.org/media/1095/vietnam.pdf |
| YDHUE20-03016-15_59_25 | jmp.huemed-univ.edu.vn | - | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d016_15_59_25.pdf |
| YDHUE20-03016-16_9_7 | jmp.huemed-univ.edu.vn | - | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d016_16_9_7.pdf |
| YDHUE20-03017-15_2_25 | jmp.huemed-univ.edu.vn | - | https://jmp.huemed-univ.edu.vn/BBao/2020/3/PDF_2020m03d017_15_2_25.pdf |
| YDHUE20-06029-17_23_11 | jmp.huemed-univ.edu.vn | - | https://jmp.huemed-univ.edu.vn/BBao/2020/6/PDF_2020m06d029_17_23_11.pdf |
| YHCM16-S116 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2016/20%202binh%20dan/116.pdf |
| YHCM16-S125 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2016/20%206thongnhat/125.pdf |
| YHCM16-S160 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2016/20%202bvdhyd/160.pdf |
| YHCM16-S171 | duoc.tapchiyhoctphcm.vn | S | https://duoc.tapchiyhoctphcm.vn/upload/2016/20%206ndgd/171.pdf |
| YHCM16-S241 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2016/20%202phamngocthach/241.pdf |
| YHCM16-S35 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2016/20%202binh%20dan/35.pdf |
| YHCM16-S66 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2016/20%201cd%20noikhoa%20I/66.pdf |
| YHCM18-S001 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2018/22%201ngoaikhoa%201/001.pdf |
| YHCM18-S005 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2018/22%204%20ND%202%20lan%202%202018/005.pdf |
| YHCM18-S10 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2018/22%204nieu%20than/10.pdf |
| YHCM18-S26 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2018/22%201ngoaikhoa%201/26.pdf |
| YHCM18-S289 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2018/22%202noikhoa2/289.pdf |
| YHCM18-S95 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2018/22%203PB%20PHAMNGOCTHACH/95.pdf |
| YHCM19-S209 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2019/23%201%20noi/209.pdf |
| YHCM19-S255 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2019/23%203%20nieu%20than/255.pdf |
| YHCM21-CDHA112 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/112.pdf |
| YHCM21-CDHA144 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/144.pdf |
| YHCM21-CDHA163 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S1%202021%20CDHA,%20SHPT%20(goi%20HDGS%202022)/163.pdf |
| YHCM21-S93 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2021/T25%20S2%202021%20Hoi%20PT%20ban%20tay%20(goi%20HDGS%202022)/93.pdf |
| YHCM22-CDHA125 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/125.pdf |
| YHCM22-CDHA138 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/138.pdf |
| YHCM22-CDHA159 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/159.pdf |
| YHCM22-CDHA16 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/16.pdf |
| YHCM22-CDHA183 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/183.pdf |
| YHCM22-CDHA189 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/189.pdf |
| YHCM22-CDHA21 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/21.pdf |
| YHCM22-CDHA34 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/34.pdf |
| YHCM22-CDHA67 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/67.pdf |
| YHCM22-CDHA79 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/79.pdf |
| YHCM22-CDHA8 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/8.pdf |
| YHCM22-CDHA86 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/86.pdf |
| YHCM22-CDHA98 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/98.pdf |
| YHCM22-CDHA98 | www.tapchiyhoctphcm.vn | S | https://www.tapchiyhoctphcm.vn/upload/2022/T26%20S2%202022%20CDHA-YTCC/98.pdf |
| YHCM22-S157 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2022/T26%20S1%202022%20Ngoai%20Khoa%20(goi%20HDGS%202022)/157.pdf |
| YHCM25-S59 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S7/59.pdf |
| YHCM25-S68 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2025/T28%20S5/68.pdf |
| YHCM26-S121 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S1/121.pdf |
| YHCM26-S20 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S1/20.pdf |
| YHCM26-S56 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S10/56.pdf |
| YHCM26-S70 | tapchiyhoctphcm.vn | S | https://tapchiyhoctphcm.vn/upload/2026/T29%20S3/70.pdf |
| huejmp.vn-343 | huejmp.vn | - | https://huejmp.vn/index.php/journal/article/download/343/336 |
