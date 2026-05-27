# gym-api

Tiny sync backend for the [gym workout tracker PWA](https://github.com/webtitovdev/gym).

Single-user, single password. Hono + SQLite + JWT, ~250 LoC. No frameworks beyond
Hono. Designed to run on a 256 MB Ubuntu VPS for ~free.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | liveness check |
| `POST` | `/auth/login` | — | `{ password }` → `{ token }` (long-lived JWT) |
| `GET` | `/api/sync` | Bearer | full snapshot of `sessions`, `setLogs`, `settings` |
| `POST` | `/api/sync` | Bearer | bulk upsert; last-write-wins by `updated_at` |

All IDs are client-generated UUIDs so writes work offline and merge cleanly.

## Local dev

```bash
npm install
cp .env.example .env  # edit ADMIN_PASSWORD + JWT_SECRET
npm run dev           # http://localhost:3000
```

## Deploy to Ubuntu VPS

One-shot installer (run as root on the VPS):

```bash
curl -sSL https://raw.githubusercontent.com/webtitovdev/gym-api/main/deploy/install.sh | sudo bash
```

You'll be asked for:
- **VPS public IP** — the script auto-builds `gym-api.<IP>.nip.io` as the hostname
- **App password** — what you'll type to log in from the PWA

The script:
1. Installs Node 20 + Caddy
2. Creates `gym-api` system user, clones repo to `/opt/gym-api`
3. Builds the TypeScript code (`npm ci && npm run build`)
4. Generates `.env` with a random `JWT_SECRET`
5. Installs and starts `gym-api.service` (systemd)
6. Configures Caddy reverse proxy with auto-HTTPS via Let's Encrypt

Verify:
```bash
curl https://gym-api.<YOUR-IP>.nip.io/health
# → {"ok":true,"ts":...}
```

### Updates

After pushing changes to GitHub:
```bash
cd /opt/gym-api
sudo -u gym-api git pull
sudo -u gym-api npm ci && sudo -u gym-api npm run build
sudo systemctl restart gym-api
```

## Architecture notes

- **SQLite** via `better-sqlite3` (sync API, fast, no separate process)
- **WAL journal mode** — concurrent reads while one writer
- **Last-write-wins** sync — each row has `updated_at` (ms epoch); upserts only apply if newer
- **Soft delete** — `deleted` flag instead of removing rows, so other devices learn about deletions on next sync
- **No expiry on JWT** — single user, single device class, simpler than refresh tokens

## Data model

```
sessions
  id TEXT PK            -- client-generated UUID
  day_id TEXT           -- "1" | "2" | "3" from program.json
  started_at INTEGER    -- ms epoch
  completed_at INTEGER  -- 0 = active, >0 = done timestamp
  body_weight REAL?
  notes TEXT?
  updated_at INTEGER    -- ms epoch, increments on any mutation
  deleted INTEGER       -- 0 | 1

set_logs
  id TEXT PK
  session_id TEXT       -- FK
  exercise_id TEXT      -- from exercises.json
  set_index INTEGER
  weight REAL
  reps INTEGER
  rir INTEGER
  side TEXT?            -- 'left' | 'right' for unilateral
  completed_at INTEGER
  notes TEXT?
  updated_at INTEGER
  deleted INTEGER

settings
  key TEXT PK
  value TEXT            -- JSON-encoded
  updated_at INTEGER
```
