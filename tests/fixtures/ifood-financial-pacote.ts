import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { EscopoFontesFinancial } from '@/lib/integracoes/ifood/financial-v3-pacote-fontes';

export function criarFontesFinancial(competencia = '2024-02', identidade: Partial<EscopoFontesFinancial> = {}) {
  const escopo: EscopoFontesFinancial = {
    parceiroId: 'parceiro-fixture', lojaId: 'loja-fixture', conexaoId: 'conexao-fixture',
    merchantId: 'abcdefab-1234-4234-8234-abcdef123456', ambiente: 'TEST', ...identidade, competencia,
  };
  const { parceiroId, lojaId, merchantId } = escopo;
  const inicio = competencia + '-01';
  const ultimo = new Date(inicio + 'T00:00:00Z');
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1, 0);
  const fim = ultimo.toISOString().slice(0, 10);
  const csv = [
    'valor;competencia;pedido_associado_ifood;loja_id;impacto_no_repasse;moeda;produto',
    ['100.00', competencia, 'pedido-sintetico', merchantId, 'SIM', 'BRL', 'IFOOD'].join(';'),
    ['-12.00', competencia, 'pedido-sintetico', merchantId, 'SIM', 'BRL', 'IFOOD'].join(';'),
  ].join('\n');
  const arquivoGzip = gzipSync(csv);
  const evento = {
    name: 'ORDER_COMMISSION', trigger: 'ORDER', product: 'IFOOD', competence: competencia, receiver: { merchantId },
    hasTransferImpact: true, amount: { value: '-12.00', currency: 'BRL' }, billing: { baseValue: '100', feePercentage: '12' },
  };
  const manifesto = {
    versao: 1, escopo: { ...escopo },
    arquivo: {
      merchantId, competencia, requestId: 'protocolo-sintetico', linhas: 2, pedidos: 1, produto: 'IFOOD', moeda: 'BRL',
      sha256: createHash('sha256').update(arquivoGzip).digest('hex'),
    },
    eventos: [{
      consulta: { merchantId, inicio, fim, page: 1, size: 100 },
      corpo: JSON.stringify({ page: 1, size: 100, hasNextPage: false, financialEvents: [evento] }),
    }],
    configuracao: { parceiroId, lojaId, canal: 'IFOOD', competencia, vigencias: [{ inicio, fim, comissaoBp: 1200, pagamentoBp: 0 }] },
  };
  return { escopo, arquivoGzip, manifesto };
}
