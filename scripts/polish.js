const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../src/App.css');
let content = fs.readFileSync(cssPath, 'utf8');

// Replace shadows
content = content.replace(/box-shadow:\s*4px\s+4px\s+0\s+(var\(--ink\)|rgba\(.*?\));/g, 'box-shadow: 0 4px 16px rgba(17, 24, 39, 0.06);');
content = content.replace(/box-shadow:\s*8px\s+8px\s+0\s+(var\(--ink\)|rgba\(.*?\));/g, 'box-shadow: 0 12px 32px rgba(17, 24, 39, 0.08);');

// Replace borders
content = content.replace(/border:\s*2px\s+solid\s+var\(--ink\);/g, 'border: 1px solid var(--line);');
content = content.replace(/border-bottom:\s*2px\s+solid\s+var\(--ink\);/g, 'border-bottom: 1px solid var(--line);');

// Soften fonts
content = content.replace(/font-weight:\s*900;/g, 'font-weight: 700;');
content = content.replace(/font-weight:\s*850;/g, 'font-weight: 600;');
content = content.replace(/font-weight:\s*800;/g, 'font-weight: 600;');

// Make cards and screens rounded
const roundedClasses = [
  '.app-screen',
  '.inquiry-card',
  '.admin-inquiry-card',
  '.auth-panel',
  '.admin-detail',
  '.hero',
  '.admin-kpi',
  '.place-search-dropdown'
];

roundedClasses.forEach(cls => {
  const regex = new RegExp(`(${cls.replace(/\./g, '\\.')}\\s*\\{[^}]*?)`, 'g');
  // It's safer to just inject it. But simpler to not use regex for this if it's too complex.
});

// A safer way: just append a utility class or inject directly into known blocks.
content += `
/* UI Polish Overrides */
.app-screen,
.inquiry-card,
.admin-inquiry-card,
.auth-panel,
.admin-detail,
.hero,
.admin-kpi,
.place-search-dropdown,
.admin-map-container,
.truck-stats div,
.feature-card {
  border-radius: 12px;
}

button {
  transition: all 0.2s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}
`;

fs.writeFileSync(cssPath, content);
console.log('App.css polished successfully!');
