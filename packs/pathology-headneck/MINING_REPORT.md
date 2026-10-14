# MINING_REPORT: pathology-headneck (bản nháp 0.1.0)

Pack con của `pathology`: giải phẫu bệnh đầu cổ, không gồm tuyến giáp và cận giáp (thuộc pack nội tiết).
Ngày đào: 2026-10-13. Trạng thái: DRAFT, chưa commit.

## 1. Phương pháp

- **Thuật ngữ:** giữ đủ 57 thuật ngữ hạt giống. "thyroglossal duct cyst" vẫn giữ vì là nang bẩm sinh vùng cổ, không phải bệnh lý tuyến giáp.
  Thêm 13 thuật ngữ trung tâm: squamous cell carcinoma, head and neck SCC, oral cavity, oropharynx, hypopharynx,
  nasopharynx, lymphoepithelial carcinoma, tumour budding, occult metastasis, salivary gland, parotid gland,
  submandibular gland, sinonasal papilloma. Tổng cộng 70 dòng.
- **Nguồn:** tìm kiếm OJS trên Tạp chí Y học Việt Nam (tapchiyhocvietnam.vn) và VJOL (vjol.info.vn). VJOL gom nhiều tạp chí:
  Nghiên cứu Y học, Y Dược học Cần Thơ, Khoa học ĐH Hồng Bàng, Y Dược học Phạm Ngọc Thạch, Y dược lâm sàng 108,
  Y học lâm sàng BV TW Huế, Y Dược Huế, Tai Mũi Họng VN, Y Dược học Quân sự, Y học TP.HCM, Ung thư học VN,
  Y học dự phòng và Răng Hàm Mặt VN. Bổ sung bằng WebSearch có lọc tên miền VN, đọc 5 trang (bài GPB tuyến nước bọt
  BV Nguyễn Tri Phương, tổng quan u tuyến mang tai TMH 2026, HIU 2022, VMJ 2026) và metadata trích dẫn của các bài
  được dẫn (chỉ lấy năm, không tính là lượt tìm).
- **Cách đếm:** mỗi biến thể được truy vấn bằng cụm từ đặt trong ngoặc kép. Tần suất (freq) là số bài VN khác nhau,
  đúng chủ đề đầu cổ, có dùng biến thể đó. Việc lọc dựa trên tiêu đề, hoặc tóm tắt khi có ghi chú. Riêng các dòng
  ghi "hits" thì freq là số kết quả thô của công cụ tìm kiếm.
  Biến thể chuẩn là biến thể có freq cao nhất. Khi hai biến thể gần hòa, ưu tiên biến thể khớp pack cha và đánh dấu `tie`.
- **Giới hạn kỹ thuật:**
  - Tìm kiếm OJS không phân biệt dấu và khớp mờ ở mức từ, nên cụm ngắn cho số hit nhiễu. Ví dụ: "nhầy bì" ra 500 hit,
    "u xơ mạch" 500, "độ dày u" 500, "nạo vét hạch cổ" 85. Các số này bị loại và được thay bằng số bài đếm theo tiêu đề.
  - VMJ trả kết quả chậm, khoảng 50 giây mỗi truy vấn. Cuối phiên VJOL chặn với lỗi HTTP 429, làm 9 truy vấn thất bại:
    dentigerous, ossifying fibroma, fibrous dysplasia, thyroglossal, CUP x2, FNA, tumour budding và spindle cell (lỗi 500).
- **Số lượt tìm:**
  - 102 truy vấn OJS thành công (80 VJOL, 22 VMJ) và khoảng 25 lượt thất bại hoặc bị chặn.
  - 20 WebSearch.
  - 8 lần mở trang tìm kiếm qua WebFetch (3 lần timeout).
  - Tổng khoảng 130 lượt tìm thành công, **vượt mức trần ~120**. Lý do: mỗi biến thể tranh chấp được truy vấn trên 2 site.
  - Không chép câu văn nào từ bài báo, chỉ ghi cặp thuật ngữ, số đếm và trích dẫn.

## 2. Kết quả (70 dòng)

| Trạng thái | Số dòng | Thuật ngữ |
|---|---|---|
| ok (đã chốt) | 35 | squamous cell carcinoma, HNSCC, oral SCC, oral cavity, keratinizing / non-keratinizing SCC, hypopharynx, p16 IHC, nasopharyngeal carcinoma, nasopharynx, oral leukoplakia, neck dissection, lymph node level, occult metastasis, salivary / parotid / submandibular gland, pleomorphic adenoma, Warthin, mucoepidermoid, adenoid cystic, carcinoma ex PA, Milan, frozen section, sinonasal papilloma, inverted papilloma, olfactory neuroblastoma, JNA, ameloblastoma, dentigerous cyst, radicular cyst, cholesteatoma, vocal cord polyp, vocal cord nodule, laryngeal papillomatosis |
| tie (gần hòa) | 4 | oropharynx, HPV-associated oropharyngeal SCC, depth of invasion, tumour budding |
| low (bằng chứng 0-1 nguồn, chọn theo quy tắc pack cha) | 19 | EBER-ISH, basaloid SCC, spindle cell carcinoma, lymphoepithelial carcinoma, erythroplakia, oral epithelial dysplasia, laryngeal dysplasia, CUP neck, basal cell adenoma, oncocytoma, secretory carcinoma, polymorphous adenocarcinoma, oncocytic / exophytic papilloma, SNUC, NUT carcinoma, odontogenic keratocyst, fibrous dysplasia, branchial cleft cyst |
| unresolved (không có chuẩn VN) | 8 | verrucous carcinoma, worst pattern of invasion, tumour thickness, extranodal extension, close margin, acinic cell carcinoma, ossifying fibroma, thyroglossal duct cyst |
| parent (giữ theo pack cha) | 4 | perineural invasion, salivary duct carcinoma, fine needle aspiration, tonsil |

**Lý do để unresolved và giữ EN:**
- **verrucous carcinoma:** không thấy bài VN nào. Tạm dùng "ung thư biểu mô dạng mụn cóc (verrucous carcinoma)", có kèm EN.
- **WPOI:** bài VN duy nhất (PNT) viết bằng tiếng Anh. Tạm dịch mô tả "kiểu xâm lấn xấu nhất (WPOI)".
- **tumour thickness:** truy vấn nhiễu, không có bài xác nhận. Tạm dùng "độ dày u".
- **ENE:** "phá vỡ vỏ hạch" cho 0 kết quả trên VMJ và 1 trên VJOL (bài tuyến giáp). Tạm dùng "xâm lấn ra ngoài hạch (ENE)",
  theo mẫu "xâm lấn ra ngoài tuyến giáp".
- **close margin:** "diện cắt gần" và "diện cắt sát" đều cho 0 kết quả. Tạm dùng "diện cắt sát u".
- **acinic cell carcinoma:** chỉ có "carcinôm tế bào nang" suy từ ngữ cảnh bài TMH 2026. Tạm dùng "ung thư biểu mô tế bào
  túi tuyến", theo quy ước pack cha acinar = túi tuyến.
- **ossifying fibroma, thyroglossal duct cyst:** truy vấn bị chặn (429). Có một bài YDCT dùng "nang giáp - móng" cho
  thyroglossal duct cyst. Cần chạy lại.

## 3. Xung đột với pack cha (`packs/pathology/glossary.csv`)

| Thuật ngữ | Pack cha | Y văn đầu cổ (bằng chứng) | Xử lý trong pack này |
|---|---|---|---|
| squamous cell carcinoma | carcinôm tế bào gai (dòng 174) | ung thư biểu mô tế bào gai 13 nguồn; ung thư biểu mô (tế bào) vảy 10; carcinôm tế bào gai 2 (HIU 2022, BVNTP) | **Ghi đè** bằng "ung thư biểu mô tế bào gai". Phần "gai" khớp pack cha, phần "carcinôm" thì không. Pack cha cũng tự mâu thuẫn: dòng 28 ghi carcinoma = ung thư biểu mô |
| frozen section | lát cắt lạnh | sinh thiết tức thì 7 (VMJ 7162 hạ họng, YHCM thanh quản, HIU, TNU...); tiêu bản cắt lạnh 1; "lát cắt lạnh" 0 | **Ghi đè** bằng "sinh thiết tức thì". Đề xuất pack cha đổi: thủ thuật = sinh thiết tức thì, tiêu bản = tiêu bản cắt lạnh |
| fine needle aspiration | chọc hút tế bào bằng kim nhỏ (FNA), term_fix cấm "chọc hút kim nhỏ" | chọc hút kim nhỏ 5 tiêu đề (VMJ); chọc hút (tế bào) bằng kim nhỏ 4; chọc hút tế bào kim nhỏ 2 | **Giữ pack cha** vì user đã chốt. Dạng ngắn phổ biến hơn trong tiêu đề. Cần người quyết có giữ term_fix hay không |
| expression (p16) | bộc lộ | bài p16 đầu cổ: "biểu hiện p16" 2 (TCNCYH, YDCT); "bộc lộ" 0 trong đầu cổ, 1 trong cổ tử cung (VMJ) | **Giữ pack cha** (bộc lộ) |
| perineural invasion | xâm lấn quanh thần kinh | phân tán: xâm lấn quanh thần kinh 3 (1 bài đầu cổ: VMJ 1054); xâm nhập thần kinh ~3; xâm lấn thần kinh 2; xâm nhiễm thần kinh 1 | **Giữ pack cha** vì không biến thể nào áp đảo |
| depth of invasion (liên quan quy ước invasion = xâm lấn) | (không có) | độ sâu xâm lấn 4 (3 tiêu đề + 1 "chiều sâu xâm lấn"); độ sâu xâm nhập 5 (1 tiêu đề, 4 tóm tắt bài BV K) | Chọn "xâm lấn" cho khớp pack cha, đánh dấu tie |

**Câu hỏi mở của pack cha:**
- **carcinoma:** y văn đầu cổ VN dùng áp đảo "ung thư biểu mô":
  - SCC: 13 nguồn so với 2 nguồn "carcinôm".
  - Mucoepidermoid: 7 so với 2 (TMH 2026 "carcinôm biểu bì nhầy", BVNTP "carcinôm nhầy bì").
  - Adenoid cystic: 6 (1 trong số đó viết "carcinoma") so với 1 ("carcinôm nang tuyến").
  - Vòm họng: 5 so với 1 ("carcinôm vòm hầu", YHLS Huế).

  "carcinôm" chỉ gặp ở nhóm tác giả giải phẫu bệnh phía Nam (ĐHYD TP.HCM / HIU, BVNTP, TMH 2026). Khuyến nghị dùng
  "ung thư biểu mô" cho đầu cổ, giống pack vú.
- **lymphoma:** không đào thuật ngữ lymphôm đầu cổ (ngoài danh sách hạt giống). Pack cha đã có "lymphôm tế bào NK/T ngoài hạch,
  thể mũi". Không có bằng chứng mới.

## 4. Cần người quyết

1. **squamous:** chấp nhận "ung thư biểu mô tế bào gai" (ghi đè dòng 174 pack cha) hay giữ "carcinôm tế bào gai"?
   Lưu ý: phía Bắc (BV K, TCNCYH tổng quan) vẫn dùng "vảy" (10 nguồn).
2. **oropharynx:** "khẩu hầu" (6 nguồn: phía Nam, TCNCYH, các bài HPV/p16) hay "họng miệng" (5 nguồn: BV K, ĐHYHN)?
   Tests hiện chấp nhận cả hai.
3. **depth of invasion:** "độ sâu xâm lấn" hay "độ sâu xâm nhập" (nhóm BV K)?
4. **frozen section:** đổi pack cha từ "lát cắt lạnh" sang "sinh thiết tức thì"?
5. **FNA:** giữ dạng dài của pack cha hay chấp nhận "chọc hút kim nhỏ" (phổ biến hơn trong tiêu đề) và bỏ term_fix tương ứng?
6. **tumour budding:** "nảy chồi u" (khớp pack cha) hay "nảy chồi bướu" (bài đầu cổ phía Nam)? Hiện hòa 2-2.
7. **Thuật ngữ báo cáo chưa có chuẩn VN:** WPOI, ENE, tumour thickness, close margin. Cần chốt cách dịch, giữ viết tắt.
8. **Thực thể hiếm không có bài VN:** acinic cell carcinoma (túi tuyến / nang tuyến / chùm nang), secretory carcinoma,
   polymorphous adenocarcinoma (dễ nhầm với u tuyến đa hình), verrucous carcinoma, SNUC, NUT carcinoma,
   oncocytic / exophytic papilloma, ossifying fibroma.
9. **Chạy lại khi VJOL hết chặn (429):** thyroglossal duct cyst ("nang ống giáp lưỡi" hay "nang giáp - móng"),
   CUP ("chưa rõ" hay "không rõ" nguyên phát), dentigerous cyst, fibrous dysplasia.

## 5. Tệp

- `pack.json`: id, parent, draft, 30 từ khóa detect.
- `prompt.md`: 5 dòng văn phong.
- `glossary.csv`: 70 dòng, cột note theo dạng `freq N; src: ...`.
- `rules.json`: `term_fixes` rỗng. Không có biến thể sai nào vừa thực sự xuất hiện, vừa có bằng chứng mạnh chống lại.
- `tests.jsonl`: 10 câu tổng hợp tự viết.
- `sources.md`: biến thể, số đếm và trích dẫn cho từng thuật ngữ.
