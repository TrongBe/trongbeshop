/**
 * TRONEX Antigravity Interactive Cursor & Proximity Spotlight System (v2.1)
 * 
 * Layer 1: Antigravity Micro-particles Canvas (Repulsion + Orbital Swirl + Constellation Lines to Mouse)
 * Layer 2: Smooth LERP Cursor Aura (Radial Glow) & Magnetic Ring with Interactive Hover Scaling
 * Layer 3: Proximity Card Spotlight (--mouse-x, --mouse-y tracking on interactive cards)
 * Safeguards: Responsive to mousemove without touchscreen blocking, pauses in Zen Mode
 */

(function () {
  'use strict';

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
    let prevMouseX = -9999;
    let prevMouseY = -9999;
    let isMouseOnScreen = false;
    let isHovering = false;

    // Lerp positions for Aura and Ring
    let auraX = -9999;
    let auraY = -9999;
    let ringX = -9999;
    let ringY = -9999;

    // Particles configuration: 75 - 90 ambient zero-gravity particles
    const NUM_PARTICLES = 82;
    const INTERACTION_RADIUS = 160;
    let ambientParticles = [];
    let trailSparks = [];

    const COLOR_PALETTE = {
      indigo: { r: 79, g: 70, b: 229, hex: '#4F46E5' },
      cyan:   { r: 6, g: 182, b: 212, hex: '#06B6D4' },
      violet: { r: 139, g: 92, b: 246, hex: '#8B5CF6' }
    };
    const COLOR_KEYS = ['indigo', 'cyan', 'violet'];

    // -------------------------------------------------------------
    // 3. CANVAS RESIZE & PARTICLE INITIALIZATION
    // -------------------------------------------------------------
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(dpr, dpr);

      initAmbientParticles();
    }

    function initAmbientParticles() {
      ambientParticles = [];

      // Grid-distributed initial anchors with organic jitter
      const cols = Math.ceil(Math.sqrt(NUM_PARTICLES * (width / Math.max(height, 1))));
      const rows = Math.ceil(NUM_PARTICLES / cols);
      const stepX = width / cols;
      const stepY = height / rows;

      let count = 0;
      for (let r = 0; r < rows && count < NUM_PARTICLES; r++) {
        for (let c = 0; c < cols && count < NUM_PARTICLES; c++) {
          const originX = (c + 0.5) * stepX + (Math.random() - 0.5) * (stepX * 0.65);
          const originY = (r + 0.5) * stepY + (Math.random() - 0.5) * (stepY * 0.65);
          const colorKey = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];

          ambientParticles.push({
            originX: originX,
            originY: originY,
            x: originX,
            y: originY,
            vx: 0,
            vy: 0,
            radius: 2.0 + Math.random() * 1.5, // 2.0px - 3.5px
            colorKey: colorKey,
            color: COLOR_PALETTE[colorKey],
            baseAlpha: 0.48 + Math.random() * 0.28, // 0.48 - 0.76
            orbitAngle: Math.random() * Math.PI * 2,
            orbitRadius: 10 + Math.random() * 20,
            orbitSpeed: 0.008 + Math.random() * 0.014
          });
          count++;
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
        auraX = mouseX;
        auraY = mouseY;
        ringX = mouseX;
        ringY = mouseY;
      }

      // Spawn glowing trail spark particles when moving
      const mouseMoveDist = Math.hypot(mouseX - prevMouseX, mouseY - prevMouseY);
      if (mouseMoveDist > 6 && trailSparks.length < 24) {
        const sparkColorKey = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
        trailSparks.push({
          x: mouseX + (Math.random() - 0.5) * 16,
          y: mouseY + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 1.4,
          vy: (Math.random() - 0.5) * 1.4,
          radius: 2.0 + Math.random() * 1.2,
          color: COLOR_PALETTE[sparkColorKey],
          alpha: 0.82,
          life: 28,
          maxLife: 28
        });
      }
      prevMouseX = mouseX;
      prevMouseY = mouseY;

      // Layer 3: Proximity Card Spotlight coordinates update
      const targetCard = e.target.closest(
        '.quiz-card, .mission-card, .stat-card, .bento-card, .setup-card, .vact-lobby-hero, .profile-card, .bento-policy-surface, .home-quiz-card'
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
    const HOVER_SELECTORS = 'a, button, .quiz-card, .mission-card, .stat-card, .bento-card, .home-quiz-card, .tronex-option-label, .filter-tab, [role="button"], input, select, textarea, .card-start-btn, .btn-start-home-quiz';

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
      // Safeguard: Pause rendering if user is in Zen Mode (v-act.html & simulation)
      if (document.body.classList.contains('zen-mode')) {
        ctx.clearRect(0, 0, width, height);
        aura.style.opacity = '0';
        ring.style.opacity = '0';
        requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // --- 5A. Update LERP Positions for Aura & Ring ---
      if (isMouseOnScreen) {
        auraX += (mouseX - auraX) * 0.12;
        auraY += (mouseY - auraY) * 0.12;
        ringX += (mouseX - ringX) * 0.22;
        ringY += (mouseY - ringY) * 0.22;

        aura.style.opacity = '1';
        ring.style.opacity = '1';
      } else {
        aura.style.opacity = '0';
        ring.style.opacity = '0';
      }

      aura.style.transform = `translate3d(${auraX}px, ${auraY}px, 0)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) ${isHovering ? 'scale(1.45)' : 'scale(1)'}`;

      // --- 5B. Update & Simulate Ambient Particles ---
      const activeNearParticles = [];
      const particleLen = ambientParticles.length;

      for (let i = 0; i < particleLen; i++) {
        const p = ambientParticles[i];

        // 1. Organic gentle zero-gravity drift around anchor point
        p.orbitAngle += p.orbitSpeed;
        const driftTargetX = p.originX + Math.cos(p.orbitAngle) * p.orbitRadius;
        const driftTargetY = p.originY + Math.sin(p.orbitAngle) * p.orbitRadius;

        // 2. Interactive mouse proximity force field (radius 160px)
        let factor = 0;
        let dist = 9999;
        if (isMouseOnScreen) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          dist = Math.hypot(dx, dy);

          if (dist < INTERACTION_RADIUS && dist > 0.1) {
            factor = 1 - dist / INTERACTION_RADIUS;

            // Repulsion push away from mouse tip
            const repelPower = factor * 4.8;
            p.vx += (dx / dist) * repelPower;
            p.vy += (dy / dist) * repelPower;

            // Subtle magnetic swirl around cursor
            const swirlPower = factor * 1.8;
            p.vx += (-dy / dist) * swirlPower;
            p.vy += (dx / dist) * swirlPower;

            activeNearParticles.push({ p: p, dist: dist, factor: factor });
          }
        }

        // 3. Elastic Hooke's Law return to drifting anchor
        p.vx += (driftTargetX - p.x) * 0.042;
        p.vy += (driftTargetY - p.y) * 0.042;

        // 4. Viscous damping friction
        p.vx *= 0.85;
        p.vy *= 0.85;

        // 5. Update coordinate
        p.x += p.vx;
        p.y += p.vy;
      }

      // --- 5C. Draw Constellation Lines (lineWidth: 1.2) ---
      const nearCount = activeNearParticles.length;
      if (nearCount > 0 && isMouseOnScreen) {
        ctx.lineWidth = 1.2;

        // 1. Direct lines from cursor (mouseX, mouseY) to nearby particles
        for (let i = 0; i < nearCount; i++) {
          const item = activeNearParticles[i];
          const col = item.p.color;
          const lineAlpha = item.factor * 0.72; // clear alpha for force field
          ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${lineAlpha})`;

          ctx.beginPath();
          ctx.moveTo(mouseX, mouseY);
          ctx.lineTo(item.p.x, item.p.y);
          ctx.stroke();
        }

        // 2. Inter-particle constellation lines between neighbors
        for (let i = 0; i < nearCount; i++) {
          for (let j = i + 1; j < nearCount; j++) {
            const p1 = activeNearParticles[i].p;
            const p2 = activeNearParticles[j].p;
            const pairDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

            if (pairDist < 105) {
              const pairAlpha = (1 - pairDist / 105) * Math.min(activeNearParticles[i].factor, activeNearParticles[j].factor) * 0.65;
              ctx.strokeStyle = `rgba(99, 102, 241, ${pairAlpha})`;

              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        }
      }

      // --- 5D. Draw Ambient Particles ---
      for (let i = 0; i < particleLen; i++) {
        const p = ambientParticles[i];
        const col = p.color;

        let drawRadius = p.radius;
        let drawAlpha = p.baseAlpha;

        if (isMouseOnScreen) {
          const distToMouse = Math.hypot(p.x - mouseX, p.y - mouseY);
          if (distToMouse < INTERACTION_RADIUS) {
            const exc = 1 - distToMouse / INTERACTION_RADIUS;
            drawRadius = p.radius + exc * 1.5;
            drawAlpha = Math.min(0.88, p.baseAlpha + exc * 0.35);
          }
        }

        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${drawAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- 5E. Draw & Update Cursor Trail Spark Particles ---
      for (let i = trailSparks.length - 1; i >= 0; i--) {
        const spark = trailSparks[i];
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.life--;

        const sparkAlpha = (spark.life / spark.maxLife) * spark.alpha;
        const col = spark.color;

        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${sparkAlpha})`;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.radius * (spark.life / spark.maxLife), 0, Math.PI * 2);
        ctx.fill();

        if (spark.life <= 0) {
          trailSparks.splice(i, 1);
        }
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
