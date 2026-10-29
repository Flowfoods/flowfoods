/**
 * Central de Integrações (INT-1.2, decisão 484) — guarda de ambiente. Um lugar só decide o que muda entre TEST e PRODUCAO
 * nas chamadas ao provedor:
 *  - no TEST, o iFood exige o cabeçalho `x-request-homologation: true` (com a loja de teste);
 *  - em PRODUCAO, esse cabeçalho NUNCA sai (teste automático prova).
 * O ambiente vem do app (`IntegracaoApp.ambiente`), nunca de variável solta: o app de teste não fala com loja de produção e
 * vice-versa (o banco já não deixa ligar loja de teste em parceiro real).
 */

export type AmbienteDaChamada = 'TEST' | 'PRODUCAO';

export const CABECALHO_DE_HOMOLOGACAO = 'x-request-homologation';

export function cabecalhosDoAmbiente(ambiente: AmbienteDaChamada): Record<string, string> {
  if (ambiente === 'TEST') return { [CABECALHO_DE_HOMOLOGACAO]: 'true' };
  if (ambiente === 'PRODUCAO') return {};
  throw new Error('Ambiente da chamada desconhecido.');
}

/** Confere uma chamada já montada: produção com o cabeçalho de homologação, ou teste sem ele, é erro de programação. */
export function conferirCabecalhos(ambiente: AmbienteDaChamada, cabecalhos: Record<string, string>): void {
  const tem = Object.keys(cabecalhos).some((k) => k.toLowerCase() === CABECALHO_DE_HOMOLOGACAO);
  if (ambiente === 'PRODUCAO' && tem) throw new Error('Chamada de produção com o cabeçalho de homologação: recusada.');
  if (ambiente === 'TEST' && !tem) throw new Error('Chamada de teste sem o cabeçalho de homologação: recusada.');
}
