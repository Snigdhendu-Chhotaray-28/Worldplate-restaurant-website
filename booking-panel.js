(function () {
    const API_BASE = window.BOOKING_API_URL ||
        (window.location.port === '3001' ? '/api' : 'http://localhost:3001/api');

    let overlayEl, modalEl;
    let pendingCount = 0;
    let pendingRefreshTimer = null;

    /* ── Helper ── */
    function formatDateDisplay(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    function formatPrice(amount) {
        const num = Number(amount);
        return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
    }

    async function apiFetch(path) {
        const res = await fetch(`${API_BASE}${path}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
    }

    /* ── Pending count ── */
    async function fetchPendingCount() {
        try {
            const data = await apiFetch('/bookings/pending-count');
            pendingCount = data.pending_count || 0;
        } catch (e) {
            pendingCount = 0;
        }
        renderPendingBanner();
    }

    function renderPendingBanner() {
        const el = document.getElementById('bpPendingBanner');
        if (!el) return;
        if (pendingCount > 0) {
            el.className = 'bp-pending-banner';
            el.innerHTML = `
                <span class="bp-pulse"></span>
                <span class="bp-pending-text">
                    <strong>${pendingCount} booking${pendingCount > 1 ? 's' : ''} pending verification</strong>
                    — seats are reserved until payment is confirmed.
                </span>`;
        } else {
            el.className = 'bp-pending-banner bp-pending-zero';
            el.innerHTML = `
                <span class="bp-pulse"></span>
                <span class="bp-pending-text"><strong>All seats are open!</strong> No pending verifications right now.</span>`;
        }
    }

    /* ── Status lookup ── */
    let lookupLoading = false;

    async function lookupBooking() {
        const input = document.getElementById('bpBookingIdInput');
        const bookingId = input ? input.value.trim().toUpperCase() : '';

        if (!bookingId) {
            showResult('<div class="bp-error"><i class="bx bx-error-circle"></i> Please enter a Booking ID.</div>');
            return;
        }

        if (lookupLoading) return;
        lookupLoading = true;
        const btn = document.getElementById('bpSearchBtn');
        if (btn) btn.disabled = true;

        showResult('<div class="bp-loading"><div class="bp-spinner"></div> Looking up your booking...</div>');

        try {
            const data = await apiFetch(`/bookings/${encodeURIComponent(bookingId)}`);
            renderBookingResult(data.booking);
        } catch (err) {
            showResult(`<div class="bp-error"><i class="bx bx-error-circle"></i> ${err.message}</div>`);
        } finally {
            lookupLoading = false;
            if (btn) btn.disabled = false;
        }
    }

    function showResult(html) {
        const el = document.getElementById('bpResult');
        if (el) el.innerHTML = html;
    }

    function getStatusBadgeClass(status) {
        if (status === 'Payment Verified') return 'verified';
        if (status === 'Payment Rejected') return 'rejected';
        return 'pending';
    }

    function getStatusIcon(status) {
        if (status === 'Payment Verified') return '✓';
        if (status === 'Payment Rejected') return '✗';
        return '⏳';
    }

    function renderBookingResult(b) {
        const statusClass = getStatusBadgeClass(b.payment_status);
        const statusIcon = getStatusIcon(b.payment_status);

        const rejectionHtml = (b.payment_status === 'Payment Rejected' && b.rejection_reason)
            ? `<div class="bp-rejection-box">
                <div class="bp-rejection-title">Admin Message</div>
                <div class="bp-rejection-reason">${b.rejection_reason}</div>
               </div>`
            : '';

        const statusNote = {
            'Pending Verification': 'Your payment is awaiting review by the restaurant. You will receive an email once verified.',
            'Payment Verified': 'Great news! Your booking is confirmed. Please carry your Booking ID when you arrive.',
            'Payment Rejected': 'Your payment could not be verified. Please contact the restaurant for assistance.'
        }[b.payment_status] || '';

        showResult(`
            <div class="bp-booking-card">
                <div class="bp-booking-card-top">
                    <div>
                        <div class="bp-booking-id-label">Booking ID</div>
                        <div class="bp-booking-id-value">#${b.booking_id}</div>
                    </div>
                    <span class="bp-status-badge ${statusClass}">${statusIcon} ${b.payment_status}</span>
                </div>
                <div class="bp-detail-rows">
                    <div class="bp-detail-row">
                        <span class="bp-detail-label">Name</span>
                        <span class="bp-detail-value">${b.customer_name}</span>
                    </div>
                    <div class="bp-detail-row">
                        <span class="bp-detail-label">Table</span>
                        <span class="bp-detail-value">${b.table_type_name} — Table ${b.table_number}</span>
                    </div>
                    <div class="bp-detail-row">
                        <span class="bp-detail-label">Date</span>
                        <span class="bp-detail-value">${formatDateDisplay(b.booking_date)}</span>
                    </div>
                    <div class="bp-detail-row">
                        <span class="bp-detail-label">Time</span>
                        <span class="bp-detail-value">${b.start_time_display} – ${b.end_time_display}</span>
                    </div>
                    <div class="bp-detail-row">
                        <span class="bp-detail-label">Duration</span>
                        <span class="bp-detail-value">${b.duration} Hour${b.duration > 1 ? 's' : ''}</span>
                    </div>
                    <div class="bp-detail-row">
                        <span class="bp-detail-label">Amount</span>
                        <span class="bp-detail-value highlight">${formatPrice(b.amount)}</span>
                    </div>
                </div>
                ${rejectionHtml}
                ${statusNote ? `<div style="padding:0.75rem 1.25rem 1rem;color:#777;font-size:0.8rem;border-top:1px solid rgba(255,255,255,0.05);line-height:1.5;">${statusNote}</div>` : ''}
            </div>
        `);
    }

    /* ── Modal HTML ── */
    function buildModalHtml() {
        return `
            <div class="bp-header">
                <h2>Booking <span>Panel</span></h2>
                <button class="bp-close-btn" id="bpCloseBtn" aria-label="Close"><i class="bx bx-x"></i></button>
            </div>
            <div class="bp-body">
                <!-- Pending banner -->
                <div class="bp-pending-banner" id="bpPendingBanner">
                    <span class="bp-pulse"></span>
                    <span class="bp-pending-text">Checking seat availability...</span>
                </div>

                <!-- Booking ID lookup -->
                <p class="bp-section-label">Check Your Booking Status</p>
                <div class="bp-search-row">
                    <input
                        type="text"
                        id="bpBookingIdInput"
                        class="bp-search-input"
                        placeholder="Enter Booking ID (e.g. WP-ABC123)"
                        maxlength="20"
                        autocomplete="off"
                        spellcheck="false"
                    >
                    <button class="bp-search-btn" id="bpSearchBtn">
                        <i class="bx bx-search"></i> Check
                    </button>
                </div>

                <!-- Result area -->
                <div id="bpResult" class="bp-result"></div>

                <!-- Divider -->
                <div class="bp-divider">OR</div>

                <!-- CTA -->
                <button class="bp-book-btn" id="bpNewBookingBtn">
                    <i class="bx bx-calendar-plus"></i> &nbsp;Make a New Table Booking
                </button>

                <!-- Admin Panel link -->
                <div class="bp-divider" style="margin:1rem 0 0.75rem;"></div>
                <a href="/admin.html" target="_blank" class="bp-admin-btn">
                    <i class="bx bx-shield-quarter"></i> Admin Panel
                </a>
            </div>
        `;
    }

    /* ── Open / Close ── */
    function openPanel() {
        if (!overlayEl) return;
        modalEl.innerHTML = buildModalHtml();
        overlayEl.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Bind events
        document.getElementById('bpCloseBtn')?.addEventListener('click', closePanel);
        document.getElementById('bpSearchBtn')?.addEventListener('click', lookupBooking);
        document.getElementById('bpBookingIdInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') lookupBooking();
        });
        document.getElementById('bpNewBookingBtn')?.addEventListener('click', () => {
            closePanel();
            // Open the booking modal (reuse existing "Book A Table" logic)
            setTimeout(() => {
                const bookBtn = document.getElementById('bookTableBtn');
                if (bookBtn) bookBtn.click();
            }, 300);
        });

        // Fetch pending count + auto-refresh every 30s
        fetchPendingCount();
        pendingRefreshTimer = setInterval(fetchPendingCount, 30000);
    }

    function closePanel() {
        if (!overlayEl) return;
        overlayEl.classList.remove('active');
        document.body.style.overflow = '';
        clearInterval(pendingRefreshTimer);
        pendingRefreshTimer = null;
    }

    /* ── Init ── */
    function init() {
        overlayEl = document.getElementById('bookingPanelModal');
        if (!overlayEl) return;

        modalEl = overlayEl.querySelector('.bp-modal');

        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) closePanel();
        });

        // Bind the header button
        document.getElementById('openBookingPanelBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openPanel();
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
