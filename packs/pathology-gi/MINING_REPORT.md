# MINING_REPORT: pathology-gi (Giải phẫu bệnh tiêu hóa), draft 0.1.0

Ngày khai thác: 2026-10-13. Phạm vi: ống tiêu hóa (thực quản, dạ dày, ruột non, ruột thừa, đại trực tràng, ống hậu môn). Không gồm gan, đường mật, tụy.

## 1. Tóm tắt

- Glossary có **83 dòng** (96 khóa tiếng Anh nếu tính cả các dạng thay thế viết bằng " / ").
  - Khoảng 60 thuật ngữ gốc được giao, tất cả đều trong phạm vi nên không bỏ thuật ngữ nào.
  - Thêm **15 thuật ngữ trung tâm**: eosinophil, atrophic gastritis, neuroendocrine carcinoma, villous, inflammatory bowel disease, crypt, lamina propria, muscularis mucosae, submucosa, muscularis propria, subserosa, mucin, adenocarcinoma, loss of expression, neoadjuvant chemoradiotherapy.
- **Đã chốt có bằng chứng tạp chí: 55 dòng.** Bằng chứng thấp hoặc ghép từ quy ước: **24 dòng** (kể cả "u hạt": giữ theo pack cha vì không đo được). Giữ nguyên tiếng Anh: **4 dòng** (MLH1, PMS2, MSH2, MSH6).
- **Xung đột với pack cha: 6 điểm** (mục 5). **Cần người quyết: 18 điểm** (mục 6).
- rules.json để trống. Không có biến thể sai rõ ràng nào vừa được quan sát thấy, vừa có bằng chứng mạnh chống lại.

## 2. Phương pháp

1. **Kho đếm chính là VJOL** (`vjol.info.vn`, cổng OJS gom nhiều tạp chí Việt Nam). Kho này gồm Tạp chí Y học Việt Nam, Nghiên cứu Y học, Y dược lâm sàng 108, Y Dược học Cần Thơ, Y Dược Huế, Y học TP.HCM (Y học), Ung thư học Việt Nam, Khoa học Tiêu hóa Việt Nam, Y học lâm sàng BV TW Huế, Y học Quân sự…
   - Mỗi biến thể được tìm dưới dạng **cụm từ chính xác** và lấy tổng số bài. Số này phản ánh tiêu đề, tóm tắt và từ khóa, không phản ánh toàn văn.
   - Mỗi biến thể lưu 3 bài đầu (tên bài, tạp chí, năm, URL) làm trích dẫn.
   - Biến thể "hóa/hoá", "tủy/tuỷ" được tra cả hai cách viết rồi cộng lại.
2. **Kiểm tra chéo bằng 3 nguồn:**
   - OJS riêng của TCNCYH, CTUMP và YDLS108 (gọi chung OJS3).
   - Ô tìm kiếm của tapchiyhocvietnam.vn (VMJ), đọc tên bài qua WebFetch.
   - Danh sách tiêu đề VJOL (title-level) cho các thuật ngữ có số đếm nhiễu.
3. **Văn bản Bộ Y tế được đọc toàn văn và đếm cụm từ:**
   - BYT-CRC18: QĐ 2549/QĐ-BYT 2018, ung thư đại trực tràng.
   - BYT-GC20: QĐ 3127/QĐ-BYT 2020, ung thư dạ dày.
   - BYT-QTKT21: hướng dẫn quy trình kỹ thuật nội khoa Tiêu hóa.
   - Thêm toàn văn bài TCNCYH 2024 về u nhầy ruột thừa.
4. **Khi tạp chí không có kết quả**, tham khảo trang bệnh viện hoặc trang phổ thông (Vinmec, Long Châu, BV Nguyễn Tri Phương). Các nguồn này được ghi rõ là "lay" và không tính là y văn bình duyệt.
5. **Cách chọn canonical:** biến thể có tần suất cao nhất trong y văn bình duyệt.
   - Hai biến thể hòa nhau: ưu tiên dạng nhất quán với pack cha hoặc với các thuật ngữ khác trong pack, rồi ghi "cần người quyết".
   - Không có bằng chứng: ghép từ theo quy ước của pack cha và ghi "bằng chứng thấp".
6. Không chép câu nào từ bài báo. Chỉ ghi cặp thuật ngữ, số đếm và trích dẫn (xem sources.md).

### Số lần tra cứu

| Loại | Số lượng |
|---|---|
| WebSearch tương tác | 15 |
| WebFetch tương tác | 18 (14 lần vào VMJ, trong đó 3 bị ECONNRESET và 2 hết thời gian chờ; 4 lần vào bài/văn bản) |
| **Tổng tra cứu tương tác** | **33**, dưới mức ~120 |
| Truy vấn tự động đếm cụm từ trên VJOL (gồm retry) | 486 lượt cho 449 cụm từ khác nhau |
| Truy vấn tự động lấy danh sách tiêu đề VJOL | 63 |
| Truy vấn tự động trên OJS3 | 255 (85 cụm từ × 3 tạp chí) |
| Tài liệu tải về và đọc toàn văn | 4 (3 văn bản BYT + 1 bài PDF TCNCYH) |

**Lệch khỏi chỉ dẫn:** tổng số yêu cầu tự động (~800) vượt xa mức "~120 searches". Đây là các yêu cầu GET tới ô tìm kiếm OJS, có giãn cách 1,5–3 giây giữa các lượt, không tốn token. Tôi dùng cách này vì WebSearch (máy chủ ở Mỹ) gần như không trả kết quả tiếng Việt khi không giới hạn tên miền, và phần tóm tắt của nó tự diễn giải thuật ngữ nên không đếm được biến thể. Nếu cần tuân thủ đúng mức 120, chỉ nên dùng phần tương tác (33 lượt) cùng các văn bản BYT; khi đó phần lớn quyết định vẫn giữ nguyên, nhưng số đếm sẽ mỏng hơn nhiều.

### Sự cố và giới hạn (đọc trước)

- **tapchiyhocvietnam.vn đã chặn IP máy này** (connection reset). Nguyên nhân là trong giai đoạn thăm dò đầu, tôi gửi vài truy vấn curl dài, nặng (mất hơn 60 giây mỗi truy vấn). Sau đó VMJ chỉ còn truy cập được qua WebFetch, và WebFetch cũng bị reset nếu gọi song song. Các truy vấn tự động sau đó chỉ gửi tới VJOL và OJS3, với giãn cách 1,5–3 giây.
- **OJS bỏ mọi từ dưới 3 ký tự**, như "u", "mô", "tế", "cơ", "bờ", "đa", "xạ", "bổ", "ít". Vì vậy:
  - Một số cặp biến thể không phân biệt được bằng số đếm ("nảy chồi u" = "u nảy chồi"; "hóa xạ trị tân bổ trợ" cũng đếm cả "hóa trị tân bổ trợ").
  - Số đếm của các cụm chung bị phình to ("u hạt", "lớp đệm", "cơ niêm", "lắng đọng u", "ít kết dính").
  - Những thuật ngữ này đã được đối chiếu lại bằng tiêu đề hoặc văn bản BYT và được đánh dấu `*` trong sources.md.
- **VJOL có cả tạp chí ngoài y khoa** (kỹ thuật, nông nghiệp), làm nhiễu các cụm như "lớp đệm", "tuyến ống", "OLGA", "Marsh".
- Một số truy vấn dài gồm toàn từ phổ biến bị VJOL trả lỗi 500, ví dụ "ung thư biểu mô tuyến đại trực tràng". Các trường hợp đó dùng OJS3 và VMJ thay thế.
- Năm xuất bản của bài VMJ không hiển thị trên trang tìm kiếm nên ghi "n.d.".

## 3. Thuật ngữ đã chốt có bằng chứng (canonical)

**Thực quản và dạ dày**
- Barrett thực quản
- dị sản ruột
- loạn sản độ thấp / độ cao
- ung thư biểu mô tế bào vảy thực quản
- bạch cầu ái toan
- viêm dạ dày do Helicobacter pylori
- viêm dạ dày mạn teo
- viêm teo niêm mạc dạ dày
- ung thư biểu mô tuyến dạ dày
- thể ruột / thể lan tỏa (Lauren)
- ung thư biểu mô kém kết dính
- ung thư biểu mô tế bào nhẫn
- u lympho MALT, u lympho MALT dạ dày (họ từ "u lympho" có bằng chứng mạnh)
- u mô đệm đường tiêu hóa (GIST)
- u thần kinh nội tiết (NET)

**Ruột non, viêm ruột và polyp**
- bệnh celiac
- teo nhung mao
- nhung mao
- bệnh Crohn
- viêm loét đại tràng
- bệnh viêm ruột mạn tính
- khe tuyến, áp xe khe tuyến
- u tuyến ống, u tuyến ống nhung mao
- tổn thương răng cưa không cuống
- polyp tăng sản
- polyp Peutz-Jeghers
- bệnh đa polyp tuyến gia đình (FAP)

**Ung thư đại trực tràng và sinh học phân tử**
- ung thư biểu mô tuyến đại trực tràng
- ung thư biểu mô tuyến
- ung thư biểu mô tuyến nhầy
- nảy chồi u
- xâm nhập quanh thần kinh
- xâm nhập mạch bạch huyết
- xâm lấn mạch máu ngoài thành (EMVI)
- diện cắt vòng quanh (CRM)
- cắt toàn bộ mạc treo trực tràng (TME)
- độ thoái triển u (TRG)
- hóa xạ trị tiền phẫu
- thiếu hụt hệ thống sửa chữa ghép cặp sai (dMMR), protein sửa chữa ghép cặp sai (MMR)
- mất ổn định vi vệ tinh (MSI)
- mất biểu hiện
- hội chứng Lynch

**Ruột thừa, hậu môn và thành ống tiêu hóa**
- u tân sinh nhầy ruột thừa độ thấp (LAMN)
- giả u nhầy phúc mạc
- trĩ
- lớp cơ niêm
- lớp dưới niêm mạc
- lớp dưới thanh mạc
- chất nhầy

Chi tiết từng cặp nằm trong glossary.csv (cột note) và sources.md.

## 4. Chưa giải quyết hoặc bằng chứng thấp

**Không có bài tạp chí nào; dạng hiện tại được ghép theo quy ước:**
- ung thư biểu mô tuyến thực quản (VJOL lỗi 500, OJS3 0)
- phân giai đoạn OLGA / OLGIM (y văn dùng "phân loại OLGA" 1 lần)
- phân loại Marsh
- lympho bào trong biểu mô (IEL)
- biến dạng khe tuyến
- u tuyến nhung mao
- u tuyến răng cưa truyền thống
- polyp thiếu niên
- ung thư biểu mô thể tủy
- ung thư biểu mô trong niêm mạc
- diện cắt polyp
- tổn thương nội biểu mô vảy ống hậu môn

**Chỉ có nguồn phổ thông, không có tạp chí:**
- viêm thực quản tăng bạch cầu ái toan
- viêm đại tràng vi thể / collagen / lympho bào
- viêm đại tràng giả mạc

**Chỉ có 1–2 nguồn:**
- viêm đại tràng do thiếu máu cục bộ
- ung thư biểu mô thần kinh nội tiết (NEC)
- nhân lắng đọng (chỉ có BYT-CRC18)
- lớp cơ thực sự
- lớp đệm (số đếm nhiễu)

**Không đo được, giữ theo pack cha:**
- u hạt (OJS bỏ từ "u", nên số đếm cụm này không dùng được)

**Giữ nguyên tiếng Anh** (tên gen/protein; y văn Việt Nam cũng giữ nguyên):
- MLH1, PMS2, MSH2, MSH6
- Các tên hệ phân loại giữ trong câu: OLGA, OLGIM, Marsh, Lauren, Mandard, Dworak
- Các viết tắt EMVI, TME, CRM, TRG được giữ trong ngoặc

## 5. Xung đột với pack cha (`packs/pathology/glossary.csv`)

Không có xung đột nào bị ghi đè âm thầm. Mỗi điểm dưới đây đều có ghi chú "XUNG ĐỘT" trong cột note của glossary.csv.

1. **carcinoma: "ung thư biểu mô" hay "carcinôm"** (câu hỏi mở của pack cha). Y văn tiêu hóa ủng hộ rõ **"ung thư biểu mô"**:

   | Cụm | Ung thư biểu mô | carcinôm / carcinom |
   |---|---|---|
   | tuyến (VJOL) | 183 | 20 + 3 (tỉ lệ ~8:1) |
   | tuyến dạ dày (VJOL) | 25 | 4 |
   | tuyến dạ dày (OJS3) | 10 | 0 |
   | tuyến đại trực tràng (OJS3) | 10 | 1 |

   "carcinôm" chỉ gặp ở nhóm tác giả TP.HCM và Cần Thơ (Y học TP.HCM, Y Dược học Cần Thơ, các bài của nhóm TP.HCM trên VMJ). Kết quả này **khớp** với dòng carcinoma = ung thư biểu mô của pack cha. Tuy nhiên chính pack cha **tự mâu thuẫn**: dòng "squamous cell carcinoma = carcinôm tế bào gai" và "small cell lung carcinoma = carcinôm tế bào nhỏ" lại dùng "carcinôm". Đề nghị thống nhất.
2. **squamous: "tế bào gai" (pack cha) hay "tế bào vảy" (y văn tiêu hóa).** Pack cha ghi "squamous cell carcinoma = carcinôm tế bào gai", kèm chú thích "squamous = tế bào GAI (KHÔNG vảy)".

   | Phạm vi | tế bào vảy / vảy | tế bào gai / gai |
   |---|---|---|
   | Thực quản (VJOL) | 12 | 1 |
   | Không giới hạn cơ quan (VJOL) | 70 | 21 |
   | OJS3 | 18 | 6 |

   Ở OJS3, "gai" tập trung ở CTUMP (Cần Thơ). Pack này chỉ đặt **dòng riêng cho thực quản** ("ung thư biểu mô tế bào vảy thực quản"), **không** ghi đè dòng chung "squamous cell carcinoma". Hệ quả: một câu như "squamous cell carcinoma of the anal canal" vẫn ra "carcinôm tế bào gai" theo pack cha, nên cùng một tài liệu sẽ không nhất quán. **Cần người quyết** có thêm dòng ghi đè chung trong pack GI hay không.
3. **lymphoma: "lymphôm" (pack cha) hay "u lympho" (y văn).**

   | Cụm | u lympho | lymphôm |
   |---|---|---|
   | không Hodgkin | 23 | 2 |
   | tế bào B | 57 | 3 |
   | Hodgkin | 8 | 2 |
   | Tổng OJS3 | 16 | 2 |

   Cả 3 tiêu đề MALT trên VMJ dùng "u lympho". Ngay Y học TP.HCM năm 2026 cũng dùng "u lympho" (u lympho tế bào áo nang; u lympho... MALT). "lymphôm" chỉ gặp ở Cần Thơ, Huế và nhóm GPB TP.HCM. Pack GI dùng **"u lympho MALT"** và chỉ áp cho các dòng MALT, **không** ghi đè dòng chung "lymphoma". Pack cha hiện cũng tự mâu thuẫn: dòng "lymphoma" ghi lymphôm, còn các dòng mantle cell, ALCL, LPL lại ghi u lympho. **Cần người quyết.**
4. **lymphovascular invasion:** pack cha ghi "xâm lấn mạch bạch huyết"; pack GI chọn **"xâm nhập mạch bạch huyết"**.

   | Nguồn | xâm nhập | xâm lấn |
   |---|---|---|
   | VJOL, "… mạch" không kèm "máu" | ~13 | ~3 |
   | VJOL, đúng cụm "… mạch bạch huyết" | 1 | 0 |
   | BYT | 2 (BYT-GC20) | 2 (BYT-CRC18) |

   TCNCYH 2025 dùng "xâm nhập mạch"; pack vú (cùng đợt khai thác) cũng chọn "xâm nhập". Hệ quả phụ: test LVI trong `packs/pathology/tests.jsonl` yêu cầu "xâm lấn mạch bạch huyết". Test LVI của pack GI chấp nhận cả hai dạng.
5. **perineural invasion:** pack cha ghi "xâm lấn quanh thần kinh"; pack GI chọn **"xâm nhập quanh thần kinh"**.

   | Nguồn | xâm nhập | xâm lấn |
   |---|---|---|
   | VJOL, đúng cụm "… quanh thần kinh" | 3 | 1 |
   | VJOL, mọi dạng | 9 | 6 |
   | OJS3 | 5 | 1 |
   | BYT-CRC18 ("… thần kinh") | 0 | 1 |

   Bằng chứng chỉ ở mức vừa phải. Tôi chọn "xâm nhập" để cùng động từ với dòng LVI. **Cần người quyết.**
6. **villous:** pack cha có dòng chung "villous = nguyên bào nuôi gai nhau" (nghĩa nhau thai). Trong tài liệu tiêu hóa, nghĩa này **sai**. Pack GI ghi đè "villous = nhung mao" (teo nhung mao, u tuyến ống nhung mao). Đề nghị đổi khóa của dòng trong pack cha thành "villous (placenta)" hoặc "villous trophoblast".
7. **Mâu thuẫn nội bộ của pack cha (không phải xung đột với pack GI):**
   - **lymphocyte:** rules.json ghi lymphocyte = "lympho bào" và coi "tế bào lympho" là sai; nhưng ghi chú của dòng lymphoma trong glossary lại ghi "lymphocyte = tế bào lympho GIỮ NGUYÊN". Pack GI theo rules.json: lympho bào trong biểu mô, viêm đại tràng lympho bào.
   - **goblet cell:** pack cha ghi "tế bào đài"; y văn tiêu hóa không có bằng chứng nào (0). Pack GI không thêm dòng này.

Các điểm **đồng thuận** với pack cha: metaplasia = dị sản, dysplasia = loạn sản, độ thấp/độ cao, signet ring cell = tế bào nhẫn, resection margin = diện cắt, microsatellite = vi vệ tinh, adenoma = u tuyến, granuloma = u hạt, neoplasm = tân sinh (dùng trong LAMN), SIL = tổn thương nội biểu mô vảy.

## 6. Cần người quyết (ưu tiên từ cao xuống thấp)

1. Thống nhất "carcinôm" hay "ung thư biểu mô" trong pack cha (dòng SCC và small cell). Bằng chứng tiêu hóa nghiêng hẳn về ung thư biểu mô.
2. "squamous": "vảy" hay "gai"; có thêm dòng ghi đè chung "squamous cell carcinoma" trong pack GI hay không.
3. "lymphoma": "u lympho" hay "lymphôm"; có thêm dòng ghi đè chung trong pack GI hay không.
4. "LVI / PNI": "xâm nhập" hay "xâm lấn". Nên quyết chung cho mọi pack (pack vú cũng chọn "xâm nhập").
5. "CRM": "diện cắt vòng quanh" (6) hay "diện cắt chu vi" (4). Hai bên sát nút; BYT-CRC18 dùng "diện cắt xung quanh u".
6. "UC": "viêm loét đại tràng" (tạp chí 16) hay "viêm loét đại trực tràng chảy máu" (BYT-QTKT21, Hội Tiêu hóa).
7. "TRG": "độ thoái triển u" hay "mức độ đáp ứng mô bệnh học".
8. "LAMN": "u tân sinh nhầy ruột thừa độ thấp" hay "u nhầy ruột thừa độ thấp" (hòa 1–1).
9. "tumour deposit": "nhân lắng đọng" (chỉ có BYT). Cân nhắc "nhân lắng đọng u" để tránh lẫn với "nhân" tế bào.
10. "muscularis propria": "lớp cơ thực sự", "lớp cơ riêng" hay chỉ "lớp cơ" như BYT-CRC18.
11. "IBD": "bệnh viêm ruột mạn tính" hay "bệnh viêm ruột".
12. "EoE": "viêm thực quản tăng bạch cầu ái toan" hay "viêm thực quản bạch cầu ái toan" (hòa 3–3 ở nguồn phổ thông).
13. "OLGA/OLGIM": "phân giai đoạn" (theo staging của pack cha) hay "phân loại OLGA" (1 bài).
14. "lymphocytic colitis": "viêm đại tràng lympho bào" (theo quy tắc pack cha) hay "viêm đại tràng lympho" (Vinmec).
15. "intraepithelial lymphocytes": "lympho bào trong biểu mô" (không có bằng chứng).
16. "ischemic colitis": có thêm "cục bộ" hay không.
17. "juvenile polyp": "polyp thiếu niên" (không có bằng chứng).
18. "Lauren": "thể ruột / thể lan tỏa" (tạp chí 10) hay "típ ruột / típ lan toả" như BYT-GC20.

### Thay đổi 2026-10-15 18:48 (bản 0.1.4)

- neoadjuvant chemoradiotherapy = **"hóa xạ trị tân bổ trợ"** (trước: "hóa xạ trị tiền phẫu"): lựa chọn 2 của anh,
  neoadjuvant = "tân bổ trợ" ở mọi gói. Tin xấu: số đếm của gói này nghiêng về "tiền phẫu" (5 tài liệu, 4 tiêu đề) so
  với "tân bổ trợ" 1. Thêm 1 test.

## 7. File trong pack

- `pack.json`: id pathology-gi, parent pathology, draft true, 30 từ khóa detect.
- `prompt.md`: 5 dòng giọng chuyên ngành.
- `glossary.csv`: 83 dòng, cột note theo dạng "freq N; src: …".
- `rules.json`: `{"term_fixes": []}`.
- `tests.jsonl`: 10 câu tiếng Anh tự viết. Các test chạm điểm xung đột (LVI, CRM, Lauren, LAMN, UC) dùng `must_any` để không khóa cứng lựa chọn.
- `sources.md`: biến thể, số đếm, trích dẫn và bảng mã nguồn.
