// =============================================
// AbangPC - Inventory
// Staff-only stock list: used laptops + counted parts
// =============================================
let currentUser = null;
let laptopFilter = 'in_stock';
let editingLaptopId = null;
let editingLaptopSoldCount = 0;
let editingItemId = null;

// =============================================
// HELPERS
// =============================================
function fmtPrice(v) {
    if (v === null || v === undefined || v === '')
        return '—';
    const n = Number(v);
    if (!Number.isFinite(n))
        return '—';
    return 'RM ' + n.toFixed(2);
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

// Keys must match the <option value=""> list in inventory.html. The category
// column is free text, so adding one here needs no database change. Unknown
// values still render, falling back to the raw string.
const CATEGORY_LABELS = {
    gpu: 'GPU',
    ram: 'RAM',
    ssd: 'SSD',
    processor: 'PROCESSOR',
    motherboard: 'MOTHERBOARD',
    monitor: 'MONITOR',
    mouse: 'MOUSE',
    mousepad: 'MOUSEPAD',
    speaker: 'SPEAKER',
    other: 'OTHER',
};

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

    // A laptop card is a batch of identical units: `quantity` is what is left,
    // `sold_count` is how many have gone. A part-sold batch legitimately shows
    // in both tabs, so filter on the counts rather than a single status.
    let query = db.from('inventory_laptops').select('*');
    query = laptopFilter === 'sold'
        ? query.gt('sold_count', 0)
        : query.gt('quantity', 0);

    const { data, error } = await query.order('created_at', { ascending: false });

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
          ${laptopFilter === 'sold'
            ? `<span class="badge">${r.sold_count} sold</span>`
            : `<span class="badge">Qty ${r.quantity}</span>`}
        </div>
        ${r.condition ? `<div class="text-muted" style="font-size:12px;margin-top:4px;">${escapeHtml(r.condition)}</div>` : ''}
        <div class="ticket-card-device">${escapeHtml([r.brand, r.model].filter(Boolean).join(' ')) || '—'}</div>
        <div class="ticket-card-issue">${specs || 'No specs recorded'}</div>
        ${r.notes ? `<div class="text-muted" style="font-size:12px;margin-top:6px;">${escapeHtml(r.notes)}</div>` : ''}
        <div class="ticket-card-footer">
          <span class="ticket-price">${fmtPrice(r.price)}</span>
          <div class="ticket-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="editLaptop('${r.id}')">✏️</button>
            ${laptopFilter === 'sold'
                ? `<button class="btn btn-secondary btn-sm" onclick="unmarkSold('${r.id}')">↩️ Restock</button>`
                : `<button class="btn btn-primary btn-sm" onclick="markSold('${r.id}')">💰 Sell 1</button>`}
            <button class="btn btn-danger btn-sm" onclick="deleteLaptop('${r.id}')">🗑️</button>
          </div>
        </div>
      </div>`;
    }).join('');
}

async function editLaptop(id) {
    const { data, error } = await db.from('inventory_laptops').select('*').eq('id', id).single();
    if (error || !data) {
        showToast('Failed to load laptop', 'error');
        return;
    }
    document.getElementById('lapTitle').value = data.title || '';
    document.getElementById('lapBrand').value = data.brand || '';
    document.getElementById('lapModel').value = data.model || '';
    document.getElementById('lapCpu').value = data.cpu || '';
    document.getElementById('lapRam').value = data.ram || '';
    document.getElementById('lapStorage').value = data.storage || '';
    document.getElementById('lapCondition').value = data.condition || '';
    document.getElementById('lapPrice').value = data.price ?? '';
    document.getElementById('lapNotes').value = data.notes || '';
    document.getElementById('lapQty').value = data.quantity ?? 1;
    document.getElementById('lapPhoto').value = '';
    editingLaptopSoldCount = data.sold_count || 0;
    openLaptopModal(id);
}

// Sells one unit out of the batch: quantity down one, sold_count up one.
async function markSold(id) {
    const { data: row, error: readErr } = await db.from('inventory_laptops')
        .select('title, quantity, sold_count').eq('id', id).single();
    if (readErr || !row) {
        showToast('Failed to read laptop', 'error');
        return;
    }
    if ((row.quantity || 0) <= 0) {
        showToast('None left in stock', 'error');
        return;
    }
    if (!confirm(`Sell one "${row.title}"?\n\nIn stock: ${row.quantity} → ${row.quantity - 1}`))
        return;

    const nextQty = row.quantity - 1;
    // Guarded update: only applies if the counts are still what we just read,
    // so two staff selling at the same moment cannot overwrite each other's
    // sale. Zero rows updated means someone else got there first.
    const { data: updated, error } = await db.from('inventory_laptops')
        .update({
            quantity: nextQty,
            sold_count: (row.sold_count || 0) + 1,
            // status is kept in step with the counts so the table stays readable
            // in Supabase, even though the tabs now filter on the counts.
            status: nextQty === 0 ? 'sold' : 'in_stock',
            sold_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('quantity', row.quantity)
        .eq('sold_count', row.sold_count ?? 0)
        .select('id');
    if (error) {
        showToast('Failed to record sale', 'error');
        return;
    }
    if (!updated || updated.length === 0) {
        showToast('Stock changed on another device — refreshed, please try again', 'error');
        await loadLaptops();
        return;
    }
    await loadLaptops();
    showToast('💰 Sold 1!', 'success');
}

// Puts one sold unit back: the exact inverse of markSold.
async function unmarkSold(id) {
    const { data: row, error: readErr } = await db.from('inventory_laptops')
        .select('quantity, sold_count').eq('id', id).single();
    if (readErr || !row) {
        showToast('Failed to read laptop', 'error');
        return;
    }
    if ((row.sold_count || 0) <= 0) {
        showToast('Nothing to restock', 'error');
        return;
    }
    // Guarded update, same reasoning as markSold.
    const { data: updated, error } = await db.from('inventory_laptops')
        .update({
            quantity: (row.quantity || 0) + 1,
            sold_count: row.sold_count - 1,
            status: 'in_stock',
        })
        .eq('id', id)
        .eq('quantity', row.quantity)
        .eq('sold_count', row.sold_count)
        .select('id');
    if (error) {
        showToast('Failed to restock', 'error');
        return;
    }
    if (!updated || updated.length === 0) {
        showToast('Stock changed on another device — refreshed, please try again', 'error');
        await loadLaptops();
        return;
    }
    await loadLaptops();
    showToast('↩️ Back in stock', 'success');
}

async function deleteLaptop(id) {
    if (!confirm('Delete this laptop from inventory?\n\nThis cannot be undone.'))
        return;
    const { error } = await db.from('inventory_laptops').delete().eq('id', id);
    if (error) {
        showToast('Failed to delete laptop', 'error');
        return;
    }
    await loadLaptops();
    showToast('🗑️ Laptop deleted', 'success');
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
        document.getElementById('lapQty').value = '1';
        editingLaptopSoldCount = 0;
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
    const price = priceRaw === '' ? null : Number(priceRaw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
        showToast('Price must be 0 or more', 'error');
        return;
    }

    // A batch with 0 left and 0 sold matches neither tab filter and would
    // vanish from the page, so quantity 0 is only allowed once something
    // has actually been sold.
    const quantity = Math.max(0, parseInt(document.getElementById('lapQty').value, 10) || 0);
    if (quantity === 0 && editingLaptopSoldCount === 0) {
        showToast('Quantity must be at least 1 — delete the laptop instead if it is gone', 'error');
        return;
    }

    const payload = {
        title,
        brand: document.getElementById('lapBrand').value.trim() || null,
        model: document.getElementById('lapModel').value.trim() || null,
        cpu: document.getElementById('lapCpu').value.trim() || null,
        ram: document.getElementById('lapRam').value.trim() || null,
        storage: document.getElementById('lapStorage').value.trim() || null,
        condition: document.getElementById('lapCondition').value || null,
        notes: document.getElementById('lapNotes').value.trim() || null,
        price,
        quantity,
        // Keep status in step with the counts on edit too, the same way
        // markSold does, so the Supabase table never contradicts the tabs.
        status: quantity === 0 ? 'sold' : 'in_stock',
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
    // Guarded update: only applies if the quantity is still what we just read,
    // so two staff adjusting the same part at once cannot lose an update.
    const { data: updated, error } = await db.from('inventory_items')
        .update({ quantity: next })
        .eq('id', id)
        .eq('quantity', row.quantity)
        .select('id');
    if (error) {
        showToast('Failed to update stock', 'error');
        return;
    }
    if (!updated || updated.length === 0) {
        showToast('Stock changed on another device — refreshed, please try again', 'error');
        await loadItems();
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
    const price = priceRaw === '' ? null : Number(priceRaw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
        showToast('Price must be 0 or more', 'error');
        return;
    }

    const payload = {
        name,
        category: document.getElementById('itemCategory').value,
        quantity: Math.max(0, parseInt(document.getElementById('itemQty').value, 10) || 0),
        price,
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
window.editLaptop = editLaptop;
window.markSold = markSold;
window.unmarkSold = unmarkSold;
window.deleteLaptop = deleteLaptop;

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initInventory);
