/** Confere os ativos locais e seu preload no build real; não acessa rede ou env. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const origens = [
  'src/app/fonts/gelasio/Gelasio-Variable.woff2',
  'src/app/fonts/gelasio/Gelasio-Italic-Variable.woff2',
  'src/app/fonts/libre-franklin/LibreFranklin-Variable.woff2',
];
const esperadas = await Promise.all(origens.map(async nome => {
  const bytes = await readFile(path.join(raiz, nome));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2', 'Fonte de origem inválida.');
  return { hash: hash(bytes), bytes: bytes.length };
}));
assert.equal(new Set(esperadas.map(f => f.hash)).size, 3, 'As três fontes precisam ser distintas.');
const manifest = JSON.parse(await readFile(path.join(raiz, '.next/server/next-font-manifest.json'), 'utf8'));
assert.ok(manifest.app && typeof manifest.app === 'object' && !Array.isArray(manifest.app), 'Manifesto de fontes do App Router ausente.');
const entradas = Object.values(manifest.app);
assert.ok(entradas.every(e => Array.isArray(e) && e.every(n => typeof n === 'string')), 'Manifesto de fontes incompatível.');
const ativos = [...new Set(entradas.flat())];
assert.equal(ativos.length, 3, 'O build deve declarar preload dos três ativos locais únicos.');
const fontesDoLayout = manifest.app[path.join(raiz, 'src/app/layout')];
assert.ok(Array.isArray(fontesDoLayout), 'Fontes do layout raiz ausentes no manifesto.');
assert.deepEqual([...new Set(fontesDoLayout)].sort(), [...ativos].sort(), 'O layout raiz deve declarar os três preloads.');
const encontrados = [];
for (const ativo of ativos) {
  assert.match(ativo, /^static\/media\/[a-zA-Z0-9._-]+\.woff2$/, 'Caminho de fonte inesperado.');
  const bytes = await readFile(path.join(raiz, '.next', ativo));
  encontrados.push(hash(bytes));
}
assert.deepEqual(encontrados.sort(), esperadas.map(f => f.hash).sort(), 'Ativos compilados diferem das fontes oficiais versionadas.');
console.log(`Fontes locais verificadas: ${ativos.length} ativos, ${esperadas.reduce((s, f) => s + f.bytes, 0)} bytes, preload no manifesto do build.`);
