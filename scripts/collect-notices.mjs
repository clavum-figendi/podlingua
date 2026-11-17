import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json','utf8'));
const rows = [];
let output = 'PODLINGUA — THIRD-PARTY NOTICES\n\nGenerated from package-lock.json and installed distribution license files.\nIncludes runtime AND development/build/test dependencies; not every entry ships in the browser.\nRuntime model and external ONNX Runtime notices are in credits/ separately.\n\n';
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/')) continue;
  let manifest;
  try { manifest = JSON.parse(await readFile(join(path,'package.json'),'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && entry.optional) continue; throw error; }
  rows.push({name:manifest.name,version:manifest.version,license:manifest.license ?? entry.license ?? 'See upstream',dev:Boolean(entry.dev),repository:manifest.repository});
  output += `\n${'='.repeat(72)}\n${manifest.name} ${manifest.version}\nLicense: ${JSON.stringify(manifest.license ?? entry.license ?? 'See upstream')}\nUsage: ${entry.dev ? 'development/build/test' : 'runtime or transitive dependency'}\nRepository: ${JSON.stringify(manifest.repository ?? '')}\n`;
  for (const filename of (await readdir(path)).filter(n=>/^(LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)(?:$|[. -])/i.test(n))) {
    try { output += `\n--- ${filename} ---\n${await readFile(join(path,filename),'utf8')}\n`; } catch { }
  }
}
await writeFile('public/THIRD_PARTY_NOTICES.txt',output);
await writeFile('public/dependency-inventory.json',JSON.stringify(rows,null,2)+'\n');
console.log(`Collected ${rows.length} dependency records and ${output.length} notice characters.`);
