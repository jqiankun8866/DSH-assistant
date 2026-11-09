// Validate with the YAML parser bundled by the installed DSH, without copying credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function readAsset(resources, relative) {
  const unpacked = path.join(resources, 'app.asar.unpacked', relative);
  if (fs.existsSync(unpacked)) return fs.readFileSync(unpacked, 'utf8');
  const fd = fs.openSync(path.join(resources, 'app.asar'), 'r');
  const read = (offset, length) => {
    const buf = Buffer.alloc(length); let done = 0;
    while (done < length) { const n = fs.readSync(fd, buf, done, length-done, offset+done); if (!n) throw Error('Truncated ASAR'); done += n; }
    return buf;
  };
  try {
    const head = read(0, 16), size = head.readUInt32LE(12);
    if (size > 64*1024*1024) throw Error('Unexpected ASAR header');
    let entry = JSON.parse(read(16, size).toString('utf8'));
    for (const segment of relative.split('/')) entry = entry?.files?.[segment];
    if (!entry || entry.unpacked || !Number.isSafeInteger(entry.size) || entry.size > 4*1024*1024) throw Error('DSH asset unavailable: '+relative);
    const offset = Number(entry.offset);
    if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid ASAR parser offset');
    return read(8+head.readUInt32LE(4)+offset, entry.size).toString('utf8');
  } finally { fs.closeSync(fd); }
}
function yamlParser(resources) {
  const holder={exports:{}};
  vm.runInNewContext(readAsset(resources,'dsh/node_modules/js-yaml/dist/js-yaml.js'), {module:holder,exports:holder.exports}, {timeout:3000});
  return holder.exports;
}
module.exports={readAsset,yamlParser};
if(require.main===module)try {
  const parsed=yamlParser(process.argv[2]).load(fs.readFileSync(process.argv[3],'utf8'));
  if (!Array.isArray(parsed)) throw Error('Overlay must be a YAML list');
  console.log('DSH overlay YAML validated');
} catch (error) {
  // Avoid printing config snippets, which could contain tokens.
  console.error('Overlay validation failed: '+(error.reason || error.message)); process.exitCode=1;
}
