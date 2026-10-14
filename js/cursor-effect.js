/**
 * TRONEX Antigravity Interactive Cursor & Proximity Spotlight System
 * 
 * Layer 1: Antigravity Micro-particles Canvas (Repulsion + Spring Physics + Dynamic Constellations)
 * Layer 2: Smooth Lerp Cursor Aura (Radial Glow) & Magnetic Ring with Interactive Hover Scaling
 * Layer 3: Proximity Card Spotlight (--mouse-x, --mouse-y tracking on interactive cards)
 * Safeguards: Disables on touch devices, pauses in Zen Mode, keeps default system cursor intact
 */

(function () {
  'use strict';

  // Safeguard 1: Do not run on touchscreen or mobile devices
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    return;
  }

  // Ensure DOM is ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAntigravityCursor);
  } else {
    initAntigravityCursor();
  }

  function initAntigravityCursor() {
    // -------------------------------------------------------------
    // 1. SETUP DOM ELEMENTS
    // -------------------------------------------------------------
    let canvas = document.getElementById('antigravityCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'antigravityCanvas';
      document.body.appendChild(canvas);
    }

    let aura = document.querySelector('.cursor-glow-aura');
    if (!aura) {
      aura = document.createElement('div');
      aura.className = 'cursor-glow-aura';
      document.body.appendChild(aura);
    }

    let ring = document.querySelector('.cursor-magnetic-ring');
    if (!ring) {
      ring = document.createElement('div');
      ring.className = 'cursor-magnetic-ring';
      document.body.appendChild(ring);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // -------------------------------------------------------------
    // 2. STATE & CONFIGURATION
    // -------------------------------------------------------------
    let width = 0;
    let height = 0;
    let dpr = 1;

    let mouseX = -9999;
    let mouseY = -9999;
    let isMouseOnScreen = false;
    let isHovering = false;

    // Lerp positions for Aura and Ring
    let auraX = -9999;
    let auraY = -9999;
    let ringX = -9999;
    let ringY = -9999;

    let particles = [];
    const REPULSION_RADIUS = 150;
    const REPULSION_POWER = 8.5;
    const SPRING = 0.055;
    const FRICTION = 0.82;
    const GRID_SPACING = 92;

    const isDarkMode = () => document.documentElement.getAttribute('data-theme') === 'dark';

    // -------------------------------------------------------------
    // 3. RESIZE & PARTICLE GRID SETUP
    // -------------------------------------------------------------
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(dpr, dpr);

      initParticles();
    }

    function initParticles() {
      particles = [];
      const cols = Math.ceil(width / GRID_SPACING) + 1;
      const rows = Math.ceil(height / GRID_SPACING) + 1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const originX = c * GRID_SPACING + (Math.sin(r * 1.5 + c) * 12);
          const originY = r * GRID_SPACING + (Math.cos(r + c * 1.5) * 12);
          const rand = Math.random();
          const colorType = rand < 0.4 ? 'indigo' : (rand < 0.75 ? 'cyan' : 'violet');

          particles.push({
            originX: originX,
            originY: originY,
            x: originX,
            y: originY,
            vx: 0,
            vy: 0,
            baseRadius: 1.5 + Math.random() * 0.9,
            colorType: colorType
          });
        }
      }
    }

    window.addEventListener('resize', debounce(resize, 180));
    resize();

    // -------------------------------------------------------------
    // 4. MOUSE EVENT HANDLERS
    // -------------------------------------------------------------
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (!isMouseOnScreen) {
        isMouseOnScreen = true;
        // Snap directly on first entry to avoid flying in from corner
        if (auraX < 0) {
          auraX = mouseX;
          auraY = mouseY;
          ringX = mouseX;
          ringY = mouseY;
        }
      }

      // Layer 3: Proximity Card Spotlight coordinates update
      const targetCard = e.target.closest(
        '.quiz-card, .mission-card, .stat-card, .bento-card, .setup-card, .vact-lobby-hero, .profile-card, .bento-policy-surface'
      );
      if (targetCard) {
        const rect = targetCard.getBoundingClientRect();
        targetCard.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        targetCard.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      }
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      isMouseOnScreen = false;
      mouseX = -9999;
      mouseY = -9999;
    });

    // Interactive Hover Elements for Magnetic Ring scaling
    const HOVER_SELECTORS = 'a, button, .quiz-card, .mission-card, .stat-card, .bento-card, .tronex-option-label, .filter-tab, [role="button"], input, select, textarea, .card-start-btn';

    document.addEventListener('mouseover', (e) => {
      if (e.target && e.target.closest && e.target.closest(HOVER_SELECTORS)) {
        isHovering = true;
        ring.classList.add('is-hovering');
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(HOVER_SELECTORS)) {
        isHovering = false;
        ring.classList.remove('is-hovering');
      }
    });

    // -------------------------------------------------------------
    // 5. ANIMATION & PHYSICS RENDER LOOP
    // -------------------------------------------------------------
    function render() {
      // Safeguard 2: Pause rendering if user is in Zen Mode (v-act.html)
      if (document.body.classList.contains('zen-mode')) {
        ctx.clearRect(0, 0, width, height);
        aura.style.opacity = '0';
        ring.style.opacity = '0';
        requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      const isDark = isDarkMode();

      // --- Update Lerp Positions for Aura & Ring ---
      if (isMouseOnScreen) {
        auraX += (mouseX - auraX) * 0.10;
        auraY += (mouseY - auraY) * 0.10;
        ringX += (mouseX - ringX) * 0.20;
        ringY += (mouseY - ringY) * 0.20;

        aura.style.opacity = '1';
        ring.style.opacity = '1';
      } else {
        aura.style.opacity = '0';
        ring.style.opacity = '0';
      }

      aura.style.transform = `translate3d(${auraX}px, ${auraY}px, 0)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) ${isHovering ? 'scale(1.42)' : 'scale(1)'}`;

      // --- Physics & Particle Simulation ---
      const nearParticles = [];
      const particleLen = particles.length;

      for (let i = 0; i < particleLen; i++) {
        const p = particles[i];

        // 1. Antigravity Mouse Repulsion
        if (isMouseOnScreen) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.hypot(dx, dy);

          if (dist < REPULSION_RADIUS && dist > 0.1) {
            const force = (1 - dist / REPULSION_RADIUS) * REPULSION_POWER;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force * 1.1;
            p.vy += Math.sin(angle) * force * 1.1;

            nearParticles.push({ p, dist });
          }
        }

        // 2. Spring Hooke's Law back to origin
        p.vx += (p.originX - p.x) * SPRING;
        p.vy += (p.originY - p.y) * SPRING;

        // 3. Viscous Friction Damping
        p.vx *= FRICTION;
        p.vy *= FRICTION;

        // 4. Update Position
        p.x += p.vx;
        p.y += p.vy;
      }

      // --- Subtle Constellation Field Lines near Cursor ---
      const nearLen = nearParticles.length;
      if (nearLen > 1) {
        ctx.lineWidth = 0.9;
        for (let i = 0; i < nearLen; i++) {
          for (let j = i + 1; j < nearLen; j++) {
            const p1 = nearParticles[i].p;
            const p2 = nearParticles[j].p;
            const lineDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

            if (lineDist < 95) {
              const proximityFactor = Math.min(
                1 - nearParticles[i].dist / REPULSION_RADIUS,
                1 - nearParticles[j].dist / REPULSION_RADIUS
              );
              const alpha = (1 - lineDist / 95) * proximityFactor * (isDark ? 0.38 : 0.28);

              ctx.strokeStyle = isDark
                ? `rgba(99, 102, 241, ${alpha})`
                : `rgba(79, 70, 229, ${alpha})`;

              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }

      // --- Draw Particles ---
      for (let i = 0; i < particleLen; i++) {
        const p = particles[i];
        let currentRadius = p.baseRadius;
        let fillStyle = '';

        if (isMouseOnScreen) {
          const distToMouse = Math.hypot(p.x - mouseX, p.y - mouseY);

          if (distToMouse < REPULSION_RADIUS) {
            const exciteFactor = 1 - (distToMouse / REPULSION_RADIUS);
            currentRadius += exciteFactor * 1.2;

            if (isDark) {
              if (p.colorType === 'cyan') {
                fillStyle = `rgba(56, 189, 248, ${0.45 + exciteFactor * 0.5})`;
              } else if (p.colorType === 'violet') {
                fillStyle = `rgba(168, 85, 247, ${0.45 + exciteFactor * 0.5})`;
              } else {
                fillStyle = `rgba(99, 102, 241, ${0.45 + exciteFactor * 0.5})`;
              }
            } else {
              if (p.colorType === 'cyan') {
                fillStyle = `rgba(14, 165, 233, ${0.4 + exciteFactor * 0.5})`;
              } else {
                fillStyle = `rgba(79, 70, 229, ${0.45 + exciteFactor * 0.5})`;
              }
            }
          }
        }

        // Default ambient dot style
        if (!fillStyle) {
          fillStyle = isDark
            ? 'rgba(99, 102, 241, 0.20)'
            : 'rgba(79, 70, 229, 0.22)';
        }

        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  }

  // Utility Debounce function
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
})();
