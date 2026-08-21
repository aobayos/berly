// dist-electron holds compiled output for the Electron main/preload
// processes. The root package.json declares "type": "module", but that
// output is CommonJS (see tsconfig.electron.json) — this override tells
// Node to treat everything under dist-electron as CommonJS regardless.
const fs = require('fs');

fs.mkdirSync('dist-electron', { recursive: true });
fs.writeFileSync(
  'dist-electron/package.json',
  JSON.stringify({ type: 'commonjs' })
);
