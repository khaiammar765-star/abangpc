// =============================================
// AbangPC — app.ts
// All interactive logic in TypeScript
// =============================================

// ---------- Types ----------
interface Product {
  icon: string;
  name: string;
  badge: 'new' | 'used';
  price: string;
  desc: string;
}

interface Service {
  icon: string;
  name: string;
  desc: string;
  from: string;
}

interface Step {
  num: number;
  title: string;
  desc: string;
}

// ---------- Data ----------
const products: Product[] = [
  { icon: '💻', name: 'Refurbished Laptops', badge: 'used', price: 'From RM 450', desc: 'Cleaned, tested & formatted. Core i5 / i7 options available.' },
  { icon: '🖥️', name: 'Desktop PCs', badge: 'new', price: 'From RM 1,200', desc: 'Custom-built or branded units. Gaming & office configurations.' },
  { icon: '🧠', name: 'RAM & SSD Upgrades', badge: 'new', price: 'From RM 80', desc: 'DDR4/DDR5 RAM and SATA/NVMe SSDs. Installed while you wait.' },
  { icon: '⌨️', name: 'Peripherals', badge: 'new', price: 'From RM 25', desc: 'Keyboards, mice, webcams, cables & accessories in stock.' },
  { icon: '🔋', name: 'Laptop Batteries', badge: 'new', price: 'From RM 60', desc: 'Compatible batteries for most major brands. Fitted same day.' },
  { icon: '🔌', name: 'Power Adapters', badge: 'new', price: 'From RM 35', desc: 'Universal & brand-specific chargers. All checked before sale.' },
];

const services: Service[] = [
  { icon: '🖥️', name: 'Screen Replacement', desc: 'Cracked or dim displays replaced with quality panels.', from: 'From RM 120' },
  { icon: '💾', name: 'Data Recovery', desc: 'Recover files from failed, corrupted or formatted drives.', from: 'From RM 80' },
  { icon: '🦠', name: 'Virus Removal', desc: 'Full malware cleanup, OS reinstall if needed.', from: 'From RM 50' },
  { icon: '🔌', name: 'Charging Port Repair', desc: 'Laptop charging port damaged? We replace it quickly.', from: 'From RM 60' },
  { icon: '🌡️', name: 'Overheating Fix', desc: 'Thermal paste replacement, fan cleaning & airflow optimisation.', from: 'From RM 40' },
  { icon: '🛠️', name: 'General Servicing', desc: 'Full hardware check, deep cleaning and OS tune-up.', from: 'From RM 35' },
];

const steps: Step[] = [
  { num: 1, title: 'Drop Off', desc: 'Bring in your device — no appointment needed.' },
  { num: 2, title: 'Diagnosis', desc: 'Free check & quote given on the spot.' },
  { num: 3, title: 'Repair', desc: 'We fix it, usually the same day.' },
  { num: 4, title: 'Pick Up', desc: 'Collect your device, good as new.' },
];

// ---------- Render Products ----------
function renderProducts(): void {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  products.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <span class="product-icon">${p.icon}</span>
      <h3>${p.name} <span class="badge-${p.badge}">${p.badge.toUpperCase()}</span></h3>
      <div class="price">${p.price}</div>
      <p class="desc">${p.desc}</p>
      <a class="btn-enquire" href="https://wa.me/60197707324?text=Hi%20AbangPC%2C%20I%27m%20interested%20in%20${encodeURIComponent(p.name)}" target="_blank">Enquire →</a>
    `;
    grid.appendChild(card);
  });
}

// ---------- Render Services ----------
function renderServices(): void {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  services.forEach(s => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div class="service-icon-wrap">${s.icon}</div>
      <div class="service-body">
        <h3>${s.name}</h3>
        <p>${s.desc}</p>
        <div class="price-from">${s.from}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ---------- Render Steps ----------
function renderSteps(): void {
  const container = document.getElementById('stepsContainer');
  if (!container) return;

  steps.forEach(s => {
    const step = document.createElement('div');
    step.className = 'step';
    step.innerHTML = `
      <div class="step-num">${s.num}</div>
      <strong>${s.title}</strong>
      <p>${s.desc}</p>
    `;
    container.appendChild(step);
  });
}

// ---------- Counter Animation ----------
function animateCounter(el: HTMLElement, target: number, suffix: string = '', duration: number = 1800): void {
  let start: number | null = null;
  const step = (timestamp: number): void => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function startCounters(): void {
  const repairs = document.getElementById('countRepairs');
  const years   = document.getElementById('countYears');
  const time    = document.getElementById('countTime');
  if (repairs) animateCounter(repairs, 500, '+');
  if (years)   animateCounter(years, 5);
  if (time)    animateCounter(time, 24);
}

// ---------- Scroll Reveal ----------
function initReveal(): void {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ---------- Navbar Scroll Effect ----------
function initNavbar(): void {
  const navbar = document.getElementById('navbar');
  const links  = document.querySelectorAll<HTMLAnchorElement>('[data-nav]');

  window.addEventListener('scroll', () => {
    if (!navbar) return;
    navbar.classList.toggle('scrolled', window.scrollY > 40);

    // Highlight active nav link
    let current = '';
    document.querySelectorAll('section').forEach(section => {
      if (window.scrollY >= section.offsetTop - 120) current = section.id;
    });
    links.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) link.classList.add('active');
    });
  });
}

// ---------- Hamburger Menu ----------
function initHamburger(): void {
  const btn   = document.getElementById('hamburger');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  btn.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => links.classList.remove('open'));
  });
}

// ---------- Open/Closed Status ----------
function updateOpenStatus(): void {
  const dot    = document.getElementById('openDot');
  const status = document.getElementById('openStatus');
  if (!dot || !status) return;

  const now  = new Date();
  const day  = now.getDay(); // 0 = Sun
  const hour = now.getHours();
  const min  = now.getMinutes();
  const time = hour + min / 60;

  let isOpen = false;
  if (day >= 1 && day <= 6) isOpen = time >= 9 && time < 19;  // Mon–Sat 9–7
  else if (day === 0)        isOpen = time >= 10 && time < 16; // Sun 10–4

  dot.classList.add(isOpen ? 'open' : 'closed');
  status.textContent = isOpen ? 'Open now' : 'Currently closed';
}

// ---------- Hero counter trigger ----------
let countersStarted = false;
function initCounters(): void {
  const hero = document.getElementById('home');
  if (!hero) return;
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !countersStarted) {
      countersStarted = true;
      startCounters();
    }
  }, { threshold: 0.3 });
  obs.observe(hero);
}

// ---------- Contact Form ----------
function initForm(): void {
  const form    = document.getElementById('contactForm') as HTMLFormElement | null;
  const success = document.getElementById('formSuccess');
  const btn     = document.getElementById('submitBtn') as HTMLButtonElement | null;
  if (!form || !success || !btn) return;

  function showError(id: string, msg: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  }
  function clearErrors(): void {
    ['fnameError', 'fphoneError', 'fmsgError'].forEach(id => showError(id, ''));
  }
  function validate(): boolean {
    clearErrors();
    let valid = true;
    const name  = (document.getElementById('fname')  as HTMLInputElement).value.trim();
    const phone = (document.getElementById('fphone') as HTMLInputElement).value.trim();
    const msg   = (document.getElementById('fmsg')   as HTMLTextAreaElement).value.trim();

    if (!name)  { showError('fnameError',  'Please enter your name.'); valid = false; }
    if (!phone) { showError('fphoneError', 'Please enter your phone number.'); valid = false; }
    if (!msg)   { showError('fmsgError',   'Please enter a message.'); valid = false; }
    return valid;
  }

  form.addEventListener('submit', (e: Event) => {
    e.preventDefault();
    if (!validate()) return;

    const name  = (document.getElementById('fname')  as HTMLInputElement).value.trim();
    const phone = (document.getElementById('fphone') as HTMLInputElement).value.trim();
    const type  = (document.getElementById('ftype')  as HTMLSelectElement).value;
    const msg   = (document.getElementById('fmsg')   as HTMLTextAreaElement).value.trim();

    const waMsg = encodeURIComponent(
      `Hi AbangPC!\n\nName: ${name}\nPhone: ${phone}\nEnquiry: ${type}\n\n${msg}`
    );
    btn.disabled = true;
    btn.textContent = 'Sending...';

    setTimeout(() => {
      form.style.display = 'none';
      success.classList.add('show');
      window.open(`https://wa.me/60197707324?text=${waMsg}`, '_blank');
    }, 800);
  });
}

// ---------- Particle Animation ----------
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

function initParticles(): void {
  const canvas = document.getElementById('particleCanvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let particles: Particle[] = [];
  const PARTICLE_COUNT = 60;
  const CONNECT_DISTANCE = 130;

  function resize(): void {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;
  }

  function createParticles(): void {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.8 + 0.6,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }
  }

  function animate(): void {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update & draw particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Bounce off edges
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245, 197, 24, ${p.opacity})`;
      ctx.fill();
    });

    // Draw connecting lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < CONNECT_DISTANCE) {
          const alpha = (1 - distance / CONNECT_DISTANCE) * 0.15;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(245, 197, 24, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(animate);
  }

  resize();
  createParticles();
  animate();

  window.addEventListener('resize', () => {
    resize();
    createParticles();
  });
}

// ---------- Dropping PC Emojis ----------
function initDroppingEmojis(): void {
  const hero = document.getElementById('home');
  if (!hero) return;

  const emojis = ['💾', '🖥️', '⚡', '🔧', '🖱️', '⌨️', '🔌', '💿', '🧠', '📡', '🔩', '💡'];

  interface EmojiDrop {
    el: HTMLSpanElement;
    x: number;
    y: number;
    speed: number;
    size: number;
    opacity: number;
    rotation: number;
    rotSpeed: number;
    sway: number;
    swaySpeed: number;
    swayOffset: number;
  }

  const drops: EmojiDrop[] = [];
  const heroRect = hero.getBoundingClientRect();
  const heroHeight = hero.offsetHeight;
  const heroWidth = hero.offsetWidth;

  // Create container
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
  `;
  hero.style.position = 'relative';
  hero.insertBefore(container, hero.firstChild);

  // Spawn a new emoji drop
  function spawnDrop(): void {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const size = Math.random() * 20 + 18; // 18-38px
    const x = Math.random() * heroWidth;

    const el = document.createElement('span');
    el.textContent = emoji;
    el.style.cssText = `
      position: absolute;
      font-size: ${size}px;
      left: ${x}px;
      top: -${size + 10}px;
      opacity: 0;
      user-select: none;
      pointer-events: none;
      filter: drop-shadow(0 0 4px rgba(245,197,24,0.3));
    `;
    container.appendChild(el);

    const drop: EmojiDrop = {
      el,
      x,
      y: -(size + 10),
      speed: Math.random() * 1.5 + 0.8,
      size,
      opacity: Math.random() * 0.4 + 0.15,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 1.5,
      sway: Math.random() * 30 + 10,
      swaySpeed: Math.random() * 0.02 + 0.01,
      swayOffset: Math.random() * Math.PI * 2,
    };
    drops.push(drop);
  }

  // Animate all drops
  let frame = 0;
  function animate(): void {
    frame++;

    // Spawn new drop every 30 frames
    if (frame % 30 === 0) spawnDrop();

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.speed;
      d.rotation += d.rotSpeed;

      // Sway left and right
      const swayX = Math.sin(frame * d.swaySpeed + d.swayOffset) * d.sway;

      // Fade in at top, fade out at bottom
      const progress = d.y / heroHeight;
      if (progress < 0.1) {
        d.opacity = Math.min(d.opacity, progress * 10 * 0.4);
      } else if (progress > 0.75) {
        d.opacity = Math.max(0, d.opacity - 0.008);
      }

      d.el.style.transform = `translate(${swayX}px, ${d.y}px) rotate(${d.rotation}deg)`;
      d.el.style.opacity = String(d.opacity);

      // Remove when past bottom
      if (d.y > heroHeight + 50) {
        d.el.remove();
        drops.splice(i, 1);
      }
    }

    requestAnimationFrame(animate);
  }

  // Spawn a few immediately
  for (let i = 0; i < 6; i++) {
    setTimeout(spawnDrop, i * 400);
  }

  animate();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  renderServices();
  renderSteps();
  initReveal();
  initNavbar();
  initHamburger();
  initCounters();
  updateOpenStatus();
  initForm();
  initParticles();
  initDroppingEmojis();
});
