const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { cleanupExpiredBookings } = require('../services/cleanup');
const {
    sendBookingConfirmation,
    sendBookingRejection,
    verifyConnection,
    sendTestEmail
} = require('../services/emailService');


const router = express.Router();
router.use(requireAdmin);

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `qr-code${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\/(png|jpeg|jpg|webp)$/.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPG, and WebP images are allowed.'));
        }
    }
});

router.get('/bookings', async (req, res) => {
    try {
        const status = req.query.status;
        let query = `
            SELECT id, booking_id, customer_name, customer_email, utr_number,
                   table_type_name, table_number,
                   booking_date, start_time, end_time, duration, amount,
                   payment_status, rejection_reason, created_at, expires_at
            FROM bookings
        `;
        const params = [];

        if (status) {
            query += ' WHERE payment_status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT 500';

        const result = await db.execute({ sql: query, args: params });
        res.json({ bookings: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch bookings.' });
    }
});

router.patch('/bookings/:id/payment-status', async (req, res) => {
    try {
        const { payment_status: paymentStatus, rejection_reason: rejectionReason } = req.body;
        const allowed = ['Pending Verification', 'Payment Verified', 'Payment Rejected'];

        if (!allowed.includes(paymentStatus)) {
            return res.status(400).json({ error: 'Invalid payment status.' });
        }

        const reasonValue = paymentStatus === 'Payment Rejected'
            ? (rejectionReason || '').trim() || null
            : null;

        const updateResult = await db.execute({
            sql: 'UPDATE bookings SET payment_status = ?, rejection_reason = ? WHERE id = ?',
            args: [paymentStatus, reasonValue, req.params.id]
        });

        if (updateResult.rowsAffected === 0) {
            return res.status(404).json({ error: 'Booking not found.' });
        }

        const bookingResult = await db.execute({
            sql: `SELECT booking_id, customer_name, customer_email, table_type_name, table_number,
                         booking_date, start_time, end_time, duration, amount, payment_status, rejection_reason
                  FROM bookings WHERE id = ?`,
            args: [req.params.id]
        });

        const booking = bookingResult.rows[0];

        if (booking) {
            if (paymentStatus === 'Payment Verified') {
                await sendBookingConfirmation(booking).catch((err) =>
                    console.error('[AdminRoute] sendBookingConfirmation error:', err.message)
                );
            } else if (paymentStatus === 'Payment Rejected') {
                await sendBookingRejection(booking, reasonValue).catch((err) =>
                    console.error('[AdminRoute] sendBookingRejection error:', err.message)
                );
            }
        }

        res.json({ message: 'Payment status updated.', payment_status: paymentStatus });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update payment status.' });
    }
});

router.get('/table-types', async (req, res) => {
    try {
        const typesResult = await db.execute(`
            SELECT tt.*, (
                SELECT COUNT(*) FROM restaurant_tables rt
                WHERE rt.table_type_id = tt.id AND rt.is_active = 1
            ) AS active_tables
            FROM table_types tt
            ORDER BY sort_order ASC
        `);

        const tablesResult = await db.execute(`
            SELECT id, table_type_id, table_number, is_active
            FROM restaurant_tables
            ORDER BY table_type_id, table_number
        `);

        res.json({ table_types: typesResult.rows, tables: tablesResult.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch admin table data.' });
    }
});

router.put('/table-types/:id', async (req, res) => {
    try {
        const { name, capacity, price_1h, price_2h, is_active: isActive } = req.body;

        const result = await db.execute({
            sql: `UPDATE table_types
                  SET name = COALESCE(?, name),
                      capacity = COALESCE(?, capacity),
                      price_1h = COALESCE(?, price_1h),
                      price_2h = COALESCE(?, price_2h),
                      is_active = COALESCE(?, is_active)
                  WHERE id = ?`,
            args: [name, capacity, price_1h, price_2h, isActive, req.params.id]
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'Table type not found.' });
        }

        res.json({ message: 'Table type updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update table type.' });
    }
});

router.post('/tables', async (req, res) => {
    try {
        const { table_type_id: tableTypeId, table_number: tableNumber } = req.body;

        if (!tableTypeId || !tableNumber) {
            return res.status(400).json({ error: 'table_type_id and table_number are required.' });
        }

        const result = await db.execute({
            sql: `INSERT INTO restaurant_tables (table_type_id, table_number)
                  VALUES (?, ?)`,
            args: [tableTypeId, tableNumber]
        });

        res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Table added.' });
    } catch (error) {
        if (String(error.message).includes('UNIQUE')) {
            return res.status(409).json({ error: 'This table number already exists for this type.' });
        }
        console.error(error);
        res.status(500).json({ error: 'Failed to add table.' });
    }
});

router.patch('/tables/:id', async (req, res) => {
    try {
        const { is_active: isActive } = req.body;

        const result = await db.execute({
            sql: 'UPDATE restaurant_tables SET is_active = ? WHERE id = ?',
            args: [isActive ? 1 : 0, req.params.id]
        });

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'Table not found.' });
        }

        res.json({ message: 'Table updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update table.' });
    }
});

router.get('/settings', async (req, res) => {
    try {
        const result = await db.execute('SELECT key, value, updated_at FROM settings');
        const settings = result.rows;
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const config = Object.fromEntries(settings.map((s) => [s.key, s.value]));

        res.json({
            settings,
            qr_code_url: `${baseUrl}/${config.qr_code_path || 'uploads/qr-code.png'}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch settings.' });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const { upi_id: upiId, restaurant_name: restaurantName } = req.body;
        const upsertSql = `
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `;

        if (upiId !== undefined) {
            await db.execute({ sql: upsertSql, args: ['upi_id', upiId] });
        }
        if (restaurantName !== undefined) {
            await db.execute({ sql: upsertSql, args: ['restaurant_name', restaurantName] });
        }

        res.json({ message: 'Settings updated.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update settings.' });
    }
});

router.post('/settings/qr-code', upload.single('qr_code'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No QR code image uploaded.' });
        }

        const relativePath = `uploads/${req.file.filename}`;

        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at)
                  VALUES ('qr_code_path', ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
            args: [relativePath]
        });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        res.json({
            message: 'QR code updated successfully.',
            qr_code_url: `${baseUrl}/${relativePath}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to upload QR code.' });
    }
});

router.post('/cleanup/run', async (req, res) => {
    try {
        const removed = await cleanupExpiredBookings();
        res.json({ message: 'Cleanup completed.', removed });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Cleanup failed.' });
    }
});

router.get('/email/status', async (req, res) => {
    try {
        const user = process.env.EMAIL_USER;
        const hasCredentials = !!(
            user && user !== 'your_gmail@gmail.com' &&
            process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'your_16_char_app_password' &&
            process.env.EMAIL_PASS !== 'PASTE_YOUR_16_CHAR_APP_PASSWORD_HERE'
        );

        if (!hasCredentials) {
            return res.json({
                configured: false,
                verified: false,
                user: user || null,
                message: 'Gmail credentials not configured.'
            });
        }

        const verification = await verifyConnection();

        res.json({
            configured: true,
            verified: verification.success,
            user,
            message: verification.message
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to check email status.' });
    }
});

router.post('/email/test', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Please provide a valid recipient email address.' });
        }

        await sendTestEmail(email);
        res.json({ message: `Test email sent successfully to ${email}` });
    } catch (error) {
        console.error('[Admin API] Test email failed:', error);
        res.status(500).json({ error: error.message || 'Failed to send test email.' });
    }
});


module.exports = router;
