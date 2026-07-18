// =============================================
// AbangPC - Inventory
// Staff-only stock list: used laptops + counted parts
// =============================================
let currentUser = null;
let laptopFilter = 'in_stock';
let editingLaptopId = null;
let editingItemId = null;

// =============================================
// HELPERS
// =============================================
function fmtPrice(v) {
    if (v === null || v === undefined || v === '')
        return '—';
    return 'RM ' + Number(v).toFixed(2);
}

function escapeHtml(s) {
    if (!s)
        return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const CATEGORY_LABELS = { gpu: 'GPU', ram: 'RAM', ssd: 'SSD', other: 'Other' };

// =============================================
// INIT
// =============================================
async function initInventory() {
    try {
        currentUser = await SystemApp.requireManager();
        SystemApp.renderSidebar(currentUser, 'inventory');
        bindEvents();
        await Promise.all([loadLaptops(), loadItems()]);
    }
    catch (err) {
        console.error(err);
    }
}

// =============================================
// BIND EVENTS
// =============================================
function bindEvents() {
    document.getElementById('menuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });

    // Parts
    document.getElementById('addItemBtn')?.addEventListener('click', () => openItemModal(null));
    document.getElementById('saveItemBtn')?.addEventListener('click', saveItem);
    document.getElementById('cancelItemBtn')?.addEventListener('click', () => closeModal('itemModal'));
    document.getElementById('closeItemModal')?.addEventListener('click', () => closeModal('itemModal'));
}

// =============================================
// LAPTOPS
// =============================================
async function loadLaptops() {
    // Implemented in Task 7
}

// =============================================
// PARTS
// =============================================
async function loadItems() {
    const tbody = document.getElementById('itemsBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">Loading...</td></tr>`;

    const { data, error } = await db
        .from('inventory_items')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger);">Failed to load parts.</td></tr>`;
        return;
    }
    renderItems(data || []);
}

function renderItems(rows) {
    const tbody = document.getElementById('itemsBody');
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">No parts yet. Click "➕ Add Part" to start.</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr${r.quantity === 0 ? ' style="opacity:0.45;"' : ''}>
        <td>${escapeHtml(r.name)}</td>
        <td><span class="badge">${CATEGORY_LABELS[r.category] || escapeHtml(r.category)}</span></td>
        <td><strong>${r.quantity}</strong></td>
        <td>${fmtPrice(r.price)}</td>
        <td class="text-muted">${escapeHtml(r.notes) || '—'}</td>
        <td></td>
      </tr>
    `).join('');
}

function openItemModal(id) {
    editingItemId = id || null;
    document.getElementById('itemModalTitle').textContent = id ? '🔩 Edit Part' : '🔩 Add Part';
    document.getElementById('itemNameErr').classList.add('hidden');

    if (!id) {
        document.getElementById('itemName').value = '';
        document.getElementById('itemCategory').value = 'other';
        document.getElementById('itemQty').value = '0';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemNotes').value = '';
    }
    document.getElementById('itemModal').classList.remove('hidden');
}

async function saveItem() {
    const name = document.getElementById('itemName').value.trim();
    const errEl = document.getElementById('itemNameErr');

    if (!name) {
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const priceRaw = document.getElementById('itemPrice').value.trim();
    const payload = {
        name,
        category: document.getElementById('itemCategory').value,
        quantity: parseInt(document.getElementById('itemQty').value, 10) || 0,
        price: priceRaw === '' ? null : Number(priceRaw),
        notes: document.getElementById('itemNotes').value.trim() || null,
    };

    const btn = document.getElementById('saveItemBtn');
    btn.disabled = true;
    const wasEditing = editingItemId;
    try {
        let error;
        if (wasEditing) {
            ({ error } = await db.from('inventory_items').update(payload).eq('id', wasEditing));
        }
        else {
            payload.created_by = currentUser.id;
            ({ error } = await db.from('inventory_items').insert(payload));
        }
        if (error)
            throw error;

        // Only clear the edit id on success. Clearing it on failure would turn
        // a retry into an INSERT, silently duplicating the row.
        editingItemId = null;
        closeModal('itemModal');
        await loadItems();
        showToast(wasEditing ? '✅ Part updated!' : '✅ Part added!', 'success');
    }
    catch (err) {
        showToast(err.message || 'Failed to save part', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initInventory);
