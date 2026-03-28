# Thảo Hoàng Orchid — Print Server

Express server nhận lệnh in từ frontend (web), chuyển tiếp đến máy in qua CUPS.

---

## 🗺 URL Map

### Tunnel (Internet / WAN)

| Khu   | Chức năng       | URL                                              |
|-------|-----------------|--------------------------------------------------|
| Tổng  | Landing page    | `print.thangmotsach.com` (Cloudflare Pages)      |
| Khu A | In tem          | `a_print.thangmotsach.com/in_label`              |
| Khu B | In tem          | `b_print.thangmotsach.com/in_label`              |
| Khu A | In A4           | `a_print.thangmotsach.com/in_a4`                 |
| Khu B | In A4           | `b_print.thangmotsach.com/in_a4`                 |

### Local LAN (cùng mạng)

| Khu A | `http://192.168.0.6:4001/in_label`  |
|-------|--------------------------------------|
| Khu A | `http://192.168.0.6:4001/in_a4`     |
| Khu B | `http://192.168.2.14:4001/in_label` |
| Khu B | `http://192.168.2.14:4001/in_a4`    |

> **Root `/` và `/in_label`, `/in_a4` đều trả về `index.html`**

---

## 📡 API Endpoints

### In tem (XPrinter)

```
GET  /<khu>.../in_label/health    → JSON trạng thái máy in tem
POST /<khu>.../in_label/print     → In tem PNG
     Body: { imageBase64, numCopies }
```

### In A4

```
GET  /<khu>.../in_a4/health       → JSON trạng thái máy in A4
POST /<khu>.../in_a4/print        → In tài liệu A4
     Body: { fileBase64, fileName, numCopies }
     Hỗ trợ: PDF, DOCX, ODT, XLSX, PNG, JPG (tối đa 25MB)
     DOCX/ODT/XLSX → LibreOffice headless → PDF → lp
```

---

## ⚙️ Cài đặt

```bash
sudo ./install.sh
```

Script sẽ hỏi và tự động cài:
1. Hostname nhận dạng khu (`print-khu-a` / `print-khu-b`)
2. Node.js 20
3. CUPS + cấu hình LAN
4. Driver XPrinter
5. Máy in tem (XP-365B hoặc XP-470B)
6. Máy in A4 (tên CUPS tùy máy — hỏi thủ công)
7. LibreOffice headless
8. npm install
9. systemd service `thaohoang-print-label`

---

## 🌐 Cloudflare Tunnel

Mỗi khu cần **1 tunnel riêng**, trỏ đến IP tĩnh (không dùng localhost):

```
Khu A:  a_print.thangmotsach.com  →  http://192.168.0.6:4001
Khu B:  b_print.thangmotsach.com  →  http://192.168.2.14:4001
```

Tunnel route **tất cả path** về Express — Express tự xử lý `/in_label` và `/in_a4`.

**Cài cloudflared:**
```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-public-v2.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-public-v2.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-public-v2.gpg] \
  https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
sudo cloudflared service install <TOKEN_CỦA_KHU>
```

---

## 🔧 Cấu hình máy in A4

Sau khi cài xong, điền tên CUPS thật vào `server.js`:

```js
const PRINTER_A4_A = 'Canon-LBP2900';   // ← tên thật Khu A
const PRINTER_A4_B = 'HP-LaserJet-Pro'; // ← tên thật Khu B
```

Xem tên CUPS: `lpstat -a` hoặc `lpstat -v`

---

## 📋 Quản lý service

```bash
sudo systemctl status  thaohoang-print-label
sudo systemctl restart thaohoang-print-label
sudo systemctl stop    thaohoang-print-label

# Xem log realtime
journalctl -u thaohoang-print-label -f
```

---

## 📁 Cấu trúc file

```
label_ThaoHoang_Print/
├── server.js                        # Express server (in tem + A4)
├── index.html                       # Frontend SPA (4 tab)
├── package.json
├── install.sh                       # Script cài đặt
├── printer-driver-xprinter_*.deb    # Driver XPrinter
├── README.md
└── WORKFLOW.md
```
