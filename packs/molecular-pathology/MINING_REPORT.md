# MINING_REPORT: molecular-pathology (Bệnh học phân tử ung thư), draft 0.1.0

Ngày khai thác: 2026-10-14, cùng phiên và cùng kho với `molecular` (cha). Phương pháp, lưu lượng (56 / 58 request, 22 / 40 tìm kiếm, 2 / 15 WebFetch) và cách đếm: xem `packs/molecular/MINING_REPORT.md` và `sources.md`. Phạm vi: biến đổi sinh dưỡng trên khối u, panel NGS và báo cáo (VAF, TMB, MSI, HRD, LOH), sinh thiết lỏng, dung hợp / tái sắp xếp / khuếch đại, dấu ấn sinh học, bậc bằng chứng, các ký hiệu gen thường gặp.

## 1. Tóm tắt (tin xấu trước)

- **182 dòng**: 48 dòng giữ tiếng Anh (ký hiệu gen, biến thể protein, viết tắt như TMB, dMMR, ctDNA), 32 dòng trùng khóa với `pathology*` (giữ đúng giá trị), 42 dòng bằng chứng thấp hoặc chưa giải quyết (ghi "low" / "UNRESOLVED" trong note). 14 test, không có term fix. `check_packs`: 0 lỗi.
- **Không tìm thấy dạng tiếng Việt nào trong y văn** (40 tài liệu + tìm kiếm có giới hạn tên miền) cho: tumor mutational burden, homologous recombination deficiency, variant allele frequency, companion diagnostic, actionable. Các dòng này dùng dạng ghép hoặc dạng của lộ trình, giữ viết tắt EN, và **cần người dùng chốt** (đúng luật dự án: không có kết quả thì hỏi).
- **Bằng chứng ngược với giá trị của pack `pathology*`** (giữ giá trị của pack sở hữu, ghi "USER DECISION"):
  - loss of MMR protein expression: TCNCYH 2024 (tác giả di truyền + GPB) viết "mất biểu hiện protein MMR" 14 lần, "bộc lộ" 1 lần; quyết định 5 giữ "bộc lộ" cho protein. Ngược lại, bài GPB về PD-L1 (TCNCYH 2022) viết "bộc lộ PD-L1" 48 lần, ủng hộ quyết định 5. Chưa có số đếm phía Nam cho MMR.
  - targeted therapy: pathology = "liệu pháp nhắm trúng đích", nhưng kho có "điều trị đích" 9 tài liệu (S3), "điều trị nhắm trúng đích" 5 (S4), "liệu pháp nhắm trúng đích" 1. Pack này **không** chứa khóa đó (để pathology / medicine-oncology quyết).
  - driver mutation: pathology = "đột biến điều khiển (driver mutation)"; kho không có dạng tiếng Việt; một bài BV K (snippet) dùng "đột biến gen dẫn đường".
  - concordance: pathology = "đồng thuận" (nghĩa giữa người đọc); bài phân tử phía Nam dùng "tỷ lệ tương đồng" cho sinh thiết lỏng so với mô, nên pack này dùng khóa ghép `concordance rate`.
- Đã bỏ các hàng ký hiệu gen trùng từ tiếng Anh (KIT, MET, ATM, POLE) vì khóa không phân biệt hoa / thường; prompt và test vẫn giữ quy tắc "không dịch MET, KIT, ATM".
- Phần huyết học (BCR::ABL1, MRD) chỉ có 2 bài phía Nam; "tổ hợp gen BCR::ABL1" (phía Nam) khác "gen dung hợp" (người dùng đã duyệt): để pack `medicine-hematology` quyết.

## 2. Các lựa chọn chính và số đếm

| EN | Chọn | Số tài liệu (S / N / O) | Biến thể thua / ghi chú |
|---|---|---|---|
| somatic mutation | đột biến sinh dưỡng | 4 (4/0) | đột biến soma 2 |
| germline mutation | đột biến dòng mầm | 4 (3/1) | đột biến di truyền 2 |
| liquid biopsy | sinh thiết lỏng | 3 (2/1) | |
| cell-free DNA | DNA ngoại bào (cfDNA) | S1 | DNA tự do S1: hòa, giữ dạng của lộ trình |
| circulating tumor DNA | DNA khối u lưu hành (ctDNA) | S1 | DNA khối u tuần hoàn 0 |
| mutant allele frequency | tần suất đột biến (MAF) | S2 | |
| exon 19 deletion | mất đoạn exon 19 | 3 (1/2) | xóa đoạn exon 19 1 (N) |
| KRAS mutation | đột biến gen KRAS | 7 (5/2) | đột biến KRAS 6 (4/2) |
| EGFR mutation | đột biến gen EGFR (= respiratory) | 6 | đột biến EGFR 7: hòa |
| acquired resistance | kháng thuốc thứ phát | S1 | mắc phải 0 (lộ trình gợi ý "mắc phải") |
| homologous recombination repair | sửa chữa tái tổ hợp tương đồng (HRR) | S1 (Chợ Rẫy) | |
| measurable residual disease | bệnh tồn lưu đo được (MRD) | S1 (BV TMHH) | "tồn dư" 0 |
| gene panel | panel gen | 4 (1/3) | bảng gen 3 (1/2): gần hòa |
| biomarker | dấu ấn sinh học | 3 (2/1) | |
| predictive | dự đoán | 15 (S6) | tiên đoán 6 (S5, phần lớn từ bài CĐHA) |
| PD-L1 expression | bộc lộ PD-L1 | 1 N (48 lần) | biểu hiện PD-L1 2 |

## 3. Quyết định cần người dùng

1. **TMB**: "gánh nặng đột biến khối u" hay "tải lượng đột biến khối u", hay chỉ giữ "TMB"?
2. **VAF / MAF**: "tần suất alen biến thể (VAF)" hay theo bài phía Nam "tần suất đột biến (MAF)" cho cả hai?
3. **HRD**: "thiếu hụt tái tổ hợp tương đồng (HRD)" có ổn không?
4. **actionable**: "có thể điều trị nhắm trúng đích" hay giữ "actionable" kèm chú thích?
5. **companion diagnostic**: "xét nghiệm chẩn đoán đồng hành"?
6. **dMMR trên HMMD**: giữ "mất bộc lộ protein MMR" (quyết định 5) dù TCNCYH 2024 viết "mất biểu hiện" 14:1?
7. **acquired resistance**: "kháng thuốc thứ phát" (1 bài phía Nam) hay "kháng thuốc mắc phải" (lộ trình)?
8. **cfDNA**: "DNA ngoại bào" hay "DNA tự do" (hai bài phía Nam, mỗi bài một dạng)?
9. **driver mutation**: giữ "đột biến điều khiển (driver mutation)" của pathology hay đổi sang "đột biến dẫn đường"?
10. **targeted therapy** (pathology / medicine-oncology): "liệu pháp nhắm trúng đích" hay "điều trị (nhắm trúng) đích" như kho đếm được?

### Đã chốt 2026-10-15 18:48 (bản 0.1.2)

- fusion gene = **"tổ hợp gen"**: anh xác nhận (lựa chọn 1), cùng giá trị với `pathology-hemato`; gene fusion = "dung
  hợp gen", fusion = "dung hợp", ALK fusion = "dung hợp gen ALK" không đổi. prompt.md: câu cũ "fusion gene = gen dung
  hợp" sửa thành "tổ hợp gen". Thêm 1 test (must "tổ hợp gen" và "dung hợp gen", must_not "gen dung hợp").

## 4. Kiểm tra

- `check_packs`: 0 lỗi. `build_registry --include-drafts`: 185 profile terms, không cảnh báo.
- `eval_pack.py molecular-pathology --family --fake`: 28 test (14 của pack + 14 của cha) nạp đúng schema. Lúc khai thác chưa chạy được mô hình thật (GPU bận).
- Bổ sung tối 2026-10-14 (offline, Ollama cục bộ): `tools/eval_pack.py molecular-pathology gemma4:e4b --dir --family` trên GPU: **25/28**. Test của pack đạt 12/14; test của cha `molecular` đạt 13/14. Ba test trượt: (1) FISH break-apart probe được dịch là "mẫu dò tách đoạn", trong khi test đòi "đầu dò tách đôi" (quyết định 7: FISH = đầu dò); (2) "variants of uncertain significance" được dịch là "biến thể có ý nghĩa không xác định", test đòi "biến thể chưa rõ ý nghĩa"; (3) test "cloned" của `molecular`. Chạy riêng pack, không có cha: 10/14. Tiêu chí của lộ trình dùng qwen3.5:9b; lần này dùng gemma4:e4b theo yêu cầu.
- Thăm dò: báo cáo NGS (EGFR, VAF, TMB, MSI, sinh thiết lỏng) chọn `molecular-pathology` + `molecular`. Đoạn GPB phổi ngắn có EGFR / ALK / PD-L1 chỉ đạt 0,081 (dưới ngưỡng 0,10, dù có 2 detect hit), nên chỉ chọn `pathology-respiratory` + `pathology`. Deck thật dài hơn có thể vượt ngưỡng; cần đo lại trên corpus GPB (tiêu chí 3(d) của lộ trình).
