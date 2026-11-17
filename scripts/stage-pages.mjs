import {readFile, cp, rm, writeFile, stat} from 'node:fs/promises';
await stat('dist/index.html');
const html=await readFile('dist/index.html','utf8');
if (!html.includes('/podlingua/assets/')) throw new Error('Build is missing the GitHub Pages project base path');
await rm('docs',{recursive:true,force:true});
await cp('dist','docs',{recursive:true});
await writeFile('docs/.nojekyll','');
console.log('Staged Vite build and credits in docs/ for GitHub Pages. Commit this output with its matching source.');
