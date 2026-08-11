const db = require('../db/database');
const {
    generateBookingId,
    buildExpiresAt,
    getPriceForDuration,
    addHoursToTime,
    validateUtr,
    validateCustomerName,
    isValidDateString,
    isPastDateTime,
    getTodayDateString
} = require('./helpers');
const { getTableTypeById, isTableAvailable } = require('./availability');

async function createBooking(payload) {
    const {
        table_type_id: tableTypeId,
        table_number: tableNumber,
        booking_date: bookingDate,
        start_time: startTime,
        duration,
        customer_name: customerName,
        utr_number: utrNumber,
        customer_email: customerEmail,
        payment_status: paymentStatus = 'Pending Verification'
    } = payload;


    if (!Number.isInteger(tableTypeId) || tableTypeId <= 0) {
        return { error: 'Invalid table type.', status: 400 };
    }

    if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
        return { error: 'Invalid table number.', status: 400 };
    }

    if (![1, 2].includes(duration)) {
        return { error: 'Duration must be 1 or 2 hours.', status: 400 };
    }

    if (!isValidDateString(bookingDate)) {
        return { error: 'Invalid booking date.', status: 400 };
    }

    if (bookingDate < getTodayDateString()) {
        return { error: 'Cannot book a past date.', status: 400 };
    }

    if (!/^\d{2}:\d{2}$/.test(startTime)) {
        return { error: 'Invalid start time.', status: 400 };
    }

    if (isPastDateTime(bookingDate, startTime)) {
        return { error: 'Cannot book a past time slot.', status: 400 };
    }

    if (!validateCustomerName(customerName)) {
        return { error: 'Please enter a valid full name (2–100 characters).', status: 400 };
    }

    if (!validateUtr(utrNumber)) {
        return { error: 'Invalid payment transaction ID.', status: 400 };
    }

    const emailStr = (customerEmail || '').trim().toLowerCase();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
        return { error: 'Please enter a valid Gmail / email address.', status: 400 };
    }

    const tableType = await getTableTypeById(tableTypeId);
    if (!tableType) {
        return { error: 'Table type not found.', status: 404 };
    }

    const tableExistsResult = await db.execute({
        sql: `SELECT id FROM restaurant_tables
              WHERE table_type_id = ? AND table_number = ? AND is_active = 1`,
        args: [tableTypeId, tableNumber]
    });

    if (tableExistsResult.rows.length === 0) {
        return { error: 'Selected table does not exist.', status: 400 };
    }

    const endTime = addHoursToTime(startTime, duration);
    const amount = getPriceForDuration(tableType, duration);
    const expiresAt = buildExpiresAt(bookingDate, endTime);

    const tx = await db.transaction('write');

    try {
        const available = await isTableAvailable(tableTypeId, tableNumber, bookingDate, startTime, endTime, tx);
        if (!available) {
            await tx.rollback();
            return {
                error: 'This table was just booked by another customer. Please select another available table or time slot.',
                status: 409
            };
        }

        let bookingId = generateBookingId();
        let attempts = 0;

        while (attempts < 5) {
            const existing = await tx.execute({
                sql: 'SELECT id FROM bookings WHERE booking_id = ?',
                args: [bookingId]
            });
            if (existing.rows.length === 0) break;
            bookingId = generateBookingId();
            attempts += 1;
        }

        await tx.execute({
            sql: `INSERT INTO bookings (
                    booking_id, customer_name, utr_number, customer_email,
                    table_type_id, table_type_name, table_number,
                    booking_date, start_time, end_time, duration,
                    amount, payment_status, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                bookingId,
                customerName.trim(),
                utrNumber.trim().toUpperCase(),
                emailStr,
                tableTypeId,
                tableType.name,
                tableNumber,
                bookingDate,
                startTime,
                endTime,
                duration,
                amount,
                paymentStatus,
                expiresAt
            ]
        });


        const bookingResult = await tx.execute({
            sql: `SELECT booking_id, customer_name, table_type_name, table_number,
                         booking_date, start_time, end_time, duration, amount,
                         payment_status, created_at
                  FROM bookings WHERE booking_id = ?`,
            args: [bookingId]
        });

        await tx.commit();
        return { booking: bookingResult.rows[0] };
    } catch (err) {
        await tx.rollback();
        throw err;
    }
}

module.exports = { createBooking };
