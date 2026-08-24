// electron-builder stages the app in <output>/win-unpacked.tmp and then
// renames that directory into place. On some machines that rename is refused
// inside the project tree while every other operation on it succeeds — see
// the known-failure note in CLAUDE.md. Building into the OS temp directory
// sidesteps it without touching anyone's security settings.
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const output = path.join(os.tmpdir(), 'berly-release');

// Run electron-builder's own entry point under this Node rather than going
// through the npx shim: since Node 20 a .cmd shim cannot be spawned without
// a shell, and doing so fails silently with no output at all.
const cli = require.resolve('electron-builder/cli.js');

const result = spawnSync(
  process.execPath,
  [cli, `--config.directories.output=${output}`],
  { stdio: 'inherit' }
);

if (result.error) {
  console.error(`Could not run electron-builder: ${result.error.message}`);
  process.exit(1);
}
if (result.status === 0) {
  console.log(`\nInstaller written to ${output}`);
}
process.exit(result.status ?? 1);
