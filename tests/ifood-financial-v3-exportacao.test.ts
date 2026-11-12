import { mkdtemp, readdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { exportarConciliacaoSimulada } from '../scripts/integracao-financial-exportar';

const protocolo = { merchantId: 'aaaaaaaa-1111-4444-8888-aaaaaaaaaaaa', competencia: '2026-02', requestId: 'protocolo-simulado' };
const identidade = { parceiro: 'parceiro-simulado', loja: 'loja-simulada', merchant: protocolo.merchantId,
  competencia: protocolo.competencia, moeda: 'BRL' as const, produto: 'IFOOD' };
const nome = 'conciliacao-simulada-' + protocolo.merchantId + '-' + protocolo.competencia + '.csv.gz';
function entrada(valor: string) {
  const csv = 'loja_id;competencia;pedido_associado_ifood;impacto_no_repasse;valor\r\n'
    + [protocolo.merchantId, protocolo.competencia, 'pedido-teste', 'SIM', valor].join(';');
  return { origem: 'SIMULACAO' as const, pedido: { identidade, protocolo }, acompanhamento: { estado: 'DISPONIVEL' as const, protocolo },
    arquivo: { identidade, protocolo, bytes: gzipSync(csv), totaisInformados: { linhas: 1, pedidos: 1 } } };
}

it('publica uma única cópia completa quando duas exportações concorrem pelo mesmo destino', async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'flowfoods-exportacao-'));
  try {
    const concorrentes = [entrada('7.50'), entrada('4.00')];
    const execucoes = concorrentes.map(e => exportarConciliacaoSimulada(pasta, e));
    // Uma alteração posterior no chamador não pode reclassificar os bytes já recebidos como dados reais.
    for (const e of concorrentes) Object.assign(e, { origem: 'PRODUCAO' });
    const grava = await Promise.allSettled(execucoes);
    expect(grava.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(grava.filter(r => r.status === 'rejected')).toHaveLength(1);
    const vencedor = grava.findIndex(r => r.status === 'fulfilled');
    expect(grava[vencedor]).toMatchObject({ status: 'fulfilled', value: { origem: 'SIMULACAO' } });
    expect(await readdir(pasta)).toEqual([nome]);
    expect(await readFile(join(pasta, nome))).toEqual(concorrentes[vencedor].arquivo.bytes);
  } finally {
    for (const file of await readdir(pasta)) await unlink(join(pasta, file));
    await rmdir(pasta);
  }
});

it('preserva um arquivo anterior e recusa exportar quando os totais do protocolo divergem', async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'flowfoods-exportacao-'));
  const caminho = join(pasta, nome);
  try {
    const invalida = entrada('2.00');
    invalida.arquivo.totaisInformados.linhas = 2;
    await expect(exportarConciliacaoSimulada(pasta, invalida)).rejects.toThrow();
    expect(await readdir(pasta)).toEqual([]);
    await writeFile(caminho, 'anterior');
    await expect(exportarConciliacaoSimulada(pasta, entrada('7.50'))).rejects.toThrow('destino já existe');
    expect(await readFile(caminho, 'utf8')).toBe('anterior');
    expect(await readdir(pasta)).toEqual([nome]);
  } finally {
    for (const file of await readdir(pasta)) await unlink(join(pasta, file));
    await rmdir(pasta);
  }
});
