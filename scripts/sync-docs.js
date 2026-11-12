import { copyFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('docs/assets/',root),{recursive:true});
await mkdir(new URL('docs/vendor/',root),{recursive:true});
for(const file of ['crossbus.min.js','crossbus.min.js.map']) await copyFile(new URL(`dist/${file}`,root),new URL(`docs/assets/${file}`,root));
for(const file of ['marked.umd.js','marked.umd.js.map']) await copyFile(new URL(`node_modules/marked/lib/${file}`,root),new URL(`docs/vendor/${file}`,root));
await copyFile(new URL('node_modules/marked/LICENSE',root),new URL('docs/vendor/marked-LICENSE.md',root));
console.log('Synced the exact CrossBus bundle and pinned Markdown renderer into the Pages source.');
