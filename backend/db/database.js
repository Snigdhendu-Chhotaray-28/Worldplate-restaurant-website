const { createClient } = require('@libsql/client');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    console.error('[Database Error] TURSO_DATABASE_URL is not set in environment variables.');
}

const db = createClient({
    url: url || 'file:backend/data/bookings.db', // Fallback to local file if URL is omitted
    authToken: authToken || undefined,
});

module.exports = db;
