# Payment Ledger

A multi-user web app for tracking Arabic Telegram payment messages. Accounts are created
from a secret admin page, then users connect a Telegram bot to a channel, start a
listener, watch live logs, browse the parsed payments, and export the matching rows to
Excel on demand. Public sign-ups are disabled.

The Telegram traffic is very light: one long-polling loop per listener, no webhooks, and
no background workers beyond the FastAPI process.

## Stack

- **Backend:** FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL, asyncpg
- **Frontend:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, TanStack Query
- **Auth:** Argon2 password hashing, JWT in an httpOnly cookie
- **Telegram tokens:** encrypted at rest with Fernet; only a masked hint is returned

> Prisma is a Node.js ORM and cannot run inside the Python/FastAPI backend. SQLAlchemy +
> Alembic provide the same model/migration workflow. The original `payments.xlsx` and old
> bot scripts live in `legacy/` for reference only.

## Quick start with Docker

Requirements: Docker Desktop (or Docker Engine + Compose v2).

1. Create the environment file if it does not exist:

   ```powershell
   Copy-Item .env.example .env
   ```

   Fill in `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_SECRET`.
   Generate secrets with:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   python -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
   ```

   A local `.env` with generated development secrets is already present in this workspace.

2. Build and start everything (first build can take a few minutes):

   ```powershell
   docker compose up --build -d
   ```

3. Open <http://localhost:3000/admin>, enter `ADMIN_SECRET`, and create the first
   account. Then sign in at <http://localhost:3000/login>.

   The admin page is not linked anywhere in the app; keep its URL and secret private.
   From there you can also reset passwords, edit emails, deactivate/reactivate accounts, or
   delete accounts. Deactivation stops the account's listeners and revokes its sessions;
   deletion also removes the account's listeners, logs, and payments.

4. Add a listener:

   - Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
   - Add the bot to your Telegram channel as an **administrator** with permission to read
     messages.
   - Enter the channel as `@username` or as a numeric ID such as `-1001234567890`.
   - Paste the bot token, save, then press **Start listening**.

The first start skips updates that Telegram still has queued, so only new messages are
collected. Later starts resume from the last processed update.

### Useful commands

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose down          # stop, keep the database
docker compose down -v       # stop and delete the database volume
```

If it is the very first deploy, the backend runs `alembic upgrade head` automatically
before starting.

## How it works

- Each listener is one bot token + one channel, owned by one account.
- Telegram updates are long-polled and filtered to the configured channel.
- The Arabic parser extracts payments and keeps its pending multi-message state per
  listener in PostgreSQL, so restarts do not lose context. It recognises Syrian pound
  and USD amounts (`$`, `دولار`), thousand words (`الف`), bundles (`باقة`/`باقات`),
  balance top-ups (`ترصيد`/`رصيد`), day differences (`فرق ايام`), and refunds
  (`تم ترجيع`), which are stored as negative values with `kind = refund`.
- Edited Telegram messages are re-parsed and replace their previously stored payments.
  The log keeps the last edit time (`edited_at`).
- Telegram does **not** send deletion updates for regular channel posts. Stored messages
  can be removed manually from the logs panel (or via the delete-log API), which also
  removes their parsed payments. Deletions of business messages are processed when
  Telegram sends `deleted_business_messages`.
- Every received relevant message and every lifecycle event is written to
  `listener_logs`. Logs older than `LOG_RETENTION_DAYS` (default 7) are pruned.
- Parsed payments are stored in `payments` and kept indefinitely.
- Excel export is generated on request from the current filters; nothing is written to
  Excel during listening.

### API

All routes are under `/api`:

| Route | Purpose |
| --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Account session |
| `GET/POST /admin/users` | Secret admin API; requires the `X-Admin-Secret` header |
| `PATCH/DELETE /admin/users/{id}` | Update email/status or delete an account |
| `POST /admin/users/{id}/password` | Reset an account password and revoke its sessions |
| `GET/POST /listeners` | List or create listeners |
| `GET/PATCH/DELETE /listeners/{id}` | Listener details |
| `POST /listeners/{id}/start`, `POST /listeners/{id}/stop` | Control polling |
| `GET /listeners/{id}/logs` | Cursor-paginated logs |
| `DELETE /listeners/{id}/logs/{log_id}` | Remove a stored message and its payments |
| `GET /listeners/{id}/payments` | Filtered, paginated payments |
| `GET /listeners/{id}/payments/export.xlsx` | Excel export |
| `GET /health` | Backend + database health |

Interactive docs: <http://localhost:8000/docs>.

## Local development (without Docker)

Start a PostgreSQL instance on `localhost:5432`, or use:

```powershell
docker run -d --name management-bot-db `
  -e POSTGRES_USER=bot -e POSTGRES_PASSWORD=bot `
  -e POSTGRES_DB=management_bot -p 5432:5432 postgres:16-alpine
```

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --workers 1
```

Frontend (second terminal):

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. The Next.js server proxies `/api/*` to
`BACKEND_INTERNAL_URL` (default `http://localhost:8000`), so session cookies stay
same-origin.

**Run exactly one backend worker.** Polling loops live inside the API process; multiple
workers would poll the same bot tokens concurrently. Multiple listeners and multiple
accounts are fine on a single worker.

### Tests and checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\ruff.exe check app tests
.\.venv\Scripts\ruff.exe format --check app tests

cd ..\frontend
npm run typecheck
npm run build
```

## Configuration

Docker Compose reads the root `.env`; the backend reads the same variable names when run
directly.

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `bot` / required / `management_bot` | Compose database |
| `DATABASE_URL` | built from the values above | Use `postgresql+asyncpg://...` |
| `JWT_SECRET` | required | Random string |
| `ENCRYPTION_KEY` | required | URL-safe base64 32-byte Fernet key |
| `ACCESS_TOKEN_EXPIRE_DAYS` | `7` | Login cookie lifetime |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `ADMIN_SECRET` | required | Secret for the admin page and user creation API |
| `LOG_RETENTION_DAYS` | `7` | `0` keeps logs forever |
| `CORS_ORIGINS` | `http://localhost:3000` | Only needed for direct API calls |
| `TELEGRAM_POLL_TIMEOUT` | `30` | Long-poll timeout, seconds |
| `BACKEND_PORT` / `FRONTEND_PORT` | `8000` / `3000` | Published Docker ports |

## Security and operations

- The legacy bot had a hardcoded Telegram token in `legacy/config.py`. Revoke it with
  BotFather before deploying; never reuse it.
- Never commit `.env`. The repository ignores root, backend, and frontend env files.
- Keep `ADMIN_SECRET` long and private. The `/admin` page is unlisted, but the secret is
  what actually protects account creation.
- Serve the app over HTTPS and set `COOKIE_SECURE=true` in production.
- Telegram permits **one poller per bot token**. Do not run the same token in the old
  bot, in another listener, or in a second backend replica.
- A webhook on the same bot must be removed before polling can start; the app reports
  the Telegram error in the listener UI.
- To scale beyond one API process, move listeners to a separate singleton worker. The API
  can then be replicated, but only one poller owner may exist per token.
- Back up the database with:

  ```powershell
  docker compose exec -T db pg_dump -U bot management_bot > backup.sql
  ```

## Project layout

```text
backend/
  app/
    api/          FastAPI routers and dependencies
    core/         settings and security helpers
    db/           SQLAlchemy base/session
    models/       users, listeners, payments, logs
    schemas/      request/response models
    services/     Telegram client, poller manager, parser, exporter
  alembic/        migration environment and schema revisions
  tests/          auth, listener, logs/payments/export, poller tests
frontend/
  app/            login, dashboard, listener detail, secret admin page
  components/     UI, forms, logs, payments
  lib/            API client, hooks, i18n, formatting
legacy/           original script, logs, and payments.xlsx (reference only)
```

## Troubleshooting

- **"The bot must be an administrator"** — promote the bot to channel admin; read access
  is enough for messages, but admin status is required by Telegram for channels.
- **"Conflict: terminated by other getUpdates request"** — the same token is polled by
  another process. Stop the old bot/listener and try again.
- **No logs after starting** — the first start deliberately ignores existing backlog;
  send a new payment message to the channel.
- **Cannot create accounts** — open `/admin` and use the `ADMIN_SECRET` from `.env`, or
  check that the variable is set and restart the backend.
- **Port already in use** — change `FRONTEND_PORT`/`BACKEND_PORT` in `.env`, or stop the
  conflicting service.
