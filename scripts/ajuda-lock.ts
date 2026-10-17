/**
 * Regrava `src/lib/erp/ajuda.lock.json` a partir de `ajuda-textos.ts` (0.6).
 * Recusa texto alterado sem a versão subir. Uso: npm run ajuda:lock
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRADAS } from '../src/lib/erp/ajuda-textos';
import { lockNovo, type Lock } from '../src/lib/erp/ajuda-integridade';

const arquivo = join('src', 'lib', 'erp', 'ajuda.lock.json');
const atual: Lock = existsSync(arquivo) ? (JSON.parse(readFileSync(arquivo, 'utf8')) as Lock) : {};
try {
  const novo = lockNovo(ENTRADAS, atual);
  writeFileSync(arquivo, JSON.stringify(novo, null, 2) + '\n');
  console.log(`  ajuda.lock.json gravado: ${Object.keys(novo).length} entradas.`);
} catch (e) {
  console.error(`  ${(e as Error).message}`);
  process.exit(1);
}
