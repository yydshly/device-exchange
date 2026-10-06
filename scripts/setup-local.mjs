import fs from 'node:fs';
const file = new URL('../.openai/hosting.json', import.meta.url);
if (!fs.existsSync(file)) { fs.mkdirSync(new URL('../.openai/', import.meta.url), { recursive: true }); fs.writeFileSync(file, JSON.stringify({d1:'DB',r2:null},null,2)+'\n'); console.log('Created local D1 binding manifest without a hosted Site identity.'); }
else console.log('Existing hosting manifest preserved.');
