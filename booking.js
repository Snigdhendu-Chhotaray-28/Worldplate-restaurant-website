(function () {
    const API_BASE = window.BOOKING_API_URL ||
        (window.location.port === '3001' ? '/api' : 'http://localhost:3001/api');

    const STEPS = ['table', 'datetime', 'pick-table', 'summary', 'confirm'];
    const TOTAL_STEPS = STEPS.length - 1;

    const state = {
        step: 0,
        tableTypes: [],
        selectedType: null,
        date: '',
        duration: 1,
        startTime: '',
        endTime: '',
        tables: [],
        selectedTable: null,
        price: 0,
        customerName: '',
        customerEmail: '',
        bookingResult: null,
        loading: false,
        error: ''
    };


    let modalEl, overlayEl;

    function formatPrice(amount) {
        const num = Number(amount);
        return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
    }

    function formatDateDisplay(dateStr) {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    function getMinDate() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    async function apiFetch(path, options = {}) {
        let res;
        try {
            res = await fetch(`${API_BASE}${path}`, {
                headers: { 'Content-Type': 'application/json', ...options.headers },
                ...options
            });
        } catch (networkErr) {
            // Server is not running or unreachable
            throw new Error('Cannot connect to the server. Please make sure the backend is running.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'Something went wrong. Please try again.');
        }
        return data;
    }

    function setError(msg) {
        state.error = msg;
        render();
    }

    function clearError() {
        state.error = '';
    }

    function goToStep(index) {
        state.step = Math.max(0, Math.min(index, TOTAL_STEPS));
        clearError();
        render();
    }

    function closeModal() {
        overlayEl.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openModal() {
        resetState();
        overlayEl.classList.add('active');
        document.body.style.overflow = 'hidden';
        loadTableTypes();
    }

    function resetState() {
        Object.assign(state, {
            step: 0,
            selectedType: null,
            date: getMinDate(),
            duration: 1,
            startTime: '',
            endTime: '',
            tables: [],
            selectedTable: null,
            price: 0,
            customerName: '',
            customerEmail: '',
            utrNumber: '',
            paymentConfig: null,
            bookingResult: null,
            loading: false,
            error: ''
        });
    }

    async function loadTableTypes() {
        state.loading = true;
        render();
        try {
            const data = await apiFetch('/table-types');
            state.tableTypes = data.table_types;
        } catch (err) {
            setError(err.message);
        } finally {
            state.loading = false;
            render();
        }
    }

    async function loadTimeSlots() {
        if (!state.selectedType || !state.date) return;
        state.loading = true;
        state.startTime = '';
        clearError();
        render();

        try {
            const params = new URLSearchParams({
                table_type_id: state.selectedType.id,
                date: state.date,
                duration: state.duration
            });
            const data = await apiFetch(`/availability/slots?${params}`);
            state.slots = data.slots || [];
            if (data.message && state.slots.length === 0) {
                state.error = data.message;
            }
        } catch (err) {
            setError(err.message);
            state.slots = [];
        } finally {
            state.loading = false;
            render();
        }
    }

    async function loadTables() {
        if (!state.selectedType || !state.date || !state.startTime) return;
        state.loading = true;
        state.selectedTable = null;
        clearError();
        render();

        try {
            const params = new URLSearchParams({
                table_type_id: state.selectedType.id,
                date: state.date,
                start_time: state.startTime,
                duration: state.duration
            });
            const data = await apiFetch(`/availability/tables?${params}`);
            state.tables = data.tables || [];
            state.endTime = data.end_time;
            state.price = data.price;

            if (data.message && data.available_count === 0) {
                state.error = data.message;
            }
        } catch (err) {
            setError(err.message);
            state.tables = [];
        } finally {
            state.loading = false;
            render();
        }
    }

    async function handlePaymentAndBooking() {
        state.loading = true;
        clearError();
        render();

        try {
            // 1. Create Razorpay Order from backend
            const orderData = await apiFetch('/payments/order', {
                method: 'POST',
                body: JSON.stringify({
                    table_type_id: state.selectedType.id,
                    duration: state.duration
                })
            });

            // 2. Open Razorpay Checkout modal
            const options = {
                key: orderData.key_id,
                amount: orderData.amount,
                currency: "INR",
                name: orderData.restaurant_name || "WorldPlate",
                description: `Table Booking — ${state.selectedType.name}`,
                order_id: orderData.order_id,
                prefill: {
                    name: state.customerName.trim(),
                    email: state.customerEmail.trim().toLowerCase()
                },
                theme: {
                    color: "#ff4500"
                },
                modal: {
                    ondismiss: function () {
                        state.loading = false;
                        setError('Payment checkout cancelled. You can try again when ready.');
                    }
                },
                handler: async function (response) {
                    try {
                        state.loading = true;
                        clearError();
                        render();

                        // 3. Send payment details to confirm booking automatically
                        const data = await apiFetch('/bookings', {
                            method: 'POST',
                            body: JSON.stringify({
                                table_type_id: state.selectedType.id,
                                table_number: state.selectedTable,
                                booking_date: state.date,
                                start_time: state.startTime,
                                duration: state.duration,
                                customer_name: state.customerName.trim(),
                                customer_email: state.customerEmail.trim().toLowerCase(),
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        state.bookingResult = data.booking;
                        goToStep(4); // index of 'confirm' step
                    } catch (err) {
                        setError(err.message);
                    } finally {
                        state.loading = false;
                        render();
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.on('payment.failed', function (resp) {
                state.loading = false;
                const failureMsg = resp.error?.description || 'Payment failed. Please try again.';
                setError(`Payment Failed: ${failureMsg}`);
            });
            rzp.open();
        } catch (err) {
            setError(err.message);
            state.loading = false;
            render();
        }
    }


    function renderStepIndicator() {
        return STEPS.slice(0, -1).map((_, i) => {
            let cls = 'booking-step-dot';
            if (i < state.step) cls += ' completed';
            if (i === state.step) cls += ' active';
            return `<div class="${cls}"></div>`;
        }).join('');
    }

    function renderTableStep() {
        if (state.loading) {
            return '<div class="booking-loading"><div class="booking-spinner"></div> Loading tables...</div>';
        }

        const cards = state.tableTypes.map((type) => {
            const selected = state.selectedType?.id === type.id ? ' selected' : '';
            return `
                <div class="booking-table-card${selected}" data-type-id="${type.id}">
                    <h3>${type.name}</h3>
                    <div class="booking-table-meta">
                        <span><i class='bx bx-group'></i> Up to ${type.capacity} guests</span>
                        <span><i class='bx bx-table'></i> ${type.total_tables} table${type.total_tables > 1 ? 's' : ''}</span>
                    </div>
                    <div class="booking-price-row">
                        <span>1 Hour</span>
                        <strong>${formatPrice(type.price_1h)}</strong>
                    </div>
                    <div class="booking-price-row">
                        <span>2 Hours</span>
                        <strong>${formatPrice(type.price_2h)}</strong>
                    </div>
                    <span class="booking-availability-badge">${type.availability_status}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="booking-step active" data-step="table">
                <h3 class="booking-step-title">Choose Your Seating</h3>
                <p class="booking-step-subtitle">Select a table type to begin your reservation</p>
                <div class="booking-table-grid">${cards}</div>
            </div>
        `;
    }

    function renderDateTimeStep() {
        const slots = (state.slots || []).map((slot) => {
            const selected = state.startTime === slot.start_time ? ' selected' : '';
            return `<button type="button" class="booking-chip${selected}" data-start="${slot.start_time}">${slot.start_time_display}</button>`;
        }).join('');

        return `
            <div class="booking-step active" data-step="datetime">
                <h3 class="booking-step-title">Select Date & Time</h3>
                <p class="booking-step-subtitle">${state.selectedType?.name || ''} — pick your preferred slot</p>

                <div class="booking-form-group">
                    <label for="bookingDate">Booking Date</label>
                    <input type="date" id="bookingDate" min="${getMinDate()}" value="${state.date}">
                </div>

                <div class="booking-form-group">
                    <label>Duration</label>
                    <div class="booking-duration-toggle">
                        <button type="button" class="booking-duration-btn${state.duration === 1 ? ' selected' : ''}" data-duration="1">1 Hour — ${formatPrice(state.selectedType?.price_1h || 0)}</button>
                        <button type="button" class="booking-duration-btn${state.duration === 2 ? ' selected' : ''}" data-duration="2">2 Hours — ${formatPrice(state.selectedType?.price_2h || 0)}</button>
                    </div>
                </div>

                <div class="booking-form-group">
                    <label>Available Time Slots</label>
                    ${state.loading ? '<div class="booking-loading"><div class="booking-spinner"></div> Checking availability...</div>' :
                slots ? `<div class="booking-chip-grid">${slots}</div>` :
                    '<div class="booking-empty-msg">Sorry, no tables are available for this time slot.</div>'}
                </div>
            </div>
        `;
    }

    function renderPickTableStep() {
        const available = state.tables.filter((t) => t.available);
        const pending = state.tables.filter((t) => !t.available && t.status === 'Pending');
        const booked = state.tables.filter((t) => !t.available && t.status !== 'Pending');

        const tableCards = state.tables.map((t) => {
            if (t.available) {
                const sel = state.selectedTable === t.table_number ? ' table-tile--selected' : '';
                return `
                    <button type="button" class="table-tile table-tile--available${sel}" data-table="${t.table_number}" title="Table ${t.table_number} — Available">
                        <span class="table-tile__icon"><i class='bx bx-chair'></i></span>
                        <span class="table-tile__num">${t.table_number}</span>
                        <span class="table-tile__label">Available</span>
                    </button>`;
            }
            if (t.status === 'Pending') {
                return `
                    <span class="table-tile table-tile--pending" title="Table ${t.table_number} — Pending Verification">
                        <span class="table-tile__icon"><i class='bx bx-time-five'></i></span>
                        <span class="table-tile__num">${t.table_number}</span>
                        <span class="table-tile__label">Pending</span>
                    </span>`;
            }
            return `
                <span class="table-tile table-tile--booked" title="Table ${t.table_number} — Booked">
                    <span class="table-tile__icon"><i class='bx bx-x-circle'></i></span>
                    <span class="table-tile__num">${t.table_number}</span>
                    <span class="table-tile__label">Booked</span>
                </span>`;
        }).join('');

        const legend = `
            <div class="table-legend">
                <span class="table-legend__item table-legend__item--available"><i class='bx bx-check-circle'></i> ${available.length} Available</span>
                <span class="table-legend__item table-legend__item--pending"><i class='bx bx-time-five'></i> ${pending.length} Pending</span>
                <span class="table-legend__item table-legend__item--booked"><i class='bx bx-x-circle'></i> ${booked.length} Booked</span>
            </div>`;

        return `
            <div class="booking-step active" data-step="pick-table">
                <h3 class="booking-step-title">Select Available Table</h3>
                <p class="booking-step-subtitle">${state.selectedType?.name} &nbsp;·&nbsp; ${formatDateDisplay(state.date)} &nbsp;·&nbsp; ${state.startTime || ''}</p>

                ${state.loading ? '<div class="booking-loading"><div class="booking-spinner"></div> Loading tables...</div>' : `
                    ${legend}
                    ${state.tables.length > 0
                    ? `<div class="table-map">${tableCards}</div>`
                    : '<div class="booking-empty-msg">Sorry, no tables are available for this time slot.</div>'}
                    ${available.length === 0 && state.tables.length > 0
                    ? '<div class="booking-empty-msg" style="margin-top:0.75rem">All tables are occupied for this slot. Please pick a different time.</div>'
                    : ''}
                `}
            </div>
        `;
    }

    function renderSummaryStep() {
        const startDisplay = state.slots?.find(s => s.start_time === state.startTime)?.start_time_display ||
            state.bookingResult?.start_time_display || state.startTime;
        const endDisplay = state.slots?.find(s => s.start_time === state.startTime)?.end_time_display ||
            state.bookingResult?.end_time_display || state.endTime;

        return `
            <div class="booking-step active" data-step="summary">
                <h3 class="booking-step-title">Confirm Details & Pay</h3>
                <p class="booking-step-subtitle">Review your reservation and enter guest info</p>

                <div class="booking-summary">
                    <div class="booking-summary-row"><span>Table Type</span><span>${state.selectedType?.name}</span></div>
                    <div class="booking-summary-row"><span>Table Number</span><span>Table ${state.selectedTable}</span></div>
                    <div class="booking-summary-row"><span>Date</span><span>${formatDateDisplay(state.date)}</span></div>
                    <div class="booking-summary-row"><span>Time</span><span>${startDisplay} – ${endDisplay}</span></div>
                    <div class="booking-summary-row"><span>Duration</span><span>${state.duration} Hour${state.duration > 1 ? 's' : ''}</span></div>
                    <div class="booking-summary-row"><span>Total Amount</span><span class="booking-price-amount" style="color:var(--accent-color);font-weight:700;font-size:1.1rem;">${formatPrice(state.price)}</span></div>
                </div>

                <div class="booking-form-group" style="margin-top:1.25rem;">
                    <label for="customerName" style="display:block;margin-bottom:0.35rem;font-size:0.85rem;color:var(--text-muted);">Full Name *</label>
                    <input type="text" id="customerName" placeholder="Enter your full name" value="${state.customerName}" maxlength="100" style="width:100%;padding:0.65rem 0.85rem;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--primary-bg);color:var(--text-color);font-family:var(--font-body);font-size:0.88rem;" required>
                </div>

                <div class="booking-form-group" style="margin-top:1rem;">
                    <label for="customerEmail" style="display:block;margin-bottom:0.35rem;font-size:0.85rem;color:var(--text-muted);">Gmail / Email Address *</label>
                    <input type="email" id="customerEmail" placeholder="Enter your email address" value="${state.customerEmail}" maxlength="150" style="width:100%;padding:0.65rem 0.85rem;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--primary-bg);color:var(--text-color);font-family:var(--font-body);font-size:0.88rem;" required>
                    <small style="color:var(--text-muted);font-size:0.75rem;margin-top:4px;display:block">Your confirmation receipt and booking details will be emailed here.</small>
                </div>

                <div class="booking-notice" style="margin-top:1.25rem;">
                    <strong>Non-Refundable Policy:</strong> All table bookings are non-refundable. Please verify all details before making payment.
                </div>
            </div>
        `;
    }

    function renderConfirmStep() {
        const b = state.bookingResult;
        if (!b) return '';

        return `
            <div class="booking-step active" data-step="confirm">
                <div class="booking-confirmation">
                    <div class="booking-confirmation-icon" style="background:rgba(40,167,69,0.15);color:#28a745;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 1.5rem;"><i class='bx bx-check'></i></div>
                    <h3 class="booking-step-title">Booking Confirmed Successfully!</h3>
                    <p class="booking-id" style="font-size:1.25rem;font-weight:700;color:var(--accent-color);margin:0.5rem 0 1.5rem;">Booking ID: #${b.booking_id}</p>

                    <div class="booking-summary" style="text-align:left;">
                        <div class="booking-summary-row"><span>Guest Name</span><span>${b.customer_name}</span></div>
                        <div class="booking-summary-row"><span>Table</span><span>${b.table_type_name} — Table ${b.table_number}</span></div>
                        <div class="booking-summary-row"><span>Date</span><span>${formatDateDisplay(b.booking_date)}</span></div>
                        <div class="booking-summary-row"><span>Time</span><span>${b.start_time_display} – ${b.end_time_display}</span></div>
                        <div class="booking-summary-row"><span>Duration</span><span>${b.duration} Hour${b.duration > 1 ? 's' : ''}</span></div>
                        <div class="booking-summary-row"><span>Amount Paid</span><span>${formatPrice(b.amount)}</span></div>
                    </div>

                    <div class="booking-status-badge" style="display:inline-block;background:rgba(40,167,69,0.15);color:#28a745;padding:0.35rem 1rem;border-radius:20px;font-size:0.8rem;font-weight:700;margin-top:1.5rem;">Payment Verified</div>
                    <p class="booking-step-subtitle" style="margin-top:0.75rem;font-size:0.85rem;color:var(--text-muted);">A confirmation email has been sent to you.</p>
                </div>
            </div>
        `;
    }

    function renderBody() {
        switch (STEPS[state.step]) {
            case 'table': return renderTableStep();
            case 'datetime': return renderDateTimeStep();
            case 'pick-table': return renderPickTableStep();
            case 'summary': return renderSummaryStep();
            case 'confirm': return renderConfirmStep();
            default: return '';
        }
    }

    function renderFooter() {
        if (STEPS[state.step] === 'confirm') {
            return `<button type="button" class="btn btn-primary" id="bookingDoneBtn">Done</button>`;
        }

        const backBtn = state.step > 0
            ? `<button type="button" class="btn btn-secondary" id="bookingBackBtn">Back</button>`
            : '';

        let nextLabel = 'Continue';
        if (STEPS[state.step] === 'summary') nextLabel = state.loading ? 'Processing...' : 'Pay & Book';

        const nextDisabled = state.loading ? ' disabled' : '';
        const nextBtn = `<button type="button" class="btn btn-primary" id="bookingNextBtn"${nextDisabled}>${nextLabel}</button>`;

        return backBtn + nextBtn;
    }


    function render() {
        if (!modalEl) return;

        modalEl.innerHTML = `
            <div class="booking-modal-header">
                <h2>Book Your <span>Table</span></h2>
                <button class="close-modal-btn" id="closeBookingBtn" aria-label="Close booking"><i class='bx bx-x'></i></button>
            </div>
            ${state.step < 6 ? `<div class="booking-step-indicator">${renderStepIndicator()}</div>` : ''}
            <div class="booking-modal-body">
                ${state.error ? `<div class="booking-error-msg">${state.error}</div>` : ''}
                ${renderBody()}
            </div>
            <div class="booking-modal-footer">${renderFooter()}</div>
        `;

        bindEvents();
    }

    function bindEvents() {
        document.getElementById('closeBookingBtn')?.addEventListener('click', closeModal);

        document.getElementById('bookingDoneBtn')?.addEventListener('click', closeModal);

        document.getElementById('bookingBackBtn')?.addEventListener('click', () => {
            goToStep(state.step - 1);
        });

        document.getElementById('bookingNextBtn')?.addEventListener('click', handleNext);

        modalEl.querySelectorAll('.booking-table-card').forEach((card) => {
            card.addEventListener('click', () => {
                const typeId = parseInt(card.dataset.typeId, 10);
                state.selectedType = state.tableTypes.find((t) => t.id === typeId);
                goToStep(1);
                loadTimeSlots();
            });
        });

        const dateInput = document.getElementById('bookingDate');
        dateInput?.addEventListener('change', (e) => {
            state.date = e.target.value;
            loadTimeSlots();
        });

        modalEl.querySelectorAll('.booking-duration-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.duration = parseInt(btn.dataset.duration, 10);
                loadTimeSlots();
            });
        });

        modalEl.querySelectorAll('.booking-chip[data-start]').forEach((chip) => {
            chip.addEventListener('click', () => {
                state.startTime = chip.dataset.start;
                render();
            });
        });

        modalEl.querySelectorAll('.booking-chip[data-table], .table-tile--available[data-table]').forEach((chip) => {
            chip.addEventListener('click', () => {
                state.selectedTable = parseInt(chip.dataset.table, 10);
                render();
            });
        });

        document.getElementById('customerName')?.addEventListener('input', (e) => {
            state.customerName = e.target.value;
        });

        document.getElementById('customerEmail')?.addEventListener('input', (e) => {
            state.customerEmail = e.target.value;
        });

    }

    async function handleNext() {
        clearError();

        switch (STEPS[state.step]) {
            case 'table':
                if (!state.selectedType) { setError('Please select a table type.'); return; }
                goToStep(1);
                loadTimeSlots();
                break;

            case 'datetime':
                if (!state.date) { setError('Please select a date.'); return; }
                if (!state.startTime) { setError('Please select a time slot.'); return; }
                goToStep(2);
                loadTables();
                break;

            case 'pick-table':
                if (!state.selectedTable) { setError('Please select an available table.'); return; }
                goToStep(3);
                break;

            case 'summary':
                if (!state.customerName.trim()) {
                    setError('Please enter your full name.');
                    return;
                }
                if (!state.customerEmail.trim()) {
                    setError('Please enter your email address.');
                    return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.customerEmail.trim())) {
                    setError('Please enter a valid email address.');
                    return;
                }
                await handlePaymentAndBooking();
                break;

            default:
                break;
        }
    }


    function initBookingModal() {
        overlayEl = document.getElementById('bookingModal');
        if (!overlayEl) return;

        modalEl = overlayEl.querySelector('.booking-modal');

        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl && STEPS[state.step] !== 'confirm') closeModal();
        });

        document.querySelectorAll('.btn-secondary').forEach((btn) => {
            if (btn.textContent.trim().toLowerCase().includes('book')) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    openModal();
                });
            }
        });
    }

    document.addEventListener('DOMContentLoaded', initBookingModal);
})();
