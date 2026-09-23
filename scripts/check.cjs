/* Check real extension entry points without executing browser code. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, resolve, read } = require('./paths.cjs');
function extensionFiles() {
  const manifest = JSON.parse(read('manifest.json'));
  const files = new Set(['manifest.json', manifest.background.service_worker, manifest.options_page]);
  for (const script of manifest.content_scripts) for (const file of [...script.js, ...(script.css || [])]) files.add(file);
  const html = read(manifest.options_page);
  for (const match of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) files.add(path.posix.join(path.posix.dirname(manifest.options_page), match[1]));
  const worker = read(manifest.background.service_worker);
  for (const match of worker.matchAll(/importScripts\('([^']+)'\)/g)) files.add(path.posix.join(path.posix.dirname(manifest.background.service_worker), match[1]));
  return [...files];
}
function check() {
  const manifest = JSON.parse(read('manifest.json')), pkg = JSON.parse(read('package.json'));
  if (manifest.version !== pkg.version) throw new Error('Manifest/package versions differ');
  for (const file of extensionFiles()) {
    if (!resolve(file).startsWith(root + path.sep) || !fs.statSync(resolve(file)).isFile()) throw new Error(`Invalid entry: ${file}`);
    if (file.endsWith('.js')) new vm.Script(read(file), { filename: file });
  }
  console.log('Extension paths, script syntax and versions are valid.');
}
module.exports = { extensionFiles, check };
if (require.main === module) check();
