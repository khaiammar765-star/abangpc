// =============================================
// AbangPC - Calendar
// Shared calendar: shop closures + activities (owner-posted) and
// approved staff leave. Staff apply for leave; only AbangPC (superadmin)
// posts events and approves/rejects leave.
//
// Only APPROVED leave reaches the month grid. Pending and rejected
// requests live in the Leave Requests list below the grid.
// =============================================
let currentUser = null;
let staffById = {};
const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth(); // 0-11
let rejectingLeaveId = null;      // set while the reject-reason modal is open

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
const LEAVE_STATUS = {
    pending: '⏳ Pending',
    approved: '✅ Approved',
    rejected: '❌ Rejected',
};

// =============================================
// INIT
// =============================================
async function initCalendar() {
    try {
        currentUser = await SystemApp.requireManager();
        SystemApp.renderSidebar(currentUser, 'calendar');
        // Only the superadmin (AbangPC) posts events. Everyone applies for
        // leave and views. Hide the button for non-superadmins.
        if (!currentUser.is_superadmin) {
            const b = document.getElementById('addEventBtn');
            if (b) b.style.display = 'none';
        }
        await loadStaff();
        renderDow();
        bindEvents();
        await renderMonth();
        await loadLeaveRequests();
    }
    catch (err) {
        console.error(err);
    }
}

async function loadStaff() {
    const { data, error } = await db
        .from('users').select('id, full_name').eq('is_active', true);
    if (error) { SystemApp.showToast('Failed to load staff', 'error'); return; }
    staffById = {};
    (data || []).forEach(s => { staffById[s.id] = s.full_name; });
}

function renderDow() {
    document.getElementById('calDow').innerHTML =
        DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');
}

function bindEvents() {
    document.getElementById('menuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.getElementById('calPrev')?.addEventListener('click', () => shiftMonth(-1));
    document.getElementById('calNext')?.addEventListener('click', () => shiftMonth(1));

    document.getElementById('addEventBtn')?.addEventListener('click', openEventModal);
    document.getElementById('cancelEventBtn')?.addEventListener('click', () => SystemApp.closeModal('eventModal'));
    document.getElementById('closeEventModal')?.addEventListener('click', () => SystemApp.closeModal('eventModal'));
    document.getElementById('saveEventBtn')?.addEventListener('click', saveEvent);

    document.getElementById('applyLeaveBtn')?.addEventListener('click', openLeaveModal);
    document.getElementById('cancelLeaveBtn')?.addEventListener('click', () => SystemApp.closeModal('leaveModal'));
    document.getElementById('closeLeaveModal')?.addEventListener('click', () => SystemApp.closeModal('leaveModal'));
    document.getElementById('saveLeaveBtn')?.addEventListener('click', saveLeave);

    document.getElementById('cancelReasonBtn')?.addEventListener('click', () => SystemApp.closeModal('reasonModal'));
    document.getElementById('closeReasonModal')?.addEventListener('click', () => SystemApp.closeModal('reasonModal'));
    document.getElementById('confirmReasonBtn')?.addEventListener('click', confirmReject);
}

async function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    else if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    await renderMonth();
}

// =============================================
// MONTH GRID
// =============================================
function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; } // m is 0-11

// Cells for the month: leading/trailing nulls pad to whole weeks (Mon-start).
function buildMonthCells(y, m) {
    const startWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0 .. Sun=6
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

function monthBounds(y, m) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    return { first: ymd(y, m, 1), last: ymd(y, m, daysInMonth) };
}

// True when the entry's [start_date, end_date] covers dayStr (all ISO strings).
function overlaps(entry, dayStr) {
    return entry.start_date <= dayStr && entry.end_date >= dayStr;
}

async function renderMonth() {
    const grid = document.getElementById('calGrid');
    document.getElementById('calLabel').textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:var(--muted);">Loading...</div>`;

    const { first, last } = monthBounds(viewYear, viewMonth);

    // Events overlapping the month, and approved leave overlapping the month.
    const [{ data: events, error: e1 }, { data: leave, error: e2 }] = await Promise.all([
        db.from('calendar_events').select('*').lte('start_date', last).gte('end_date', first),
        db.from('staff_leave').select('*').eq('status', 'approved').lte('start_date', last).gte('end_date', first),
    ]);
    if (e1 || e2) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:var(--danger);">Failed to load calendar.</div>`;
        return;
    }

    const cells = buildMonthCells(viewYear, viewMonth);
    grid.innerHTML = cells.map(d => {
        if (d === null) return `<div class="cal-cell empty"></div>`;
        const dayStr = ymd(viewYear, viewMonth, d);
        const isToday = (viewYear === today.getFullYear() && viewMonth === today.getMonth() && d === today.getDate());

        const chips = [];
        (events || []).filter(ev => overlaps(ev, dayStr)).forEach(ev => {
            const click = currentUser.is_superadmin ? ` onclick="deleteEvent('${ev.id}')" style="cursor:pointer;"` : '';
            const hint = currentUser.is_superadmin ? ' (click to delete)' : '';
            chips.push(`<div class="cal-chip ${ev.event_type}"${click} title="${SystemApp.escapeHtml(ev.title)}${hint}">${SystemApp.escapeHtml(ev.title)}</div>`);
        });
        (leave || []).filter(lv => overlaps(lv, dayStr)).forEach(lv => {
            const name = SystemApp.escapeHtml(staffById[lv.staff_id] || 'Staff');
            chips.push(`<div class="cal-chip leave" title="${name} on leave">${name}</div>`);
        });

        return `<div class="cal-cell${isToday ? ' today' : ''}">
            <div class="cal-daynum">${d}</div>${chips.join('')}
          </div>`;
    }).join('');
}

// =============================================
// EVENTS (superadmin)
// =============================================
function openEventModal() {
    if (!currentUser.is_superadmin) { SystemApp.showToast('Only AbangPC can add events', 'error'); return; }
    document.getElementById('evType').value = 'closure';
    document.getElementById('evTitle').value = '';
    document.getElementById('evDesc').value = '';
    document.getElementById('evStart').value = '';
    document.getElementById('evEnd').value = '';
    document.getElementById('evTitleErr').classList.add('hidden');
    document.getElementById('evDateErr').classList.add('hidden');
    document.getElementById('eventModal').classList.remove('hidden');
}

async function saveEvent() {
    const title = document.getElementById('evTitle').value.trim();
    const start = document.getElementById('evStart').value;
    const end = document.getElementById('evEnd').value;
    const titleErr = document.getElementById('evTitleErr');
    const dateErr = document.getElementById('evDateErr');
    titleErr.classList.toggle('hidden', !!title);
    const datesOk = !!start && !!end && end >= start;
    dateErr.classList.toggle('hidden', datesOk);
    if (!title || !datesOk) return;

    const btn = document.getElementById('saveEventBtn');
    btn.disabled = true;
    try {
        const { error } = await db.from('calendar_events').insert({
            event_type: document.getElementById('evType').value,
            title,
            description: document.getElementById('evDesc').value.trim() || null,
            start_date: start,
            end_date: end,
            created_by: currentUser.id,
        });
        if (error) throw error;
        SystemApp.closeModal('eventModal');
        await renderMonth();
        SystemApp.showToast('✅ Event added!', 'success');
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Failed to add event', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    const { error } = await db.from('calendar_events').delete().eq('id', id);
    if (error) { SystemApp.showToast('Failed to delete event', 'error'); return; }
    await renderMonth();
    SystemApp.showToast('🗑️ Event deleted', 'success');
}

// =============================================
// LEAVE — APPLY (any staff)
// =============================================
function openLeaveModal() {
    document.getElementById('lvStart').value = '';
    document.getElementById('lvEnd').value = '';
    document.getElementById('lvNote').value = '';
    document.getElementById('lvDateErr').classList.add('hidden');
    document.getElementById('leaveModal').classList.remove('hidden');
}

async function saveLeave() {
    const start = document.getElementById('lvStart').value;
    const end = document.getElementById('lvEnd').value;
    const dateErr = document.getElementById('lvDateErr');
    const datesOk = !!start && !!end && end >= start;
    dateErr.classList.toggle('hidden', datesOk);
    if (!datesOk) return;

    const btn = document.getElementById('saveLeaveBtn');
    btn.disabled = true;
    try {
        const { error } = await db.from('staff_leave').insert({
            staff_id: currentUser.id,
            start_date: start,
            end_date: end,
            note: document.getElementById('lvNote').value.trim() || null,
        });
        if (error) throw error;
        SystemApp.closeModal('leaveModal');
        await loadLeaveRequests();
        SystemApp.showToast('✅ Leave request submitted!', 'success');
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Failed to submit', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

// =============================================
// LEAVE — LIST
// =============================================
async function loadLeaveRequests() {
    const list = document.getElementById('leaveList');
    list.innerHTML = `<div style="padding:20px;color:var(--muted);">Loading...</div>`;

    const { data, error } = await db.from('staff_leave')
        .select('*').order('created_at', { ascending: false });
    if (error) { list.innerHTML = `<div style="padding:20px;color:var(--danger);">Failed to load requests.</div>`; return; }

    // A normal staff member sees only their own; the superadmin sees all.
    let rows = data || [];
    if (!currentUser.is_superadmin) rows = rows.filter(r => r.staff_id === currentUser.id);
    renderLeave(rows);
}

function renderLeave(rows) {
    const list = document.getElementById('leaveList');
    if (!rows.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🌴</div>
            <div>No leave requests. Click "🌴 Apply for Leave" to add one.</div></div>`;
        return;
    }
    list.innerHTML = rows.map(leaveCardHTML).join('');
}

function leaveCardHTML(lv) {
    const who = SystemApp.escapeHtml(staffById[lv.staff_id] || 'Staff');
    const span = `${SystemApp.formatDate(lv.start_date)} → ${SystemApp.formatDate(lv.end_date)}`;
    const mineOrAdmin = lv.staff_id === currentUser.id || currentUser.is_superadmin;

    let actions = '';
    if (lv.status === 'pending' && lv.staff_id === currentUser.id) {
        actions += `<button class="btn btn-secondary btn-sm" onclick="withdrawLeave('${lv.id}')">↩️ Withdraw</button>`;
    }
    actions += leaveAdminActions(lv);

    return `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;">${who}</div>
          <div class="text-muted" style="font-size:13px;margin-top:2px;">${span}</div>
        </div>
        <span class="badge">${LEAVE_STATUS[lv.status] || lv.status}</span>
      </div>
      ${lv.note && mineOrAdmin ? `<div style="font-size:13px;margin-top:8px;">Note: ${SystemApp.escapeHtml(lv.note)}</div>` : ''}
      ${lv.status === 'rejected' && lv.decision_reason ? `<div style="font-size:13px;margin-top:6px;color:var(--warning);">Reason: ${SystemApp.escapeHtml(lv.decision_reason)}</div>` : ''}
      ${actions ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>` : ''}
    </div>`;
}

// Superadmin action buttons on pending requests.
function leaveAdminActions(lv) {
    if (!currentUser.is_superadmin || lv.status !== 'pending') return '';
    return `<button class="btn btn-primary btn-sm" onclick="approveLeave('${lv.id}')">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="openReject('${lv.id}')">❌ Reject</button>`;
}

async function withdrawLeave(id) {
    if (!confirm('Withdraw this leave request?')) return;
    // Guard on pending + own row: only a still-pending, owned request is removed.
    const { data: deleted, error } = await db.from('staff_leave')
        .delete().eq('id', id).eq('staff_id', currentUser.id).eq('status', 'pending').select('id');
    if (error) { SystemApp.showToast('Failed to withdraw', 'error'); return; }
    if (!deleted || !deleted.length) { SystemApp.showToast('Only your own pending request can be withdrawn', 'error'); await loadLeaveRequests(); return; }
    await loadLeaveRequests();
    SystemApp.showToast('↩️ Request withdrawn', 'success');
}

// =============================================
// LEAVE — DECIDE (superadmin)
// =============================================
async function approveLeave(id) {
    // Guarded on still-pending so two tabs cannot double-decide.
    const { data: updated, error } = await db.from('staff_leave')
        .update({ status: 'approved', decided_by: currentUser.id, decided_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'pending').select('id');
    if (error) { SystemApp.showToast('Failed to approve', 'error'); return; }
    if (!updated || !updated.length) { SystemApp.showToast('Already decided — refreshed', 'error'); await loadLeaveRequests(); return; }
    await loadLeaveRequests();
    await renderMonth(); // approved leave now shows on the grid
    SystemApp.showToast('✅ Leave approved!', 'success');
}

function openReject(id) {
    rejectingLeaveId = id;
    document.getElementById('reasonText').value = '';
    document.getElementById('reasonErr').classList.add('hidden');
    document.getElementById('reasonModal').classList.remove('hidden');
}

async function confirmReject() {
    if (!rejectingLeaveId) return;
    const reason = document.getElementById('reasonText').value.trim();
    if (!reason) { document.getElementById('reasonErr').classList.remove('hidden'); return; }
    document.getElementById('reasonErr').classList.add('hidden');

    const btn = document.getElementById('confirmReasonBtn');
    btn.disabled = true;
    try {
        const { data: updated, error } = await db.from('staff_leave')
            .update({ status: 'rejected', decision_reason: reason, decided_by: currentUser.id, decided_at: new Date().toISOString() })
            .eq('id', rejectingLeaveId).eq('status', 'pending').select('id');
        if (error) throw error;
        SystemApp.closeModal('reasonModal');
        rejectingLeaveId = null;
        if (!updated || !updated.length) { SystemApp.showToast('Already decided — refreshed', 'error'); await loadLeaveRequests(); return; }
        await loadLeaveRequests();
        SystemApp.showToast('❌ Leave rejected', 'success');
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Failed to reject', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

// =============================================
// EXPOSE TO HTML (onclick handlers)
// =============================================
window.deleteEvent = deleteEvent;
window.withdrawLeave = withdrawLeave;
window.approveLeave = approveLeave;
window.openReject = openReject;

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initCalendar);
