// =============================================
// AbangPC - Inventory
// Staff-only stock list: used laptops + counted parts
// =============================================
let currentUser = null;
let laptopFilter = 'in_stock';
let editingLaptopId = null;
let editingItemId = null;

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
    // Implemented in Task 5
}

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initInventory);
