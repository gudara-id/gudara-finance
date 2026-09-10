# Gudara Finance Cloudflare-Only Deployment

Panduan ini dipakai ketika belum ada VPS. Frontend berjalan di Cloudflare Pages, backend API berjalan di Cloudflare Workers, dan database memakai Cloudflare D1.

Arsitektur:

```text
app.gudara.id -> Cloudflare Pages -> frontend/dist
api.gudara.id -> Cloudflare Worker -> Cloudflare D1
```

Backend Express/PostgreSQL di folder `src/` tetap dipertahankan untuk rencana VPS nanti.

## 1. Frontend: Cloudflare Pages

Di Cloudflare Dashboard:

1. Buka **Workers & Pages**.
2. Pilih **Create application**.
3. Pilih **Pages**.
4. Hubungkan repository project ini.
5. Set build:

```text
Root directory: frontend
Build command: npm run build
Build output directory: dist
```

Tambahkan variable production:

```env
VITE_API_BASE_URL=https://api.gudara.id
```

Set custom domain Pages:

```text
app.gudara.id
```

## 2. Backend API: Cloudflare Worker

Masuk ke folder Worker:

```bash
cd cloudflare/api-worker
npm install
```

Login Wrangler:

```bash
npx wrangler login
```

Buat database D1:

```bash
npx wrangler d1 create gudara-finance-db
```

Salin `database_id` dari output command tersebut, lalu masukkan ke:

```text
cloudflare/api-worker/wrangler.jsonc
```

Ganti:

```jsonc
"database_id": "replace-with-cloudflare-d1-database-id"
```

Set secret JWT:

```bash
npx wrangler secret put JWT_SECRET
```

Masukkan secret acak minimal 32 karakter saat diminta. Jangan gunakan secret yang pernah dikirim di chat/terminal.

## 3. Migration dan Seed D1

Apply schema ke D1 remote:

```bash
npx wrangler d1 migrations apply gudara-finance-db --remote
```

Seed Chart of Accounts:

```bash
npx wrangler d1 execute gudara-finance-db --remote --file ./seeds/chart-of-accounts.sql
```

Buat SQL admin lokal:

```bash
npm run make-admin-sql -- admin@gudara.id PasswordAdminKuat123! "Gudara Admin" admin
```

Apply admin user:

```bash
npx wrangler d1 execute gudara-finance-db --remote --file ./seeds/admin-user.sql
```

File `seeds/admin-user.sql` otomatis di-ignore oleh Git.

## 4. Deploy Worker

Deploy:

```bash
npx wrangler deploy
```

Jika custom domain belum otomatis aktif, buka Cloudflare Dashboard:

```text
Workers & Pages -> gudara-finance-api -> Settings -> Domains & Routes
```

Tambahkan custom domain:

```text
api.gudara.id
```

Tes API:

```bash
curl https://api.gudara.id/health
```

Respons yang benar:

```json
{"status":"ok"}
```

## 5. DNS Cloudflare

Untuk Cloudflare-only:

- Jangan buat `A record api` ke IPv4 VPS, karena belum ada VPS.
- `api.gudara.id` diarahkan lewat Worker custom domain.
- `app.gudara.id` diarahkan lewat Pages custom domain.

## 6. Saat Nanti Pindah ke VPS

Ketika VPS sudah dibeli, ada dua pilihan:

1. Tetap pakai Cloudflare Pages untuk frontend, lalu pindahkan `api.gudara.id` dari Worker ke VPS.
2. Pindahkan frontend dan backend ke VPS sepenuhnya memakai Docker/Nginx.

Untuk pilihan pertama, cukup:

- Deploy backend Express/PostgreSQL di VPS dengan `docker-compose.vps.yml`.
- Ubah routing `api.gudara.id` dari Worker custom domain menjadi DNS `A` record ke IP VPS.
- Pastikan backend VPS memakai:

```env
CORS_ORIGIN=https://app.gudara.id
```

Frontend tidak perlu diubah karena tetap memanggil:

```env
VITE_API_BASE_URL=https://api.gudara.id
```
