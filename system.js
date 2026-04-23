"use strict";
// =============================================
// AbangPC Management System — system.ts
// All system logic: auth, login, particles
// =============================================
// =============================================
// PARTICLE ANIMATION (Login page)
// =============================================
function initLoginParticles() {
    const canvas = document.getElementById('loginParticles');
    if (!canvas)
        return;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    let particles = [];
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    function spawn() {
        particles = Array.from({ length: 50 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            radius: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.4 + 0.1,
        }));
    }
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > canvas.width)
                p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height)
                p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(245,197,24,${p.opacity})`;
            ctx.fill();
        });
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(245,197,24,${(1 - dist / 120) * 0.1})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(draw);
    }
    resize();
    spawn();
    draw();
    window.addEventListener('resize', () => { resize(); spawn(); });
}
// =============================================
// AUTH HELPERS
// =============================================
async function getCurrentUser() {
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user)
            return null;
        const { data } = await db
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();
        return data;
    }
    catch (_a) {
        return null;
    }
}
async function requireAuth(redirectTo = 'login.html') {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = redirectTo;
        throw new Error('Not authenticated');
    }
    return user;
}
async function requireManager() {
    const user = await requireAuth();
    if (user.role !== 'manager') {
        window.location.href = 'login.html';
        throw new Error('Not a manager');
    }
    return user;
}
function getUserInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function formatDate(dateStr) {
    if (!dateStr)
        return '—';
    return new Date(dateStr).toLocaleDateString('en-MY', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}
function formatDateTime(dateStr) {
    if (!dateStr)
        return '—';
    return new Date(dateStr).toLocaleString('en-MY', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}
function formatDuration(dateStr) {
    if (!dateStr)
        return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `${days}d ${hours % 24}h`;
    if (hours > 0)
        return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
}
function getStatusLabel(status) {
    const labels = {
        diagnosing: '🔍 Diagnosing',
        repairing: '🔧 Repairing',
        finished: '✅ Finished',
        ready_pickup: '📦 Ready for Pickup',
        collected: '🏠 Collected',
    };
    return labels[status] || status;
}
function getStatusBadgeHTML(status) {
    return `<span class="badge badge-${status}">${getStatusLabel(status)}</span>`;
}
// =============================================
// SIDEBAR HELPERS
// =============================================
function renderSidebar(user, activePage) {
    var _a;
    const sidebarHTML = `
    <div class="sidebar-header">
      <img src="logo.jpeg" alt="AbangPC" class="sidebar-logo" />
      <span class="sidebar-brand">Abang<span>PC</span></span>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Management</div>
      <a href="dashboard.html" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}">
        <span class="nav-item-icon">📊</span> Dashboard
      </a>
      <a href="dashboard.html#create" class="nav-item">
        <span class="nav-item-icon">➕</span> New Ticket
      </a>
      <div class="nav-section-label">Tools</div>
      <a href="status.html" class="nav-item" target="_blank">
        <span class="nav-item-icon">🔍</span> Status Checker
      </a>
      <a href="index.html" class="nav-item">
        <span class="nav-item-icon">🌐</span> Main Website
      </a>
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="user-avatar">${getUserInitials(user.full_name)}</div>
        <div>
          <div class="user-name">${user.full_name}</div>
          <div class="user-role">${user.role}</div>
        </div>
      </div>
      <button class="btn-logout" id="logoutBtn">🚪 Sign Out</button>
    </div>
  `;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.innerHTML = sidebarHTML;
        (_a = document.getElementById('logoutBtn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', logout);
    }
}
async function logout() {
    await db.auth.signOut();
    window.location.href = 'login.html';
}
// =============================================
// LOGIN PAGE
// =============================================
async function initLogin() {
    initLoginParticles();
    // If already logged in, redirect
    const user = await getCurrentUser();
    if (user) {
        window.location.href = 'dashboard.html';
        return;
    }
    const form = document.getElementById('loginForm');
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const togglePw = document.getElementById('togglePw');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = document.getElementById('loginBtnText');
    const spinner = document.getElementById('loginSpinner');
    const errorEl = document.getElementById('loginError');
    // Toggle password visibility
    togglePw === null || togglePw === void 0 ? void 0 : togglePw.addEventListener('click', () => {
        const isText = passEl.type === 'text';
        passEl.type = isText ? 'password' : 'text';
        togglePw.textContent = isText ? '👁️' : '🙈';
    });
    // Form submit
    form === null || form === void 0 ? void 0 : form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.classList.add('hidden');
        errorEl.textContent = '';
        const email = emailEl.value.trim();
        const password = passEl.value;
        // Validate
        let valid = true;
        const emailErrEl = document.getElementById('emailErr');
        const passErrEl = document.getElementById('passwordErr');
        emailErrEl.textContent = '';
        passErrEl.textContent = '';
        if (!email) {
            emailErrEl.textContent = 'Email is required.';
            valid = false;
        }
        if (!password) {
            passErrEl.textContent = 'Password is required.';
            valid = false;
        }
        if (!valid)
            return;
        // Loading state
        loginBtn.disabled = true;
        btnText.textContent = 'Signing in...';
        spinner.classList.remove('hidden');
        try {
            const { data, error } = await db.auth.signInWithPassword({ email, password });
            if (error)
                throw error;
            if (!data.user)
                throw new Error('Login failed. Please try again.');
            // Get user profile
            const { data: profile } = await db
                .from('users')
                .select('*')
                .eq('id', data.user.id)
                .single();
            if (!profile)
                throw new Error('Account not set up. Contact your manager.');
            if (!profile.is_active)
                throw new Error('Your account has been deactivated.');
            // Redirect based on role
            window.location.href = 'dashboard.html';
        }
        catch (err) {
            errorEl.textContent = err.message || 'Login failed. Please check your credentials.';
            errorEl.classList.remove('hidden');
            loginBtn.disabled = false;
            btnText.textContent = 'Sign In';
            spinner.classList.add('hidden');
        }
    });
}
// =============================================
// PUBLIC STATUS CHECKER
// =============================================
async function initStatusChecker() {
    const form = document.getElementById('statusForm');
    const ticketEl = document.getElementById('ticketInput');
    const resultEl = document.getElementById('statusResult');
    const errorEl = document.getElementById('statusError');
    form === null || form === void 0 ? void 0 : form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticketNum = ticketEl.value.trim().toUpperCase();
        if (!ticketNum)
            return;
        resultEl.classList.add('hidden');
        errorEl.classList.add('hidden');
        resultEl.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">Searching...</div>';
        resultEl.classList.remove('hidden');
        try {
            const { data, error } = await db.rpc('check_ticket_status', {
                p_ticket_number: ticketNum
            });
            if (error)
                throw error;
            if (!data || data.length === 0)
                throw new Error('Ticket not found. Please check your ticket number.');
            const ticket = data[0];
            renderStatusResult(ticket, resultEl);
        }
        catch (err) {
            resultEl.classList.add('hidden');
            errorEl.textContent = err.message || 'Something went wrong. Please try again.';
            errorEl.classList.remove('hidden');
        }
    });
}
function renderStatusResult(ticket, container) {
    const statusOrder = ['diagnosing', 'repairing', 'finished', 'ready_pickup', 'collected'];
    const currentIdx = statusOrder.indexOf(ticket.status);
    const stepsHTML = statusOrder.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        const labels = {
            diagnosing: '🔍 Diagnosing',
            repairing: '🔧 Repairing',
            finished: '✅ Finished',
            ready_pickup: '📦 Ready',
            collected: '🏠 Collected',
        };
        return `
      <div class="progress-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
        <div class="progress-dot">${isDone ? '✓' : i + 1}</div>
        <div class="progress-label">${labels[s]}</div>
      </div>
    `;
    }).join('');
    const duration = ticket.time_in_current_status
        ? formatDuration(new Date(Date.now() - parsePgInterval(ticket.time_in_current_status)).toISOString())
        : '—';
    container.innerHTML = `
    <div class="status-ticket-header">
      <div class="status-ticket-num">${ticket.ticket_number}</div>
      <div class="status-ticket-device">
        ${ticket.device_type === 'laptop' ? '💻' : '🖥️'}
        ${ticket.device_brand || ''} ${ticket.device_model || ''} ${ticket.device_type}
        — ${ticket.issue_description}
      </div>
    </div>

    <div class="status-progress">
      <div class="progress-steps">${stepsHTML}</div>
    </div>

    <div class="status-info-grid">
      <div class="status-info-item">
        <div class="status-info-label">Current Status</div>
        <div class="status-info-value">${getStatusLabel(ticket.status)}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Time in Status</div>
        <div class="status-info-value">${duration}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Technician</div>
        <div class="status-info-value">${ticket.technician_name || 'Being assigned'}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Quoted Price</div>
        <div class="status-info-value" style="color:var(--yellow)">
          ${ticket.quoted_price ? 'RM ' + Number(ticket.quoted_price).toFixed(2) : '—'}
        </div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Date Received</div>
        <div class="status-info-value">${formatDate(ticket.created_at)}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Est. Completion</div>
        <div class="status-info-value">${ticket.estimated_completion ? formatDate(ticket.estimated_completion) : '—'}</div>
      </div>
    </div>

    ${ticket.status === 'ready_pickup' ? `
      <div class="alert alert-success" style="margin-top:16px;">
        🎉 Your device is ready! Please come to the shop to collect it.
        <br><a href="https://wa.me/60197707324" style="color:inherit;font-weight:700;">WhatsApp us to confirm: 019-770 7324</a>
      </div>
    ` : ''}
  `;
}
// Helper to parse Postgres interval string to milliseconds
function parsePgInterval(interval) {
    if (!interval)
        return 0;
    let ms = 0;
    const days = interval.match(/(\d+) day/);
    const hours = interval.match(/(\d+):(\d+):(\d+)/);
    if (days)
        ms += parseInt(days[1]) * 86400000;
    if (hours) {
        ms += parseInt(hours[1]) * 3600000;
        ms += parseInt(hours[2]) * 60000;
        ms += parseInt(hours[3]) * 1000;
    }
    return ms;
}
// =============================================
// EXPOSE TO HTML PAGES
// =============================================
const SystemApp = {
    initLogin,
    initStatusChecker,
    requireAuth,
    requireManager,
    getCurrentUser,
    renderSidebar,
    logout,
    formatDate,
    formatDateTime,
    formatDuration,
    getStatusLabel,
    getStatusBadgeHTML,
    getUserInitials,
};
window.SystemApp = SystemApp;
