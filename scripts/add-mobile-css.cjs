const fs = require('fs');
const path = require('path');
const cssPath = path.join('d:/AHV/src/App.css');
let css = fs.readFileSync(cssPath, 'utf8');

const mobileCSS = `
/* ==========================================================================
   MOBILE UI/UX OVERHAUL (Premium Layout & Touch Targets)
   ========================================================================== */
@media (max-width: 768px) {
  /* 1. STANDARDIZE TOUCH TARGETS */
  button,
  .header-call,
  .menu-button,
  .primary-action,
  .secondary-action,
  .submit-button,
  input[type="text"],
  input[type="email"],
  input[type="number"],
  input[type="datetime-local"],
  select,
  textarea,
  .admin-status-chip,
  .location-correction-toggle,
  .copy-ref-btn {
    min-height: 48px !important;
  }
  
  /* Ensure padding inside inputs gives enough breathing room */
  input, select, textarea {
    padding: 0.85rem 1rem !important;
    font-size: 1rem !important; /* Prevents iOS Safari zoom */
  }

  /* 2. PREMIUM CARD AESTHETICS */
  .recent-card,
  .customer-inquiry-card,
  .admin-detail-panel,
  .inquiry-grid > div {
    border-radius: 16px !important;
    box-shadow: 0 10px 25px -5px rgba(17, 24, 39, 0.05), 0 8px 10px -6px rgba(17, 24, 39, 0.01) !important;
    border: 1px solid rgba(223, 231, 225, 0.8) !important;
    background: rgba(255, 255, 255, 0.95) !important;
    backdrop-filter: blur(8px) !important;
    padding: 1.25rem !important;
    margin-bottom: 1.25rem;
  }

  /* Soften the background of the app slightly so white cards pop more */
  .app-shell {
    background: #f1f5f3 !important;
  }

  /* 3. TYPOGRAPHY & SPACING */
  .screen-heading h1 {
    font-size: clamp(2.2rem, 9vw, 3rem) !important;
    letter-spacing: -0.03em !important;
  }
  
  .customer-status-pill {
    padding: 0.5rem 0.85rem !important;
    font-size: 0.75rem !important;
    border-radius: 8px !important;
  }

  /* 4. FLOATING ACTION BUTTONS (Sticky CTAs for mobile) */
  .admin-detail-panel .fixed-save-container,
  .admin-detail-panel > div[style*="position: sticky"] {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    background: rgba(255, 255, 255, 0.98) !important;
    backdrop-filter: blur(12px) !important;
    border-top: 1px solid rgba(0,0,0,0.08) !important;
    padding: 1rem 1.25rem max(1rem, env(safe-area-inset-bottom)) !important;
    z-index: 1000 !important;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.05) !important;
  }

  /* Add extra padding to the bottom of panels so the sticky button doesn't hide content */
  .admin-detail-panel {
    padding-bottom: 100px !important;
  }
  
  .home-next-actions {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 0.75rem !important;
  }
  
  /* Make location search on admin take full width naturally */
  .philippines-map-picker-container {
    padding: 0.5rem !important;
  }
}
`;

if (!css.includes('MOBILE UI/UX OVERHAUL')) {
  fs.writeFileSync(cssPath, css + '\\n' + mobileCSS);
  console.log('Mobile CSS added successfully.');
} else {
  console.log('Mobile CSS already exists.');
}
