import { readdir, readFile, mkdir, writeFile, lstat, unlink } from 'node:fs/promises'
import { resolve, join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'

// Runtime-JS build for installed DSH, without resolving source-only link: peers.
// This is a transpilation build, not a substitute for the upstream typecheck.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/wechat-channel')
const source = join(root, 'src')
const output = join(root, 'lib')
const generated = new Set()
let count = 0
// Refuse linked directories before any writes; stale-file pruning stays in lib.
async function inspect(dir) {
  try { if ((await lstat(dir)).isSymbolicLink()) throw Error('Linked build directory: '+dir) }
  catch (e) { if(e.code==='ENOENT')return; throw e }
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if(entry.isSymbolicLink())throw Error('Linked build entry: '+join(dir,entry.name))
    if(entry.isDirectory())await inspect(join(dir,entry.name))
  }
}
await inspect(source)
await inspect(output)
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.name.endsWith('.mjs') || entry.name === 'email_worker.py') {
      const target = join(root, 'lib', relative(source, path))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, await readFile(path, 'utf8'))
      generated.add(target)
      count++
    }
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      const target = join(root, 'lib', relative(source, path).replace(/\.ts$/, '.js'))
      const code = stripTypeScriptTypes(await readFile(path, 'utf8'), { mode: 'transform', sourceUrl: 'dsh-wechat/' + relative(root, path).replaceAll('\\', '/') })
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, code)
      generated.add(target)
      count++
    }
  }
}
await walk(source)
async function prune(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name)
    if(entry.isDirectory())await prune(path)
    else if(!generated.has(path))await unlink(path)
  }
}
await prune(output)
console.log(`Built ${count} runtime modules in ${join(root, 'lib')}`)
