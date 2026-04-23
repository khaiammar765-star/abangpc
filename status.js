"use strict";
// =============================================
// AbangPC – status.ts
// Public Repair Status Checker
// =============================================
// =============================================
// INIT
// =============================================
function initStatusPage() {
    initParticles();
    bindEvents();
    // Auto-fill from URL param e.g. status.html?ticket=20260420-001
    const urlParams = new URLSearchParams(window.location.search);
    const ticketParam = urlParams.get('ticket');
    if (ticketParam) {
        const input = document.getElementById('ticketInput');
        input.value = ticketParam.toUpperCase();
        checkStatus(ticketParam.toUpperCase());
    }
}
// =============================================
// BIND EVENTS
// =============================================
function bindEvents() {
    const form = document.getElementById('statusForm');
    const input = document.getElementById('ticketInput');
    // Auto uppercase as user types
    input.addEventListener('input', () => {
        const pos = input.selectionStart;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(pos, pos);
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ticket = input.value.trim();
        if (!ticket)
            return;
        checkStatus(ticket);
    });
}
// =============================================
// CHECK STATUS
// =============================================
async function checkStatus(ticketNumber) {
    const resultEl = document.getElementById('statusResult');
    const errorEl = document.getElementById('statusError');
    const btn = document.getElementById('checkBtn');
    const btnText = document.getElementById('checkBtnText');
    const spinner = document.getElementById('checkSpinner');
    // Reset
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    errorEl.textContent = '';
    // Loading state
    btn.disabled = true;
    btnText.textContent = 'Checking...';
    spinner.classList.remove('hidden');
    try {
        const { data, error } = await db.rpc('check_ticket_status', {
            p_ticket_number: ticketNumber
        });
        if (error)
            throw error;
        if (!data || data.length === 0) {
            throw new Error(`Ticket "${ticketNumber}" not found. Please check your ticket number and try again.`);
        }
        // Fetch both PC and Laptop diagnose reports
        const [{ data: diagnose }, { data: laptopDiagnose }] = await Promise.all([
            db.from('diagnose_reports').select('pdf_url, done_by').eq('ticket_id', data[0].id || '').single(),
            db.from('diagnose_laptop_reports').select('pdf_url, done_by').eq('ticket_id', data[0].id || '').single(),
        ]);
        renderResult(data[0], resultEl, diagnose, laptopDiagnose);
        resultEl.classList.remove('hidden');
        // Smooth scroll to result
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    catch (err) {
        errorEl.textContent = err.message || 'Something went wrong. Please try again.';
        errorEl.classList.remove('hidden');
    }
    finally {
        btn.disabled = false;
        btnText.textContent = 'Check Status';
        spinner.classList.add('hidden');
    }
}
// =============================================
// RENDER RESULT
// =============================================
function renderResult(ticket, container, diagnose, laptopDiagnose) {
    const statusOrder = ['diagnosing', 'repairing', 'finished', 'ready_pickup', 'collected'];
    const currentIdx = statusOrder.indexOf(ticket.status);
    const stepLabels = {
        diagnosing: { icon: '🔍', label: 'Diagnosing' },
        repairing: { icon: '🔧', label: 'Repairing' },
        finished: { icon: '✅', label: 'Finished' },
        ready_pickup: { icon: '📦', label: 'Ready' },
        collected: { icon: '🏠', label: 'Collected' },
    };
    // Progress steps HTML
    const stepsHTML = statusOrder.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        const { icon, label } = stepLabels[s];
        return `
      <div class="progress-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
        <div class="progress-dot">${isDone ? '✓' : isCurrent ? icon : i + 1}</div>
        <div class="progress-label">${label}</div>
      </div>
    `;
    }).join('');
    // Time in current status
    const timeInStatus = ticket.time_in_current_status
        ? parseDuration(ticket.time_in_current_status)
        : '—';
    // Special banner for ready_pickup
    const readyBanner = ticket.status === 'ready_pickup' ? `
    <div class="alert alert-success" style="margin-top:16px;text-align:center;">
      🎉 <strong>Your device is ready for collection!</strong><br>
      Please come to our shop at Putra Point, Nilai.<br>
      <a href="https://wa.me/60197707324?text=Hi%20AbangPC%2C%20my%20ticket%20${encodeURIComponent(ticket.ticket_number)}%20is%20ready.%20When%20can%20I%20collect%3F"
        style="color:var(--success);font-weight:700;display:inline-block;margin-top:8px;">
        💬 WhatsApp to Confirm Collection
      </a>
    </div>
  ` : '';
    // Collected banner
    const collectedBanner = ticket.status === 'collected' ? `
    <div class="alert alert-info" style="margin-top:16px;text-align:center;">
      ✅ This device has been collected. Thank you for choosing AbangPC!<br>
      <a href="https://wa.me/60197707324" style="color:var(--info);font-weight:700;display:inline-block;margin-top:8px;">
        Need help again? WhatsApp us!
      </a>
    </div>
  ` : '';
    container.innerHTML = `
    <!-- Ticket Header -->
    <div class="status-ticket-header">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="status-ticket-num">${ticket.ticket_number}</div>
          <div class="status-ticket-device">
            ${ticket.device_type === 'laptop' ? '💻' : '🖥️'}
            ${ticket.device_brand || ''} ${ticket.device_model || ''} ${ticket.device_type}
          </div>
        </div>
        <div>${getStatusBadgeHTML(ticket.status)}</div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="status-progress">
      <div class="progress-steps">${stepsHTML}</div>
    </div>

    <!-- Info Grid -->
    <div class="status-info-grid">
      <div class="status-info-item">
        <div class="status-info-label">Current Status</div>
        <div class="status-info-value">${getStatusLabel(ticket.status)}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Time in Status</div>
        <div class="status-info-value">${timeInStatus}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Date Received</div>
        <div class="status-info-value">${formatDate(ticket.created_at)}</div>
      </div>
      <div class="status-info-item">
        <div class="status-info-label">Est. Completion</div>
        <div class="status-info-value">
          ${ticket.estimated_completion ? formatDate(ticket.estimated_completion) : '—'}
        </div>
      </div>
    </div>

    <!-- Issue -->
    <div class="status-info-item" style="margin-top:12px;">
      <div class="status-info-label">Issue Reported</div>
      <div class="status-info-value" style="font-weight:400;font-size:14px;">${ticket.issue_description}</div>
    </div>

    ${readyBanner}
    ${collectedBanner}

    <!-- Diagnose Report Downloads -->
    ${diagnose && diagnose.pdf_url ? `
    <div style="margin-top:16px;padding:14px 16px;background:var(--card);border:1px solid var(--border-hover);border-radius:10px;text-align:center;">
      <div style="font-size:13px;font-weight:700;color:var(--white);margin-bottom:8px;">🖥️ Laporan Diagnos PC</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Done by: ${diagnose.done_by || '—'}</div>
      <a href="${diagnose.pdf_url}" target="_blank" style="text-decoration:none;display:inline-block;background:var(--yellow);color:#000;font-weight:700;font-size:12px;padding:8px 16px;border-radius:8px;">
        ⬇️ Download PC Report
      </a>
    </div>
    ` : ''}
    ${laptopDiagnose && laptopDiagnose.pdf_url ? `
    <div style="margin-top:12px;padding:14px 16px;background:var(--card);border:1px solid var(--border-hover);border-radius:10px;text-align:center;">
      <div style="font-size:13px;font-weight:700;color:var(--white);margin-bottom:8px;">💻 Laporan Diagnose Laptop</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Done by: ${laptopDiagnose.done_by || '—'}</div>
      <a href="${laptopDiagnose.pdf_url}" target="_blank" style="text-decoration:none;display:inline-block;background:var(--yellow);color:#000;font-weight:700;font-size:12px;padding:8px 16px;border-radius:8px;">
        ⬇️ Download Laptop Report
      </a>
    </div>
    ` : ''}

    <!-- Share link -->
    <div style="margin-top:16px;text-align:center;">
      <button onclick="shareTicket('${ticket.ticket_number}')" class="btn btn-secondary btn-sm">
        🔗 Share Status Link
      </button>
    </div>
  `;
}
// =============================================
// SHARE TICKET
// =============================================
function shareTicket(ticketNumber) {
    const url = `${window.location.origin}${window.location.pathname}?ticket=${ticketNumber}`;
    if (navigator.share) {
        navigator.share({
            title: `AbangPC – Ticket ${ticketNumber}`,
            text: `Check repair status for ticket ${ticketNumber}`,
            url,
        });
    }
    else {
        navigator.clipboard.writeText(url).then(() => {
            alert('Status link copied to clipboard!');
        });
    }
}
// =============================================
// HELPERS
// =============================================
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
function formatDate(dateStr) {
    if (!dateStr)
        return '—';
    return new Date(dateStr).toLocaleDateString('en-MY', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}
function parseDuration(interval) {
    if (!interval)
        return '—';
    let totalSecs = 0;
    const days = interval.match(/(\d+) day/);
    const time = interval.match(/(\d+):(\d+):(\d+)/);
    if (days)
        totalSecs += parseInt(days[1]) * 86400;
    if (time) {
        totalSecs += parseInt(time[1]) * 3600;
        totalSecs += parseInt(time[2]) * 60;
        totalSecs += parseInt(time[3]);
    }
    const d = Math.floor(totalSecs / 86400);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    if (d > 0)
        return `${d} day${d > 1 ? 's' : ''} ${h}h`;
    if (h > 0)
        return `${h}h ${m}m`;
    return `${m} minute${m !== 1 ? 's' : ''}`;
}
// =============================================
// PARTICLE ANIMATION
// =============================================
function initParticles() {
    const canvas = document.getElementById('statusParticles');
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
        particles = Array.from({ length: 40 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            radius: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.3 + 0.1,
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
                if (dist < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(245,197,24,${(1 - dist / 100) * 0.08})`;
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
// EXPOSE
// =============================================
window.shareTicket = shareTicket;
// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initStatusPage);
