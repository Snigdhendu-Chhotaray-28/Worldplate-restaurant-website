const OPEN_HOUR = parseInt(process.env.RESTAURANT_OPEN_HOUR || '10', 10);
const CLOSE_HOUR = parseInt(process.env.RESTAURANT_CLOSE_HOUR || '23', 10);

function pad(n) {
    return String(n).padStart(2, '0');
}

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${pad(hours)}:${pad(minutes)}`;
}

function formatTime12h(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${pad(minutes)} ${period}`;
}

function addHoursToTime(timeStr, hoursToAdd) {
    return minutesToTime(timeToMinutes(timeStr) + hoursToAdd * 60);
}

function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isValidDateString(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isPastDateTime(dateStr, timeStr) {
    const now = new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const bookingDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return bookingDate <= now;
}

function generateBookingId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'WP-';
    for (let i = 0; i < 6; i += 1) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function buildExpiresAt(dateStr, endTime) {
    return `${dateStr} ${endTime}:00`;
}

function getPriceForDuration(tableType, duration) {
    return duration === 1 ? tableType.price_1h : tableType.price_2h;
}

function generateTimeSlots(durationHours) {
    const slots = [];
    const openMinutes = OPEN_HOUR * 60;
    const closeMinutes = CLOSE_HOUR * 60;
    const durationMinutes = durationHours * 60;

    for (let start = openMinutes; start + durationMinutes <= closeMinutes; start += 60) {
        slots.push(minutesToTime(start));
    }

    return slots;
}

function validateUtr(utr) {
    const cleaned = String(utr || '').trim();
    return cleaned.length >= 6 && cleaned.length <= 30 && /^[A-Za-z0-9]+$/.test(cleaned);
}

function validateCustomerName(name) {
    const cleaned = String(name || '').trim();
    return cleaned.length >= 2 && cleaned.length <= 100 && /^[\p{L}\p{M}\s'.-]+$/u.test(cleaned);
}

module.exports = {
    OPEN_HOUR,
    CLOSE_HOUR,
    timeToMinutes,
    minutesToTime,
    formatTime12h,
    addHoursToTime,
    getTodayDateString,
    isValidDateString,
    isPastDateTime,
    generateBookingId,
    buildExpiresAt,
    getPriceForDuration,
    generateTimeSlots,
    validateUtr,
    validateCustomerName
};
