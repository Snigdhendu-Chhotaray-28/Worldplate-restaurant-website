require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const bookingRoutes = require('./routes/booking');
const adminRoutes = require('./routes/admin');
const { startCleanupScheduler } = require('./services/cleanup');

require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   [
                "'self'",
                "'unsafe-inline'",          // inline scripts in HTML
                "https://checkout.razorpay.com",
                "https://cdnjs.cloudflare.com",
                "https://unpkg.com"
            ],
            styleSrc:    [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc:     [
                "'self'",
                "https://fonts.gstatic.com",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com",
                "data:"
            ],
            imgSrc:      ["'self'", "data:", "https:", "blob:"],
            connectSrc:  [
                "'self'",
                "https://api.razorpay.com",
                "https://lumberjack.razorpay.com",
                "https://lumberjack-dx.razorpay.com"
            ],
            frameSrc:    ["https://api.razorpay.com"],
            workerSrc:   ["'self'", "blob:"],
            objectSrc:   ["'none'"],
            upgradeInsecureRequests: []
        }
    }
}));

app.set('trust proxy', 1);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json({ limit: '100kb' }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api', apiLimiter);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', bookingRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS policy blocked this request.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
});

startCleanupScheduler(cron);

app.listen(PORT, () => {
    console.log(`WorldPlate Booking API running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});
