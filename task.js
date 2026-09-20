// =============================================
// AbangPC - Staff Task
// =============================================
// A task moves through these statuses:
//
//   in_progress  ── doer clicks "Mark Done" ──►  awaiting_approval
//                                                 (or awaiting_owner
//                                                  if there are no approvers)
//   awaiting_approval ── every approver approves ──►  awaiting_owner
//   awaiting_owner    ── creator clicks "Accept"  ──►  completed
//
//   At any review point, "Send Back" returns the task to in_progress
//   (and resets all approver chips to pending), while "Reject" ends it
//   as failed. Both require a written reason.
//
// Only the superadmin (AbangPC) can create tasks. Everyone can do,
// approve, and view. Each page section below is grouped by role.
// =============================================
let currentUser = null;
let allStaff = [];
let staffById = {};
let filterMine = false;
let pendingReason = null; // { action, taskId, rowId } while reason modal is open

const STATUS_LABELS = {
    in_progress: '🔧 In Progress',
    awaiting_approval: '👀 Awaiting Approval',
    awaiting_owner: '⭐ Awaiting Owner',
    completed: '✅ Completed',
    failed: '❌ Failed',
};

async function initTask() {
    try {
        currentUser = await SystemApp.requireManager();
        SystemApp.renderSidebar(currentUser, 'task');
        // Only the superadmin (AbangPC) may create/assign tasks. Everyone else
        // can still do, approve, and view — so the page loads for all managers,
        // but the New Task button is hidden for non-superadmins.
        if (!currentUser.is_superadmin) {
            const btn = document.getElementById('addTaskBtn');
            if (btn) btn.style.display = 'none';
        }
        await loadStaff();
        bindEvents();
        await loadTasks();
    }
    catch (err) {
        console.error(err);
    }
}

async function loadStaff() {
    const { data, error } = await db
        .from('users')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
    if (error) {
        SystemApp.showToast('Failed to load staff', 'error');
        return;
    }
    allStaff = data || [];
    staffById = {};
    allStaff.forEach(s => { staffById[s.id] = s.full_name; });

    // Doer select
    const doer = document.getElementById('taskDoer');
    doer.innerHTML = '<option value="">— Choose staff —</option>' +
        allStaff.map(s => `<option value="${s.id}">${SystemApp.escapeHtml(s.full_name)}</option>`).join('');

    // Assignee filter
    const fa = document.getElementById('filterAssignee');
    fa.innerHTML = '<option value="">All Assignees</option>' +
        allStaff.map(s => `<option value="${s.id}">${SystemApp.escapeHtml(s.full_name)}</option>`).join('');
}

function bindEvents() {
    document.getElementById('menuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.getElementById('addTaskBtn')?.addEventListener('click', openTaskModal);
    document.getElementById('cancelTaskBtn')?.addEventListener('click', () => SystemApp.closeModal('taskModal'));
    document.getElementById('closeTaskModal')?.addEventListener('click', () => SystemApp.closeModal('taskModal'));
    document.getElementById('saveTaskBtn')?.addEventListener('click', saveTask);

    // Rebuild approver checkboxes when the doer changes (doer excluded)
    document.getElementById('taskDoer')?.addEventListener('change', renderApproverChoices);

    // Filters
    document.getElementById('filterSearch')?.addEventListener('input', loadTasks);
    document.getElementById('filterAssignee')?.addEventListener('change', loadTasks);
    document.getElementById('filterStatus')?.addEventListener('change', loadTasks);
    document.getElementById('filterMine')?.addEventListener('click', () => {
        filterMine = !filterMine;
        document.getElementById('filterMine').classList.toggle('active', filterMine);
        loadTasks();
    });

    // Reason modal
    document.getElementById('cancelReasonBtn')?.addEventListener('click', () => SystemApp.closeModal('reasonModal'));
    document.getElementById('closeReasonModal')?.addEventListener('click', () => SystemApp.closeModal('reasonModal'));
    document.getElementById('confirmReasonBtn')?.addEventListener('click', confirmReason);
}

// =============================================
// CREATE TASK
// =============================================
function openTaskModal() {
    // Guard behind the hidden button: creation is superadmin-only.
    if (!currentUser.is_superadmin) {
        SystemApp.showToast('Only AbangPC can create tasks', 'error');
        return;
    }
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskDoer').value = '';
    document.getElementById('taskStart').value = '';
    document.getElementById('taskEnd').value = '';
    document.getElementById('taskTitleErr').classList.add('hidden');
    document.getElementById('taskDoerErr').classList.add('hidden');
    renderApproverChoices();
    document.getElementById('taskModal').classList.remove('hidden');
}

// Approver checkboxes, excluding whoever is selected as the doer
function renderApproverChoices() {
    const doerId = document.getElementById('taskDoer').value;
    const box = document.getElementById('taskApprovers');
    const choices = allStaff.filter(s => s.id !== doerId);
    if (!choices.length) {
        box.innerHTML = '<span class="text-muted" style="font-size:13px;">No other staff available.</span>';
        return;
    }
    box.innerHTML = choices.map(s => `
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;">
        <input type="checkbox" class="approver-check" value="${s.id}" />
        ${SystemApp.escapeHtml(s.full_name)}
      </label>`).join('');
}

async function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const doerId = document.getElementById('taskDoer').value;
    const titleErr = document.getElementById('taskTitleErr');
    const doerErr = document.getElementById('taskDoerErr');
    titleErr.classList.toggle('hidden', !!title);
    doerErr.classList.toggle('hidden', !!doerId);
    if (!title || !doerId) return;

    const approverIds = [...document.querySelectorAll('.approver-check:checked')].map(c => c.value);
    const startVal = document.getElementById('taskStart').value;
    const endVal = document.getElementById('taskEnd').value;

    const btn = document.getElementById('saveTaskBtn');
    btn.disabled = true;
    try {
        const { data: task, error } = await db.from('staff_tasks').insert({
            title,
            description: document.getElementById('taskDesc').value.trim() || null,
            assigned_to: doerId,
            created_by: currentUser.id,
            start_date: startVal || null,
            end_date: endVal || null,
        }).select('id').single();
        if (error) throw error;

        if (approverIds.length) {
            const rows = approverIds.map(aid => ({ task_id: task.id, approver_id: aid }));
            const { error: aErr } = await db.from('staff_task_approvers').insert(rows);
            if (aErr) throw aErr;
        }

        SystemApp.closeModal('taskModal');
        await loadTasks();
        SystemApp.showToast('✅ Task created!', 'success');
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Failed to create task', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

// =============================================
// LOAD & RENDER
// =============================================
async function loadTasks() {
    const list = document.getElementById('taskList');
    const countEl = document.getElementById('taskCount');
    list.innerHTML = `<div style="padding:30px;color:var(--muted);">Loading...</div>`;

    const { data, error } = await db
        .from('staff_tasks')
        .select('*, staff_task_approvers(*)')
        .order('created_at', { ascending: false });
    if (error) {
        list.innerHTML = `<div style="padding:30px;color:var(--danger);">Failed to load tasks.</div>`;
        countEl.textContent = '';
        return;
    }

    // Client-side filters
    const search = document.getElementById('filterSearch').value.trim().toLowerCase();
    const fAssignee = document.getElementById('filterAssignee').value;
    const fStatus = document.getElementById('filterStatus').value;

    let rows = data || [];
    if (search) rows = rows.filter(t => (t.title || '').toLowerCase().includes(search));
    if (fAssignee) rows = rows.filter(t => t.assigned_to === fAssignee);
    if (fStatus) rows = rows.filter(t => t.status === fStatus);
    if (filterMine) rows = rows.filter(needsMyAction);

    countEl.textContent = `${rows.length} task${rows.length !== 1 ? 's' : ''}`;
    renderTasks(rows);
}

// True when it is this viewer's turn to act on the task
function needsMyAction(t) {
    if (t.status === 'in_progress') return t.assigned_to === currentUser.id;
    if (t.status === 'awaiting_approval') {
        return (t.staff_task_approvers || [])
            .some(a => a.approver_id === currentUser.id && a.decision === 'pending');
    }
    if (t.status === 'awaiting_owner') return t.created_by === currentUser.id;
    return false;
}

function isOverdue(t) {
    if (!t.end_date) return false;
    if (t.status === 'completed' || t.status === 'failed') return false;
    const today = new Date().toISOString().slice(0, 10);
    return t.end_date < today;
}

function approverChipsHTML(t) {
    const rows = t.staff_task_approvers || [];
    if (!rows.length) return '<span class="text-muted" style="font-size:12px;">No approvers</span>';
    const dot = { pending: '⏳', approved: '✅', sent_back: '↩️', rejected: '❌' };
    return rows.map(a => `
      <span class="badge" style="margin-right:6px;">
        ${dot[a.decision] || ''} ${SystemApp.escapeHtml(staffById[a.approver_id] || 'Unknown')}
      </span>`).join('');
}

function renderTasks(rows) {
    const list = document.getElementById('taskList');
    if (!rows.length) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">✅</div>
            <div>No tasks match. Click "➕ New Task" to create one.</div>
          </div>`;
        return;
    }
    list.innerHTML = rows.map(taskCardHTML).join('');
}

function taskCardHTML(t) {
    const doer = SystemApp.escapeHtml(staffById[t.assigned_to] || 'Unknown');
    const creator = SystemApp.escapeHtml(staffById[t.created_by] || 'Unknown');
    const overdue = isOverdue(t)
        ? `<span class="badge" style="background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid rgba(239,68,68,0.3);">⚠️ Overdue</span>`
        : '';
    const dates = [
        t.start_date ? `Start ${SystemApp.formatDate(t.start_date)}` : null,
        t.end_date ? `Due ${SystemApp.formatDate(t.end_date)}` : null,
    ].filter(Boolean).join(' • ') || 'No dates set';

    return `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${SystemApp.escapeHtml(t.title)}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">Doer: <strong>${doer}</strong> · Owner: ${creator}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="badge">${STATUS_LABELS[t.status] || t.status}</span>
          ${overdue}
        </div>
      </div>
      ${t.description ? `<div style="font-size:14px;margin-top:10px;">${SystemApp.escapeHtml(t.description)}</div>` : ''}
      <div style="margin-top:10px;">${approverChipsHTML(t)}</div>
      <div class="text-muted" style="font-size:12px;margin-top:8px;">${dates}</div>
      ${t.reason ? `<div style="margin-top:8px;font-size:13px;color:var(--warning);">Last feedback: ${SystemApp.escapeHtml(t.reason)}</div>` : ''}
      <div class="ticket-card-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        ${taskActionsHTML(t)}
      </div>
    </div>`;
}

// Returns the buttons this viewer may press at the task's current stage
function taskActionsHTML(t) {
    const btns = [];
    // Doer, while in progress
    if (t.status === 'in_progress' && t.assigned_to === currentUser.id) {
        btns.push(`<button class="btn btn-primary btn-sm" onclick="markDone('${t.id}')">✔️ Mark Done</button>`);
    }
    // Approver, while awaiting approval and still pending
    if (t.status === 'awaiting_approval') {
        const mine = (t.staff_task_approvers || [])
            .find(a => a.approver_id === currentUser.id && a.decision === 'pending');
        if (mine) {
            btns.push(`<button class="btn btn-primary btn-sm" onclick="approve('${t.id}','${mine.id}')">✅ Approve</button>`);
            btns.push(`<button class="btn btn-secondary btn-sm" onclick="openReason('approver_send_back','${t.id}','${mine.id}')">↩️ Send Back</button>`);
            btns.push(`<button class="btn btn-danger btn-sm" onclick="openReason('approver_reject','${t.id}','${mine.id}')">❌ Reject</button>`);
        }
    }
    // Creator, at owner stage
    if (t.status === 'awaiting_owner' && t.created_by === currentUser.id) {
        btns.push(`<button class="btn btn-primary btn-sm" onclick="acceptTask('${t.id}')">🏁 Accept</button>`);
        btns.push(`<button class="btn btn-secondary btn-sm" onclick="openReason('owner_send_back','${t.id}','')">↩️ Send Back</button>`);
        btns.push(`<button class="btn btn-danger btn-sm" onclick="openReason('owner_reject','${t.id}','')">❌ Reject</button>`);
    }
    // Creator can always delete their own task
    if (t.created_by === currentUser.id) {
        btns.push(`<button class="btn btn-danger btn-sm" onclick="deleteTask('${t.id}')">🗑️</button>`);
    }
    return btns.join('') || '<span class="text-muted" style="font-size:12px;">No action for you right now</span>';
}

// =============================================
// WORKFLOW: DOER
// =============================================
async function markDone(id) {
    // Read the approver count to decide the next status
    const { data: task, error: readErr } = await db.from('staff_tasks')
        .select('id, staff_task_approvers(id)').eq('id', id).single();
    if (readErr || !task) { SystemApp.showToast('Failed to read task', 'error'); return; }

    const hasApprovers = (task.staff_task_approvers || []).length > 0;
    const nextStatus = hasApprovers ? 'awaiting_approval' : 'awaiting_owner';

    // Guard on current status + doer so a stale card cannot double-apply
    const { data: updated, error } = await db.from('staff_tasks')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'in_progress')
        .eq('assigned_to', currentUser.id)
        .select('id');
    if (error) { SystemApp.showToast('Failed to update task', 'error'); return; }
    if (!updated || !updated.length) {
        SystemApp.showToast('Task already moved on — refreshed', 'error');
        await loadTasks();
        return;
    }
    await loadTasks();
    SystemApp.showToast('✔️ Marked done!', 'success');
}

// =============================================
// WORKFLOW: APPROVER
// =============================================
async function approve(taskId, rowId) {
    // Mark my row approved, guarded on it still being pending
    const { data: updatedRow, error } = await db.from('staff_task_approvers')
        .update({ decision: 'approved', reason: null, decided_at: new Date().toISOString() })
        .eq('id', rowId)
        .eq('approver_id', currentUser.id)
        .eq('decision', 'pending')
        .select('id');
    if (error) { SystemApp.showToast('Failed to approve', 'error'); return; }
    if (!updatedRow || !updatedRow.length) {
        SystemApp.showToast('This task already moved on — refreshed', 'error');
        await loadTasks();
        return;
    }

    // If every approver has now approved, advance to awaiting_owner
    const { data: rows } = await db.from('staff_task_approvers')
        .select('decision').eq('task_id', taskId);
    const allApproved = (rows || []).length > 0 && rows.every(r => r.decision === 'approved');
    if (allApproved) {
        await db.from('staff_tasks')
            .update({ status: 'awaiting_owner', updated_at: new Date().toISOString() })
            .eq('id', taskId)
            .eq('status', 'awaiting_approval');
    }
    await loadTasks();
    SystemApp.showToast('✅ Approved!', 'success');
}

// =============================================
// WORKFLOW: REASON MODAL (send back / reject, both stages)
// =============================================
function openReason(action, taskId, rowId) {
    pendingReason = { action, taskId, rowId };
    const isReject = action.endsWith('reject');
    document.getElementById('reasonModalTitle').textContent = isReject ? '❌ Reject Task' : '↩️ Send Back';
    document.getElementById('reasonText').value = '';
    document.getElementById('reasonErr').classList.add('hidden');
    document.getElementById('reasonModal').classList.remove('hidden');
}

async function confirmReason() {
    if (!pendingReason) return;
    const reason = document.getElementById('reasonText').value.trim();
    if (!reason) { document.getElementById('reasonErr').classList.remove('hidden'); return; }
    document.getElementById('reasonErr').classList.add('hidden');

    const { action, taskId, rowId } = pendingReason;
    const btn = document.getElementById('confirmReasonBtn');
    btn.disabled = true;
    try {
        if (action === 'approver_reject' || action === 'owner_reject') {
            await failTask(taskId, reason, rowId);
        } else {
            await sendBackTask(taskId, reason, rowId);
        }
        SystemApp.closeModal('reasonModal');
        pendingReason = null;
        await loadTasks();
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Action failed', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

// Reject → failed (terminal). rowId present only at approver stage.
async function failTask(taskId, reason, rowId) {
    if (rowId) {
        await db.from('staff_task_approvers')
            .update({ decision: 'rejected', reason, decided_at: new Date().toISOString() })
            .eq('id', rowId);
    }
    const { error } = await db.from('staff_tasks')
        .update({ status: 'failed', reason, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    if (error) throw error;
    SystemApp.showToast('❌ Task rejected', 'success');
}

// Send back → in_progress, reset all approver rows to pending.
async function sendBackTask(taskId, reason, rowId) {
    const { error } = await db.from('staff_tasks')
        .update({ status: 'in_progress', reason, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    if (error) throw error;
    // Reset every approver row for a fresh round
    await db.from('staff_task_approvers')
        .update({ decision: 'pending', reason: null, decided_at: null })
        .eq('task_id', taskId);
    SystemApp.showToast('↩️ Sent back to doer', 'success');
}

// =============================================
// WORKFLOW: OWNER
// =============================================
async function acceptTask(id) {
    const { data: updated, error } = await db.from('staff_tasks')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'awaiting_owner')
        .eq('created_by', currentUser.id)
        .select('id');
    if (error) { SystemApp.showToast('Failed to accept', 'error'); return; }
    if (!updated || !updated.length) {
        SystemApp.showToast('Task already moved on — refreshed', 'error');
        await loadTasks();
        return;
    }
    await loadTasks();
    SystemApp.showToast('🏁 Task completed!', 'success');
}

async function deleteTask(id) {
    if (!confirm('Delete this task?\n\nThis cannot be undone.')) return;
    // created_by guard: only the creator's delete will match a row
    const { data: deleted, error } = await db.from('staff_tasks')
        .delete()
        .eq('id', id)
        .eq('created_by', currentUser.id)
        .select('id');
    if (error) { SystemApp.showToast('Failed to delete', 'error'); return; }
    if (!deleted || !deleted.length) {
        SystemApp.showToast('Only the task creator can delete it', 'error');
        return;
    }
    await loadTasks();
    SystemApp.showToast('🗑️ Task deleted', 'success');
}

// =============================================
// EXPOSE TO HTML (onclick handlers)
// =============================================
window.markDone = markDone;
window.approve = approve;
window.openReason = openReason;
window.acceptTask = acceptTask;
window.deleteTask = deleteTask;

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initTask);
