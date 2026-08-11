const crypto = require('crypto');

function requireAdmin(req, res, next) {
    const apiKey = req.headers['x-admin-key'] || req.headers.authorization?.replace('Bearer ', '');
    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey) {
        return res.status(500).json({ error: 'Admin API key is not configured on the server.' });
    }

    if (!apiKey) {
        return res.status(401).json({ error: 'Unauthorized. Missing admin credentials.' });
    }

    const keyBuf = Buffer.from(String(apiKey), 'utf8');
    const expectedBuf = Buffer.from(String(expectedKey), 'utf8');

    if (keyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(keyBuf, expectedBuf)) {
        return res.status(401).json({ error: 'Unauthorized. Invalid admin credentials.' });
    }

    return next();
}

module.exports = { requireAdmin };
