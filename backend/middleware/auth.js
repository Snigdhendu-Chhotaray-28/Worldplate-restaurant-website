const crypto = require('crypto');
const db = require('../db/database');

async function requireAdmin(req, res, next) {
    const apiKey = req.headers['x-admin-key'] || req.headers.authorization?.replace('Bearer ', '');

    if (!apiKey) {
        return res.status(401).json({ error: 'Unauthorized. Missing admin credentials.' });
    }

    try {
        // First check database admin table for matching password or id:password
        const dbResult = await db.execute({
            sql: 'SELECT id, password FROM admin WHERE password = ? OR (id || ":" || password) = ? OR id = ? LIMIT 1',
            args: [apiKey, apiKey, apiKey]
        });

        if (dbResult.rows.length > 0) {
            req.adminId = dbResult.rows[0].id;
            return next();
        }

        // Fallback check against process.env.ADMIN_API_KEY if configured
        const expectedKey = process.env.ADMIN_API_KEY;
        if (expectedKey) {
            const keyBuf = Buffer.from(String(apiKey), 'utf8');
            const expectedBuf = Buffer.from(String(expectedKey), 'utf8');

            if (keyBuf.length === expectedBuf.length && crypto.timingSafeEqual(keyBuf, expectedBuf)) {
                return next();
            }
        }

        return res.status(401).json({ error: 'Unauthorized. Invalid admin credentials.' });
    } catch (err) {
        console.error('[AuthMiddleware] Error verifying admin credentials:', err);
        return res.status(500).json({ error: 'Internal server error verifying credentials.' });
    }
}

module.exports = { requireAdmin };
