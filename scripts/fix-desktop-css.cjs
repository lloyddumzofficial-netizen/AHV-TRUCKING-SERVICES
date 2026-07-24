const fs = require('fs');

const css = `
/* Desktop UI Fixes for Homepage */
@media (min-width: 900px) {
  .hero-section {
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 4rem;
  }

  .hero-copy {
    padding-right: 2rem;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }

  .home-next-actions {
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    max-width: 800px;
  }
  
  .desktop-only {
    display: inline-block !important;
  }
}
`;

fs.appendFileSync('src/App.css', css);
console.log('Appended Desktop CSS to src/App.css');
