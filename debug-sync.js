const fs = require('fs');
const lines = fs.readFileSync('src/old_index.js', 'utf16le').split('\n');
const startSync = lines.findIndex(l => l.includes("app.post('/api/db/sync'"));
console.log(lines.slice(startSync, startSync + 20).join('\n'));
