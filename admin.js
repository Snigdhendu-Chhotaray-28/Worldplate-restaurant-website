(function () {
    const API_BASE = window.BOOKING_ADMIN_API_URL ||
        (window.location.port === '3001' ? '/api/admin' : 'http://localhost:3001/api/admin');

    let adminKey = sessionStorage.getItem('adminKey') || '';

    const loginScreen = document.getElementById('loginScreen');
    const dashboard = document.getElementById('adminDashboard');
    const toast = document.getElementById('adminToast');

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    async function adminFetch(path, options = {}) {
        try {
            const res = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers: {
                    'X-Admin-Key': adminKey,
                    ...options.headers
                }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        } catch (err) {
            if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                throw new Error('Cannot connect to backend server. Please verify that the backend is running.');
            }
            throw err;
        }
    }

    function statusClass(status) {
        if (status === 'Payment Verified') return 'verified';
        if (status === 'Payment Rejected') return 'rejected';
        return 'pending';
    }

    function maskEmail(email) {
        if (!email) return '—';
        const [user, domain] = email.split('@');
        if (!domain) return email;
        const masked = user.slice(0, 2) + '***';
        return `${masked}@${domain}`;
    }

    async function loadBookings(status = '') {
        const query = status ? `?status=${encodeURIComponent(status)}` : '';
        const data = await adminFetch(`/bookings${query}`);
        const wrap = document.getElementById('bookingsTableWrap');

        if (!data.bookings.length) {
            wrap.innerHTML = '<div class="admin-empty">No bookings found.</div>';
            return;
        }

        wrap.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Table</th>
                            <th>Date / Time</th>
                            <th>Amount</th>
                            <th>UTR</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.bookings.map((b) => `
                            <tr>
                                <td><strong>${b.booking_id}</strong></td>
                                <td>${b.customer_name}</td>
                                <td style="font-size:0.78rem;color:#aaa;" title="${b.customer_email || ''}">${maskEmail(b.customer_email)}</td>
                                <td>${b.table_type_name} #${b.table_number}</td>
                                <td>${b.booking_date}<br>${b.start_time}–${b.end_time}</td>
                                <td>₹${b.amount.toLocaleString('en-IN')}</td>
                                <td style="font-size:0.78rem;">${b.utr_number}</td>
                                <td>
                                    <span class="admin-status ${statusClass(b.payment_status)}">${b.payment_status}</span>
                                    ${b.rejection_reason ? `<div style="font-size:0.72rem;color:#888;margin-top:4px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.rejection_reason}">📝 ${b.rejection_reason}</div>` : ''}
                                </td>
                                <td>
                                    <div class="admin-actions">
                                        <button class="btn-verify" data-id="${b.id}" data-action="verify">Verify</button>
                                        <button class="btn-reject" data-id="${b.id}" data-action="reject">Reject</button>
                                        <button class="btn-pending" data-id="${b.id}" data-action="pending">Pending</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        wrap.querySelectorAll('.admin-actions button').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const id = btn.dataset.id;

                if (action === 'reject') {
                    // Show inline rejection reason prompt
                    const existingPrompt = document.getElementById(`reject-prompt-${id}`);
                    if (existingPrompt) { existingPrompt.remove(); return; }

                    const row = btn.closest('tr');
                    const promptRow = document.createElement('tr');
                    promptRow.id = `reject-prompt-${id}`;
                    promptRow.innerHTML = `
                        <td colspan="9" style="padding:0.75rem 1rem;background:rgba(244,67,54,0.05);border-bottom:1px solid rgba(244,67,54,0.15);">
                            <div style="display:flex;gap:0.5rem;align-items:flex-end;">
                                <div style="flex:1;">
                                    <label style="font-size:0.75rem;color:#ef5350;display:block;margin-bottom:4px;">Rejection Reason (optional — will be emailed to customer)</label>
                                    <textarea id="reject-reason-${id}" rows="2" placeholder="e.g. Payment not received in our account. Please contact us." style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(244,67,54,0.3);border-radius:8px;padding:0.5rem 0.75rem;color:#f0f0f0;font-family:inherit;font-size:0.85rem;resize:vertical;"></textarea>
                                </div>
                                <button class="btn-reject" data-confirm-reject="${id}" style="padding:0.45rem 0.85rem;white-space:nowrap;">Confirm Reject</button>
                                <button class="btn-pending" data-cancel-reject="${id}" style="padding:0.45rem 0.85rem;">Cancel</button>
                            </div>
                        </td>
                    `;
                    row.insertAdjacentElement('afterend', promptRow);

                    promptRow.querySelector(`[data-confirm-reject]`)?.addEventListener('click', async () => {
                        const reason = document.getElementById(`reject-reason-${id}`)?.value.trim() || '';
                        try {
                            await adminFetch(`/bookings/${id}/payment-status`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ payment_status: 'Payment Rejected', rejection_reason: reason })
                            });
                            showToast('Booking rejected. Email sent to customer.');
                            loadBookings(document.getElementById('bookingFilter').value);
                        } catch (err) {
                            showToast(err.message);
                        }
                    });

                    promptRow.querySelector(`[data-cancel-reject]`)?.addEventListener('click', () => {
                        promptRow.remove();
                    });

                    return;
                }

                const statusMap = { verify: 'Payment Verified', pending: 'Pending Verification' };
                const paymentStatus = statusMap[action];
                if (!paymentStatus) return;

                try {
                    await adminFetch(`/bookings/${id}/payment-status`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payment_status: paymentStatus })
                    });
                    const msg = action === 'verify' ? 'Booking verified. Confirmation email sent!' : 'Booking set to Pending.';
                    showToast(msg);
                    loadBookings(document.getElementById('bookingFilter').value);
                } catch (err) {
                    showToast(err.message);
                }
            });
        });
    }

    async function loadTables() {
        const data = await adminFetch('/table-types');
        const wrap = document.getElementById('tablesInventory');

        wrap.innerHTML = data.table_types.map((type) => {
            const typeTables = data.tables.filter((t) => t.table_type_id === type.id);
            return `
                <div style="margin-bottom:1.5rem;">
                    <h4 style="margin-bottom:0.5rem;">${type.name} (${type.active_tables} active)</h4>
                    <table class="admin-table">
                        <thead><tr><th>Table #</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                            ${typeTables.map((t) => `
                                <tr>
                                    <td>Table ${t.table_number}</td>
                                    <td>${t.is_active ? 'Active' : 'Inactive'}</td>
                                    <td>
                                        <button class="btn-${t.is_active ? 'reject' : 'verify'}" data-table-id="${t.id}" data-active="${t.is_active ? 0 : 1}">
                                            ${t.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        wrap.querySelectorAll('[data-table-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await adminFetch(`/tables/${btn.dataset.tableId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_active: parseInt(btn.dataset.active, 10) })
                    });
                    showToast('Table updated.');
                    loadTables();
                } catch (err) {
                    showToast(err.message);
                }
            });
        });
    }

    async function loadPricing() {
        const data = await adminFetch('/table-types');
        const wrap = document.getElementById('pricingConfig');

        wrap.innerHTML = data.table_types.map((type) => `
            <div style="margin-bottom:1.25rem;padding-bottom:1.25rem;border-bottom:1px solid rgba(255,255,255,0.05);">
                <h4 style="margin-bottom:0.75rem;">${type.name}</h4>
                <div class="admin-form-row">
                    <div><label>1 Hour (₹)</label><input type="number" data-field="price_1h" data-id="${type.id}" value="${type.price_1h}"></div>
                    <div><label>2 Hours (₹)</label><input type="number" data-field="price_2h" data-id="${type.id}" value="${type.price_2h}"></div>
                    <div><label>Capacity</label><input type="number" data-field="capacity" data-id="${type.id}" value="${type.capacity}"></div>
                </div>
                <button class="btn btn-primary save-pricing-btn" data-id="${type.id}" style="font-size:0.85rem;padding:0.45rem 1rem;">Save ${type.name}</button>
            </div>
        `).join('');

        wrap.querySelectorAll('.save-pricing-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const container = btn.parentElement;
                const price1h = container.querySelector('[data-field="price_1h"]').value;
                const price2h = container.querySelector('[data-field="price_2h"]').value;
                const capacity = container.querySelector('[data-field="capacity"]').value;

                try {
                    await adminFetch(`/table-types/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            price_1h: parseInt(price1h, 10),
                            price_2h: parseInt(price2h, 10),
                            capacity: parseInt(capacity, 10)
                        })
                    });
                    showToast(`${btn.textContent.replace('Save ', '')} pricing saved.`);
                } catch (err) {
                    showToast(err.message);
                }
            });
        });
    }

    async function loadSettings() {
        const data = await adminFetch('/settings');
        const config = Object.fromEntries(data.settings.map((s) => [s.key, s.value]));

        document.getElementById('qrPreview').src = data.qr_code_url;
        document.getElementById('upiIdInput').value = config.upi_id || '';
        document.getElementById('restaurantNameInput').value = config.restaurant_name || '';
    }

    function showDashboard() {
        loginScreen.style.display = 'none';
        dashboard.style.display = 'block';
        loadBookings();
        loadTables();
        loadPricing();
        loadSettings();
    }

    async function doLogin() {
        const adminId = (document.getElementById('adminIdInput')?.value || '').trim();
        const adminPassword = (document.getElementById('adminPasswordInput')?.value || '').trim();
        const errorEl = document.getElementById('loginError');
        errorEl.style.display = 'none';

        if (!adminId || !adminPassword) {
            errorEl.textContent = 'Please enter both Admin ID and Password.';
            errorEl.style.display = 'block';
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: adminId, password: adminPassword })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Login failed.');
            }

            adminKey = data.token || adminPassword;
            sessionStorage.setItem('adminKey', adminKey);
            showDashboard();
        } catch (err) {
            if (err.message && err.message.includes('verify that the backend is running')) {
                errorEl.textContent = 'Cannot connect to backend server. Please ensure the backend is running.';
            } else {
                errorEl.textContent = err.message || 'Invalid admin ID or password.';
            }
            errorEl.style.display = 'block';
        }
    }

    document.getElementById('adminLoginBtn').addEventListener('click', doLogin);

    ['adminIdInput', 'adminPasswordInput'].forEach((id) => {
        document.getElementById(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLogin();
        });
    });

    document.getElementById('adminLogoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('adminKey');
        adminKey = '';
        location.reload();
    });

    document.querySelectorAll('.admin-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
            document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
        });
    });

    document.getElementById('bookingFilter').addEventListener('change', (e) => {
        loadBookings(e.target.value);
    });

    document.getElementById('qrUploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = document.getElementById('qrFileInput').files[0];
        if (!file) { showToast('Please select an image.'); return; }

        const formData = new FormData();
        formData.append('qr_code', file);

        try {
            const res = await fetch(`${API_BASE}/settings/qr-code`, {
                method: 'POST',
                headers: { 'X-Admin-Key': adminKey },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            document.getElementById('qrPreview').src = data.qr_code_url + '?t=' + Date.now();
            showToast('QR code updated.');
        } catch (err) {
            showToast(err.message);
        }
    });

    document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
        try {
            await adminFetch('/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    upi_id: document.getElementById('upiIdInput').value,
                    restaurant_name: document.getElementById('restaurantNameInput').value
                })
            });
            showToast('Settings saved.');
        } catch (err) {
            showToast(err.message);
        }
    });

    document.getElementById('runCleanupBtn').addEventListener('click', async () => {
        try {
            const data = await adminFetch('/cleanup/run', { method: 'POST' });
            showToast(`Cleanup done. Removed ${data.removed} record(s).`);
        } catch (err) {
            showToast(err.message);
        }
    });

    if (adminKey) {
        showDashboard();
    }
})();
