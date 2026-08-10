const db = require('../db/database');

async function cleanupExpiredBookings() {
    const result = await db.execute(`
        DELETE FROM bookings
        WHERE datetime(expires_at, '+24 hours') < datetime('now', 'localtime')
    `);

    const changes = result.rowsAffected || 0;
    if (changes > 0) {
        console.log(`[Cleanup] Removed ${changes} expired booking record(s).`);
    }

    return changes;
}

function startCleanupScheduler(cron) {
    cron.schedule('0 * * * *', async () => {
        try {
            await cleanupExpiredBookings();
        } catch (err) {
            console.error('[Cleanup] Scheduler execution error:', err.message);
        }
    }, {
        timezone: process.env.TIMEZONE || 'Asia/Kolkata'
    });

    cleanupExpiredBookings().catch((err) =>
        console.error('[Cleanup] Initial execution error:', err.message)
    );
    console.log('[Cleanup] Scheduled hourly booking cleanup job.');
}

module.exports = {
    cleanupExpiredBookings,
    startCleanupScheduler
};
