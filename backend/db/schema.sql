PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS table_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    price_1h REAL NOT NULL,
    price_2h REAL NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_type_id INTEGER NOT NULL,
    table_number INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (table_type_id) REFERENCES table_types(id) ON DELETE CASCADE,
    UNIQUE (table_type_id, table_number)
);

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    utr_number TEXT NOT NULL,
    table_type_id INTEGER NOT NULL,
    table_type_name TEXT NOT NULL,
    table_number INTEGER NOT NULL,
    booking_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration INTEGER NOT NULL CHECK (duration IN (1, 2)),
    amount REAL NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending Verification'
        CHECK (payment_status IN ('Pending Verification', 'Payment Verified', 'Payment Rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (table_type_id) REFERENCES table_types(id)
);

CREATE INDEX IF NOT EXISTS idx_bookings_overlap
    ON bookings (table_type_id, table_number, booking_date, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_expires
    ON bookings (expires_at);

CREATE INDEX IF NOT EXISTS idx_bookings_status
    ON bookings (payment_status);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
