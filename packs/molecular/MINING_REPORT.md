# MINING_REPORT: molecular (Sinh học phân tử), draft 0.1.0

Ngày khai thác: 2026-10-14, đợt 1 (run `wave1-molecular`), cùng phiên với `molecular-pathology`. Phạm vi: acid nucleic, cấu trúc và biểu hiện gen, các loại biến đổi DNA, PCR / qPCR / RT-PCR / ddPCR, điện di, giải trình tự (Sanger, NGS cơ bản), lai phân tử, blot, ELISA, nuôi cấy tế bào, tách dòng, CRISPR. Pack gốc, không có cha; là cha của `molecular-pathology` (sau này thêm `genetics`, `bioinformatics`).

## 1. Tóm tắt (tin xấu trước)

- **210 dòng** glossary (35 giữ tiếng Anh, 21 trùng khóa với `pathology*` và giữ đúng giá trị, 69 bằng chứng thấp: ghi "low" trong note), 14 test, 2 term fix (ADN -> DNA, ARN -> RNA; quyết định 7 và số đếm 25:3 tài liệu). `check_packs`: 0 lỗi.
- **Nguồn phía Nam cho phần kỹ thuật thuần (tách dòng, vector, biến nạp, CRISPR, Western blot) gần như không có.** Các dòng này dựa trên kho VJBT / TC KH&CN (Hà Nội). Sáu bài phương pháp của các tạp chí phía Nam trên VJOL (ĐHQG TP.HCM, ĐH Mở TP.HCM, ĐH Nguyễn Tất Thành, ĐH Công nghiệp Thực phẩm) không tải được: VJOL trả 302 về chính nó (cần cookie) rồi 404. Tạp chí Y Dược học Cần Thơ bị bỏ qua có chủ ý: robots.txt đòi crawl-delay 20 s và cấm các tác tử AI tải bài.
- **Bằng chứng ngược với giá trị của pack `pathology`** (không sửa được ở đây vì luật sở hữu; giữ đúng giá trị pathology và ghi "USER DECISION"):
  - insertion: "thêm đoạn" 5 tài liệu (S3) so với "chèn đoạn" 4 (S1). Phía Nam nghiêng về "thêm đoạn" 3:1.
  - allele: "alen" 9 tài liệu so với "allele" 3 (quyết định 7 đã chọn "alen"), nhưng khóa trần `allele` của pathology vẫn là "allele". Pack này chỉ dùng "alen" trong khóa ghép (`mutant allele`, `allele frequency`).
  - genome: "bộ gen" có ở 5 tài liệu phía Nam, "hệ gen" 0 tài liệu phía Nam (dù tổng số lần "hệ gen" cao hơn do một bài tổng quan VJBT). Chọn "bộ gen".
  - FISH: "lai huỳnh quang tại chỗ" 2 tài liệu (BYT 3336, TCNCYH) so với "lai tại chỗ huỳnh quang" 1; pathology giữ dạng sau.
- **Hai lỗi về khóa đã chặn:** khóa so khớp không phân biệt hoa / thường, nên `KIT` (gen) trùng `kit` (bộ hóa chất), `MET` trùng "met", `POLE` trùng "upper pole". Đã bỏ các khóa trần đó và thêm 3 dòng `-` vào `packs/_shared/owners.csv`, cùng 2 dòng giao `sensitivity` / `specificity` cho `molecular` (theo plan mục 4.2).
- PyMuPDF không có trong env `vitranslate`; tôi chỉ dùng python.exe của env `titan_gpu310` (CPU, `-I`) để trích chữ PDF. Mọi bước khác chạy bằng env `vitranslate`.
- Bản dịch đã duyệt của người dùng (thư mục bản dịch riêng, hai bộ slide riêng) **không** được đọc vì chỉ dẫn cấm chạm vào inputs / outputs. Chỉ đọc `translator/glossary/usage_frequency.md` (2 thuật ngữ người dùng đã duyệt: gen dung hợp, xác định kiểu gen).

## 2. Phương pháp

1. Đọc `docs/PACKS.md`, lộ trình 2026-10-14 (mục 3-6 và các quyết định đã chốt), `docs/packs/plans/sinh_hoc_phan_tu.md`, các pack `pathology*` và `owners.csv`.
2. Tìm bài bằng WebSearch có `allowed_domains` (ưu tiên tapchiyhoctphcm.vn), lấy mục lục chuyên đề "Chẩn đoán hình ảnh - Sinh học phân tử" (Y học TP.HCM 25(1), 2021) bằng 1 WebFetch.
3. Tải toàn văn **chỉ** qua `tools/corpus_fetch.py --run wave1-molecular --max-total 58` (trần 40 / host mặc định). Kiểm robots.txt của từng host mới trước (qua chính công cụ này). VJOL chạy với `--delay 10` theo robots.txt của VJOL.
4. Trích chữ (PyMuPDF), chuẩn hóa NFC, gộp dấu kiểu cũ, đếm từng biến thể theo **số tài liệu** và theo vùng (S / N / O) bằng script tạm, in ASCII; kiểm ngữ cảnh (KWIC) các ca nghi ngờ để loại khớp sai (vd "toàn bộ gen" khi đếm "bộ gen", "TMB" là cơ chất ELISA, "đột biến chủ" là "đột biến chủ đạo").
5. Chọn canonical: biến thể nhiều tài liệu nhất, ưu tiên phía Nam; phía Nam không có thì lấy toàn quốc; khóa trùng với pack khác thì giữ giá trị của chủ sở hữu; ký hiệu gen, tên kỹ thuật và tên kit giữ tiếng Anh khi y văn giữ.
6. Không chép câu nào từ bài báo; `sources.md` chỉ ghi cặp thuật ngữ, số đếm và mã trích dẫn.

### Lưu lượng

| Host | Request | Kết quả |
|---|---|---|
| tapchiyhoctphcm.vn | 20 | robots + 19 PDF (1 bài lấy từ cache của miner khác, không tính) |
| duoc.tapchiyhoctphcm.vn | 1 | 1 PDF (ngoài chủ đề) |
| tapchinghiencuuyhoc.vn | 12 | robots + 11 PDF |
| vjs.ac.vn | 8 | robots + 7 PDF |
| vjol.info.vn | 8 | robots + 6 x 302 + 1 x 404: không có file |
| jcmhch.com.vn | 4 | robots + 3 x 302 (trang đăng nhập): không có file |
| vnras.com | 2 | robots + QĐ 3336/QĐ-BYT (HTML) |
| tapchi.ctump.edu.vn | 1 | robots (rồi dừng, xem trên) |
| **Tổng** | **56 / 58** | 40 tài liệu đọc được (S 21, N 18, O 1); không gặp 429 / 403 / reset |

WebSearch: 22 / 40 (tính chung cho 2 pack). WebFetch: 2 / 15 (mục lục Y học TP.HCM 25(1); trang bài JCMHCH 1404 để lấy link PDF). Không truy cập tapchiyhocvietnam.vn, thuvienphapluat.vn, msdmanuals.com. Không dùng MedEV.

## 3. Các lựa chọn chính và số đếm

| EN | Chọn | Số tài liệu (S / N / O) | Biến thể thua |
|---|---|---|---|
| gene | gen | 30 (14/15/1) | gene 27 (gồm tài liệu tham khảo) |
| DNA / RNA | DNA / RNA | 25 / 8 | ADN 3 (BYT 73 lần), ARN 1 (BYT) |
| genome | bộ gen | S5 + N5 | hệ gen 8 (S0) |
| codon | codon (giữ EN) | 8 (5/3) | bộ ba 6 (N, VJBT) |
| amino acid | acid amin | 7 (4/3) | axit amin 2 |
| deletion | mất đoạn | 10 (4/6) | xóa đoạn 5 (2/3) |
| insertion | chèn đoạn (= pathology) | 4 (1/3) | **thêm đoạn 5 (3/2)** |
| duplication | lặp đoạn | 3 | nhân đoạn 2 (N) |
| frameshift | dịch khung | 2 (N) | lệch khung 1 (N) |
| primer / primer pair | mồi / cặp mồi | 19 / 14 | đoạn mồi 5 |
| forward / reverse primer | mồi xuôi / mồi ngược | 10 / 10 | mồi thuận / nghịch 0 |
| annealing | bắt cặp | 6 (3/3) | gắn mồi 2 |
| probe (PCR, NGS) | mẫu dò | 8 (5/2/1) | đầu dò 3 (BYT, VJBT17, YHCM26-MRD dPCR) |
| DNA extraction | tách chiết DNA | 11 (8/3) | ly trích DNA 3 (S3) |
| purification | tinh sạch | 16 | tinh chế 2 |
| sequencing | giải trình tự | 28 | xác định trình tự 6 (N) |
| next generation sequencing | giải trình tự thế hệ mới (NGS) (= pathology) | 12 (8/4) | ... gen thế hệ mới 14 (7/7): hòa |
| library preparation | chuẩn bị thư viện | 7 (5/1/1) | tạo thư viện 5 (4/1) |
| negative / positive control | chứng âm / chứng dương | 5 / 4 | đối chứng âm / dương 2 / 1 (N) |
| gene expression | biểu hiện gen | 8 (2/6) | bộc lộ gen 0 |
| cloning | tách dòng | 4 (N) | nhân dòng 4 (ít lần hơn), tạo dòng 1 |
| bacterial transformation | biến nạp | 5 (N) | chuyển dạng 1 (nghĩa ác tính) |
| restriction enzyme | enzyme giới hạn | 4 (N) | enzyme cắt giới hạn 1 |
| sequencing read | trình tự đọc | 2 (1/1) | đoạn đọc 2 (N/O) |
| wild-type | kiểu hoang dã (= pathology) | kiểu dại 1 (chỉ BYT) | y văn né: "không đột biến" 5 (S4) |

## 4. Quyết định cần người dùng (bác sĩ GPB chốt)

1. **insertion: "chèn đoạn" hay "thêm đoạn"?** Phía Nam 3:1 cho "thêm đoạn". Đổi thì sửa cùng lúc `pathology` (insertion), `molecular`, `molecular-pathology` (exon 20 insertion) và test của lộ trình.
2. **allele: sửa khóa trần `allele` của pathology thành "alen"** (quyết định 7 đã chốt; số đếm 9:3). Sau đó thêm khóa trần vào `molecular`.
3. **genome: "bộ gen" (phía Nam) hay "hệ gen" (VAST / VJBT, tổng quan)?** Kéo theo reference genome, WGS, genomic DNA.
4. **FISH: thứ tự "lai tại chỗ huỳnh quang" (pathology) hay "lai huỳnh quang tại chỗ" (BYT 3336, TCNCYH)?**
5. **wild-type:** giữ "kiểu hoang dã" (pathology) hay đổi cả hai pack sang "kiểu hoang dã (wild-type)" như quyết định 7 ghi. Y văn trong kho không dùng từ này (BYT dùng "kiểu dại").
6. **probe của PCR:** bài phía Nam về dPCR (BV Truyền máu Huyết học) viết "đầu dò"; các bài NGS phía Nam viết "mẫu dò". Giữ quyết định 7 (PCR / NGS = mẫu dò)?
7. **sequence alignment:** "sắp gióng" (1 bài phía Nam) hay "gióng hàng" (VJBT); để pack `bioinformatics` quyết cũng được.

## 5. Chưa giải quyết (ít hoặc không có bằng chứng; ghi "low" trong note)

splice site, exon skipping, synonymous variant, inversion, transfection, cycle threshold, high-resolution melting, hydrolysis / hybridization / capture probe, droplet digital PCR, mitochondrial DNA, gain of function, CpG island, cell cycle. Các dạng này ghép theo quy ước và cần được xác nhận khi có thêm tài liệu.

## 6. Kiểm tra

- `tools/check_packs.py packs`: 0 lỗi (29 cảnh báo đều thuộc pack khác: 27 khóa có ngoặc của `pathology`, 1 trùng khóa của `pathology`, 1 của `pathology-kidney` đang được miner khác thêm).
- `tools/build_registry.py packs out/registry-drafts --include-drafts`: 214 profile terms, không cảnh báo detect.
- `tools/eval_pack.py molecular --family --fake`: 14 test nạp đúng schema (mô hình giả chỉ lặp lại câu nguồn nên đạt 1/14 là bình thường). Lúc khai thác chưa chạy được mô hình thật (GPU bận đến khoảng 15:00).
- Bổ sung tối 2026-10-14 (offline, Ollama cục bộ): `tools/eval_pack.py molecular gemma4:e4b --dir --family` trên GPU: **13/14**. Test trượt: "cloned into the CRISPR/Cas9 expression vector" được dịch là "nhân bản vào vector" (`must_any` tách dòng / nhân dòng / gắn). Tiêu chí của lộ trình dùng qwen3.5:9b; lần này dùng gemma4:e4b theo yêu cầu.
- Python suite: 648 passed.
- Thăm dò chọn pack (registry nháp): đoạn phương pháp PCR / Sanger và đoạn tách dòng chọn `molecular`; báo cáo NGS chọn `molecular-pathology` + `molecular`; văn bản "agri genetics" chọn `molecular` (được phép theo K8); "stats tutorial" và đoạn GPB u màng não không chọn pack phân tử.
