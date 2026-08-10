# WorldPlate — Table Booking System

Production-ready restaurant table reservation system with online UPI payment, real-time availability, and admin management.

## Architecture

```
Frontend (index.html + booking.js)
        ↓
Backend API (Express — port 3001)
        ↓
SQLite Database (single source of truth)
```

## Quick Start

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

**Important:** Change `ADMIN_API_KEY` to a strong secret before deploying.

### 3. Start the server

```bash
npm start
```

This starts the API and serves the website at **http://localhost:3001**

- Website: http://localhost:3001/index.html
- Admin panel: http://localhost:3001/admin.html
- API health: http://localhost:3001/api/health

The database is created and seeded automatically on first run.

### Alternative: Live Server + API

If you use VS Code Live Server (port 5500) for the frontend:

1. Start the backend: `cd backend && npm start`
2. Open the site via Live Server
3. Ensure `CORS_ORIGIN` in `.env` includes your Live Server URL

## Booking Flow

1. Click **Book A Table** on the homepage
2. Select table type (2-Seater, 4-Seater, 6-Seater, Family Pack)
3. Choose date, duration (1h / 2h), and available time slot
4. Pick an available table number
5. Review summary and non-refund policy
6. Scan QR code and pay the displayed amount
7. Enter name and UTR / transaction number
8. Receive booking confirmation (status: Pending Verification)

## Admin Panel

Open **admin.html** and log in with your `ADMIN_API_KEY`.

Manage:

- **Bookings** — view all reservations, verify/reject UTR payments
- **Table Inventory** — activate/deactivate individual tables
- **Pricing** — update 1-hour and 2-hour prices per table type
- **QR & Settings** — upload a new payment QR code, set UPI ID
- **Data Cleanup** — manually trigger expired booking deletion

## Default Table Inventory

| Type        | Tables        | 1 Hour | 2 Hours |
|-------------|---------------|--------|---------|
| 2-Seater    | Table 1–2     | ₹399   | ₹499    |
| 4-Seater    | Table 1–4     | ₹599   | ₹799    |
| 6-Seater    | Table 1–2     | ₹999   | ₹1,299  |
| Family Pack | Table 1       | ₹1,499 | ₹1,999  |

All prices and inventory are stored in the database and editable via admin.

## QR Code Configuration

The default QR code is at `backend/uploads/qr-code.png` (UPI: `7751080146@ptyes`).

To replace it:

1. Log in to the admin panel
2. Go to **QR & Settings**
3. Upload a new image (PNG, JPG, or WebP)

The booking payment step loads the QR dynamically from the database — no code changes needed.

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/table-types` | List table types with prices |
| GET | `/api/availability/slots` | Available time slots |
| GET | `/api/availability/tables` | Table availability for a slot |
| GET | `/api/payment-config` | QR code URL and UPI ID |
| POST | `/api/bookings` | Create a booking |
| GET | `/api/bookings/:id` | Get booking by ID |

### Admin (requires `X-Admin-Key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/bookings` | List bookings |
| PATCH | `/api/admin/bookings/:id/payment-status` | Update payment status |
| GET/PUT | `/api/admin/table-types/:id` | Manage pricing |
| POST | `/api/admin/settings/qr-code` | Upload QR code |
| POST | `/api/admin/cleanup/run` | Manual cleanup |

## Automatic Data Cleanup

A cron job runs **every hour** and deletes booking records where:

```
expires_at + 24 hours < current server time
```

`expires_at` is set to the end of the reservation (booking date + end time). Active and future bookings are never deleted early.

## Security

- All availability checks happen server-side
- Prices are calculated on the backend (frontend amounts are not trusted)
- Double-booking prevention via database transactions
- Admin routes protected by API key
- Rate limiting on public API
- Secrets stored in `.env` (never commit `.env` to git)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `DATABASE_PATH` | SQLite file path | `./data/bookings.db` |
| `ADMIN_API_KEY` | Admin authentication key | *(required)* |
| `CORS_ORIGIN` | Allowed frontend origins | `localhost:5500,3001` |
| `RESTAURANT_OPEN_HOUR` | Opening hour (24h) | `10` |
| `RESTAURANT_CLOSE_HOUR` | Closing hour (24h) | `23` |
| `TIMEZONE` | Cron cleanup timezone | `Asia/Kolkata` |

## Project Structure

```
restaurant-website/
├── index.html          # Main site (booking integrated)
├── booking.js          # Booking modal frontend
├── booking.css         # Booking modal styles
├── admin.html          # Admin dashboard
├── admin.js / admin.css
├── backend/
│   ├── server.js       # Express server
│   ├── db/             # Schema, seed, database
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── middleware/     # Auth
│   └── uploads/        # QR code storage
└── assets/images/      # Static assets
```

## No Refund Policy

The booking system has **no refund functionality**. A clear non-refundable notice is shown before payment and during the payment step.
