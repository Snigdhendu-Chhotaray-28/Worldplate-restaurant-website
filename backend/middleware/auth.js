const crypto = require('crypto');
const db = require('../db/database');

async function requireAdmin(req, res, next) {
    const apiKey = req.headers['x-admin-key'] || req.headers.authorization?.replace('Bearer ', '');

    if (!apiKey) {
        return res.status(401).json({ error: 'Unauthorized. Missing admin credentials.' });
    }

    // Fast-path: check env ADMIN_API_KEY first (no DB call needed)
    const expectedKey = process.env.ADMIN_API_KEY;
    if (expectedKey) {
        try {
            const keyBuf = Buffer.from(String(apiKey), 'utf8');
            const expectedBuf = Buffer.from(String(expectedKey), 'utf8');
            if (keyBuf.length === expectedBuf.length && crypto.timingSafeEqual(keyBuf, expectedBuf)) {
                return next();
            }
        } catch (_) { /* ignore buffer comparison errors */ }
    }

    try {
        // Check database admin table — only match on password column (token IS the password)
        const dbResult = await db.execute({
            sql: 'SELECT id, password FROM admin WHERE password = ? LIMIT 1',
            args: [apiKey]
        });

        if (dbResult.rows.length > 0) {
            req.adminId = dbResult.rows[0].id;
            return next();
        }

        return res.status(401).json({ error: 'Unauthorized. Invalid admin credentials.' });
    } catch (err) {
        console.error('[AuthMiddleware] DB error verifying credentials:', err.message || err);
        return res.status(500).json({ error: 'Internal server error verifying credentials. DB: ' + (err.message || 'unknown') });
    }
}

module.exports = { requireAdmin };
