# WORKFLOW — Print Server Thảo Hoàng Orchid

## Luồng tổng thể

```
Người dùng (browser)
  │
  ├─ Mở print.thangmotsach.com    → Cloudflare Pages (landing, chọn khu)
  │
  ├─ Click "Khu A - In Tem"       → a_print.thangmotsach.com/in_label
  ├─ Click "Khu B - In Tem"       → b_print.thangmotsach.com/in_label
  ├─ Click "Khu A - In A4"        → a_print.thangmotsach.com/in_a4
  └─ Click "Khu B - In A4"        → b_print.thangmotsach.com/in_a4
           │
           ▼ (Cloudflare Tunnel)
    server.js : port 4001
           │
           ├─ /in_label → GET  : trả index.html
           ├─ /in_a4    → GET  : trả index.html
           │
           ├─ /in_label/health  → JSON {khu, printer, available}
           ├─ /in_label/print   → lp → XP-365B / XP-470B
           │
           ├─ /in_a4/health     → JSON {khu, printer_a4, available}
           └─ /in_a4/print      → [nếu DOCX: LibreOffice → PDF] → lp → máy A4
```

---

## Chi tiết luồng In Tem

```
Frontend (index.html)
  1. Vẽ canvas 1146×862px (landscape)
  2. Xoay 90°CW → PNG 862×1146px (portrait)
  3. POST /in_label/print  {imageBase64, numCopies}
           │
           ▼ server.js
  4. Ghi PNG vào /tmp/label_<ts>.png
  5. lp -d XP-365B -n <copies> -o media=Custom.73x97mm -o fit-to-page <file>
  6. Xóa file tạm
  7. Response: {success, message, details}
```

## Chi tiết luồng In A4

```
Frontend (index.html)
  1. Chọn file (PDF / DOCX / ảnh, max 25MB)
  2. Đọc base64 → xem trước
  3. POST /in_a4/print  {fileBase64, fileName, numCopies}
           │
           ▼ server.js
  4. Ghi file vào /tmp/a4_<ts>.<ext>

  5a. [PDF / ảnh]  → lp trực tiếp
  5b. [DOCX/ODT/XLSX/PPTX]
        → libreoffice --headless --convert-to pdf
        → lp -d <PRINTER_A4> -n <copies> -o media=A4 -o fit-to-page

  6. Xóa file tạm
  7. Response: {success, message, details}
```

---

## Cấu hình nhận dạng khu

Server tự nhận dạng khu qua **hostname**:

| Hostname chứa   | Khu | Máy in tem | Máy in A4       |
|-----------------|-----|------------|-----------------|
| `khu-a` / `aserver` / `khua` | A   | XP-365B    | PRINTER_A4_A    |
| Còn lại         | B   | XP-470B    | PRINTER_A4_B    |

Đặt hostname:
```bash
sudo hostnamectl set-hostname print-khu-a   # Khu A
sudo hostnamectl set-hostname print-khu-b   # Khu B
```

---

## Cloudflare Tunnel — Cấu hình

```yaml
# config.yaml (trong ~/.cloudflared/ hoặc /etc/cloudflared/)
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  # Tất cả request đến a_print.thangmotsach.com đều về server:4001
  - hostname: a_print.thangmotsach.com
    service: http://192.168.0.6:4001    # IP tĩnh của máy Khu A

  # Catch-all
  - service: http_status:404
```

> **Lưu ý**: Dùng **IP tĩnh**, không dùng `localhost` vì cloudflared chạy
> với quyền khác có thể không resolve được.

**Mỗi khu dùng 1 tunnel token riêng** (lấy từ Cloudflare Dashboard → Zero Trust → Tunnels).

---

## Deploy / Update

```bash
# 1. Upload file mới lên server
scp -r label_ThaoHoang_Print/ pi@192.168.0.6:~/

# 2. Cài lại nếu chưa có service
sudo ./install.sh

# 3. Chỉ restart service (nếu đã cài)
sudo systemctl restart thaohoang-print-label

# 4. Kiểm tra
journalctl -u thaohoang-print-label -f
curl http://localhost:4001/in_label/health
curl http://localhost:4001/in_a4/health
```

---

## Troubleshooting

### Service không start
```bash
journalctl -u thaohoang-print-label -n 50 --no-pager
```

### Máy in không nhận lệnh
```bash
lpstat -a                     # danh sách máy in
lpstat -p XP-365B             # trạng thái cụ thể
lpinfo -v | grep usb          # thiết bị USB đang thấy
```

### LibreOffice không convert được
```bash
libreoffice --version
libreoffice --headless --convert-to pdf test.docx
```

### Test API thủ công
```bash
# Health check
curl http://localhost:4001/in_label/health | python3 -m json.tool
curl http://localhost:4001/in_a4/health    | python3 -m json.tool

# Test in tem (cần file PNG base64)
curl -X POST http://localhost:4001/in_label/print \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"<base64>","numCopies":1}'
```
