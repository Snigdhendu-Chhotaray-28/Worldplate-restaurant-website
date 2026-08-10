// Configuration for the WorldPlate Booking System

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/api'
    : 'https://worldplate-restaurant-website.onrender.com/api';

window.BOOKING_API_URL = API_BASE_URL;
window.BOOKING_ADMIN_API_URL = `${API_BASE_URL}/admin`;