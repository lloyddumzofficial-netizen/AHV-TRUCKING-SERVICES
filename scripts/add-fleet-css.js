const fs = require('fs');

const css = `
/* Fleet Showcase CSS */
.fleet-section {
  padding: 4rem 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.fleet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
}

.fleet-card {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.fleet-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgba(0,0,0,0.1);
  border-color: rgba(22, 163, 74, 0.4);
}

.fleet-card-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.fleet-icon {
  color: var(--green);
  padding: 12px;
  background: var(--soft-green);
  border-radius: 12px;
  width: 48px;
  height: 48px;
}

.fleet-card-header h3 {
  font-size: 1.25rem;
  color: var(--ink);
  margin: 0 0 0.25rem 0;
}

.fleet-model {
  font-size: 0.9rem;
  color: var(--muted);
  font-weight: 500;
}

.fleet-specs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 1.5rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.spec-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  color: var(--muted);
}

.spec-item svg {
  color: var(--green);
  margin-top: 2px;
}

.spec-item div {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.spec-item span {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.spec-item strong {
  color: var(--ink);
  font-size: 0.95rem;
}

.fleet-best-for {
  font-size: 0.95rem;
  color: var(--ink);
  line-height: 1.5;
}

.fleet-best-for strong {
  color: var(--green);
}

.fleet-highlights {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: auto;
}

.fleet-highlights .highlight-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
  line-height: 1.4;
}

.fleet-highlights .highlight-item svg {
  color: var(--green);
  flex-shrink: 0;
  margin-top: 2px;
}
`;

fs.appendFileSync('src/App.css', css);
console.log('Appended CSS to src/App.css');
