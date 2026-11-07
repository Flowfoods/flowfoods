import type { ClassificacaoDaFicha } from '@/lib/erp/ficha-secoes-campos';

export function TextoClassificacao({ classificacao, vazio = false }: { classificacao?: ClassificacaoDaFicha; vazio?: boolean }) {
  if (!classificacao?.secao) return vazio ? <span>Sem seção</span> : null;
  const { secao, subsecao } = classificacao;
  return <span className="block break-words text-[12px] leading-snug text-suave [overflow-wrap:anywhere]">
    {secao.nome}{!secao.ativa && ' (arquivada)'}{subsecao && <> / {subsecao.nome}{(!subsecao.ativa || !subsecao.secaoAtiva) && ' (arquivada)'}</>}
  </span>;
}
