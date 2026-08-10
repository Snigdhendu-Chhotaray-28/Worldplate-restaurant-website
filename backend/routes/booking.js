const express = require('express');
const {
    getTableTypesWithInventory,
    getAvailableTimeSlots,
    getTableAvailabilitySummary
} = require('../services/availability');
const { createBooking } = require('../services/booking');
const { formatTime12h, getPriceForDuration } = require('../services/helpers');
const { sendBookingSubmitted } = require('../services/emailService');
const db = require('../db/database');

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

router.post('/bookings', async (req, res) => {
    try {
        const payload = {
            table_type_id: parseInt(req.body.table_type_id, 10),
            table_number: parseInt(req.body.table_number, 10),
            booking_date: req.body.booking_date,
            start_time: req.body.start_time,
            duration: parseInt(req.body.duration, 10),
            customer_name: req.body.customer_name,
            utr_number: req.body.utr_number,
            customer_email: req.body.customer_email
        };

        const result = await createBooking(payload);

        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }

        const booking = result.booking;

        const emailBooking = {
            ...booking,
            customer_email: (req.body.customer_email || '').trim().toLowerCase(),
            utr_number: (req.body.utr_number || '').trim().toUpperCase()
        };
        sendBookingSubmitted(emailBooking).catch((err) =>
            console.error('[BookingRoute] sendBookingSubmitted error:', err.message)
        );

        res.status(201).json({
            message: 'Your booking has been submitted successfully. Your payment is pending verification.',
            booking: {
                ...booking,
                start_time_display: formatTime12h(booking.start_time),
                end_time_display: formatTime12h(booking.end_time)
            }
        });
    } catch (error) {
        console.error(error);
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
