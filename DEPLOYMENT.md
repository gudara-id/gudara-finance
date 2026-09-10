# Gudara Finance Docker Deployment

## Struktur Container

- `frontend`: Nginx static server untuk React/Vite dan reverse proxy `/api/*` ke backend.
- `backend`: Node.js/Express API.
- `postgres`: PostgreSQL production database.

## Persiapan Environment

Copy contoh environment production:

```bash
cp .env.production.example .env
```

Ubah nilai berikut sebelum deploy:

```env
POSTGRES_PASSWORD='replace-with-strong-database-password'
JWT_SECRET='replace-with-random-minimum-32-character-production-secret'
SEED_ADMIN_PASSWORD='replace-with-strong-admin-password'
```

Gunakan tanda petik satu untuk password/secret production, terutama jika nilainya berisi karakter `$`.
Tanpa quote, Docker Compose akan menganggap bagian setelah `$` sebagai variable environment lain.

## Menjalankan Aplikasi

Build dan jalankan semua service:

```bash
docker compose up -d --build
```

Jalankan migration:

```bash
docker compose exec backend npm run migrate
```

Jalankan seed data awal:

```bash
docker compose exec backend npm run seed
```

Cek log:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

## Akses

- Frontend: `http://localhost`
- Backend health lewat reverse proxy: `http://localhost/api/health`
- Backend langsung dari internal Docker network: `http://backend:3000`

Untuk production `gudara.id`, arahkan Cloudflare DNS ke IP server, lalu proxy trafik HTTP/HTTPS ke container `frontend`.

## Catatan Keamanan

- Jangan commit file `.env` production.
- Gunakan `JWT_SECRET` acak minimal 32 karakter.
- Gunakan password PostgreSQL yang kuat.
- Hanya expose container `frontend` ke publik.
- Jangan expose port PostgreSQL ke internet.
- Cloudflare harus bypass cache untuk `/api/*`.
