"use strict";
// =============================================
// AbangPC – dashboard.ts
// Manager Dashboard Logic
// =============================================
let currentUser = null;
let allTickets = [];
let selectedTicketId = '';
// =============================================
// AUTO LOGOUT (30 minutes inactivity)
// =============================================
const TIMEOUT_MS = 5 * 60 * 1000; // 30 minutes
const WARNING_MS = 60 * 1000; // warn 60 seconds before
let inactivityTimer = null;
let warningTimer = null;
let countdownInterval = null;
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    dismissLogoutWarning();
    warningTimer = setTimeout(showLogoutWarning, TIMEOUT_MS - WARNING_MS);
    inactivityTimer = setTimeout(async () => {
        dismissLogoutWarning();
        await db.auth.signOut();
        window.location.href = 'login.html';
    }, TIMEOUT_MS);
}
function showLogoutWarning() {
    var _a;
    // Don't show if already visible
    if (document.getElementById('logoutWarning'))
        return;
    let seconds = 60;
    const overlay = document.createElement('div');
    overlay.className = 'logout-overlay';
    overlay.id = 'logoutOverlay';
    const box = document.createElement('div');
    box.className = 'logout-warning';
    box.id = 'logoutWarning';
    box.innerHTML = `
    <h3>⚠️ Still there?</h3>
    <p>You will be automatically signed out due to inactivity.</p>
    <div class="logout-countdown" id="logoutCountdown">${seconds}</div>
    <button class="btn btn-primary" id="stayLoggedInBtn" style="width:100%;">Yes, Keep Me Logged In</button>
  `;
    document.body.appendChild(overlay);
    document.body.appendChild(box);
    (_a = document.getElementById('stayLoggedInBtn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        resetInactivityTimer();
    });
    countdownInterval = setInterval(() => {
        seconds--;
        const el = document.getElementById('logoutCountdown');
        if (el)
            el.textContent = String(seconds);
        if (seconds <= 0)
            clearInterval(countdownInterval);
    }, 1000);
}
function dismissLogoutWarning() {
    var _a, _b;
    clearInterval(countdownInterval);
    (_a = document.getElementById('logoutWarning')) === null || _a === void 0 ? void 0 : _a.remove();
    (_b = document.getElementById('logoutOverlay')) === null || _b === void 0 ? void 0 : _b.remove();
}
function initAutoLogout() {
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
}
// =============================================
// INIT
// =============================================
async function initDashboard() {
    try {
        currentUser = await SystemApp.requireManager();
        SystemApp.renderSidebar(currentUser, 'dashboard');
        await loadTickets();
        bindEvents();
        initAutoLogout();
    }
    catch (err) {
        console.error(err);
    }
}
// =============================================
// LOAD TICKETS
// =============================================
async function loadTickets() {
    const tbody = document.getElementById('ticketsBody');
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted);">Loading...</td></tr>`;
    const { data, error } = await db
        .from('tickets')
        .select(`
      *,
      customers (id, name, phone)
    `)
        .order('created_at', { ascending: false });
    if (error) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--danger);">Error loading tickets: ${error.message}</td></tr>`;
        return;
    }
    allTickets = data || [];
    updateStats();
    renderTickets(allTickets);
}
// =============================================
// UPDATE STATS
// =============================================
function updateStats() {
    const counts = {
        diagnosing: 0, repairing: 0,
        finished: 0, ready_pickup: 0, collected: 0
    };
    allTickets.forEach(t => { if (counts[t.status] !== undefined)
        counts[t.status]++; });
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el)
            el.textContent = String(val);
    };
    set('statTotal', allTickets.length);
    set('statDiagnosing', counts.diagnosing);
    set('statRepairing', counts.repairing);
    set('statReady', counts.ready_pickup);
    set('statCollected', counts.collected);
}
// =============================================
// TICKET AGE HELPER
// =============================================
function getTicketAge(estimatedCompletion, status) {
    // Show CLOSED badge for collected tickets
    if (status === 'collected') {
        return { badge: '<span class="ticket-age-badge closed">CLOSED</span>', class: 'closed' };
    }
    if (!estimatedCompletion) {
        return { badge: '<span class="ticket-age-badge new">NEW</span>', class: 'new' };
    }
    const now = new Date();
    const estDate = new Date(estimatedCompletion);
    const diffMs = now.getTime() - estDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        // Before estimated date - GREEN
        return { badge: '<span class="ticket-age-badge new">NEW</span>', class: 'new' };
    }
    else if (diffDays <= 2) {
        // 0-2 days overdue - YELLOW
        return { badge: '<span class="ticket-age-badge warning">DUE</span>', class: 'warning' };
    }
    else {
        // 3+ days overdue - RED
        return { badge: '<span class="ticket-age-badge overdue">OVERDUE</span>', class: 'overdue' };
    }
}
// =============================================
// RENDER TICKETS TABLE
// =============================================
function renderTickets(tickets) {
    const tbody = document.getElementById('ticketsBody');
    const countEl = document.getElementById('ticketCount');
    countEl.textContent = `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`;
    if (tickets.length === 0) {
        tbody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty-state">
          <div class="empty-state-icon">🎫</div>
          <h3>No tickets found</h3>
          <p>Create your first ticket to get started</p>
        </div>
      </td></tr>`;
        return;
    }
    tbody.innerHTML = tickets.map(t => {
        var _a, _b;
        return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-family:'Syne',sans-serif;font-weight:700;color:var(--yellow);font-size:13px;">${t.ticket_number}</span>
          ${getTicketAge(t.estimated_completion, t.status).badge}
        </div>
      </td>
      <td>
        <div class="ticket-customer">${((_a = t.customers) === null || _a === void 0 ? void 0 : _a.name) || '—'}</div>
        <div class="ticket-device">${((_b = t.customers) === null || _b === void 0 ? void 0 : _b.phone) || ''}</div>
      </td>
      <td>
        <div>${t.device_type === 'laptop' ? '💻' : '🖥️'} ${t.device_brand || ''}</div>
        <div class="ticket-device">${t.device_model || ''}</div>
      </td>
      <td style="max-width:180px;">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;" title="${t.issue_description}">
          ${t.issue_description}
        </div>
      </td>
      <td>${SystemApp.getStatusBadgeHTML(t.status)}</td>
      <td style="color:var(--muted);font-size:13px;">
        ${SystemApp.formatDate(t.created_at)}
        <div style="font-size:11px;">${SystemApp.formatDuration(t.created_at)} ago</div>
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openDetailModal('${t.id}')">👁️ View</button>
          <button class="btn btn-secondary btn-sm" onclick="openStatusModal('${t.id}','${t.status}')">🔄</button>
          <button class="btn btn-secondary btn-sm" onclick="openPhotoModal('${t.id}')">📸</button>
          <div class="diag-dropdown">
            <button class="btn btn-secondary btn-sm diag-dropdown-btn" onclick="toggleDiagMenu('${t.id}', event)">📄 ▾</button>
            <div class="diag-dropdown-menu hidden" id="diagMenu_${t.id}">
              <button onclick="openDiagnoseModal('${t.id}');closeDiagMenus()">🖥️ PC Form</button>
              <button onclick="openLaptopDiagnoseModal('${t.id}');closeDiagMenus()">💻 Laptop Form</button>
            </div>
          </div>
          <button class="btn btn-sm" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#EF4444;" onclick="deleteTicket('${t.id}','${t.ticket_number}')">🗑️</button>
        </div>
      </td>
    </tr>
  `;
    }).join('');
}
// =============================================
// FILTERS
// =============================================
function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    const age = document.getElementById('ageFilter').value;
    const filtered = allTickets.filter(t => {
        var _a, _b, _c, _d, _e, _f;
        const matchSearch = !search ||
            t.ticket_number.toLowerCase().includes(search) ||
            ((_b = (_a = t.customers) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(search)) ||
            ((_d = (_c = t.customers) === null || _c === void 0 ? void 0 : _c.phone) === null || _d === void 0 ? void 0 : _d.includes(search)) ||
            ((_e = t.issue_description) === null || _e === void 0 ? void 0 : _e.toLowerCase().includes(search)) ||
            ((_f = t.device_brand) === null || _f === void 0 ? void 0 : _f.toLowerCase().includes(search));
        const matchStatus = !status || t.status === status;
        const matchAge = !age || getTicketAge(t.estimated_completion, t.status).class === age;
        return matchSearch && matchStatus && matchAge;
    });
    renderTickets(filtered);
}
// =============================================
// CUSTOMER PHONE LOOKUP
// =============================================
async function lookupCustomer(phone) {
    if (phone.length < 8) {
        document.getElementById('custFound').classList.add('hidden');
        return;
    }
    const { data } = await db
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .single();
    const custFoundEl = document.getElementById('custFound');
    const custNameEl = document.getElementById('custName');
    const custEmailEl = document.getElementById('custEmail');
    if (data) {
        custFoundEl.textContent = `✅ Returning customer found: ${data.name}`;
        custFoundEl.classList.remove('hidden');
        custNameEl.value = data.name;
        custEmailEl.value = data.email || '';
        custNameEl.dataset.existingId = data.id;
    }
    else {
        custFoundEl.textContent = '🆕 New customer — fill in details below';
        custFoundEl.classList.remove('hidden');
        custNameEl.value = '';
        custEmailEl.value = '';
        delete custNameEl.dataset.existingId;
    }
}
// =============================================
// CREATE TICKET
// =============================================
async function createTicket() {
    const errorEl = document.getElementById('createError');
    const btnText = document.getElementById('createBtnText');
    const spinner = document.getElementById('createSpinner');
    const submitBtn = document.getElementById('submitCreateBtn');
    errorEl.classList.add('hidden');
    const phone = document.getElementById('custPhone').value.trim();
    const name = document.getElementById('custName').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const device = document.getElementById('deviceType').value;
    const brand = document.getElementById('deviceBrand').value.trim();
    const model = document.getElementById('deviceModel').value.trim();
    const issue = document.getElementById('issueDesc').value.trim();
    const estDate = document.getElementById('estCompletion').value;
    const notes = document.getElementById('internalNotes').value.trim();
    const existingId = document.getElementById('custName').dataset.existingId;
    // Validate
    if (!phone) {
        showCreateError('Customer phone is required.');
        return;
    }
    if (!name) {
        showCreateError('Customer name is required.');
        return;
    }
    if (!issue) {
        showCreateError('Issue description is required.');
        return;
    }
    submitBtn.disabled = true;
    btnText.textContent = 'Creating...';
    spinner.classList.remove('hidden');
    try {
        // Step 1: Always upsert customer (handles both new and existing)
        const { data: newCust, error: custErr } = await db
            .from('customers')
            .upsert({ phone, name, email: email || null }, { onConflict: 'phone' })
            .select()
            .single();
        if (custErr)
            throw custErr;
        const customerId = newCust.id;
        // Step 2: Create ticket
        const { error: ticketErr } = await db
            .from('tickets')
            .insert({
            customer_id: customerId,
            device_type: device,
            device_brand: brand || null,
            device_model: model || null,
            issue_description: issue,
            status: 'diagnosing',
            created_by: currentUser.id,
            estimated_completion: estDate || null,
            internal_notes: notes || null,
        });
        if (ticketErr)
            throw ticketErr;
        // Success
        closeModal('createModal');
        resetCreateForm();
        await loadTickets();
        showToast('✅ Ticket created successfully!', 'success');
    }
    catch (err) {
        showCreateError(err.message || 'Failed to create ticket.');
    }
    finally {
        submitBtn.disabled = false;
        btnText.textContent = 'Create Ticket';
        spinner.classList.add('hidden');
    }
}
function showCreateError(msg) {
    const el = document.getElementById('createError');
    el.textContent = msg;
    el.classList.remove('hidden');
}
function resetCreateForm() {
    ['custPhone', 'custName', 'custEmail', 'deviceBrand', 'deviceModel',
        'issueDesc', 'estCompletion', 'internalNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.value = '';
    });
    document.getElementById('deviceType').value = 'laptop';
    document.getElementById('custFound').classList.add('hidden');
}
// =============================================
// DETAIL MODAL
// =============================================
async function openDetailModal(ticketId) {
    var _a, _b, _c;
    selectedTicketId = ticketId;
    const modal = document.getElementById('detailModal');
    const body = document.getElementById('detailModalBody');
    const title = document.getElementById('detailModalTitle');
    modal.classList.remove('hidden');
    body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);">Loading...</div>';
    const { data: ticket, error } = await db
        .from('tickets')
        .select(`*, customers(*)`)
        .eq('id', ticketId)
        .single();
    if (error || !ticket) {
        body.innerHTML = '<div style="color:var(--danger);padding:20px;">Failed to load ticket.</div>';
        return;
    }
    // Load status history, comments, photos
    const [{ data: history }, { data: comments }, { data: photos }] = await Promise.all([
        db.from('ticket_status_history')
            .select(`*, changer:users!ticket_status_history_changed_by_fkey(full_name)`)
            .eq('ticket_id', ticketId)
            .order('changed_at', { ascending: false }),
        db.from('ticket_comments')
            .select(`*, author:users!ticket_comments_author_id_fkey(full_name)`)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true }),
        db.from('ticket_photos')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('uploaded_at', { ascending: false }),
    ]);
    title.textContent = `Ticket ${ticket.ticket_number}`;
    body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
      <div class="status-info-item">
        <div class="status-info-label">Customer</div>
        <div class="status-info-value">${(_a = ticket.customers) === null || _a === void 0 ? void 0 : _a.name}</div>
        <div style="font-size:12px;color:var(--muted);">${(_b = ticket.customers) === null || _b === void 0 ? void 0 : _b.phone}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Device</div>
        <div class="status-info-value">${ticket.device_type === 'laptop' ? '💻' : '🖥️'} ${ticket.device_brand || ''} ${ticket.device_model || ''}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Status</div>
        <div class="status-info-value">${SystemApp.getStatusBadgeHTML(ticket.status)}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Est. Completion</div>
        <div class="status-info-value">${SystemApp.formatDate(ticket.estimated_completion)}</div>
      </div>
      <div class="status-info-item" style="grid-column:1/-1;">
        <div class="status-info-label">Issue</div>
        <div class="status-info-value" style="font-weight:400;font-size:14px;">${ticket.issue_description}</div>
      </div>
      ${ticket.internal_notes ? `
      <div class="status-info-item" style="grid-column:1/-1;background:var(--warning-dim);border:1px solid rgba(251,146,60,0.2);">
        <div class="status-info-label" style="color:var(--warning);">⚠️ Internal Notes</div>
        <div class="status-info-value" style="font-weight:400;font-size:14px;">${ticket.internal_notes}</div>
      </div>` : ''}
    </div>

    <!-- Photos -->
    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">📸 Photos</div>
      ${(photos && photos.length > 0) ? `
        <div class="photo-grid">
          ${photos.map((p) => `
            <div class="photo-item">
              <img src="${p.photo_url}" alt="${p.caption || 'Photo'}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="window.open('${p.photo_url}','_blank')" />
              ${p.caption ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;text-align:center;">${p.caption}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<div style="color:var(--muted);font-size:13px;">No photos uploaded yet.</div>'}
    </div>

    <!-- Status History -->
    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">Status History</div>
      <ul class="timeline">
        ${(history || []).map((h) => `
          <li class="timeline-item">
            <div class="timeline-dot">📋</div>
            <div class="timeline-content">
              <div class="timeline-title">${SystemApp.getStatusLabel(h.status)}</div>
              <div class="timeline-time">${SystemApp.formatDateTime(h.changed_at)} ${h.changer ? '— by ' + h.changer.full_name : ''}</div>
              ${h.notes ? `<div class="timeline-note">${h.notes}</div>` : ''}
            </div>
          </li>
        `).join('') || '<li style="color:var(--muted);font-size:13px;">No history yet.</li>'}
      </ul>
    </div>

    <!-- Comments -->
    <div>
      <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">Staff Comments</div>
      <div id="commentsList">
        ${(comments || []).map((c) => {
        var _a;
        return `
          <div style="background:var(--surface);border-radius:10px;padding:12px 14px;margin-bottom:10px;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${((_a = c.author) === null || _a === void 0 ? void 0 : _a.full_name) || 'Unknown'} — ${SystemApp.formatDateTime(c.created_at)}</div>
            <div style="font-size:14px;">${c.comment}</div>
          </div>
        `;
    }).join('') || '<div style="color:var(--muted);font-size:13px;">No comments yet.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <input type="text" id="newComment" placeholder="Add a comment..." style="flex:1;background:var(--surface);border:1px solid var(--border-hover);color:var(--white);border-radius:8px;padding:10px 14px;font-size:14px;font-family:inherit;outline:none;" />
        <button class="btn btn-primary btn-sm" onclick="addComment('${ticketId}')">Send</button>
      </div>
    </div>
  `;
    const footer = document.getElementById('detailModalFooter');
    footer.innerHTML = `
    <button class="btn btn-primary" onclick="openStatusModal('${ticketId}','${ticket.status}')">🔄 Update Status</button>
    <button class="btn btn-secondary" onclick="openPhotoModal('${ticketId}')">📸 Add Photo</button>
    <button class="btn btn-secondary" id="closeDetailBtn">Close</button>
  `;
    (_c = document.getElementById('closeDetailBtn')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', () => closeModal('detailModal'));
}
// =============================================
// ADD COMMENT
// =============================================
async function addComment(ticketId) {
    const input = document.getElementById('newComment');
    const text = input.value.trim();
    if (!text)
        return;
    const { error } = await db.from('ticket_comments').insert({
        ticket_id: ticketId,
        comment: text,
        author_id: currentUser.id,
    });
    if (error) {
        showToast('Failed to add comment', 'error');
        return;
    }
    input.value = '';
    showToast('Comment added!', 'success');
    // Reload detail modal
    openDetailModal(ticketId);
}
// =============================================
// PHOTO MODAL
// =============================================
function openPhotoModal(ticketId) {
    selectedTicketId = ticketId;
    document.getElementById('photoFile').value = '';
    document.getElementById('photoCaption').value = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoModal').classList.remove('hidden');
}
async function uploadPhoto() {
    const fileInput = document.getElementById('photoFile');
    const caption = document.getElementById('photoCaption').value.trim();
    const btn = document.getElementById('confirmPhotoBtn');
    const btnText = document.getElementById('photoUploadText');
    const spinner = document.getElementById('photoSpinner');
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Please select a photo first', 'error');
        return;
    }
    const file = fileInput.files[0];
    const ext = file.name.split('.').pop();
    const path = `tickets/${selectedTicketId}/${Date.now()}.${ext}`;
    btn.disabled = true;
    btnText.textContent = 'Uploading...';
    spinner.classList.remove('hidden');
    try {
        const { error: uploadErr } = await db.storage
            .from('ticket-photos')
            .upload(path, file, { cacheControl: '3600', upsert: false });
        if (uploadErr)
            throw uploadErr;
        const { data: urlData } = db.storage
            .from('ticket-photos')
            .getPublicUrl(path);
        const { error: dbErr } = await db.from('ticket_photos').insert({
            ticket_id: selectedTicketId,
            photo_url: urlData.publicUrl,
            caption: caption || null,
            uploaded_by: currentUser.id,
        });
        if (dbErr)
            throw dbErr;
        closeModal('photoModal');
        showToast('\u{1F4F8} Photo uploaded!', 'success');
        // Refresh detail modal if open
        if (!document.getElementById('detailModal').classList.contains('hidden')) {
            openDetailModal(selectedTicketId);
        }
    }
    catch (err) {
        showToast(err.message || 'Upload failed', 'error');
    }
    finally {
        btn.disabled = false;
        btnText.textContent = 'Upload Photo';
        spinner.classList.add('hidden');
    }
}
// =============================================
// STATUS MODAL
// =============================================
function openStatusModal(ticketId, currentStatus) {
    selectedTicketId = ticketId;
    document.getElementById('newStatusSelect').value = currentStatus;
    document.getElementById('statusNotes').value = '';
    document.getElementById('statusModal').classList.remove('hidden');
}
async function confirmStatusUpdate() {
    const newStatus = document.getElementById('newStatusSelect').value;
    const notes = document.getElementById('statusNotes').value.trim();
    // Step 1: Update ticket status
    const { error } = await db
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', selectedTicketId);
    if (error) {
        showToast('Failed to update status', 'error');
        return;
    }
    // Step 2: Wait for trigger to fire, then save notes
    if (notes) {
        await new Promise((res) => setTimeout(res, 600));
        const { data: historyRow } = await db
            .from('ticket_status_history')
            .select('id')
            .eq('ticket_id', selectedTicketId)
            .eq('status', newStatus)
            .order('changed_at', { ascending: false })
            .limit(1)
            .single();
        if (historyRow) {
            await db
                .from('ticket_status_history')
                .update({ notes })
                .eq('id', historyRow.id);
        }
    }
    closeModal('statusModal');
    await loadTickets();
    showToast('\u2705 Status updated!', 'success');
}
// =============================================
// MODAL HELPERS
// =============================================
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}
// =============================================
// TOAST NOTIFICATION
// =============================================
function showToast(msg, type = 'info') {
    const existing = document.getElementById('toast');
    if (existing)
        existing.remove();
    const colors = {
        success: 'var(--success)',
        error: 'var(--danger)',
        info: 'var(--yellow)',
    };
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = msg;
    toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:var(--card);border:1px solid ${colors[type]};
    color:${colors[type]};padding:12px 20px;border-radius:10px;
    font-size:14px;font-weight:600;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    animation:fadeInUp 0.3s ease;
  `;
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
// =============================================
// BIND EVENTS
// =============================================
function bindEvents() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10;
    // New ticket button
    (_a = document.getElementById('newTicketBtn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        document.getElementById('createModal').classList.remove('hidden');
    });
    // Close modals
    (_b = document.getElementById('closeCreateModal')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => closeModal('createModal'));
    (_c = document.getElementById('cancelCreateBtn')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', () => closeModal('createModal'));
    (_d = document.getElementById('closeDetailModal')) === null || _d === void 0 ? void 0 : _d.addEventListener('click', () => closeModal('detailModal'));
    (_e = document.getElementById('closeStatusModal')) === null || _e === void 0 ? void 0 : _e.addEventListener('click', () => closeModal('statusModal'));
    (_f = document.getElementById('cancelStatusBtn')) === null || _f === void 0 ? void 0 : _f.addEventListener('click', () => closeModal('statusModal'));
    // Close on overlay click
    ['createModal', 'detailModal', 'statusModal', 'photoModal'].forEach(id => {
        var _a;
        (_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.addEventListener('click', (e) => {
            if (e.target.id === id)
                closeModal(id);
        });
    });
    // Create ticket submit
    (_g = document.getElementById('submitCreateBtn')) === null || _g === void 0 ? void 0 : _g.addEventListener('click', createTicket);
    // Status confirm
    (_h = document.getElementById('confirmStatusBtn')) === null || _h === void 0 ? void 0 : _h.addEventListener('click', confirmStatusUpdate);
    // Photo modal
    (_j = document.getElementById('closePhotoModal')) === null || _j === void 0 ? void 0 : _j.addEventListener('click', () => closeModal('photoModal'));
    (_k = document.getElementById('cancelPhotoBtn')) === null || _k === void 0 ? void 0 : _k.addEventListener('click', () => closeModal('photoModal'));
    (_l = document.getElementById('confirmPhotoBtn')) === null || _l === void 0 ? void 0 : _l.addEventListener('click', uploadPhoto);
    // Laptop Diagnose modal
    (_m = document.getElementById('closeLaptopDiagnoseModal')) === null || _m === void 0 ? void 0 : _m.addEventListener('click', () => closeModal('laptopDiagnoseModal'));
    (_o = document.getElementById('cancelLaptopDiagnoseBtn')) === null || _o === void 0 ? void 0 : _o.addEventListener('click', () => closeModal('laptopDiagnoseModal'));
    (_p = document.getElementById('saveLaptopDiagnoseBtn')) === null || _p === void 0 ? void 0 : _p.addEventListener('click', saveLaptopDiagnoseReport);
    (_q = document.getElementById('previewLaptopDiagnoseBtn')) === null || _q === void 0 ? void 0 : _q.addEventListener('click', previewLaptopDiagnosePDF);
    (_r = document.getElementById('laptopDiagnoseModal')) === null || _r === void 0 ? void 0 : _r.addEventListener('click', (e) => {
        if (e.target.id === 'laptopDiagnoseModal')
            closeModal('laptopDiagnoseModal');
    });
    // Diagnose modal
    (_s = document.getElementById('closeDiagnoseModal')) === null || _s === void 0 ? void 0 : _s.addEventListener('click', () => closeModal('diagnoseModal'));
    (_t = document.getElementById('cancelDiagnoseBtn')) === null || _t === void 0 ? void 0 : _t.addEventListener('click', () => closeModal('diagnoseModal'));
    (_u = document.getElementById('saveDiagnoseBtn')) === null || _u === void 0 ? void 0 : _u.addEventListener('click', saveDiagnoseReport);
    (_v = document.getElementById('previewDiagnoseBtn')) === null || _v === void 0 ? void 0 : _v.addEventListener('click', previewDiagnosePDF);
    (_w = document.getElementById('diagnoseModal')) === null || _w === void 0 ? void 0 : _w.addEventListener('click', (e) => {
        if (e.target.id === 'diagnoseModal')
            closeModal('diagnoseModal');
    });
    // Photo preview
    (_x = document.getElementById('photoFile')) === null || _x === void 0 ? void 0 : _x.addEventListener('change', (e) => {
        var _a;
        const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            var _a;
            document.getElementById('photoPreviewImg').src = (_a = ev.target) === null || _a === void 0 ? void 0 : _a.result;
            document.getElementById('photoPreview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    });
    // Customer phone lookup
    (_y = document.getElementById('custPhone')) === null || _y === void 0 ? void 0 : _y.addEventListener('input', (e) => {
        lookupCustomer(e.target.value.trim());
    });
    // Filters
    (_z = document.getElementById('searchInput')) === null || _z === void 0 ? void 0 : _z.addEventListener('input', applyFilters);
    (_0 = document.getElementById('statusFilter')) === null || _0 === void 0 ? void 0 : _0.addEventListener('change', applyFilters);
    (_1 = document.getElementById('ageFilter')) === null || _1 === void 0 ? void 0 : _1.addEventListener('change', applyFilters);
    // Mobile menu
    (_2 = document.getElementById('menuBtn')) === null || _2 === void 0 ? void 0 : _2.addEventListener('click', () => {
        var _a;
        (_a = document.getElementById('sidebar')) === null || _a === void 0 ? void 0 : _a.classList.toggle('open');
    });
    // Export button
    (_3 = document.getElementById('exportBtn')) === null || _3 === void 0 ? void 0 : _3.addEventListener('click', openExportModal);
    (_4 = document.getElementById('closeExportModal')) === null || _4 === void 0 ? void 0 : _4.addEventListener('click', () => closeModal('exportModal'));
    (_5 = document.getElementById('cancelExportBtn')) === null || _5 === void 0 ? void 0 : _5.addEventListener('click', () => closeModal('exportModal'));
    (_6 = document.getElementById('confirmExportBtn')) === null || _6 === void 0 ? void 0 : _6.addEventListener('click', exportToExcel);
    // Export filter preview
    (_7 = document.getElementById('exportDateFrom')) === null || _7 === void 0 ? void 0 : _7.addEventListener('change', updateExportPreview);
    (_8 = document.getElementById('exportDateTo')) === null || _8 === void 0 ? void 0 : _8.addEventListener('change', updateExportPreview);
    (_9 = document.getElementById('exportStatus')) === null || _9 === void 0 ? void 0 : _9.addEventListener('change', updateExportPreview);
    // Close export modal on overlay click
    (_10 = document.getElementById('exportModal')) === null || _10 === void 0 ? void 0 : _10.addEventListener('click', (e) => {
        if (e.target.id === 'exportModal')
            closeModal('exportModal');
    });
}
function openExportModal() {
    // Double-check manager role
    if (!currentUser || currentUser.role !== 'manager') {
        showToast('Access denied. Managers only.', 'error');
        return;
    }
    // Set default dates: first day of current month to today
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const toStr = now.toISOString().split('T')[0];
    const fromStr = from.toISOString().split('T')[0];
    document.getElementById('exportDateFrom').value = fromStr;
    document.getElementById('exportDateTo').value = toStr;
    document.getElementById('exportStatus').value = '';
    document.getElementById('exportModal').classList.remove('hidden');
    updateExportPreview();
}
function updateExportPreview() {
    const from = document.getElementById('exportDateFrom').value;
    const to = document.getElementById('exportDateTo').value;
    const status = document.getElementById('exportStatus').value;
    let filtered = allTickets.filter(t => {
        const created = new Date(t.created_at);
        const matchFrom = !from || created >= new Date(from);
        const matchTo = !to || created <= new Date(to + 'T23:59:59');
        const matchStatus = !status || t.status === status;
        return matchFrom && matchTo && matchStatus;
    });
    const preview = document.getElementById('exportPreview');
    preview.innerHTML = `
    <span style="color:var(--yellow);font-size:20px;font-weight:800;">${filtered.length}</span>
    <span style="color:var(--white);"> tickets will be exported</span>
  `;
}
async function exportToExcel() {
    // Security check — manager only
    if (!currentUser || currentUser.role !== 'manager') {
        showToast('Access denied. Managers only.', 'error');
        return;
    }
    const from = document.getElementById('exportDateFrom').value;
    const to = document.getElementById('exportDateTo').value;
    const status = document.getElementById('exportStatus').value;
    const btn = document.getElementById('confirmExportBtn');
    const btnText = document.getElementById('exportBtnText');
    const spinner = document.getElementById('exportSpinner');
    btn.disabled = true;
    btnText.textContent = 'Preparing...';
    spinner.classList.remove('hidden');
    try {
        // Fetch full ticket data with joins
        let query = db
            .from('tickets')
            .select(`
        ticket_number, status, device_type, device_brand, device_model,
        issue_description, quoted_price, internal_notes,
        created_at, estimated_completion, completed_at, collected_at,
        customers (name, phone, email),
        assignee:users!tickets_assigned_to_fkey (full_name)
      `)
            .order('created_at', { ascending: false });
        if (from)
            query = query.gte('created_at', from);
        if (to)
            query = query.lte('created_at', to + 'T23:59:59');
        if (status)
            query = query.eq('status', status);
        const { data, error } = await query;
        if (error)
            throw error;
        if (!data || data.length === 0) {
            showToast('No tickets found to export', 'error');
            return;
        }
        const statusLabels = {
            diagnosing: 'Diagnosing', repairing: 'Repairing',
            finished: 'Finished', ready_pickup: 'Ready for Pickup', collected: 'Collected'
        };
        // Build rows
        const rows = data.map((t) => {
            var _a, _b, _c;
            return ({
                'Ticket No.': t.ticket_number,
                'Status': statusLabels[t.status] || t.status,
                'Customer Name': ((_a = t.customers) === null || _a === void 0 ? void 0 : _a.name) || '—',
                'Phone': ((_b = t.customers) === null || _b === void 0 ? void 0 : _b.phone) || '—',
                'Email': ((_c = t.customers) === null || _c === void 0 ? void 0 : _c.email) || '—',
                'Device Type': t.device_type,
                'Device Brand': t.device_brand || '—',
                'Device Model': t.device_model || '—',
                'Issue': t.issue_description,
                'Internal Notes': t.internal_notes || '—',
                'Date Received': t.created_at ? new Date(t.created_at).toLocaleDateString('en-MY') : '—',
                'Est. Completion': t.estimated_completion ? new Date(t.estimated_completion).toLocaleDateString('en-MY') : '—',
                'Date Completed': t.completed_at ? new Date(t.completed_at).toLocaleDateString('en-MY') : '—',
                'Date Collected': t.collected_at ? new Date(t.collected_at).toLocaleDateString('en-MY') : '—',
            });
        });
        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        // Column widths
        ws['!cols'] = [
            { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 15 }, { wch: 25 },
            { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 35 },
            { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
        // Filename with date
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const filename = `AbangPC_Tickets_${dateStr}.xlsx`;
        XLSX.writeFile(wb, filename);
        closeModal('exportModal');
        showToast(`✅ Exported ${rows.length} tickets!`, 'success');
    }
    catch (err) {
        showToast(err.message || 'Export failed', 'error');
    }
    finally {
        btn.disabled = false;
        btnText.textContent = '⬇️ Download Excel';
        spinner.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}
// =============================================
// DIAGNOSE DROPDOWN MENU
// =============================================
function toggleDiagMenu(ticketId, event) {
    event.stopPropagation();
    closeDiagMenus();
    const menu = document.getElementById(`diagMenu_${ticketId}`);
    if (menu)
        menu.classList.toggle('hidden');
}
function closeDiagMenus() {
    document.querySelectorAll('.diag-dropdown-menu').forEach(m => m.classList.add('hidden'));
}
// Close menus when clicking outside
document.addEventListener('click', closeDiagMenus);
// =============================================
// LAPTOP DIAGNOSE REPORT
// =============================================
let currentLaptopDiagnoseReport = null;
async function openLaptopDiagnoseModal(ticketId) {
    var _a;
    selectedTicketId = ticketId;
    currentLaptopDiagnoseReport = null;
    // Reset all fields
    const fields = [
        'ldiag_customer_name', 'ldiag_laptop_model', 'ldiag_date', 'ldiag_done_by', 'ldiag_supplier',
        'ldiag_cpu_temp', 'ldiag_cpu_remark',
        'ldiag_mobo_temp', 'ldiag_mobo_remark',
        'ldiag_ram_temp', 'ldiag_ram_remark',
        'ldiag_ssd_temp', 'ldiag_ssd_remark',
        'ldiag_gpu_before_temp', 'ldiag_gpu_before_remark',
        'ldiag_gpu_after_temp', 'ldiag_gpu_fps', 'ldiag_gpu_min_fps', 'ldiag_gpu_max_fps',
        'ldiag_battery_health', 'ldiag_battery_current', 'ldiag_battery_design',
        'ldiag_windows', 'ldiag_adapter',
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.value = '';
    });
    const selects = [
        'ldiag_keyboard', 'ldiag_touchpad', 'ldiag_speaker_left', 'ldiag_speaker_right',
        'ldiag_wifi', 'ldiag_port', 'ldiag_camera', 'ldiag_touchscreen', 'ldiag_body', 'ldiag_hinges'
    ];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.value = '';
    });
    // Set defaults
    document.getElementById('ldiag_date').value = new Date().toISOString().split('T')[0];
    document.getElementById('ldiag_done_by').value = currentUser.full_name || '';
    // Prefill customer name
    const { data: ticket } = await db
        .from('tickets')
        .select('*, customers(name)')
        .eq('id', ticketId)
        .single();
    if ((_a = ticket === null || ticket === void 0 ? void 0 : ticket.customers) === null || _a === void 0 ? void 0 : _a.name) {
        document.getElementById('ldiag_customer_name').value = ticket.customers.name;
    }
    // Check for existing report
    const { data: existing } = await db
        .from('diagnose_laptop_reports')
        .select('*')
        .eq('ticket_id', ticketId)
        .single();
    if (existing) {
        currentLaptopDiagnoseReport = existing;
        populateLaptopDiagnoseForm(existing);
        document.getElementById('laptopDiagnoseBtnText').textContent = '💾 Update & Regenerate PDF';
    }
    else {
        document.getElementById('laptopDiagnoseBtnText').textContent = '💾 Save & Generate PDF';
    }
    document.getElementById('laptopDiagnoseModal').classList.remove('hidden');
}
function populateLaptopDiagnoseForm(data) {
    const map = {
        'ldiag_customer_name': data.customer_name,
        'ldiag_laptop_model': data.laptop_model,
        'ldiag_date': data.report_date,
        'ldiag_done_by': data.done_by,
        'ldiag_supplier': data.supplier || '',
        'ldiag_cpu_temp': data.cpu_temp, 'ldiag_cpu_remark': data.cpu_remark,
        'ldiag_mobo_temp': data.mobo_temp || '', 'ldiag_mobo_remark': data.mobo_remark,
        'ldiag_ram_temp': data.ram_temp || '', 'ldiag_ram_remark': data.ram_remark,
        'ldiag_ssd_temp': data.ssd_temp, 'ldiag_ssd_remark': data.ssd_remark,
        'ldiag_gpu_before_temp': data.gpu_before_temp, 'ldiag_gpu_before_remark': data.gpu_before_remark || '',
        'ldiag_gpu_after_temp': data.gpu_after_temp,
        'ldiag_gpu_fps': data.gpu_fps || '', 'ldiag_gpu_min_fps': data.gpu_min_fps || '', 'ldiag_gpu_max_fps': data.gpu_max_fps || '',
        'ldiag_battery_health': data.battery_health, 'ldiag_battery_current': data.battery_current, 'ldiag_battery_design': data.battery_design,
        'ldiag_windows': data.windows_remark, 'ldiag_adapter': data.adapter_remark,
    };
    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val)
            el.value = val;
    });
    const selectMap = {
        'ldiag_keyboard': data.keyboard_remark,
        'ldiag_touchpad': data.touchpad_remark,
        'ldiag_speaker_left': data.speaker_left,
        'ldiag_speaker_right': data.speaker_right,
        'ldiag_wifi': data.wifi_remark,
        'ldiag_port': data.port_remark,
        'ldiag_camera': data.camera_remark,
        'ldiag_touchscreen': data.touchscreen_remark,
        'ldiag_body': data.body_remark,
        'ldiag_hinges': data.hinges_remark,
    };
    Object.entries(selectMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val)
            el.value = val;
    });
}
function getLaptopDiagnoseFormData() {
    const g = (id) => { var _a, _b; return ((_b = (_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.trim()) || ''; };
    const gpuRemark = [
        g('ldiag_gpu_fps') ? `FPS: ${g('ldiag_gpu_fps')}` : '',
        g('ldiag_gpu_min_fps') ? `MIN FPS: ${g('ldiag_gpu_min_fps')}` : '',
        g('ldiag_gpu_max_fps') ? `MAX FPS: ${g('ldiag_gpu_max_fps')}` : '',
    ].filter(Boolean).join('  ');
    return {
        ticket_id: selectedTicketId,
        customer_name: g('ldiag_customer_name'),
        laptop_model: g('ldiag_laptop_model'),
        report_date: g('ldiag_date'),
        done_by: g('ldiag_done_by'),
        supplier: g('ldiag_supplier'),
        cpu_temp: g('ldiag_cpu_temp'), cpu_remark: g('ldiag_cpu_remark'),
        mobo_temp: g('ldiag_mobo_temp'), mobo_remark: g('ldiag_mobo_remark'),
        ram_temp: g('ldiag_ram_temp'), ram_remark: g('ldiag_ram_remark'),
        ssd_temp: g('ldiag_ssd_temp'), ssd_remark: g('ldiag_ssd_remark'),
        gpu_before_temp: g('ldiag_gpu_before_temp'), gpu_before_remark: g('ldiag_gpu_before_remark'),
        gpu_after_temp: g('ldiag_gpu_after_temp'), gpu_remark: gpuRemark,
        gpu_fps: g('ldiag_gpu_fps'), gpu_min_fps: g('ldiag_gpu_min_fps'), gpu_max_fps: g('ldiag_gpu_max_fps'),
        keyboard_remark: g('ldiag_keyboard'),
        touchpad_remark: g('ldiag_touchpad'),
        battery_health: g('ldiag_battery_health'),
        battery_current: g('ldiag_battery_current'),
        battery_design: g('ldiag_battery_design'),
        speaker_left: g('ldiag_speaker_left'),
        speaker_right: g('ldiag_speaker_right'),
        wifi_remark: g('ldiag_wifi'),
        port_remark: g('ldiag_port'),
        windows_remark: g('ldiag_windows'),
        camera_remark: g('ldiag_camera'),
        touchscreen_remark: g('ldiag_touchscreen'),
        body_remark: g('ldiag_body'),
        hinges_remark: g('ldiag_hinges'),
        adapter_remark: g('ldiag_adapter'),
    };
}
function generateLaptopDiagnosePDF(data, ticketNumber) {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = 15;
    // ---- HEADER ----
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, pageW, 35, 'F');
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 197, 24);
    doc.text('AbangPC', margin, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('PT 10006(G), Phase 2A, Jalan BBN 1/3D, Putra Point, 71800 Nilai', margin, y + 15);
    doc.text('Tel: 019-770 7324  |  abangpcofficial@gmail.com', margin, y + 21);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 197, 24);
    doc.text('BORANG DIAGNOSE LAPTOP', pageW - margin, y + 8, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`Tiket: ${ticketNumber}`, pageW - margin, y + 15, { align: 'right' });
    doc.text(`Tarikh: ${data.report_date ? new Date(data.report_date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}`, pageW - margin, y + 21, { align: 'right' });
    y = 42;
    // ---- CUSTOMER INFO ----
    doc.setFillColor(35, 35, 35);
    doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('NAMA:', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(245, 197, 24);
    doc.text(data.customer_name || '—', margin + 22, y + 7);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('MODEL:', pageW / 2 + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(245, 197, 24);
    doc.text(data.laptop_model || '—', pageW / 2 + 22, y + 7);
    y = 58;
    // ---- TABLE HEADER ----
    doc.setFillColor(245, 197, 24);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text('ITEM', margin + 2, y + 5.5);
    doc.text('SUHU (°C)', margin + 52, y + 5.5);
    doc.text('REMARK', margin + 82, y + 5.5);
    y += 8;
    // ---- ROWS ----
    const statusColor = (val) => {
        if (val === 'OK')
            return [74, 222, 128];
        if (['ROSAK', 'PECAH'].includes(val))
            return [239, 68, 68];
        if (['LEMAH', 'PARTIAL', 'LONGGAR', 'CALAR'].includes(val))
            return [251, 146, 60];
        if (['TIADA'].includes(val))
            return [160, 160, 160];
        return [200, 200, 200];
    };
    const rows = [
        { item: 'CPU', temp: data.cpu_temp, remark: data.cpu_remark, isSelect: false },
        { item: 'MOBO', temp: data.mobo_temp || '—', remark: data.mobo_remark, isSelect: false },
        { item: 'RAM', temp: data.ram_temp || '—', remark: data.ram_remark, isSelect: false },
        { item: 'SSD', temp: data.ssd_temp, remark: data.ssd_remark, isSelect: false },
        { item: 'GPU (before)', temp: data.gpu_before_temp, remark: data.gpu_before_remark, isSelect: false },
        { item: 'GPU (after)', temp: data.gpu_after_temp, remark: data.gpu_remark, isSelect: false },
        { item: 'Keyboard', temp: '—', remark: data.keyboard_remark, isSelect: true },
        { item: 'Touchpad', temp: '—', remark: data.touchpad_remark, isSelect: true },
        { item: 'Battery Health', temp: data.battery_health, remark: `${data.battery_current || '—'} / ${data.battery_design || '—'} mWh`, isSelect: false },
        { item: 'Speaker', temp: '—', remark: `Left: ${data.speaker_left || '—'}  Right: ${data.speaker_right || '—'}`, isSelect: false },
        { item: 'WI-FI', temp: '—', remark: data.wifi_remark, isSelect: true },
        { item: 'Port Laptop', temp: '—', remark: data.port_remark, isSelect: true },
        { item: 'Windows', temp: '—', remark: data.windows_remark, isSelect: false },
        { item: 'Camera', temp: '—', remark: data.camera_remark, isSelect: true },
        { item: 'Touchscreen', temp: '—', remark: data.touchscreen_remark, isSelect: true },
        { item: 'Body', temp: '—', remark: data.body_remark, isSelect: true },
        { item: 'Hinges', temp: '—', remark: data.hinges_remark, isSelect: true },
        { item: 'Adapter', temp: '—', remark: data.adapter_remark, isSelect: false },
    ];
    rows.forEach((row, i) => {
        const rowH = 10;
        const bg = i % 2 === 0 ? [40, 40, 40] : [30, 30, 30];
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(margin, y, contentW, rowH, 'F');
        // Borders
        doc.setDrawColor(60, 60, 60);
        doc.line(margin, y, margin, y + rowH);
        doc.line(margin + 50, y, margin + 50, y + rowH);
        doc.line(margin + 80, y, margin + 80, y + rowH);
        doc.line(margin + contentW, y, margin + contentW, y + rowH);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
        // Item
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(245, 197, 24);
        doc.text(row.item, margin + 2, y + 6.5);
        // Temp
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 200);
        doc.text(row.temp || '—', margin + 52, y + 6.5);
        // Remark with color
        if (row.isSelect && row.remark) {
            const sc = statusColor(row.remark);
            doc.setTextColor(sc[0], sc[1], sc[2]);
            doc.setFont('helvetica', 'bold');
        }
        else {
            doc.setTextColor(200, 200, 200);
            doc.setFont('helvetica', 'normal');
        }
        const remarkLines = doc.splitTextToSize(row.remark || '—', contentW - 82);
        doc.text(remarkLines[0] || '—', margin + 82, y + 6.5);
        y += rowH;
    });
    y += 10;
    // ---- FOOTER ----
    doc.setDrawColor(60, 60, 60);
    doc.line(margin, y, margin + contentW, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 200, 200);
    doc.text('DONE BY:', margin, y);
    doc.setTextColor(245, 197, 24);
    doc.text(data.done_by || '—', margin + 24, y);
    if (data.supplier) {
        doc.setTextColor(200, 200, 200);
        doc.setFont('helvetica', 'bold');
        doc.text('SUPPLIER:', pageW / 2 - 20, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(245, 197, 24);
        doc.text(data.supplier, pageW / 2 + 8, y);
    }
    doc.setTextColor(200, 200, 200);
    doc.setFont('helvetica', 'bold');
    doc.text('TARIKH:', pageW - margin - 50, y);
    doc.setTextColor(245, 197, 24);
    doc.text(data.report_date ? new Date(data.report_date).toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—', pageW - margin - 28, y);
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text('AbangPC – PT 10006(G), Phase 2A, Jalan BBN 1/3D, Putra Point, 71800 Nilai | 019-770 7324', pageW / 2, 290, { align: 'center' });
    return doc;
}
async function saveLaptopDiagnoseReport() {
    const btn = document.getElementById('saveLaptopDiagnoseBtn');
    const btnText = document.getElementById('laptopDiagnoseBtnText');
    const spinner = document.getElementById('laptopDiagnoseSpinner');
    btn.disabled = true;
    btnText.textContent = 'Generating...';
    spinner.classList.remove('hidden');
    try {
        const formData = getLaptopDiagnoseFormData();
        if (!formData.customer_name) {
            showToast('Sila masukkan nama pelanggan', 'error');
            return;
        }
        const { data: ticket } = await db
            .from('tickets')
            .select('ticket_number')
            .eq('id', selectedTicketId)
            .single();
        const ticketNumber = (ticket === null || ticket === void 0 ? void 0 : ticket.ticket_number) || 'UNKNOWN';
        const doc = generateLaptopDiagnosePDF(formData, ticketNumber);
        const pdfBlob = doc.output('blob');
        const fileName = `diagnose/laptop_${ticketNumber}_${Date.now()}.pdf`;
        const { error: uploadErr } = await db.storage
            .from('ticket-photos')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });
        if (uploadErr)
            throw uploadErr;
        const { data: urlData } = db.storage.from('ticket-photos').getPublicUrl(fileName);
        formData.pdf_url = urlData.publicUrl;
        let dbError;
        if (currentLaptopDiagnoseReport) {
            const { error } = await db.from('diagnose_laptop_reports').update(formData).eq('id', currentLaptopDiagnoseReport.id);
            dbError = error;
        }
        else {
            const { error } = await db.from('diagnose_laptop_reports').insert(formData);
            dbError = error;
        }
        if (dbError)
            throw dbError;
        doc.save(`AbangPC_DiagnoseLaptop_${ticketNumber}.pdf`);
        closeModal('laptopDiagnoseModal');
        showToast('✅ Laporan diagnose laptop berjaya disimpan!', 'success');
    }
    catch (err) {
        showToast(err.message || 'Gagal menjana laporan', 'error');
    }
    finally {
        btn.disabled = false;
        btnText.textContent = '💾 Save & Generate PDF';
        spinner.classList.add('hidden');
    }
}
function previewLaptopDiagnosePDF() {
    const formData = getLaptopDiagnoseFormData();
    const doc = generateLaptopDiagnosePDF(formData, 'PREVIEW');
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
}
// =============================================
// DIAGNOSE REPORT
// =============================================
let currentDiagnoseReport = null;
async function openDiagnoseModal(ticketId) {
    var _a;
    selectedTicketId = ticketId;
    currentDiagnoseReport = null;
    // Reset form
    const fields = [
        'diag_customer_name', 'diag_date', 'diag_done_by', 'diag_notes',
        'diag_cpu_spec', 'diag_cpu_temp', 'diag_cpu_remark',
        'diag_mobo_spec', 'diag_mobo_temp', 'diag_mobo_remark',
        'diag_ram_spec', 'diag_ram_temp', 'diag_ram_remark',
        'diag_ssd_spec', 'diag_ssd_temp', 'diag_ssd_remark',
        'diag_gpu_spec', 'diag_gpu_temp', 'diag_gpu_remark',
        'diag_psu_spec', 'diag_psu_temp', 'diag_psu_remark',
        'diag_casing_spec', 'diag_casing_temp', 'diag_casing_remark',
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.value = '';
    });
    const selects = [
        'diag_cpu_condition', 'diag_mobo_condition', 'diag_ram_condition',
        'diag_ssd_condition', 'diag_gpu_condition', 'diag_psu_condition',
        'diag_casing_condition', 'diag_casing_power', 'diag_casing_reset', 'diag_casing_usb'
    ];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.value = '';
    });
    // Set default date to today
    document.getElementById('diag_date').value =
        new Date().toISOString().split('T')[0];
    // Set done by to current user
    document.getElementById('diag_done_by').value =
        currentUser.full_name || '';
    // Load ticket info to prefill customer name
    const { data: ticket } = await db
        .from('tickets')
        .select('*, customers(name)')
        .eq('id', ticketId)
        .single();
    if ((_a = ticket === null || ticket === void 0 ? void 0 : ticket.customers) === null || _a === void 0 ? void 0 : _a.name) {
        document.getElementById('diag_customer_name').value =
            ticket.customers.name;
    }
    // Check if existing report
    const { data: existing } = await db
        .from('diagnose_reports')
        .select('*')
        .eq('ticket_id', ticketId)
        .single();
    if (existing) {
        currentDiagnoseReport = existing;
        populateDiagnoseForm(existing);
        document.getElementById('saveDiagnoseBtn')
            .querySelector('#diagnoseBtnText').textContent = '💾 Update & Regenerate PDF';
    }
    else {
        document.getElementById('diagnoseBtnText').textContent = '💾 Save & Generate PDF';
    }
    document.getElementById('diagnoseModal').classList.remove('hidden');
}
function populateDiagnoseForm(data) {
    const map = {
        'diag_customer_name': data.customer_name,
        'diag_date': data.report_date,
        'diag_done_by': data.done_by,
        'diag_notes': data.notes || '',
        'diag_cpu_spec': data.cpu_spec, 'diag_cpu_temp': data.cpu_temp, 'diag_cpu_remark': data.cpu_remark,
        'diag_mobo_spec': data.mobo_spec, 'diag_mobo_temp': data.mobo_temp, 'diag_mobo_remark': data.mobo_remark,
        'diag_ram_spec': data.ram_spec, 'diag_ram_temp': data.ram_temp, 'diag_ram_remark': data.ram_remark,
        'diag_ssd_spec': data.ssd_spec, 'diag_ssd_temp': data.ssd_temp, 'diag_ssd_remark': data.ssd_remark,
        'diag_gpu_spec': data.gpu_spec, 'diag_gpu_temp': data.gpu_temp, 'diag_gpu_remark': data.gpu_remark,
        'diag_psu_spec': data.psu_spec, 'diag_psu_temp': data.psu_temp || '', 'diag_psu_remark': data.psu_remark,
        'diag_casing_spec': data.casing_spec, 'diag_casing_temp': '', 'diag_casing_remark': data.casing_remark,
    };
    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val)
            el.value = val;
    });
    const selectMap = {
        'diag_cpu_condition': data.cpu_condition,
        'diag_mobo_condition': data.mobo_condition,
        'diag_ram_condition': data.ram_condition,
        'diag_ssd_condition': data.ssd_condition,
        'diag_gpu_condition': data.gpu_condition,
        'diag_psu_condition': data.psu_condition,
        'diag_casing_condition': data.casing_condition,
        'diag_casing_power': data.casing_power_button,
        'diag_casing_reset': data.casing_reset_button,
        'diag_casing_usb': data.casing_usb_port,
    };
    Object.entries(selectMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val)
            el.value = val;
    });
}
function getDiagnoseFormData() {
    const g = (id) => { var _a, _b; return ((_b = (_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.trim()) || ''; };
    return {
        ticket_id: selectedTicketId,
        customer_name: g('diag_customer_name'),
        report_date: g('diag_date'),
        done_by: g('diag_done_by'),
        notes: g('diag_notes'),
        cpu_spec: g('diag_cpu_spec'), cpu_temp: g('diag_cpu_temp'),
        cpu_condition: g('diag_cpu_condition'), cpu_remark: g('diag_cpu_remark'),
        mobo_spec: g('diag_mobo_spec'), mobo_temp: g('diag_mobo_temp'),
        mobo_condition: g('diag_mobo_condition'), mobo_remark: g('diag_mobo_remark'),
        ram_spec: g('diag_ram_spec'), ram_temp: g('diag_ram_temp'),
        ram_condition: g('diag_ram_condition'), ram_remark: g('diag_ram_remark'),
        ssd_spec: g('diag_ssd_spec'), ssd_temp: g('diag_ssd_temp'),
        ssd_condition: g('diag_ssd_condition'), ssd_remark: g('diag_ssd_remark'),
        gpu_spec: g('diag_gpu_spec'), gpu_temp: g('diag_gpu_temp'),
        gpu_condition: g('diag_gpu_condition'), gpu_remark: g('diag_gpu_remark'),
        psu_spec: g('diag_psu_spec'), psu_condition: g('diag_psu_condition'), psu_remark: g('diag_psu_remark'),
        casing_spec: g('diag_casing_spec'), casing_condition: g('diag_casing_condition'),
        casing_power_button: g('diag_casing_power'),
        casing_reset_button: g('diag_casing_reset'),
        casing_usb_port: g('diag_casing_usb'),
        casing_remark: g('diag_casing_remark'),
    };
}
function generateDiagnosePDF(data, ticketNumber) {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = 15;
    // ---- HEADER ----
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, pageW, 35, 'F');
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 197, 24);
    doc.text('AbangPC', margin, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('PT 10006(G), Phase 2A, Jalan BBN 1/3D, Putra Point, 71800 Nilai', margin, y + 15);
    doc.text('Tel: 019-770 7324  |  abangpcofficial@gmail.com', margin, y + 21);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(245, 197, 24);
    doc.text('BORANG DIAGNOS', pageW - margin, y + 8, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`Tiket: ${ticketNumber}`, pageW - margin, y + 15, { align: 'right' });
    doc.text(`Tarikh: ${data.report_date ? new Date(data.report_date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}`, pageW - margin, y + 21, { align: 'right' });
    y = 42;
    // ---- CUSTOMER INFO ----
    doc.setFillColor(35, 35, 35);
    doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('NAMA:', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(245, 197, 24);
    doc.text(data.customer_name || '—', margin + 22, y + 7);
    y = 58;
    // ---- TABLE HEADER ----
    const cols = [
        { label: 'ITEM', x: margin, w: 22 },
        { label: 'SPESIFIKASI', x: margin + 22, w: 65 },
        { label: 'SUHU (°C)', x: margin + 87, w: 22 },
        { label: 'CONDITION', x: margin + 109, w: 28 },
        { label: 'REMARK', x: margin + 137, w: contentW - 137 + margin - margin },
    ];
    doc.setFillColor(245, 197, 24);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    cols.forEach(col => {
        doc.text(col.label, col.x + 2, y + 5.5);
    });
    y += 8;
    // ---- TABLE ROWS ----
    const rows = [
        { item: 'CPU', spec: data.cpu_spec, temp: data.cpu_temp, cond: data.cpu_condition, remark: data.cpu_remark },
        { item: 'MOBO', spec: data.mobo_spec, temp: data.mobo_temp, cond: data.mobo_condition, remark: data.mobo_remark },
        { item: 'RAM', spec: data.ram_spec, temp: data.ram_temp, cond: data.ram_condition, remark: data.ram_remark },
        { item: 'SSD', spec: data.ssd_spec, temp: data.ssd_temp, cond: data.ssd_condition, remark: data.ssd_remark },
        { item: 'GPU', spec: data.gpu_spec, temp: data.gpu_temp, cond: data.gpu_condition, remark: data.gpu_remark },
        { item: 'PSU', spec: data.psu_spec, temp: '—', cond: data.psu_condition, remark: data.psu_remark },
    ];
    rows.forEach((row, i) => {
        const rowH = 12;
        const bg = i % 2 === 0 ? [40, 40, 40] : [30, 30, 30];
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(margin, y, contentW, rowH, 'F');
        // Draw vertical borders
        cols.forEach(col => {
            doc.setDrawColor(60, 60, 60);
            doc.line(col.x, y, col.x, y + rowH);
        });
        doc.line(margin + contentW, y, margin + contentW, y + rowH);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);
        // Item label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(245, 197, 24);
        doc.text(row.item, cols[0].x + 2, y + 7.5);
        // Spec
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(220, 220, 220);
        const specLines = doc.splitTextToSize(row.spec || '—', cols[1].w - 4);
        doc.text(specLines[0] || '—', cols[1].x + 2, y + 7.5);
        // Temp
        doc.text(row.temp || '—', cols[2].x + 2, y + 7.5);
        // Condition with color
        const condColor = {
            'OK': [74, 222, 128],
            'ROSAK': [239, 68, 68],
            'LEMAH': [251, 146, 60],
            'PERLU TUKAR': [239, 68, 68],
        };
        const cc = condColor[row.cond || ''] || [160, 160, 160];
        doc.setTextColor(cc[0], cc[1], cc[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(row.cond || '—', cols[3].x + 2, y + 7.5);
        // Remark
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 200);
        doc.text(row.remark || '—', cols[4].x + 2, y + 7.5);
        y += rowH;
    });
    // ---- CASING ROW (special) ----
    const casingH = 22;
    doc.setFillColor(45, 45, 45);
    doc.rect(margin, y, contentW, casingH, 'F');
    cols.forEach(col => {
        doc.setDrawColor(60, 60, 60);
        doc.line(col.x, y, col.x, y + casingH);
    });
    doc.line(margin + contentW, y, margin + contentW, y + casingH);
    doc.line(margin, y + casingH, margin + contentW, y + casingH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(245, 197, 24);
    doc.text('CASING', cols[0].x + 2, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 220);
    doc.text(data.casing_spec || '—', cols[1].x + 2, y + 7);
    doc.text('—', cols[2].x + 2, y + 12);
    const casingCond = data.casing_condition || '';
    const casingColor = casingCond === 'OK' ? [74, 222, 128] : casingCond ? [239, 68, 68] : [160, 160, 160];
    doc.setTextColor(casingColor[0], casingColor[1], casingColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(casingCond || '—', cols[3].x + 2, y + 12);
    // Casing remarks
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const statusColor = (val) => val === 'OK' ? [74, 222, 128] : val === 'ROSAK' ? [239, 68, 68] : [160, 160, 160];
    doc.setTextColor(160, 160, 160);
    doc.text('POWER BUTTON:', cols[4].x + 2, y + 6);
    const pc = statusColor(data.casing_power_button || '');
    doc.setTextColor(pc[0], pc[1], pc[2]);
    doc.text(data.casing_power_button || '—', cols[4].x + 32, y + 6);
    doc.setTextColor(160, 160, 160);
    doc.text('RESET BUTTON:', cols[4].x + 2, y + 12);
    const rc = statusColor(data.casing_reset_button || '');
    doc.setTextColor(rc[0], rc[1], rc[2]);
    doc.text(data.casing_reset_button || '—', cols[4].x + 30, y + 12);
    doc.setTextColor(160, 160, 160);
    doc.text('USB PORT:', cols[4].x + 2, y + 18);
    const uc = statusColor(data.casing_usb_port || '');
    doc.setTextColor(uc[0], uc[1], uc[2]);
    doc.text(data.casing_usb_port || '—', cols[4].x + 22, y + 18);
    y += casingH + 10;
    // ---- NOTES ----
    if (data.notes) {
        doc.setFillColor(35, 35, 35);
        doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(245, 197, 24);
        doc.text('NOTA:', margin + 4, y + 8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 200, 200);
        doc.text(data.notes, margin + 20, y + 8);
        y += 18;
    }
    // ---- FOOTER ----
    y += 5;
    doc.setDrawColor(60, 60, 60);
    doc.line(margin, y, margin + contentW, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 200, 200);
    doc.text('DONE BY:', margin, y);
    doc.setTextColor(245, 197, 24);
    doc.text(data.done_by || '—', margin + 24, y);
    doc.setTextColor(200, 200, 200);
    doc.text('TARIKH:', pageW - margin - 50, y);
    doc.setTextColor(245, 197, 24);
    doc.text(data.report_date ? new Date(data.report_date).toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—', pageW - margin - 30, y);
    // Page footer
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text('AbangPC – PT 10006(G), Phase 2A, Jalan BBN 1/3D, Putra Point, 71800 Nilai | 019-770 7324', pageW / 2, 290, { align: 'center' });
    return doc;
}
async function saveDiagnoseReport() {
    const btn = document.getElementById('saveDiagnoseBtn');
    const btnText = document.getElementById('diagnoseBtnText');
    const spinner = document.getElementById('diagnoseSpinner');
    btn.disabled = true;
    btnText.textContent = 'Generating...';
    spinner.classList.remove('hidden');
    try {
        const formData = getDiagnoseFormData();
        if (!formData.customer_name) {
            showToast('Sila masukkan nama pelanggan', 'error');
            return;
        }
        // Get ticket number
        const { data: ticket } = await db
            .from('tickets')
            .select('ticket_number')
            .eq('id', selectedTicketId)
            .single();
        const ticketNumber = (ticket === null || ticket === void 0 ? void 0 : ticket.ticket_number) || 'UNKNOWN';
        // Generate PDF
        const doc = generateDiagnosePDF(formData, ticketNumber);
        const pdfBlob = doc.output('blob');
        // Upload PDF to Supabase Storage
        const fileName = `diagnose/${ticketNumber}_${Date.now()}.pdf`;
        const { error: uploadErr } = await db.storage
            .from('ticket-photos')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });
        if (uploadErr)
            throw uploadErr;
        // Get public URL
        const { data: urlData } = db.storage
            .from('ticket-photos')
            .getPublicUrl(fileName);
        formData.pdf_url = urlData.publicUrl;
        // Save or update in database
        let dbError;
        if (currentDiagnoseReport) {
            const { error } = await db
                .from('diagnose_reports')
                .update(formData)
                .eq('id', currentDiagnoseReport.id);
            dbError = error;
        }
        else {
            const { error } = await db
                .from('diagnose_reports')
                .insert(formData);
            dbError = error;
        }
        if (dbError)
            throw dbError;
        // Download PDF locally
        doc.save(`AbangPC_Diagnos_${ticketNumber}.pdf`);
        closeModal('diagnoseModal');
        showToast('✅ Laporan diagnos berjaya disimpan & dijana!', 'success');
    }
    catch (err) {
        showToast(err.message || 'Gagal menjana laporan', 'error');
    }
    finally {
        btn.disabled = false;
        btnText.textContent = '💾 Save & Generate PDF';
        spinner.classList.add('hidden');
    }
}
function previewDiagnosePDF() {
    const formData = getDiagnoseFormData();
    const doc = generateDiagnosePDF(formData, 'PREVIEW');
    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');
}
// =============================================
// DELETE TICKET
// =============================================
async function deleteTicket(ticketId, ticketNumber) {
    if (!confirm(`Are you sure you want to DELETE ticket ${ticketNumber}?\n\nThis will permanently delete:\n- Ticket data\n- Status history\n- Comments\n- Photos\n- Diagnose reports\n\nThis CANNOT be undone!`))
        return;
    try {
        // Delete in correct order
        await db.from('ticket_comments').delete().eq('ticket_id', ticketId);
        await db.from('ticket_photos').delete().eq('ticket_id', ticketId);
        await db.from('ticket_status_history').delete().eq('ticket_id', ticketId);
        await db.from('diagnose_reports').delete().eq('ticket_id', ticketId);
        await db.from('diagnose_laptop_reports').delete().eq('ticket_id', ticketId);
        const { error } = await db.from('tickets').delete().eq('id', ticketId);
        if (error)
            throw error;
        await loadTickets();
        showToast(`🗑️ Ticket ${ticketNumber} deleted!`, 'success');
    }
    catch (err) {
        showToast(err.message || 'Failed to delete ticket', 'error');
    }
}
// =============================================
// EXPOSE FUNCTIONS TO HTML (onclick handlers)
// ==============================================
window.openDetailModal = openDetailModal;
window.openStatusModal = openStatusModal;
window.openPhotoModal = openPhotoModal;
window.openDiagnoseModal = openDiagnoseModal;
window.deleteTicket = deleteTicket;
window.openLaptopDiagnoseModal = openLaptopDiagnoseModal;
window.toggleDiagMenu = toggleDiagMenu;
window.closeDiagMenus = closeDiagMenus;
window.addComment = addComment;
// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initDashboard);
