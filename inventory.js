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

    // Laptops
    document.getElementById('addLaptopBtn')?.addEventListener('click', () => openLaptopModal(null));
    document.getElementById('saveLaptopBtn')?.addEventListener('click', saveLaptop);
    document.getElementById('cancelLaptopBtn')?.addEventListener('click', () => closeModal('laptopModal'));
    document.getElementById('closeLaptopModal')?.addEventListener('click', () => closeModal('laptopModal'));

    // In Stock / Sold filter
    document.querySelectorAll('#laptopFilter .status-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('#laptopFilter .status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            laptopFilter = tab.dataset.filter;
            await loadLaptops();
        });
    });
}

// =============================================
// LAPTOPS
// =============================================
async function loadLaptops() {
    const grid = document.getElementById('laptopGrid');
    grid.innerHTML = `<div style="padding:30px;color:var(--muted);">Loading...</div>`;

    const { data, error } = await db
        .from('inventory_laptops')
        .select('*')
        .eq('status', laptopFilter)
        .order('created_at', { ascending: false });

    if (error) {
        grid.innerHTML = `<div style="padding:30px;color:var(--danger);">Failed to load laptops.</div>`;
        return;
    }
    renderLaptops(data || []);
}

function renderLaptops(rows) {
    const grid = document.getElementById('laptopGrid');
    if (!rows.length) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">💻</div>
            <div>${laptopFilter === 'sold' ? 'No laptops sold yet.' : 'No laptops in stock. Click "💻 Add Laptop" to start.'}</div>
          </div>`;
        return;
    }
    grid.innerHTML = rows.map(r => {
        const specs = [r.cpu, r.ram, r.storage].filter(Boolean).map(escapeHtml).join(' • ');
        return `
      <div class="ticket-card">
        ${r.photo_url
            ? `<img src="${escapeHtml(r.photo_url)}" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:10px;" />`
            : `<div style="width:100%;height:150px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:10px;font-size:38px;">💻</div>`}
        <div class="ticket-card-header">
          <span class="ticket-num">${escapeHtml(r.title)}</span>
          ${r.condition ? `<span class="badge">${escapeHtml(r.condition)}</span>` : ''}
        </div>
        <div class="ticket-card-device">${escapeHtml([r.brand, r.model].filter(Boolean).join(' ')) || '—'}</div>
        <div class="ticket-card-issue">${specs || 'No specs recorded'}</div>
        ${r.notes ? `<div class="text-muted" style="font-size:12px;margin-top:6px;">${escapeHtml(r.notes)}</div>` : ''}
        <div class="ticket-card-footer">
          <span class="ticket-price">${fmtPrice(r.price)}</span>
          <div class="ticket-card-actions"></div>
        </div>
      </div>`;
    }).join('');
}

// Reuses the existing ticket-photos bucket with an inventory/ prefix, so no
// new bucket or storage policy is needed. Returns null on failure rather than
// throwing — losing a photo must never lose the stock record.
async function uploadLaptopPhoto(file) {
    const ext = file.name.split('.').pop();
    const path = `inventory/${Date.now()}.${ext}`;
    const { error: uploadErr } = await db.storage
        .from('ticket-photos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) {
        showToast('Photo upload failed — saving without photo', 'error');
        return null;
    }
    const { data: urlData } = db.storage.from('ticket-photos').getPublicUrl(path);
    return urlData.publicUrl;
}

function openLaptopModal(id) {
    editingLaptopId = id || null;
    document.getElementById('laptopModalTitle').textContent = id ? '💻 Edit Laptop' : '💻 Add Laptop';
    document.getElementById('lapTitleErr').classList.add('hidden');

    if (!id) {
        ['lapTitle', 'lapBrand', 'lapModel', 'lapCpu', 'lapRam', 'lapStorage', 'lapPrice', 'lapNotes']
            .forEach(f => { document.getElementById(f).value = ''; });
        document.getElementById('lapCondition').value = '';
        document.getElementById('lapPhoto').value = '';
    }
    document.getElementById('laptopModal').classList.remove('hidden');
}

async function saveLaptop() {
    const title = document.getElementById('lapTitle').value.trim();
    const errEl = document.getElementById('lapTitleErr');

    if (!title) {
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const priceRaw = document.getElementById('lapPrice').value.trim();
    const payload = {
        title,
        brand: document.getElementById('lapBrand').value.trim() || null,
        model: document.getElementById('lapModel').value.trim() || null,
        cpu: document.getElementById('lapCpu').value.trim() || null,
        ram: document.getElementById('lapRam').value.trim() || null,
        storage: document.getElementById('lapStorage').value.trim() || null,
        condition: document.getElementById('lapCondition').value || null,
        notes: document.getElementById('lapNotes').value.trim() || null,
        price: priceRaw === '' ? null : Number(priceRaw),
    };

    const btn = document.getElementById('saveLaptopBtn');
    btn.disabled = true;
    const wasEditing = editingLaptopId;
    try {
        const fileInput = document.getElementById('lapPhoto');
        if (fileInput.files && fileInput.files.length > 0) {
            btn.textContent = 'Uploading photo...';
            const url = await uploadLaptopPhoto(fileInput.files[0]);
            if (url)
                payload.photo_url = url;
        }

        let error;
        if (wasEditing) {
            ({ error } = await db.from('inventory_laptops').update(payload).eq('id', wasEditing));
        }
        else {
            payload.created_by = currentUser.id;
            ({ error } = await db.from('inventory_laptops').insert(payload));
        }
        if (error)
            throw error;

        // Only clear the edit id on success. Clearing it on failure would turn
        // a retry into an INSERT, silently duplicating the row.
        editingLaptopId = null;
        closeModal('laptopModal');
        await loadLaptops();
        showToast(wasEditing ? '✅ Laptop updated!' : '✅ Laptop added!', 'success');
    }
    catch (err) {
        showToast(err.message || 'Failed to save laptop', 'error');
    }
    finally {
        btn.disabled = false;
        btn.textContent = '💾 Save Laptop';
    }
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
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="adjustQty('${r.id}', -1)" ${r.quantity === 0 ? 'disabled' : ''}>−</button>
          <button class="btn btn-secondary btn-sm" onclick="adjustQty('${r.id}', 1)">+</button>
          <button class="btn btn-secondary btn-sm" onclick="editItem('${r.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('${r.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
}

async function adjustQty(id, delta) {
    const { data: row, error: readErr } = await db
        .from('inventory_items').select('quantity').eq('id', id).single();
    if (readErr) {
        showToast('Failed to read stock', 'error');
        return;
    }
    const next = Math.max(0, (row.quantity || 0) + delta);
    const { error } = await db.from('inventory_items').update({ quantity: next }).eq('id', id);
    if (error) {
        showToast('Failed to update stock', 'error');
        return;
    }
    await loadItems();
}

async function editItem(id) {
    const { data, error } = await db.from('inventory_items').select('*').eq('id', id).single();
    if (error || !data) {
        showToast('Failed to load part', 'error');
        return;
    }
    document.getElementById('itemName').value = data.name || '';
    document.getElementById('itemCategory').value = data.category || 'other';
    document.getElementById('itemQty').value = data.quantity ?? 0;
    document.getElementById('itemPrice').value = data.price ?? '';
    document.getElementById('itemNotes').value = data.notes || '';
    openItemModal(id);
}

async function deleteItem(id) {
    if (!confirm('Delete this part from inventory?\n\nThis cannot be undone.'))
        return;
    const { error } = await db.from('inventory_items').delete().eq('id', id);
    if (error) {
        showToast('Failed to delete part', 'error');
        return;
    }
    await loadItems();
    showToast('🗑️ Part deleted', 'success');
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
// EXPOSE FUNCTIONS TO HTML (onclick handlers)
// =============================================
window.adjustQty = adjustQty;
window.editItem = editItem;
window.deleteItem = deleteItem;

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initInventory);
