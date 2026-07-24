const fs = require('fs');

const css = `
/* Signed-In AuthPanel overrides */
.signed-in-panel {
  padding: 0;
  border: none;
  background: transparent;
  margin-bottom: 2rem;
}
.signed-in-panel .auth-user {
  background: #fff;
  border: 1px solid var(--line);
  padding: 1rem 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.02);
}
`;

fs.appendFileSync('src/App.css', css);
console.log('Appended Signed-In CSS to src/App.css');
