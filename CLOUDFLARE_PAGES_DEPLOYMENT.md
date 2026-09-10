# Gudara Finance - Cloudflare Pages + VPS Deployment

## Target Arsitektur

- Frontend: Cloudflare Pages, domain `https://gudara.id`.
- Backend: Docker di VPS, domain API `https://api.gudara.id`.
- Database: PostgreSQL di Docker network VPS, tidak diekspos ke internet.

## 1. Build Frontend untuk Cloudflare Pages

Masuk ke folder frontend:

```bash
cd frontend
npm install
```

Buat environment production frontend:

```bash
cp .env.production.example .env.production
```

Pastikan isinya:

```env
VITE_API_BASE_URL=https://api.gudara.id
```

Build static asset:

```bash
npm run build
```

Output siap upload ada di:

```text
frontend/dist
```

Jika memakai Cloudflare Pages dashboard:

```text
Framework preset: Vite
Root directory: frontend
Build command: npm run build
Build output directory: dist
Production environment variable:
  VITE_API_BASE_URL=https://api.gudara.id
```

Jika memakai Wrangler dari folder `frontend`:

```bash
npm install
npx wrangler pages deploy dist --project-name gudara-finance
```

File `frontend/wrangler.toml` sudah disiapkan dengan:

```toml
name = "gudara-finance"
pages_build_output_dir = "./dist"
compatibility_date = "2026-08-12"

[vars]
VITE_API_BASE_URL = "https://api.gudara.id"
```

Catatan: untuk Vite, `VITE_API_BASE_URL` harus tersedia saat build.

## 2. Setup Custom Domain Cloudflare Pages

Di Cloudflare Dashboard:

```text
Workers & Pages > gudara-finance > Custom domains > Set up a custom domain
```

Tambahkan:

```text
gudara.id
www.gudara.id
```

Pastikan DNS `gudara.id` dan `www.gudara.id` mengarah ke Cloudflare Pages project.

## 3. Deploy Backend + Database di VPS

Di VPS, copy source backend ke server lalu buat file `.env` dari contoh:

```bash
cp .env.backend.production.example .env
```

Isi production minimal:

```env
POSTGRES_PASSWORD=replace-with-strong-database-password
JWT_SECRET=replace-with-random-minimum-32-character-production-secret
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://gudara.id,https://www.gudara.id
SEED_ADMIN_NAME=Gudara Admin
SEED_ADMIN_EMAIL=admin@gudara.id
SEED_ADMIN_PASSWORD=replace-with-strong-admin-password
```

Jalankan backend dan database:

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

Jalankan migration dan seed:

```bash
docker compose -f docker-compose.vps.yml exec backend npm run migrate
docker compose -f docker-compose.vps.yml exec backend npm run seed
```

Backend akan listen internal host di:

```text
127.0.0.1:3000
```

## 4. Reverse Proxy API di VPS

Gunakan Nginx/Caddy/Traefik di host VPS untuk meneruskan:

```text
https://api.gudara.id -> http://127.0.0.1:3000
```

Contoh Nginx server block:

```nginx
server {
  listen 80;
  server_name api.gudara.id;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Untuk production, aktifkan TLS. Jika memakai Cloudflare proxy dan origin HTTPS, gunakan SSL/TLS mode `Full (strict)`.

## 5. CORS Backend

Backend membaca `CORS_ORIGIN` dari `.env`.

Production:

```env
CORS_ORIGIN=https://gudara.id,https://www.gudara.id
```

Dengan setting ini, request dari domain lain akan ditolak oleh middleware CORS.

## 6. Test

Health API:

```bash
curl https://api.gudara.id/api/health
```

Login:

```bash
curl -X POST https://api.gudara.id/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gudara.id","password":"<password-admin>"}'
```

Test CORS dari browser:

```text
https://gudara.id
```

Jika login berhasil dari frontend Cloudflare Pages, konfigurasi `VITE_API_BASE_URL` dan `CORS_ORIGIN` sudah sinkron.
