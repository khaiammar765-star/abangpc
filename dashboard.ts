// =============================================
// AbangPC – dashboard.ts
// Manager Dashboard Logic
// =============================================

declare const db: any;
declare const SystemApp: any;

let currentUser: any = null;
let allTickets: any[] = [];
let allStaff: any[] = [];
let selectedTicketId: string = '';

// =============================================
// INIT
// =============================================
async function initDashboard(): Promise<void> {
  try {
    currentUser = await SystemApp.requireManager();
    SystemApp.renderSidebar(currentUser, 'dashboard');
    await Promise.all([loadStaff(), loadTickets()]);
    bindEvents();
  } catch (err) {
    console.error(err);
  }
}

// =============================================
// LOAD STAFF
// =============================================
async function loadStaff(): Promise<void> {
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('full_name');

  if (error) { console.error(error); return; }
  allStaff = data || [];
  populateStaffDropdowns();
}

function populateStaffDropdowns(): void {
  const dropdowns = ['assignStaff', 'staffFilter', 'assignStaffSelect'];
  dropdowns.forEach(id => {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const current = el.value;
    // Keep first option, remove rest
    while (el.options.length > 1) el.remove(1);
    allStaff.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.full_name} (${s.role})`;
      el.appendChild(opt);
    });
    el.value = current;
  });
}

// =============================================
// LOAD TICKETS
// =============================================
async function loadTickets(): Promise<void> {
  const tbody = document.getElementById('ticketsBody')!;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--muted);">Loading...</td></tr>`;

  const { data, error } = await db
    .from('tickets')
    .select(`
      *,
      customers (id, name, phone),
      assignee:users!tickets_assigned_to_fkey (id, full_name)
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
function updateStats(): void {
  const counts: Record<string, number> = {
    diagnosing: 0, repairing: 0,
    finished: 0, ready_pickup: 0, collected: 0
  };
  allTickets.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });

  const set = (id: string, val: number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  set('statTotal', allTickets.length);
  set('statDiagnosing', counts.diagnosing);
  set('statRepairing', counts.repairing);
  set('statReady', counts.ready_pickup);
  set('statCollected', counts.collected);
}

// =============================================
// RENDER TICKETS TABLE
// =============================================
function renderTickets(tickets: any[]): void {
  const tbody = document.getElementById('ticketsBody')!;
  const countEl = document.getElementById('ticketCount')!;
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

  tbody.innerHTML = tickets.map(t => `
    <tr>
      <td>
        <span style="font-family:'Syne',sans-serif;font-weight:700;color:var(--yellow);font-size:13px;">${t.ticket_number}</span>
      </td>
      <td>
        <div class="ticket-customer">${t.customers?.name || '—'}</div>
        <div class="ticket-device">${t.customers?.phone || ''}</div>
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
      <td>${t.assignee?.full_name || '<span style="color:var(--muted)">Unassigned</span>'}</td>
      <td style="color:var(--yellow);font-weight:600;">${t.quoted_price ? 'RM ' + Number(t.quoted_price).toFixed(2) : '—'}</td>
      <td style="color:var(--muted);font-size:13px;">
        ${SystemApp.formatDate(t.created_at)}
        <div style="font-size:11px;">${SystemApp.formatDuration(t.created_at)} ago</div>
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openDetailModal('${t.id}')">👁️ View</button>
          <button class="btn btn-secondary btn-sm" onclick="openStatusModal('${t.id}','${t.status}')">🔄</button>
          <button class="btn btn-secondary btn-sm" onclick="openAssignModal('${t.id}')">👨‍🔧</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// =============================================
// FILTERS
// =============================================
function applyFilters(): void {
  const search = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase();
  const status = (document.getElementById('statusFilter') as HTMLSelectElement).value;
  const staff  = (document.getElementById('staffFilter') as HTMLSelectElement).value;

  const filtered = allTickets.filter(t => {
    const matchSearch =
      !search ||
      t.ticket_number.toLowerCase().includes(search) ||
      t.customers?.name?.toLowerCase().includes(search) ||
      t.customers?.phone?.includes(search) ||
      t.issue_description?.toLowerCase().includes(search) ||
      t.device_brand?.toLowerCase().includes(search);

    const matchStatus = !status || t.status === status;
    const matchStaff  = !staff  || t.assigned_to === staff;

    return matchSearch && matchStatus && matchStaff;
  });

  renderTickets(filtered);
}

// =============================================
// CUSTOMER PHONE LOOKUP
// =============================================
async function lookupCustomer(phone: string): Promise<void> {
  if (phone.length < 8) {
    document.getElementById('custFound')!.classList.add('hidden');
    return;
  }

  const { data } = await db
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .single();

  const custFoundEl = document.getElementById('custFound')!;
  const custNameEl  = document.getElementById('custName') as HTMLInputElement;
  const custEmailEl = document.getElementById('custEmail') as HTMLInputElement;

  if (data) {
    custFoundEl.textContent = `✅ Returning customer found: ${data.name}`;
    custFoundEl.classList.remove('hidden');
    custNameEl.value  = data.name;
    custEmailEl.value = data.email || '';
    (custNameEl as any).dataset.existingId = data.id;
  } else {
    custFoundEl.textContent = '🆕 New customer — fill in details below';
    custFoundEl.classList.remove('hidden');
    custNameEl.value  = '';
    custEmailEl.value = '';
    delete (custNameEl as any).dataset.existingId;
  }
}

// =============================================
// CREATE TICKET
// =============================================
async function createTicket(): Promise<void> {
  const errorEl  = document.getElementById('createError')!;
  const btnText  = document.getElementById('createBtnText')!;
  const spinner  = document.getElementById('createSpinner')!;
  const submitBtn = document.getElementById('submitCreateBtn') as HTMLButtonElement;

  errorEl.classList.add('hidden');

  const phone     = (document.getElementById('custPhone')    as HTMLInputElement).value.trim();
  const name      = (document.getElementById('custName')     as HTMLInputElement).value.trim();
  const email     = (document.getElementById('custEmail')    as HTMLInputElement).value.trim();
  const device    = (document.getElementById('deviceType')   as HTMLSelectElement).value;
  const brand     = (document.getElementById('deviceBrand')  as HTMLInputElement).value.trim();
  const model     = (document.getElementById('deviceModel')  as HTMLInputElement).value.trim();
  const issue     = (document.getElementById('issueDesc')    as HTMLTextAreaElement).value.trim();
  const price     = (document.getElementById('quotedPrice')  as HTMLInputElement).value;
  const staffId   = (document.getElementById('assignStaff')  as HTMLSelectElement).value;
  const estDate   = (document.getElementById('estCompletion') as HTMLInputElement).value;
  const notes     = (document.getElementById('internalNotes') as HTMLTextAreaElement).value.trim();
  const existingId = (document.getElementById('custName') as any).dataset.existingId;

  // Validate
  if (!phone) { showCreateError('Customer phone is required.'); return; }
  if (!name)  { showCreateError('Customer name is required.'); return; }
  if (!issue) { showCreateError('Issue description is required.'); return; }

  submitBtn.disabled = true;
  btnText.textContent = 'Creating...';
  spinner.classList.remove('hidden');

  try {
    // Step 1: Create or get customer
    let customerId = existingId;
    if (!customerId) {
      const { data: newCust, error: custErr } = await db
        .from('customers')
        .upsert({ phone, name, email: email || null }, { onConflict: 'phone' })
        .select()
        .single();

      if (custErr) throw custErr;
      customerId = newCust.id;
    }

    // Step 2: Create ticket
    const { error: ticketErr } = await db
      .from('tickets')
      .insert({
        ticket_number: '',
        customer_id: customerId,
        device_type: device,
        device_brand: brand || null,
        device_model: model || null,
        issue_description: issue,
        quoted_price: price ? parseFloat(price) : null,
        status: 'diagnosing',
        assigned_to: staffId || null,
        created_by: currentUser.id,
        estimated_completion: estDate || null,
        internal_notes: notes || null,
      });

    if (ticketErr) throw ticketErr;

    // Success
    closeModal('createModal');
    resetCreateForm();
    await loadTickets();
    showToast('✅ Ticket created successfully!', 'success');

  } catch (err: any) {
    showCreateError(err.message || 'Failed to create ticket.');
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = 'Create Ticket';
    spinner.classList.add('hidden');
  }
}

function showCreateError(msg: string): void {
  const el = document.getElementById('createError')!;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function resetCreateForm(): void {
  ['custPhone','custName','custEmail','deviceBrand','deviceModel',
   'issueDesc','quotedPrice','estCompletion','internalNotes'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = '';
  });
  (document.getElementById('assignStaff') as HTMLSelectElement).value = '';
  (document.getElementById('deviceType')  as HTMLSelectElement).value = 'laptop';
  document.getElementById('custFound')!.classList.add('hidden');
}

// =============================================
// DETAIL MODAL
// =============================================
async function openDetailModal(ticketId: string): Promise<void> {
  selectedTicketId = ticketId;
  const modal = document.getElementById('detailModal')!;
  const body  = document.getElementById('detailModalBody')!;
  const title = document.getElementById('detailModalTitle')!;
  modal.classList.remove('hidden');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);">Loading...</div>';

  const { data: ticket, error } = await db
    .from('tickets')
    .select(`*, customers(*), assignee:users!tickets_assigned_to_fkey(*)`)
    .eq('id', ticketId)
    .single();

  if (error || !ticket) {
    body.innerHTML = '<div style="color:var(--danger);padding:20px;">Failed to load ticket.</div>';
    return;
  }

  // Load status history
  const { data: history } = await db
    .from('ticket_status_history')
    .select(`*, changer:users!ticket_status_history_changed_by_fkey(full_name)`)
    .eq('ticket_id', ticketId)
    .order('changed_at', { ascending: false });

  // Load comments
  const { data: comments } = await db
    .from('ticket_comments')
    .select(`*, author:users!ticket_comments_author_id_fkey(full_name)`)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  title.textContent = `Ticket ${ticket.ticket_number}`;

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
      <div class="status-info-item">
        <div class="status-info-label">Customer</div>
        <div class="status-info-value">${ticket.customers?.name}</div>
        <div style="font-size:12px;color:var(--muted);">${ticket.customers?.phone}</div>
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
        <div class="status-info-label">Assigned To</div>
        <div class="status-info-value">${ticket.assignee?.full_name || '—'}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Quoted Price</div>
        <div class="status-info-value" style="color:var(--yellow)">${ticket.quoted_price ? 'RM ' + Number(ticket.quoted_price).toFixed(2) : '—'}</div>
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

    <!-- Status History -->
    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">Status History</div>
      <ul class="timeline">
        ${(history || []).map((h: any) => `
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
        ${(comments || []).map((c: any) => `
          <div style="background:var(--surface);border-radius:10px;padding:12px 14px;margin-bottom:10px;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${c.author?.full_name || 'Unknown'} — ${SystemApp.formatDateTime(c.created_at)}</div>
            <div style="font-size:14px;">${c.comment}</div>
          </div>
        `).join('') || '<div style="color:var(--muted);font-size:13px;">No comments yet.</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <input type="text" id="newComment" placeholder="Add a comment..." style="flex:1;background:var(--surface);border:1px solid var(--border-hover);color:var(--white);border-radius:8px;padding:10px 14px;font-size:14px;font-family:inherit;outline:none;" />
        <button class="btn btn-primary btn-sm" onclick="addComment('${ticketId}')">Send</button>
      </div>
    </div>
  `;

  const footer = document.getElementById('detailModalFooter')!;
  footer.innerHTML = `
    <button class="btn btn-secondary" onclick="openStatusModal('${ticketId}','${ticket.status}')">🔄 Update Status</button>
    <button class="btn btn-secondary" onclick="openAssignModal('${ticketId}')">👨‍🔧 Reassign</button>
    <button class="btn btn-secondary" id="closeDetailBtn">Close</button>
  `;
  document.getElementById('closeDetailBtn')?.addEventListener('click', () => closeModal('detailModal'));
}

// =============================================
// ADD COMMENT
// =============================================
async function addComment(ticketId: string): Promise<void> {
  const input = document.getElementById('newComment') as HTMLInputElement;
  const text  = input.value.trim();
  if (!text) return;

  const { error } = await db.from('ticket_comments').insert({
    ticket_id: ticketId,
    comment: text,
    author_id: currentUser.id,
  });

  if (error) { showToast('Failed to add comment', 'error'); return; }

  input.value = '';
  showToast('Comment added!', 'success');

  // Reload detail modal
  openDetailModal(ticketId);
}

// =============================================
// STATUS MODAL
// =============================================
function openStatusModal(ticketId: string, currentStatus: string): void {
  selectedTicketId = ticketId;
  (document.getElementById('newStatusSelect') as HTMLSelectElement).value = currentStatus;
  (document.getElementById('statusNotes') as HTMLTextAreaElement).value = '';
  document.getElementById('statusModal')!.classList.remove('hidden');
}

async function confirmStatusUpdate(): Promise<void> {
  const newStatus = (document.getElementById('newStatusSelect') as HTMLSelectElement).value;
  const notes     = (document.getElementById('statusNotes')     as HTMLTextAreaElement).value.trim();

  const { error } = await db
    .from('tickets')
    .update({ status: newStatus })
    .eq('id', selectedTicketId);

  if (error) { showToast('Failed to update status', 'error'); return; }

  if (notes) {
    await db.from('ticket_status_history').update({ notes }).eq('ticket_id', selectedTicketId).eq('status', newStatus);
  }

  closeModal('statusModal');
  await loadTickets();
  showToast('✅ Status updated!', 'success');
}

// =============================================
// ASSIGN MODAL
// =============================================
function openAssignModal(ticketId: string): void {
  selectedTicketId = ticketId;
  const ticket = allTickets.find(t => t.id === ticketId);
  if (ticket?.assigned_to) {
    (document.getElementById('assignStaffSelect') as HTMLSelectElement).value = ticket.assigned_to;
  }
  document.getElementById('assignModal')!.classList.remove('hidden');
}

async function confirmAssign(): Promise<void> {
  const staffId = (document.getElementById('assignStaffSelect') as HTMLSelectElement).value;
  if (!staffId) { showToast('Please select a staff member', 'error'); return; }

  const { error } = await db
    .from('tickets')
    .update({ assigned_to: staffId })
    .eq('id', selectedTicketId);

  if (error) { showToast('Failed to assign ticket', 'error'); return; }

  closeModal('assignModal');
  await loadTickets();
  showToast('✅ Ticket assigned!', 'success');
}

// =============================================
// MODAL HELPERS
// =============================================
function closeModal(id: string): void {
  document.getElementById(id)!.classList.add('hidden');
}

// =============================================
// TOAST NOTIFICATION
// =============================================
function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const colors: Record<string, string> = {
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
function bindEvents(): void {
  // New ticket button
  document.getElementById('newTicketBtn')?.addEventListener('click', () => {
    document.getElementById('createModal')!.classList.remove('hidden');
  });

  // Close modals
  document.getElementById('closeCreateModal')?.addEventListener('click', () => closeModal('createModal'));
  document.getElementById('cancelCreateBtn')?.addEventListener('click', () => closeModal('createModal'));
  document.getElementById('closeDetailModal')?.addEventListener('click', () => closeModal('detailModal'));
  document.getElementById('closeAssignModal')?.addEventListener('click', () => closeModal('assignModal'));
  document.getElementById('cancelAssignBtn')?.addEventListener('click', () => closeModal('assignModal'));
  document.getElementById('closeStatusModal')?.addEventListener('click', () => closeModal('statusModal'));
  document.getElementById('cancelStatusBtn')?.addEventListener('click', () => closeModal('statusModal'));

  // Close on overlay click
  ['createModal','detailModal','assignModal','statusModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === id) closeModal(id);
    });
  });

  // Create ticket submit
  document.getElementById('submitCreateBtn')?.addEventListener('click', createTicket);

  // Assign confirm
  document.getElementById('confirmAssignBtn')?.addEventListener('click', confirmAssign);

  // Status confirm
  document.getElementById('confirmStatusBtn')?.addEventListener('click', confirmStatusUpdate);

  // Customer phone lookup
  document.getElementById('custPhone')?.addEventListener('input', (e) => {
    lookupCustomer((e.target as HTMLInputElement).value.trim());
  });

  // Filters
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  document.getElementById('staffFilter')?.addEventListener('change', applyFilters);

  // Mobile menu
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });
}

// =============================================
// EXPOSE FUNCTIONS TO HTML (onclick handlers)
// =============================================
(window as any).openDetailModal = openDetailModal;
(window as any).openStatusModal = openStatusModal;
(window as any).openAssignModal = openAssignModal;
(window as any).addComment = addComment;

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initDashboard);
