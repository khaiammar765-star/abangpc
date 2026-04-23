// =============================================
// AbangPC Management System — system.ts
// All system logic: auth, login, particles
// =============================================

// ---------- Types ----------
interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'manager' | 'staff';
  phone?: string;
  is_active: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

interface Ticket {
  id: string;
  ticket_number: string;
  customer_id: string;
  device_type: 'laptop' | 'desktop';
  device_brand?: string;
  device_model?: string;
  issue_description: string;
  quoted_price?: number;
  status: 'diagnosing' | 'repairing' | 'finished' | 'ready_pickup' | 'collected';
  assigned_to?: string;
  created_by: string;
  estimated_completion?: string;
  internal_notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  collected_at?: string;
  customers?: Customer;
  assignee?: User;
}

interface StatusHistory {
  id: string;
  ticket_id: string;
  status: string;
  changed_by?: string;
  changed_at: string;
  notes?: string;
  changer?: User;
}

// ---------- Declare globals from config.js ----------
declare const db: any;

// =============================================
// PARTICLE ANIMATION (Login page)
// =============================================
function initLoginParticles(): void {
  const canvas = document.getElementById('loginParticles') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    radius: number; opacity: number;
  }

  let particles: Particle[] = [];

  function resize(): void {
    canvas!.width = window.innerWidth;
    canvas!.height = window.innerHeight;
  }

  function spawn(): void {
    particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas!.width,
      y: Math.random() * canvas!.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
    }));
  }

  function draw(): void {
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas!.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas!.height) p.vy *= -1;

      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(245,197,24,${p.opacity})`;
      ctx!.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx!.beginPath();
          ctx!.strokeStyle = `rgba(245,197,24,${(1 - dist / 120) * 0.1})`;
          ctx!.lineWidth = 0.5;
          ctx!.moveTo(particles[i].x, particles[i].y);
          ctx!.lineTo(particles[j].x, particles[j].y);
          ctx!.stroke();
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
async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data } = await db
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    return data as User | null;
  } catch {
    return null;
  }
}

async function requireAuth(redirectTo: string = 'login.html'): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo;
    throw new Error('Not authenticated');
  }
  return user;
}

async function requireManager(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== 'manager') {
    window.location.href = 'staff.html';
    throw new Error('Not a manager');
  }
  return user;
}

function getUserInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(dateStr: string): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    diagnosing:   '🔍 Diagnosing',
    repairing:    '🔧 Repairing',
    finished:     '✅ Finished',
    ready_pickup: '📦 Ready for Pickup',
    collected:    '🏠 Collected',
  };
  return labels[status] || status;
}

function getStatusBadgeHTML(status: string): string {
  return `<span class="badge badge-${status}">${getStatusLabel(status)}</span>`;
}

// =============================================
// SIDEBAR HELPERS
// =============================================
function renderSidebar(user: User, activePage: string): void {
  const isManager = user.role === 'manager';

  const managerNav = isManager ? `
    <div class="nav-section-label">Management</div>
    <a href="dashboard.html" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}">
      <span class="nav-item-icon">📊</span> Dashboard
    </a>
    <a href="dashboard.html#create" class="nav-item">
      <span class="nav-item-icon">➕</span> New Ticket
    </a>
    <a href="dashboard.html#staff" class="nav-item ${activePage === 'staff-mgmt' ? 'active' : ''}">
      <span class="nav-item-icon">👥</span> Manage Staff
    </a>
  ` : '';

  const staffNav = `
    <div class="nav-section-label">Tickets</div>
    <a href="${isManager ? 'dashboard' : 'staff'}.html" class="nav-item ${activePage === 'tickets' ? 'active' : ''}">
      <span class="nav-item-icon">🎫</span> My Tickets
    </a>
  `;

  const sidebarHTML = `
    <div class="sidebar-header">
      <img src="logo.jpeg" alt="AbangPC" class="sidebar-logo" />
      <span class="sidebar-brand">Abang<span>PC</span></span>
    </div>
    <nav class="sidebar-nav">
      ${managerNav}
      ${staffNav}
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
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
  }
}

async function logout(): Promise<void> {
  await db.auth.signOut();
  window.location.href = 'login.html';
}

// =============================================
// LOGIN PAGE
// =============================================
async function initLogin(): Promise<void> {
  initLoginParticles();

  // If already logged in, redirect
  const user = await getCurrentUser();
  if (user) {
    window.location.href = user.role === 'manager' ? 'dashboard.html' : 'staff.html';
    return;
  }

  const form     = document.getElementById('loginForm') as HTMLFormElement;
  const emailEl  = document.getElementById('email')     as HTMLInputElement;
  const passEl   = document.getElementById('password')  as HTMLInputElement;
  const togglePw = document.getElementById('togglePw')  as HTMLButtonElement;
  const loginBtn = document.getElementById('loginBtn')  as HTMLButtonElement;
  const btnText  = document.getElementById('loginBtnText') as HTMLSpanElement;
  const spinner  = document.getElementById('loginSpinner') as HTMLSpanElement;
  const errorEl  = document.getElementById('loginError')   as HTMLDivElement;

  // Toggle password visibility
  togglePw?.addEventListener('click', () => {
    const isText = passEl.type === 'text';
    passEl.type = isText ? 'password' : 'text';
    togglePw.textContent = isText ? '👁️' : '🙈';
  });

  // Form submit
  form?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    const email    = emailEl.value.trim();
    const password = passEl.value;

    // Validate
    let valid = true;
    const emailErrEl = document.getElementById('emailErr') as HTMLSpanElement;
    const passErrEl  = document.getElementById('passwordErr') as HTMLSpanElement;
    emailErrEl.textContent = '';
    passErrEl.textContent  = '';

    if (!email) { emailErrEl.textContent = 'Email is required.'; valid = false; }
    if (!password) { passErrEl.textContent = 'Password is required.'; valid = false; }
    if (!valid) return;

    // Loading state
    loginBtn.disabled = true;
    btnText.textContent = 'Signing in...';
    spinner.classList.remove('hidden');

    try {
      const { data, error } = await db.auth.signInWithPassword({ email, password });

      if (error) throw error;
      if (!data.user) throw new Error('Login failed. Please try again.');

      // Get user profile
      const { data: profile } = await db
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (!profile) throw new Error('Account not set up. Contact your manager.');
      if (!profile.is_active) throw new Error('Your account has been deactivated.');

      // Redirect based on role
      window.location.href = profile.role === 'manager' ? 'dashboard.html' : 'staff.html';

    } catch (err: any) {
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
async function initStatusChecker(): Promise<void> {
  const form      = document.getElementById('statusForm')    as HTMLFormElement;
  const ticketEl  = document.getElementById('ticketInput')   as HTMLInputElement;
  const resultEl  = document.getElementById('statusResult')  as HTMLDivElement;
  const errorEl   = document.getElementById('statusError')   as HTMLDivElement;

  form?.addEventListener('submit', async (e: Event) => {
    e.preventDefault();
    const ticketNum = ticketEl.value.trim().toUpperCase();
    if (!ticketNum) return;

    resultEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    resultEl.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">Searching...</div>';
    resultEl.classList.remove('hidden');

    try {
      const { data, error } = await db.rpc('check_ticket_status', {
        p_ticket_number: ticketNum
      });

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Ticket not found. Please check your ticket number.');

      const ticket = data[0];
      renderStatusResult(ticket, resultEl);

    } catch (err: any) {
      resultEl.classList.add('hidden');
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      errorEl.classList.remove('hidden');
    }
  });
}

function renderStatusResult(ticket: any, container: HTMLDivElement): void {
  const statusOrder = ['diagnosing', 'repairing', 'finished', 'ready_pickup', 'collected'];
  const currentIdx  = statusOrder.indexOf(ticket.status);

  const stepsHTML = statusOrder.map((s, i) => {
    const isDone    = i < currentIdx;
    const isCurrent = i === currentIdx;
    const labels: Record<string, string> = {
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
function parsePgInterval(interval: string): number {
  if (!interval) return 0;
  let ms = 0;
  const days    = interval.match(/(\d+) day/);
  const hours   = interval.match(/(\d+):(\d+):(\d+)/);
  if (days)  ms += parseInt(days[1]) * 86400000;
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

(window as any).SystemApp = SystemApp;
