# Jenkins CI/CD Setup Guide — ProShop App

Dokumen ini menjelaskan langkah-langkah lengkap untuk mengonfigurasi Jenkins
agar pipeline CI/CD berjalan dengan benar di proyek ini.

---

## Arsitektur Pipeline

```
GitHub Push
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                        JENKINS PIPELINE                     │
│                                                             │
│  [1] Checkout → [2] Install (parallel) → [3] Test (parallel)│
│       │                                                     │
│       ▼                                                     │
│  [4] Build Docker Images (parallel: backend + frontend)     │
│       │                                                     │
│       ▼  (hanya branch main/master)                        │
│  [5] Push to Registry → [6] Deploy (Rolling) → [7] Health  │
└─────────────────────────────────────────────────────────────┘
    │ Success                      │ Failure
    ▼                              ▼
App Live ✅                   Auto Rollback ❌
```

---

## 1. Prasyarat Server Jenkins

### Instalasi Jenkins (Ubuntu/Debian)
```bash
# Java (wajib untuk Jenkins)
sudo apt update && sudo apt install -y openjdk-17-jdk

# Jenkins
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | \
  sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null
echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/ | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update && sudo apt install -y jenkins
sudo systemctl enable --now jenkins
```

### Docker (wajib diakses oleh Jenkins)
```bash
# Install Docker
sudo apt install -y docker.io docker-compose
sudo systemctl enable --now docker

# Tambahkan user jenkins ke group docker
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

### Node.js di Jenkins agent
```bash
sudo apt install -y nodejs npm
# atau pakai nvm untuk versi spesifik
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20 && nvm use 20
```

---

## 2. Plugin Jenkins yang Diperlukan

Install via **Manage Jenkins → Plugins → Available plugins**:

| Plugin | Kegunaan |
|---|---|
| `Pipeline` | Menjalankan Jenkinsfile |
| `Git` | Checkout dari GitHub |
| `Docker Pipeline` | Integrasi Docker di pipeline |
| `Credentials Binding` | Inject secrets ke pipeline |
| `HTML Publisher` | Tampilkan coverage report |
| `Blue Ocean` *(opsional)* | UI pipeline yang lebih bagus |
| `GitHub Integration` *(opsional)* | Webhook otomatis dari GitHub |

---

## 3. Credentials yang Harus Dibuat

Buka: **Manage Jenkins → Credentials → System → Global → Add Credentials**

### 3a. Docker Registry URL

| Field | Value |
|---|---|
| Kind | **Secret text** |
| ID | `DOCKER_REGISTRY` |
| Secret | `your-dockerhub-username` (atau IP registry privat, contoh: `192.168.1.100:5000`) |

### 3b. Docker Hub Login

| Field | Value |
|---|---|
| Kind | **Username with password** |
| ID | `docker-hub-credentials` |
| Username | username Docker Hub kamu |
| Password | password / access token Docker Hub |

> **Tips:** Buat Access Token di hub.docker.com → Account Settings → Security

### 3c. MongoDB URI

| Field | Value |
|---|---|
| Kind | **Secret text** |
| ID | `PROSHOP_MONGO_URI` |
| Secret | `mongodb://mongodb-proshopv2:27017/proshopdb` |

### 3d. JWT Secret

| Field | Value |
|---|---|
| Kind | **Secret text** |
| ID | `PROSHOP_JWT_SECRET` |
| Secret | string random panjang, contoh: `s3cr3t-jwt-k3y-pr0sh0p-2024` |

### 3e. PayPal Client ID

| Field | Value |
|---|---|
| Kind | **Secret text** |
| ID | `PROSHOP_PAYPAL_CLIENT_ID` |
| Secret | Client ID dari PayPal Developer Dashboard |

---

## 4. Membuat Pipeline Job di Jenkins

1. Klik **New Item** → pilih **Pipeline** → beri nama `proshop-cicd`
2. Di bagian **General**, centang **GitHub project** → isi URL repo
3. Di bagian **Build Triggers**, centang:
   - **GitHub hook trigger for GITScm polling** (untuk webhook otomatis)
   - atau **Poll SCM** dengan jadwal `H/5 * * * *` (cek tiap 5 menit)
4. Di bagian **Pipeline**:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/artamias/proshop-app.git`
   - Branch: `*/main`
   - Script Path: `Jenkinsfile`
5. Klik **Save**

---

## 5. Setup GitHub Webhook (agar trigger otomatis)

1. Buka repo GitHub → **Settings → Webhooks → Add webhook**
2. Payload URL: `http://<IP_JENKINS>:8080/github-webhook/`
3. Content type: `application/json`
4. Events: **Just the push event**
5. Klik **Add webhook**

---

## 6. Penjelasan Alur Pipeline

### Stage 1 — Checkout
Mengambil source code dari GitHub dan menampilkan info commit (author, message, branch).

### Stage 2 — Install Dependencies (Paralel)
Backend dan frontend install npm dependencies secara bersamaan untuk menghemat waktu.

### Stage 3 — Test (Paralel)
- **Frontend:** Menjalankan Jest unit tests dengan coverage report yang bisa dilihat di Jenkins UI.
- **Backend:** Memvalidasi syntax semua file JS dengan `node --check`.

### Stage 4 — Build Docker Images (Paralel)
Membangun image backend dan frontend secara bersamaan. Setiap image diberi dua tag:
- `proshopv2-backend:abc1234-42` — tag unik per build (commit SHA + build number)
- `proshopv2-backend:latest` — tag terbaru

### Stage 5 — Push to Registry *(main/master only)*
Push kedua image ke Docker Hub atau registry privat.

### Stage 6 — Deploy Rolling *(main/master only)*
Zero-downtime deployment dengan urutan:
1. Update `backend-proshopv2-1` → tunggu 12 detik
2. Update `backend-proshopv2-2` → tunggu 12 detik
3. Update `frontend-proshopv2` → tunggu 8 detik
4. Reload nginx

Selama update berlangsung, nginx tetap meneruskan traffic ke instance yang masih aktif.

### Stage 7 — Health Check *(main/master only)*
Melakukan HTTP GET ke `http://localhost:8081/api/products` hingga 12 kali (tiap 10 detik).
Jika gagal → pipeline ditandai FAILED dan rollback otomatis dijalankan.

### Post Actions
| Status | Aksi |
|---|---|
| Success | Hapus `.env`, prune dangling images, print summary |
| Failure | Hapus `.env`, prune images, `docker-compose restart` (rollback) |
| Unstable | Hapus `.env`, print peringatan |

---

## 7. Branching Strategy

| Branch | Install | Test | Build | Push | Deploy |
|---|---|---|---|---|---|
| `feature/*` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `develop` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `main` / `master` | ✅ | ✅ | ✅ | ✅ | ✅ |

Dengan strategi ini, setiap branch bisa divalidasi tanpa risiko menimpa production.

---

## 8. Troubleshooting Umum

### "Permission denied" saat docker build
```bash
sudo usermod -aG docker jenkins
sudo systemctl restart jenkins
```

### "Cannot connect to the Docker daemon"
Pastikan Docker daemon berjalan dan jenkins user ada di group docker:
```bash
sudo systemctl status docker
groups jenkins
```

### Health check selalu gagal
Periksa apakah MongoDB bisa diakses dari container backend:
```bash
docker-compose logs backend-proshopv2-1
docker exec -it mongodb-proshopv2 mongosh --eval 'db.runCommand("ping")'
```

### Pipeline tidak trigger setelah push
Cek webhook di GitHub (Settings → Webhooks → Recent Deliveries) dan pastikan
Jenkins URL bisa diakses dari internet (atau gunakan ngrok untuk testing lokal).