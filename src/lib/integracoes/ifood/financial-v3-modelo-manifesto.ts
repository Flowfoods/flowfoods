import type { EscopoFontesFinancial } from './financial-v3-pacote-fontes';

/** Modelo para a conexão selecionada. As contagens e taxas precisam ser informadas pela fonte. */
export function modeloManifestoFinancial(escopo: EscopoFontesFinancial) {
  const { parceiroId, lojaId, merchantId, competencia } = escopo;
  const inicio = `${competencia}-01`;
  const ultimo = new Date(`${inicio}T00:00:00Z`);
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1, 0);
  const fim = ultimo.toISOString().slice(0, 10);
  return {
    versao: 1, escopo,
    arquivo: { merchantId, competencia, requestId: null, sha256: null, linhas: null, pedidos: null, produto: 'IFOOD', moeda: 'BRL' },
    eventos: [{ consulta: { merchantId, inicio, fim, page: 1, size: 100 }, corpo: '' }],
    configuracao: { parceiroId, lojaId, canal: 'IFOOD', competencia, vigencias: [{ inicio, fim, comissaoBp: null, pagamentoBp: null }] },
  };
}
