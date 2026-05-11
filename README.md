# TOEFL Simulation Test

Simulasi tes TOEFL ITP-like berbasis web statis untuk latihan **Listening**, **Structure and Written Expression**, dan **Reading Comprehension**.

🌐 **Live Demo:** [https://AtsukoAditia.github.io/TOEFL-simulation-test](https://AtsukoAditia.github.io/TOEFL-simulation-test)

---

## Fitur

- 🎧 Listening Comprehension
- ✍️ Structure and Written Expression
- 📖 Reading Comprehension
- 🚀 Full Test Mode (Listening → Structure → Reading)
- ⏱️ Timer per section dengan auto-submit
- 📊 Estimasi skor TOEFL ITP-like
- 🗂️ Bank soal berbasis JSON (Set 1, 2, 3)
- 🔧 Panel Admin untuk upload soal
- ✅ Siap deploy ke GitHub Pages

---

## Struktur Proyek

```
.
├── index.html          # Halaman utama
├── admin.html          # Panel admin
├── css/
│   ├── style.css       # Styling halaman utama
│   └── admin.css       # Styling panel admin
├── js/
│   ├── app.js          # Logic utama aplikasi
│   ├── admin.js        # Logic panel admin
│   ├── scoring.js
│   ├── storage.js
│   ├── timer.js
│   └── tts.js
├── data/
│   ├── manifest.json
│   ├── listening-set-1.json
│   ├── listening-set-2.json
│   ├── listening-set-3.json
│   ├── structure-set-1.json
│   ├── structure-set-2.json
│   ├── structure-set-3.json
│   ├── reading-set-1.json
│   ├── reading-set-2.json
│   └── reading-set-3.json
└── README.md
```

---

## Menjalankan Secara Lokal

Karena aplikasi memuat data soal menggunakan `fetch()`, **tidak bisa dibuka langsung** dengan double-click file HTML.
Gunakan local server:

### Opsi 1 — VS Code Live Server
1. Buka folder project di VS Code
2. Install extension **Live Server**
3. Klik kanan `index.html`
4. Pilih **Open with Live Server**
5. Buka browser: `http://127.0.0.1:5500`

### Opsi 2 — Python HTTP Server
```bash
python -m http.server 8000
```
Buka browser: `http://localhost:8000`

### Opsi 3 — Node.js
```bash
npx serve .
```

---

## Deploy ke GitHub Pages

1. Push seluruh project ke branch `main`
2. Buka **Settings** repository
3. Masuk ke menu **Pages**
4. Source: **Deploy from a branch**
5. Branch: `main` | Folder: `/(root)`
6. Klik **Save**
7. Tunggu beberapa menit, lalu akses di:
   `https://<username>.github.io/<repo-name>`

---

## Format Tes TOEFL ITP-like

| Section | Jumlah Soal | Waktu |
|---|---|---|
| 🎧 Listening | 50 soal | 35 menit |
| ✍️ Structure | 40 soal | 25 menit |
| 📖 Reading | 50 soal | 55 menit |

### Pilihan Set Latihan
| Set | Deskripsi | Soal per Seksi |
|---|---|---|
| Set 1 | Beginner Quick Practice | 10 soal |
| Set 2 | Medium Practice | 20 soal |
| Set 3 | Advanced Long Practice | 30 soal |

---

## Catatan

> Project ini adalah alat latihan mandiri dan **tidak berafiliasi** dengan ETS (Educational Testing Service).
> Skor yang ditampilkan hanya **estimasi** untuk keperluan latihan.

---

## Lisensi

Project ini bersifat open-source untuk keperluan edukasi dan latihan.
