import { randomUUID } from 'node:crypto';
import { link, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepararDownloadConciliacaoV3 } from '../src/lib/integracoes/ifood/financial-v3-download';

/** Publica somente os bytes já validados. O nome final fica disponível por inteiro e não sobrescreve outro arquivo. */
export async function exportarConciliacaoSimulada(diretorio: string, entrada: Parameters<typeof prepararDownloadConciliacaoV3>[0]) {
  const anexo = await prepararDownloadConciliacaoV3(entrada);
  const pasta = resolve(diretorio);
  const caminho = join(pasta, anexo.nomeArquivo);
  const temporario = join(pasta, '.conciliacao-' + randomUUID() + '.tmp');
  const arquivo = await open(temporario, 'wx', 0o600);
  try {
    try {
      await arquivo.writeFile(anexo.bytes);
      await arquivo.sync();
    } finally {
      await arquivo.close();
    }
    // O vínculo no mesmo diretório publica atomicamente e falha se o destino já existir.
    await link(temporario, caminho);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('O arquivo de destino já existe. Use outro diretório para uma nova cópia.');
    throw erro;
  } finally {
    await unlink(temporario);
  }
  return { origem: 'SIMULACAO' as const, caminho, tipoConteudo: anexo.tipoConteudo, tamanhoBytes: anexo.bytes.length, resumo: anexo.resumo };
}
