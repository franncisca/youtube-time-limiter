const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const resolve = file => path.resolve(root, file);
const read = file => fs.readFileSync(resolve(file), 'utf8');
module.exports = { root, resolve, read };
