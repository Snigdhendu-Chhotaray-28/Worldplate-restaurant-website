const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { DatabaseSync } = require('node:sqlite');
const { seedDatabase } = require('./seed');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'bookings.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
seedDatabase(db);
db.close();
console.log(`Database initialized at ${dbPath}`);
