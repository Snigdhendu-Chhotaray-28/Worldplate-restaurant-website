/**
 * migrate.js
 * One-time script to push schema + seed data to Turso.
 * Run from the backend folder: node db/migrate.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    console.error('[Migrate] ERROR: TURSO_DATABASE_URL is not set.');
    process.exit(1);
}

const db = createClient({ url, authToken: authToken || undefined });

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS table_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        price_1h INTEGER NOT NULL,
        price_2h INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS restaurant_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_type_id INTEGER NOT NULL,
        table_number INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (table_type_id) REFERENCES table_types(id) ON DELETE CASCADE,
        UNIQUE (table_type_id, table_number)
    )`,
    `CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        utr_number TEXT NOT NULL,
        customer_email TEXT,
        table_type_id INTEGER NOT NULL,
        table_type_name TEXT NOT NULL,
        table_number INTEGER NOT NULL,
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration INTEGER NOT NULL CHECK (duration IN (1, 2)),
        amount INTEGER NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'Pending Verification'
            CHECK (payment_status IN ('Pending Verification', 'Payment Verified', 'Payment Rejected')),
        rejection_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (table_type_id) REFERENCES table_types(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_overlap
        ON bookings (table_type_id, table_number, booking_date, start_time, end_time)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_expires
        ON bookings (expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_status
        ON bookings (payment_status)`,
    `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
];

const DEFAULT_TABLE_TYPES = [
    { slug: '2-seater',    name: '2-Seater',    capacity: 2,  price_1h: 1, price_2h: 1.5, sort_order: 1, tables: 2 },
    { slug: '4-seater',    name: '4-Seater',    capacity: 4,  price_1h: 2, price_2h: 2.5, sort_order: 2, tables: 4 },
    { slug: '6-seater',    name: '6-Seater',    capacity: 6,  price_1h: 3, price_2h: 4,   sort_order: 3, tables: 2 },
    { slug: 'family-pack', name: 'Family Pack', capacity: 10, price_1h: 4, price_2h: 5,   sort_order: 4, tables: 1 }
];

const DEFAULT_SETTINGS = [
    { key: 'qr_code_path',    value: 'uploads/qr-code.png' },
    { key: 'upi_id',          value: '7751080146@ptyes' },
    { key: 'restaurant_name', value: 'WorldPlate' }
];

async function migrate() {
    console.log('[Migrate] Connecting to Turso:', url);

    // 1. Apply schema
    console.log('[Migrate] Running schema statements...');
    for (const sql of SCHEMA_STATEMENTS) {
        await db.execute(sql);
    }
    console.log('[Migrate] Schema applied.');

    // Update prices for existing table types
    console.log('[Migrate] Updating prices for table types...');
    for (const type of DEFAULT_TABLE_TYPES) {
        await db.execute({
            sql: `UPDATE table_types SET price_1h = ?, price_2h = ? WHERE slug = ?`,
            args: [type.price_1h, type.price_2h, type.slug]
        });
    }
    console.log('[Migrate] Table type prices updated.');

    // 2. Seed table_types + restaurant_tables (only if empty)
    const typeCount = await db.execute('SELECT COUNT(*) AS count FROM table_types');
    if (Number(typeCount.rows[0].count) === 0) {
        console.log('[Migrate] Seeding table types and tables...');
        for (const type of DEFAULT_TABLE_TYPES) {
            const inserted = await db.execute({
                sql: `INSERT INTO table_types (slug, name, capacity, price_1h, price_2h, sort_order)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [type.slug, type.name, type.capacity, type.price_1h, type.price_2h, type.sort_order]
            });
            const tableTypeId = Number(inserted.lastInsertRowid);
            for (let i = 1; i <= type.tables; i++) {
                await db.execute({
                    sql: `INSERT INTO restaurant_tables (table_type_id, table_number) VALUES (?, ?)`,
                    args: [tableTypeId, i]
                });
            }
        }
        console.log('[Migrate] Table types and inventory seeded.');
    } else {
        console.log('[Migrate] table_types already has data, skipping seed.');
    }

    // 3. Seed settings (only if empty)
    const settingsCount = await db.execute('SELECT COUNT(*) AS count FROM settings');
    if (Number(settingsCount.rows[0].count) === 0) {
        console.log('[Migrate] Seeding default settings...');
        for (const s of DEFAULT_SETTINGS) {
            await db.execute({
                sql: `INSERT INTO settings (key, value) VALUES (?, ?)`,
                args: [s.key, s.value]
            });
        }
        console.log('[Migrate] Settings seeded.');
    } else {
        console.log('[Migrate] settings already has data, skipping seed.');
    }

    console.log('[Migrate] Migration complete!');
    process.exit(0);
}

migrate().catch((err) => {
    console.error('[Migrate] Migration failed:', err.message);
    process.exit(1);
});
