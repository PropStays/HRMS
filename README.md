# Northstar HRMS

Runnable MVP with a dependency-free Node API and a JSON persistence layer.

## Run Locally

```powershell
npm start
```

Open http://localhost:3000. For local development, MySQL is recommended; the JSON file is only a fallback for non-authenticated development data.

## Production Database

The application uses MySQL in production. Set these values in a server-side `.env` file in the application directory:

```env
PORT=3000
DB_DRIVER=mysql
DB_HOST=your-production-mysql-host
DB_PORT=3306
DB_NAME=northstar_hrms
DB_USER=northstar_app
DB_PASSWORD=use-a-long-random-secret
DB_AUTO_CREATE=false
DB_REQUIRED=true
NODE_ENV=production
MASTER_ADMIN_EMAIL=admin@your-company.com
MASTER_ADMIN_PASSWORD=use-a-unique-first-run-password
```

Create the database and user before starting the application. The user needs permission to create or alter the application schema on the first startup, but does not need permission to create databases:

```sql
CREATE DATABASE northstar_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'northstar_app'@'10.%' IDENTIFIED BY 'replace-with-a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON northstar_hrms.* TO 'northstar_app'@'10.%';
FLUSH PRIVILEGES;
```

Replace `10.%` with the private IP range of the application server. Restrict MySQL port `3306` to that server in the firewall; do not expose it publicly. Do not commit `.env` or use the sample default credentials.

On startup, the application creates missing tables and applies schema migrations. Verify the connection before opening the site:

```powershell
npm install --omit=dev
npm start
Invoke-RestMethod http://localhost:3000/api/database-status
```

The response should report `"driver":"mysql"`. If it reports `json-fallback`, stop deployment and fix the MySQL host, credentials, firewall, or permissions; do not run a live system on the fallback store.

The startup seed creates the master Super Admin account when MySQL is available:

- Email: `admin@northstar.local`
- Password: `Northstar@2026`

Set `MASTER_ADMIN_EMAIL` and `MASTER_ADMIN_PASSWORD` in `.env` to use different credentials. The seed is idempotent and does not reset the existing password.

## API

- `GET /api/dashboard`
- `GET /api/employees`
- `POST /api/employees` with `{ "name", "department", "designation" }`
- `POST /api/leave/:id/approve` or `/reject`
- `POST /api/assistant` with `{ "question": "Who is absent today?" }`
- `GET /api/integrations`

Copy `.env.example` to `.env` and provide service credentials when integrating an LLM, Firebase, S3, Razorpay, or WhatsApp. The current server reports which integrations are configured; credentials are never committed.
