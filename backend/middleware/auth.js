function requireAdmin(req, res, next) {
    const apiKey = req.headers['x-admin-key'] || req.headers.authorization?.replace('Bearer ', '');

    if (!process.env.ADMIN_API_KEY) {
        return res.status(500).json({ error: 'Admin API key is not configured on the server.' });
    }

    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized. Invalid admin credentials.' });
    }

    return next();
}

module.exports = { requireAdmin };
