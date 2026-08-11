const nodemailer = require('nodemailer');

// --- Helpers ---

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function formatPrice(amount) {
    return `Rs.${Number(amount).toLocaleString('en-IN')}`;
}

function formatTime12h(time24) {
    if (!time24) return '';
    const [h, mi] = time24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(mi).padStart(2, '0')} ${ampm}`;
}

// --- Transporter --- created once at startup so misconfiguration is visible

function createTransporter() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (
        !user || user === 'your_gmail@gmail.com' ||
        !pass || pass === 'your_16_char_app_password' || pass === 'PASTE_YOUR_16_CHAR_APP_PASSWORD_HERE'
    ) {
        console.warn('[EmailService] Gmail credentials not configured -- emails are disabled.');
        console.warn('[EmailService] Set EMAIL_USER and EMAIL_PASS (App Password) in backend/.env and restart the server.');
        return null;
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });
}

const transporter = createTransporter();

if (transporter) {
    transporter.verify((error) => {
        if (error) {
            console.error('[EmailService] SMTP connection verification failed:', error.message);
        } else {
            console.log('[EmailService] SMTP server is ready to take our messages');
        }
    });
}

function verifyConnection() {
    return new Promise((resolve) => {
        if (!transporter) {
            return resolve({
                success: false,
                message: 'Gmail credentials not configured. Please set EMAIL_USER and EMAIL_PASS in your environment/Render dashboard.'
            });
        }
        transporter.verify((error) => {
            if (error) {
                resolve({ success: false, message: error.message });
            } else {
                resolve({ success: true, message: 'SMTP connection verified successfully.' });
            }
        });
    });
}

async function sendTestEmail(toEmail) {
    if (!transporter) {
        throw new Error('Email transporter not configured.');
    }
    const restaurantName = process.env.RESTAURANT_NAME || 'WorldPlate';
    const html = `
      <div style="font-family:Arial,sans-serif;padding:20px;background:#f9f9f9;border-radius:12px;max-width:500px;margin:20px auto;border:1px solid #eee;">
        <h2 style="color:#ff4500;margin-top:0;">WorldPlate SMTP Test</h2>
        <p>This is a test email sent from the <strong>${restaurantName}</strong> Booking System.</p>
        <p style="background:#fff;padding:12px;border-left:4px solid #ff4500;font-family:monospace;font-size:14px;color:#333;">
          Status: Working Successfully<br>
          Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </p>
        <p style="font-size:12px;color:#999;margin-bottom:0;">You can safely ignore this email.</p>
      </div>`;

    await transporter.sendMail({
        from: `"${restaurantName}" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `SMTP Test Mail — ${restaurantName}`,
        html
    });
}

// --- Shared HTML email shell ---

function buildEmailShell({ headerBg, headerTitle, headerEmoji, bodyHtml, restaurantName }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
  <style>
    body{margin:0;padding:20px 0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;}
    .wrap{max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);}
    .hdr{background:${headerBg};padding:36px 32px;text-align:center;}
    .hdr-emoji{font-size:48px;margin-bottom:10px;}
    .hdr h1{margin:0;color:#fff;font-size:22px;font-weight:700;}
    .logo{font-size:26px;color:#fff;font-weight:800;margin-bottom:6px;}
    .logo span{color:#ffcf80;}
    .bdy{padding:32px 36px;}
    .card{background:#f9f9f9;border:1px solid #ececec;border-radius:12px;overflow:hidden;margin:20px 0;}
    .card-hdr{background:#fff4ee;padding:14px 20px;border-bottom:1px solid #ffe0cc;}
    .card-hdr h3{margin:0;color:#ff4500;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;}
    .bid{color:#e65000;font-size:26px;font-weight:800;margin-top:4px;}
    .row{display:flex;justify-content:space-between;align-items:center;padding:11px 20px;border-bottom:1px solid #f0f0f0;}
    .row:last-child{border-bottom:none;}
    .lbl{color:#888;font-size:13px;}
    .val{color:#222;font-size:14px;font-weight:600;}
    .val-orange{color:#e65000;font-size:16px;font-weight:700;}
    .notice{background:#fff8f0;border:1px solid #ffd9b3;border-radius:10px;padding:16px 20px;margin:20px 0;}
    .notice p{margin:0;color:#7a5020;font-size:13px;line-height:1.65;}
    .notice strong{color:#e65000;}
    .badge-green{display:inline-block;background:#d4edda;color:#155724;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;}
    .badge-pending{display:inline-block;background:#fff3cd;color:#856404;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;}
    .badge-red{display:inline-block;background:#f8d7da;color:#721c24;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;}
    .ftr{text-align:center;padding:20px 32px;border-top:1px solid #ececec;}
    .ftr p{color:#aaa;font-size:12px;margin:3px 0;}
    .ftr .rname{color:#ff4500;font-weight:700;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div class="logo">World<span>Plate</span></div>
      <div class="hdr-emoji">${headerEmoji}</div>
      <h1>${headerTitle}</h1>
    </div>
    <div class="bdy">${bodyHtml}</div>
    <div class="ftr">
      <p>Thank you for choosing <span class="rname">${restaurantName}</span></p>
      <p>Puri, Odisha, India &nbsp;|&nbsp; Mon-Sun: 10:00 AM - 11:00 PM</p>
    </div>
  </div>
</body>
</html>`;
}

// --- 1. Booking Submitted (sent immediately when user submits) ---

async function sendBookingSubmitted(booking) {
    if (!transporter) return;
    const email = booking.customer_email;
    if (!email) { console.warn('[EmailService] No customer email for booking', booking.booking_id); return; }

    const restaurantName = process.env.RESTAURANT_NAME || 'WorldPlate';

    const bodyHtml = `
      <p style="color:#333;font-size:16px;margin-bottom:4px;">
        Hi <strong style="color:#e65000">${booking.customer_name}</strong>,
      </p>
      <p style="color:#555;font-size:14px;margin-top:0;margin-bottom:20px;line-height:1.6;">
        Your table booking at <strong>${restaurantName}</strong> has been <strong>submitted successfully</strong>!
        Please keep your <strong>Booking ID</strong> handy.
      </p>
      <div class="card">
        <div class="card-hdr">
          <h3>Your Booking ID</h3>
          <div class="bid">#${booking.booking_id}</div>
        </div>
        <div class="row"><span class="lbl">Table Type</span><span class="val">${booking.table_type_name}</span></div>
        <div class="row"><span class="lbl">Table Number</span><span class="val">Table ${booking.table_number}</span></div>
        <div class="row"><span class="lbl">Date</span><span class="val">${formatDateDisplay(booking.booking_date)}</span></div>
        <div class="row"><span class="lbl">Time</span><span class="val">${formatTime12h(booking.start_time)} - ${formatTime12h(booking.end_time)}</span></div>
        <div class="row"><span class="lbl">Duration</span><span class="val">${booking.duration} Hour${booking.duration > 1 ? 's' : ''}</span></div>
        <div class="row"><span class="lbl">Amount</span><span class="val val-orange">${formatPrice(booking.amount)}</span></div>
        <div class="row"><span class="lbl">UTR / Transaction</span><span class="val">${booking.utr_number || 'N/A'}</span></div>
        <div class="row"><span class="lbl">Status</span><span class="val"><span class="badge-pending">Pending Verification</span></span></div>
      </div>
      <div class="notice">
        <p>
          <strong>What happens next?</strong><br>
          Our team will verify your UPI payment. You will receive another email once your booking is
          <strong>approved or rejected</strong>. This usually takes a few hours.
        </p>
      </div>`;

    const html = buildEmailShell({
        headerBg: 'linear-gradient(135deg,#ff7a00,#ff4500)',
        headerEmoji: '📋',
        headerTitle: 'Booking Submitted — Pending Verification',
        bodyHtml,
        restaurantName
    });

    try {
        await transporter.sendMail({
            from: `"${restaurantName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Booking Submitted - Your ID: #${booking.booking_id} | ${restaurantName}`,
            html
        });
        console.log(`[EmailService] Submission email sent to ${email} for booking ${booking.booking_id}`);
    } catch (err) {
        console.error('[EmailService] Failed to send submission email:', err.message);
    }
}

// --- 2. Payment Verified (admin approves) ---

async function sendBookingConfirmation(booking) {
    if (!transporter) return;
    const email = booking.customer_email;
    if (!email) { console.warn('[EmailService] No customer email for booking', booking.booking_id); return; }

    const restaurantName = process.env.RESTAURANT_NAME || 'WorldPlate';

    const bodyHtml = `
      <p style="color:#333;font-size:16px;margin-bottom:4px;">
        Hi <strong style="color:#e65000">${booking.customer_name}</strong>,
      </p>
      <p style="color:#555;font-size:14px;margin-top:0;margin-bottom:20px;line-height:1.6;">
        Great news! Your payment has been <strong style="color:#28a745">verified and confirmed</strong>.
        We look forward to seeing you at <strong>${restaurantName}</strong>!
      </p>
      <div class="card">
        <div class="card-hdr">
          <h3>Booking Confirmed</h3>
          <div class="bid">#${booking.booking_id}</div>
        </div>
        <div class="row"><span class="lbl">Table Type</span><span class="val">${booking.table_type_name}</span></div>
        <div class="row"><span class="lbl">Table Number</span><span class="val">Table ${booking.table_number}</span></div>
        <div class="row"><span class="lbl">Date</span><span class="val">${formatDateDisplay(booking.booking_date)}</span></div>
        <div class="row"><span class="lbl">Time</span><span class="val">${formatTime12h(booking.start_time)} - ${formatTime12h(booking.end_time)}</span></div>
        <div class="row"><span class="lbl">Duration</span><span class="val">${booking.duration} Hour${booking.duration > 1 ? 's' : ''}</span></div>
        <div class="row"><span class="lbl">Amount Paid</span><span class="val val-orange">${formatPrice(booking.amount)}</span></div>
        <div class="row"><span class="lbl">Status</span><span class="val"><span class="badge-green">Payment Verified</span></span></div>
      </div>
      <div class="notice">
        <p>Please bring your <strong>Booking ID #${booking.booking_id}</strong> when you visit. All bookings are non-refundable.</p>
      </div>`;

    const html = buildEmailShell({
        headerBg: 'linear-gradient(135deg,#28a745,#20c997)',
        headerEmoji: '✅',
        headerTitle: 'Payment Verified - Booking Confirmed!',
        bodyHtml,
        restaurantName
    });

    try {
        await transporter.sendMail({
            from: `"${restaurantName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Booking Confirmed - #${booking.booking_id} | ${restaurantName}`,
            html
        });
        console.log(`[EmailService] Confirmation email sent to ${email} for booking ${booking.booking_id}`);
    } catch (err) {
        console.error('[EmailService] Failed to send confirmation email:', err.message);
    }
}

// --- 3. Payment Rejected (admin rejects) ---

async function sendBookingRejection(booking, reason) {
    if (!transporter) return;
    const email = booking.customer_email;
    if (!email) { console.warn('[EmailService] No customer email for booking', booking.booking_id); return; }

    const restaurantName = process.env.RESTAURANT_NAME || 'WorldPlate';

    const reasonHtml = reason
        ? `<div style="background:#fff0f0;border:1px solid #f5c6cb;border-radius:10px;padding:16px 20px;margin:16px 0;">
             <p style="margin:0 0 6px;color:#c0392b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Reason from Admin</p>
             <p style="margin:0;color:#333;font-size:14px;line-height:1.65;">${reason}</p>
           </div>`
        : '';

    const bodyHtml = `
      <p style="color:#333;font-size:16px;margin-bottom:4px;">
        Hi <strong style="color:#e65000">${booking.customer_name}</strong>,
      </p>
      <p style="color:#555;font-size:14px;margin-top:0;margin-bottom:20px;line-height:1.6;">
        We were unable to verify your payment for the booking at <strong>${restaurantName}</strong>.
        Your reservation has been <strong style="color:#c0392b">rejected</strong>.
      </p>
      <div class="card">
        <div class="card-hdr">
          <h3>Booking Reference</h3>
          <div class="bid">#${booking.booking_id}</div>
        </div>
        <div class="row"><span class="lbl">Table Type</span><span class="val">${booking.table_type_name}</span></div>
        <div class="row"><span class="lbl">Date</span><span class="val">${formatDateDisplay(booking.booking_date)}</span></div>
        <div class="row"><span class="lbl">Time</span><span class="val">${formatTime12h(booking.start_time)} - ${formatTime12h(booking.end_time)}</span></div>
        <div class="row"><span class="lbl">Status</span><span class="val"><span class="badge-red">Payment Rejected</span></span></div>
      </div>
      ${reasonHtml}
      <div class="notice">
        <p>
          If you believe this is an error, contact us at <strong>+91 123 456 7890</strong> with Booking ID <strong>#${booking.booking_id}</strong>.<br>
          You are welcome to make a new booking on our website.
        </p>
      </div>`;

    const html = buildEmailShell({
        headerBg: 'linear-gradient(135deg,#c0392b,#e74c3c)',
        headerEmoji: '❌',
        headerTitle: 'Payment Rejected',
        bodyHtml,
        restaurantName
    });

    try {
        await transporter.sendMail({
            from: `"${restaurantName}" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Payment Rejected - #${booking.booking_id} | ${restaurantName}`,
            html
        });
        console.log(`[EmailService] Rejection email sent to ${email} for booking ${booking.booking_id}`);
    } catch (err) {
        console.error('[EmailService] Failed to send rejection email:', err.message);
    }
}

module.exports = {
    sendBookingSubmitted,
    sendBookingConfirmation,
    sendBookingRejection,
    verifyConnection,
    sendTestEmail
};

