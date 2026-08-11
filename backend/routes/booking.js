const express = require('express');
const {
    getTableTypesWithInventory,
    getAvailableTimeSlots,
    getTableAvailabilitySummary,
    getTableTypeById
} = require('../services/availability');
const { createBooking } = require('../services/booking');
const { formatTime12h, getPriceForDuration } = require('../services/helpers');
const { sendBookingSubmitted, sendBookingConfirmation } = require('../services/emailService');
const db = require('../db/database');
const crypto = require('crypto');


const router = express.Router();

router.get('/table-types', async (req, res) => {
    try {
        const types = await getTableTypesWithInventory();
        res.json({ table_types: types });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch table types.' });
    }
});

router.get('/availability/slots', async (req, res) => {
    try {
        const tableTypeId = parseInt(req.query.table_type_id, 10);
        const bookingDate = req.query.date;
        const duration = parseInt(req.query.duration, 10);

        if (!tableTypeId || !bookingDate || ![1, 2].includes(duration)) {
            return res.status(400).json({ error: 'table_type_id, date, and duration (1 or 2) are required.' });
        }

        const result = await getAvailableTimeSlots(tableTypeId, bookingDate, duration);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            ...result,
            slots: result.slots.map((slot) => ({
                ...slot,
                start_time_display: formatTime12h(slot.start_time),
                end_time_display: formatTime12h(slot.end_time)
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to check availability.' });
    }
});

router.get('/availability/tables', async (req, res) => {
    try {
        const tableTypeId = parseInt(req.query.table_type_id, 10);
        const bookingDate = req.query.date;
        const startTime = req.query.start_time;
        const duration = parseInt(req.query.duration, 10);

        if (!tableTypeId || !bookingDate || !startTime || ![1, 2].includes(duration)) {
            return res.status(400).json({
                error: 'table_type_id, date, start_time, and duration (1 or 2) are required.'
            });
        }

        const result = await getTableAvailabilitySummary(tableTypeId, bookingDate, startTime, duration);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({
            ...result,
            start_time_display: formatTime12h(result.start_time),
            end_time_display: formatTime12h(result.end_time),
            price: getPriceForDuration(result.table_type, duration)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch table availability.' });
    }
});

router.get('/payment-config', async (req, res) => {
    try {
        const result = await db.execute(`
            SELECT key, value FROM settings
            WHERE key IN ('qr_code_path', 'upi_id', 'restaurant_name')
        `);

        const settings = result.rows;
        const config = Object.fromEntries(settings.map((s) => [s.key, s.value]));
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        res.json({
            qr_code_url: `${baseUrl}/${config.qr_code_path || 'uploads/qr-code.png'}`,
            upi_id: config.upi_id || '',
            restaurant_name: config.restaurant_name || 'WorldPlate'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch payment configuration.' });
    }
});

router.get('/bookings/pending-count', async (req, res) => {
    try {
        const result = await db.execute(`
            SELECT COUNT(*) AS count FROM bookings
            WHERE payment_status = 'Pending Verification'
        `);
        const row = result.rows[0];
        res.json({ pending_count: row ? row.count : 0 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch pending count.' });
    }
});

router.post('/payments/order', async (req, res) => {
    try {
        const tableTypeId = parseInt(req.body.table_type_id, 10);
        const duration = parseInt(req.body.duration, 10);

        if (!tableTypeId || ![1, 2].includes(duration)) {
            return res.status(400).json({ error: 'table_type_id and duration (1 or 2) are required.' });
        }

        const tableType = await getTableTypeById(tableTypeId);
        if (!tableType) {
            return res.status(404).json({ error: 'Table type not found.' });
        }

        const amount = getPriceForDuration(tableType, duration);

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            return res.status(500).json({ error: 'Razorpay keys are not configured on the server.' });
        }

        const response = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
            },
            body: JSON.stringify({
                amount: Math.round(amount * 100), // paise (handles decimal amounts like 1.50 or 2.50)
                currency: 'INR',
                receipt: `receipt_booking_${Date.now()}`
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error('[Razorpay Order Creation Failed]', JSON.stringify(errData, null, 2));
            const description = errData?.error?.description || errData?.error?.reason || 'Failed to create Razorpay order.';
            return res.status(502).json({ error: `Razorpay: ${description}` });
        }

        const order = await response.json();

        res.json({
            order_id: order.id,
            amount: order.amount,
            key_id: keyId,
            restaurant_name: process.env.RESTAURANT_NAME || 'WorldPlate'
        });
    } catch (error) {
        console.error('[Payments Order Route Error]', error);
        res.status(500).json({ error: 'Failed to create payment order.' });
    }
});

router.post('/bookings', async (req, res) => {
    try {
        const {
            table_type_id,
            table_number,
            booking_date,
            start_time,
            duration,
            customer_name,
            customer_email,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Razorpay payment parameters are required.' });
        }

        // Replay Attack Prevention: Verify this payment transaction hasn't already been processed
        const existingPayment = await db.execute({
            sql: 'SELECT id FROM bookings WHERE utr_number = ?',
            args: [razorpay_payment_id]
        });

        if (existingPayment.rows.length > 0) {
            return res.status(400).json({ error: 'This payment transaction has already been processed.' });
        }

        // Verify Razorpay Signature (Timing-safe comparison)
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            return res.status(500).json({ error: 'Razorpay secret is not configured on the server.' });
        }

        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generated_signature = hmac.digest('hex');

        const sigBuf = Buffer.from(String(razorpay_signature), 'utf8');
        const genBuf = Buffer.from(String(generated_signature), 'utf8');

        if (sigBuf.length !== genBuf.length || !crypto.timingSafeEqual(sigBuf, genBuf)) {
            console.warn('[BookingRoute] Signature verification failed.');
            return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
        }

        const payload = {
            table_type_id: parseInt(table_type_id, 10),
            table_number: parseInt(table_number, 10),
            booking_date,
            start_time,
            duration: parseInt(duration, 10),
            customer_name,
            customer_email,
            utr_number: razorpay_payment_id,
            payment_status: 'Payment Verified'
        };

        const result = await createBooking(payload);

        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }

        const booking = result.booking;

        const emailBooking = {
            ...booking,
            customer_email: (customer_email || '').trim().toLowerCase(),
            utr_number: razorpay_payment_id
        };

        // Send confirmation email directly since payment is verified
        await sendBookingConfirmation(emailBooking).catch((err) =>
            console.error('[BookingRoute] sendBookingConfirmation error:', err.message)
        );

        res.status(201).json({
            message: 'Your booking has been confirmed successfully.',
            booking: {
                ...booking,
                start_time_display: formatTime12h(booking.start_time),
                end_time_display: formatTime12h(booking.end_time)
            }
        });
    } catch (error) {
        console.error('[BookingRoute Error]', error);
        res.status(500).json({ error: 'Failed to create booking.' });
    }
});


router.get('/bookings/:bookingId', async (req, res) => {
    try {
        const result = await db.execute({
            sql: `SELECT booking_id, customer_name, table_type_name, table_number,
                         booking_date, start_time, end_time, duration, amount,
                         payment_status, rejection_reason, created_at
                  FROM bookings
                  WHERE booking_id = ?`,
            args: [req.params.bookingId]
        });

        const booking = result.rows[0];

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found.' });
        }

        res.json({
            booking: {
                ...booking,
                start_time_display: formatTime12h(booking.start_time),
                end_time_display: formatTime12h(booking.end_time)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch booking.' });
    }
});

module.exports = router;
