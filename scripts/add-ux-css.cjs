const fs = require('fs');
const path = require('path');
const cssPath = path.join('d:/AHV/src/App.css');
let css = fs.readFileSync(cssPath, 'utf8');

const uxCSS = `
/* ==========================================================================
   CLIENT-SIDE UX UPGRADES (Animations, Skeletons, Empty States)
   ========================================================================== */

/* --- SKELETON LOADER --- */
.skeleton-card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--line);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.skeleton-pulse {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-header { height: 24px; width: 40%; }
.skeleton-title { height: 28px; width: 70%; }
.skeleton-line { height: 16px; width: 100%; }
.skeleton-line.short { width: 50%; }
.skeleton-button { height: 48px; width: 100%; border-radius: 8px; margin-top: 1rem; }

/* --- PREMIUM EMPTY STATE --- */
.premium-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 1.5rem;
  background: rgba(255, 255, 255, 0.6);
  border: 2px dashed rgba(223, 231, 225, 0.8);
  border-radius: 20px;
  margin: 2rem 0;
}

.premium-empty-state svg {
  color: var(--green);
  opacity: 0.8;
  margin-bottom: 1rem;
}

.premium-empty-state h3 {
  font-size: 1.5rem;
  color: var(--ink);
  margin: 0 0 0.5rem 0;
  font-weight: 800;
}

.premium-empty-state p {
  color: var(--muted);
  max-width: 400px;
  margin: 0 0 1.5rem 0;
  line-height: 1.5;
}

.premium-empty-state button {
  background: var(--ink);
  color: #fff;
  border: none;
  padding: 1rem 2rem;
  font-weight: 700;
  font-size: 1rem;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s, background 0.2s, box-shadow 0.2s;
}

.premium-empty-state button:hover {
  transform: translateY(-2px);
  background: #000;
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
}

/* --- ANIMATIONS & HOVER EFFECTS --- */
.customer-inquiry-card {
  transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
}

@media (min-width: 769px) {
  .customer-inquiry-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 40px -10px rgba(17, 24, 39, 0.08);
  }
}

.customer-details-collapse {
  animation: slideDownFade 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: top;
  overflow: hidden;
}

@keyframes slideDownFade {
  0% {
    opacity: 0;
    transform: scaleY(0.95) translateY(-10px);
  }
  100% {
    opacity: 1;
    transform: scaleY(1) translateY(0);
  }
}
`;

if (!css.includes('CLIENT-SIDE UX UPGRADES')) {
  fs.writeFileSync(cssPath, css + '\n' + uxCSS);
  console.log('UX CSS added successfully.');
} else {
  console.log('UX CSS already exists.');
}
