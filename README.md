# 🌸 Thảo Hoàng Orchid — Hệ thống In Tem Dán Thùng

Hệ thống in tem tự động gồm 2 phần:

- **`index.html`** — web tĩnh trên Cloudflare Pages, nhận đơn từ AppSheet, vẽ tem bằng Canvas, gửi đến máy in
- **`server.js`** — Node.js server chạy local tại mỗi khu, nhận PNG, in qua CUPS

---

## 📐 Kiến trúc

```
AppSheet
   │  mở URL kèm params
   ▼
thaohoang-label.thangmotsach.com  (Cloudflare Pages)
   │  POST /in_label/print
   │
   ├──▶  aserver.thangmotsach.com/in_label  →  Khu A (192.168.0.6:4001)   →  XP-365B
   └──▶  bserver.thangmotsach.com/in_label  →  Khu B (192.168.2.14:4001)  →  XP-470B
```

**Luồng xử lý:**
1. AppSheet mở URL Cloudflare Pages kèm thông tin đơn (URL-encoded)
2. `index.html` vẽ tem trên Canvas (1146×862px landscape, 97×73mm @300dpi)
3. Canvas **xoay 90°CW ngay trên trình duyệt** → PNG portrait
4. POST PNG đến print server khu tương ứng
5. Server nhận → `lp` in qua CUPS → xóa file tạm

---

## 🗂️ Cấu trúc thư mục

```
in_label/
├── index.html                          # Frontend
├── server.js                           # Print server
├── package.json                        # npm (chỉ express)
├── setup.sh                            # ← Cài đặt máy mới từ đầu
├── install-service.sh                  # Đăng ký/cập nhật systemd service
├── printer-driver-xprinter_3_13_3_all.deb
└── README.md
```

---

## 🖨️ Thông tin máy in

| Khu | Tunnel URL | IP local | Port | Máy in |
|-----|-----------|----------|------|--------|
| A | aserver.thangmotsach.com/in_label | 192.168.0.6 | 4001 | XPrinter XP-365B |
| B | bserver.thangmotsach.com/in_label | 192.168.2.14 | 4001 | XPrinter XP-470B |

- Khổ giấy: `Custom.73x97mm` (73×97mm, portrait)
- Driver: XP-470B (grayscale) / XP-365B (grayscale)
- Kết nối: USB → `usb://Xprinter/XP-470B?serial=...`

---

## 🚀 Cài đặt máy mới (chạy 1 lần)

```bash
unzip thaohoang-label-server.zip -d in_label
cd in_label
chmod +x setup.sh
sudo ./setup.sh
```

`setup.sh` tự động làm **6 bước**, mỗi bước kiểm tra trước — chạy lại an toàn:

| Bước | Nội dung | Kiểm tra bỏ qua nếu |
|------|----------|---------------------|
| 1 | Node.js 20 | `node --version` ≥ 18 |
| 2 | CUPS + mở cổng 631 cho LAN | `dpkg -l cups` đã cài |
| 3 | Driver XPrinter `.deb` | `dpkg -l printer-driver-xprinter` đã cài |
| 4 | Thêm máy in vào CUPS | `lpstat -a` đã có tên máy |
| 5 | `npm install` (express) | `node_modules/express` đã có |
| 6 | systemd service | Ghi đè — luôn cập nhật |

### Bước 4 — Thêm máy in chi tiết

Script **tự dò URI USB** (`lpinfo -v`) thay vì nhập tay:

```
Đang dò cổng USB cho XP-470B...
✅  Tìm thấy URI: usb://Xprinter/XP-470B?serial=470BWH243290034
✅  Đã thêm XP-470B | driver: xprinter/XP-470B.ppd
```

Nếu không tự tìm được (máy chưa cắm USB), script hiển thị danh sách USB đang thấy và cho nhập thủ công.

---

## ☁️ Cloudflare Tunnel

Mỗi khu cần 1 tunnel — **dùng IP tĩnh, không dùng `localhost`** (vì cloudflared chạy trong Docker):

| Khu | Hostname | Service |
|-----|----------|---------|
| A | aserver.thangmotsach.com | http://192.168.0.6:4001 |
| B | bserver.thangmotsach.com | http://192.168.2.14:4001 |

Path prefix `in_label` → routes: `/in_label/health` và `/in_label/print`

---

## 🌐 CUPS Web UI

Truy cập từ bất kỳ máy trong LAN:

```
http://<IP-máy-in>:631
```

Ví dụ: `http://192.168.2.14:631`

Đăng nhập bằng **tài khoản Linux** của máy đó (user trong nhóm `lpadmin`).

### Xem URI máy in đang dùng

```bash
lpstat -v
# XP-470B usb://Xprinter/XP-470B?serial=470BWH243290034
```

### Thêm/sửa máy in thủ công

```bash
# Xem tất cả thiết bị USB CUPS nhận ra
sudo lpinfo -v | grep usb

# Xem tất cả driver có sẵn
sudo lpinfo -m | grep -i xprinter

# Thêm máy in
sudo lpadmin -p XP-470B -E \
  -v "usb://Xprinter/XP-470B?serial=470BWH243290034" \
  -m "xprinter/XP-470B.ppd" \
  -o PageSize=Custom.73x97mm \
  -o media=Custom.73x97mm \
  -o sides=one-sided

# Xóa và thêm lại
sudo lpadmin -x XP-470B
```

---

## 🔧 Quản lý Service

```bash
# Trạng thái
sudo systemctl status thaohoang-print-label

# Log realtime
journalctl -u thaohoang-print-label -f

# Khởi động lại (sau khi sửa server.js / chuyển thư mục)
sudo systemctl restart thaohoang-print-label

# Chuyển thư mục → chạy lại setup.sh từ vị trí mới
cd /đường/dẫn/mới/in_label
sudo ./setup.sh
```

---

## 📱 AppSheet — Formula URL

```
HYPERLINK(
  CONCATENATE(
    "https://thaohoang-label.thangmotsach.com/in_label?",
    ENCODEURL(CONCATENATE(
      TEXT([THỜI GIAN LÊN ĐƠN], "DD/MM/YYYY"), "
- ", [THÔNG TIN DÁN THÙNG], "
- MÃ CÂY: ",
      IF(CONTAINS([MÃ CÂY],"-"), LEFT([MÃ CÂY],FIND("-",[MÃ CÂY])-1), [MÃ CÂY]),
      " - ",
      IF(LEN([LOẠI CÂY])>5, LEFT(RIGHT([LOẠI CÂY],5),1)&"V", [LOẠI CÂY]), "
- GHI CHÚ: ", [GHI CHÚ], "
- TỔNG: ", [SỐ THÙNG], " THÙNG",
      IF([ĐỘI PHỤ TRÁCH]="Khu B", "\nkhuB", "\nkhuA"),
      IF(OR(
        [KHÁCH HÀNG ĐẠI LÝ]="CÔ ĐỨC",
        [KHÁCH HÀNG ĐẠI LÝ]="CÔ KIM NGÂN",
        CONTAINS([MÃ CÂY],"KSC")
      ), "\nnoLogo", "")
    ))
  ),
  "IN TEM DÁN THÙNG"
)
```

**`noLogo`** — ẩn toàn bộ thông tin công ty (logo, tên, website, footer)

---

## 📊 Số tem tự động

| Số thùng | Số tem in |
|----------|-----------|
| ≤ 1 | 2 |
| 2 | 4 |
| 2.3 | 4 (floor × 2) |
| 2.6 | 6 ((floor+1) × 2) |
| 5 | 10 |

---

## 🐛 Troubleshooting

### Service không start

```bash
journalctl -u thaohoang-print-label -n 50 --no-pager
node server.js   # chạy tay để xem lỗi trực tiếp
```

### Tunnel 502

```bash
# Kiểm tra service đang chạy
sudo systemctl status thaohoang-print-label
# Kiểm tra port đang nghe
ss -tlnp | grep 4001
# Tunnel phải dùng IP tĩnh — không dùng localhost
# Đúng:  http://192.168.2.14:4001
# Sai:   http://localhost:4001
```

### Máy in không in

```bash
lpstat -a                    # xem trạng thái queue
lpstat -v                    # xem URI đang dùng
sudo lpinfo -v | grep usb    # máy in có được nhận ra không
cancel -a XP-470B            # xóa hết job đang kẹt
```

### CUPS không truy cập được từ LAN

```bash
# Kiểm tra config
grep -E "^Port|^Listen|Allow" /etc/cups/cupsd.conf
# Phải có "Port 631" (không phải "Listen localhost:631")
# Và "Allow 192.168.0.0/16" trong các block <Location>

# Khởi động lại
sudo systemctl restart cups

# Mở firewall
sudo ufw allow 631/tcp
```

---

## 🖼️ Thay logo

Logo embed thẳng dưới dạng base64 trong `index.html` (biến `LOGO_B64`):

```bash
python3 -c "
import base64
with open('logo.jpg','rb') as f:
    print('data:image/jpeg;base64,' + base64.b64encode(f.read()).decode())
"
# Copy kết quả → thay giá trị LOGO_B64 trong index.html → git push
```

---

*Thảo Hoàng Orchid © 2026 — www.thaohoangorchid.com*
