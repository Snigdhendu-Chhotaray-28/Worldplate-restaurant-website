const db = require('../db/database');
const {
    generateTimeSlots,
    addHoursToTime,
    isPastDateTime,
    getTodayDateString,
    isValidDateString
} = require('./helpers');

const ACTIVE_STATUSES = ['Pending Verification', 'Payment Verified'];

async function getTableTypeById(id) {
    const result = await db.execute({
        sql: `SELECT id, slug, name, capacity, price_1h, price_2h, is_active
              FROM table_types
              WHERE id = ? AND is_active = 1`,
        args: [id]
    });
    return result.rows[0] || null;
}

async function getTablesForType(tableTypeId) {
    const result = await db.execute({
        sql: `SELECT id, table_number, is_active
              FROM restaurant_tables
              WHERE table_type_id = ? AND is_active = 1
              ORDER BY table_number ASC`,
        args: [tableTypeId]
    });
    return result.rows;
}

async function getOverlappingBookings(tableTypeId, tableNumber, bookingDate, startTime, endTime) {
    const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ');
    const result = await db.execute({
        sql: `SELECT booking_id, start_time, end_time, payment_status
              FROM bookings
              WHERE table_type_id = ?
                AND table_number = ?
                AND booking_date = ?
                AND payment_status IN (${placeholders})
                AND start_time < ?
                AND end_time > ?`,
        args: [tableTypeId, tableNumber, bookingDate, ...ACTIVE_STATUSES, endTime, startTime]
    });
    return result.rows;
}

async function isTableAvailable(tableTypeId, tableNumber, bookingDate, startTime, endTime, tx = null) {
    const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ');
    const runner = tx || db;
    const result = await runner.execute({
        sql: `SELECT booking_id, start_time, end_time, payment_status
              FROM bookings
              WHERE table_type_id = ?
                AND table_number = ?
                AND booking_date = ?
                AND payment_status IN (${placeholders})
                AND start_time < ?
                AND end_time > ?`,
        args: [tableTypeId, tableNumber, bookingDate, ...ACTIVE_STATUSES, endTime, startTime]
    });
    return result.rows.length === 0;
}

async function getAvailabilityForSlot(tableTypeId, bookingDate, startTime, duration) {
    const endTime = addHoursToTime(startTime, duration);
    const tables = await getTablesForType(tableTypeId);

    const checkPromises = tables.map(async (table) => {
        const overlaps = await getOverlappingBookings(tableTypeId, table.table_number, bookingDate, startTime, endTime);
        if (overlaps.length === 0) {
            return { table_number: table.table_number, available: true, status: 'Available' };
        }
        const hasPaid = overlaps.some((b) => b.payment_status === 'Payment Verified');
        return {
            table_number: table.table_number,
            available: false,
            status: hasPaid ? 'Booked' : 'Pending'
        };
    });

    return await Promise.all(checkPromises);
}

async function getAvailableTimeSlots(tableTypeId, bookingDate, duration) {
    if (!isValidDateString(bookingDate)) {
        return { error: 'Invalid booking date.' };
    }

    const tableType = await getTableTypeById(tableTypeId);
    if (!tableType) {
        return { error: 'Table type not found.' };
    }

    const today = getTodayDateString();
    if (bookingDate < today) {
        return { slots: [], message: 'Sorry, no tables are available for this time slot.' };
    }

    const allSlots = generateTimeSlots(duration);
    const slots = [];

    for (const startTime of allSlots) {
        if (bookingDate === today && isPastDateTime(bookingDate, startTime)) {
            continue;
        }

        const tableAvailability = await getAvailabilityForSlot(tableTypeId, bookingDate, startTime, duration);
        const availableCount = tableAvailability.filter((t) => t.available).length;

        if (availableCount > 0) {
            slots.push({
                start_time: startTime,
                end_time: addHoursToTime(startTime, duration),
                available_tables: availableCount,
                total_tables: tableAvailability.length
            });
        }
    }

    return {
        table_type: tableType,
        booking_date: bookingDate,
        duration,
        slots,
        message: slots.length === 0 ? 'Sorry, no tables are available for this time slot.' : null
    };
}

async function getTableAvailabilitySummary(tableTypeId, bookingDate, startTime, duration) {
    const tableType = await getTableTypeById(tableTypeId);
    if (!tableType) {
        return { error: 'Table type not found.' };
    }

    const tables = await getAvailabilityForSlot(tableTypeId, bookingDate, startTime, duration);
    const availableTables = tables.filter((t) => t.available);

    return {
        table_type: tableType,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: addHoursToTime(startTime, duration),
        duration,
        tables,
        available_count: availableTables.length,
        message: availableTables.length === 0 ? 'Sorry, no tables are available for this time slot.' : null
    };
}

async function getTableTypesWithInventory() {
    const typesResult = await db.execute(`
        SELECT id, slug, name, capacity, price_1h, price_2h, sort_order
        FROM table_types
        WHERE is_active = 1
        ORDER BY sort_order ASC
    `);

    const types = typesResult.rows;

    const populatedTypes = await Promise.all(types.map(async (type) => {
        const countResult = await db.execute({
            sql: `SELECT COUNT(*) AS count
                  FROM restaurant_tables
                  WHERE table_type_id = ? AND is_active = 1`,
            args: [type.id]
        });
        return {
            ...type,
            total_tables: countResult.rows[0]?.count || 0,
            availability_status: 'Check availability'
        };
    }));

    return populatedTypes;
}

module.exports = {
    getTableTypeById,
    getTablesForType,
    getOverlappingBookings,
    isTableAvailable,
    getAvailabilityForSlot,
    getAvailableTimeSlots,
    getTableAvailabilitySummary,
    getTableTypesWithInventory
};
