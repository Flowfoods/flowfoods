import type { ReactNode } from 'react';
import type { CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { porcentagemDoCmv, STATUS_DO_CMV } from '@/lib/erp/cmv-produto-campos';
import { FAIXAS_DO_CMV, type CortesDoFarol, type ResultadoDoFarol } from '@/lib/erp/cmv-faixas-campos';
import { formatarPontosBase } from '@/lib/erp/unidades';
import { FORMA_DO_SELO, Selo } from '../../ui/superficies';

export type CorDaFaixa = 'azul' | 'verde' | 'amarelo' | 'laranja' | 'vermelho';

/**
 * Apresentação somente: a identidade vem do classificador exato compartilhado. Cada uma das cinco faixas tem uma cor
 * própria (17/11/2026), do mais favorável ao crítico, na ordem do farol do sistema (decisão 177). Os três estados sem
 * faixa não têm cor: continuam neutros.
 */
export const APRESENTACAO_DA_FAIXA: Record<ResultadoDoFarol['faixa'], { rotulo: string; cor: CorDaFaixa | null }> = {
  muitoFavoravel: { rotulo: 'Muito favorável', cor: 'azul' },
  favoravel: { rotulo: 'Favorável', cor: 'verde' },
  confortavel: { rotulo: 'Confortável', cor: 'amarelo' },
  atencao: { rotulo: 'Atenção', cor: 'laranja' },
  critico: { rotulo: 'Crítico', cor: 'vermelho' },
  semDados: { rotulo: 'Sem dados', cor: null },
  naoOfertado: { rotulo: 'Não ofertado', cor: null },
  faixasNaoConfiguradas: { rotulo: 'Faixas não configuradas', cor: null },
};

/**
 * Classes literais (o Tailwind só gera o que lê escrito inteiro), uma linha por cor: o selo e a amostra dos filtros saem
 * do MESMO lugar, então a amostra nunca mostra outra cor que a do selo. O selo é cheio: fundo e borda na cor da faixa e o
 * texto do par (`sobre-cmv-*`, ≥ 4,5:1). Tokens só de Fichas; o farol do DRE e o `Selo` genérico não mudam.
 */
const CLASSES_DA_COR: Record<CorDaFaixa, { selo: string; amostra: string }> = {
  azul: { selo: 'border-cmv-azul bg-cmv-azul text-sobre-cmv-azul', amostra: 'bg-cmv-azul' },
  verde: { selo: 'border-cmv-verde bg-cmv-verde text-sobre-cmv-verde', amostra: 'bg-cmv-verde' },
  amarelo: { selo: 'border-cmv-amarelo bg-cmv-amarelo text-sobre-cmv-amarelo', amostra: 'bg-cmv-amarelo' },
  laranja: { selo: 'border-cmv-laranja bg-cmv-laranja text-sobre-cmv-laranja', amostra: 'bg-cmv-laranja' },
  vermelho: { selo: 'border-cmv-vermelho bg-cmv-vermelho text-sobre-cmv-vermelho', amostra: 'bg-cmv-vermelho' },
};

/** O selo de uma faixa com o texto de quem usa (o rótulo ou um estado mais preciso, como "Custo incompleto"). */
export function SeloDoFarol({ faixa, children }: { faixa: ResultadoDoFarol['faixa']; children: ReactNode }) {
  const cor = APRESENTACAO_DA_FAIXA[faixa].cor;
  return cor ? <span className={`${FORMA_DO_SELO} ${CLASSES_DA_COR[cor].selo}`}>{children}</span> : <Selo tom="neutro">{children}</Selo>;
}

/** A cor da faixa ao lado do nome, nos filtros: o controle continua neutro e o estado sem faixa fica só com o contorno. */
export function AmostraDaFaixa({ faixa }: { faixa: ResultadoDoFarol['faixa'] }) {
  const cor = APRESENTACAO_DA_FAIXA[faixa].cor;
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cor ? CLASSES_DA_COR[cor].amostra : 'border border-linha-forte'}`} />;
}

export const AVISO_DO_ARREDONDAMENTO = 'O percentual aparece com uma casa decimal. A faixa considera o CMV sem arredondar.';

export function intervaloDoFarol(faixa: ResultadoDoFarol['faixa'], cortes: CortesDoFarol | null): string | null {
  if (!cortes) return null;
  const { aBp: a, bBp: b, cBp: c, dBp: d } = cortes;
  switch (faixa) {
    case 'muitoFavoravel': return `Abaixo de ${formatarPontosBase(a)}`;
    case 'favoravel': return `De ${formatarPontosBase(a)} até menos de ${formatarPontosBase(b)}`;
    case 'confortavel': return `De ${formatarPontosBase(b)} a ${formatarPontosBase(c)}, incluindo os limites`;
    case 'atencao': return `Acima de ${formatarPontosBase(c)} até ${formatarPontosBase(d)}`;
    case 'critico': return `Acima de ${formatarPontosBase(d)}`;
    default: return null;
  }
}

export function SeloDaFaixa({ faixa }: { faixa: ResultadoDoFarol['faixa'] }) {
  return <SeloDoFarol faixa={faixa}><span className="min-w-0 whitespace-normal">{APRESENTACAO_DA_FAIXA[faixa].rotulo}</span></SeloDoFarol>;
}

export function IntervalosDoFarol({ cortes }: { cortes: CortesDoFarol | null }) {
  if (!cortes) return <p className="text-sm text-suave">Sem faixas configuradas.</p>;
  return <ul className="space-y-2 text-[13px] text-suave">{FAIXAS_DO_CMV.map(faixa => <li key={faixa} className="flex flex-wrap items-center gap-x-2 gap-y-1"><SeloDaFaixa faixa={faixa} /><span>{intervaloDoFarol(faixa, cortes)}.</span></li>)}</ul>;
}

type ContaDoFarol = Pick<CmvDoCanal, 'cmvBp' | 'farol' | 'status' | 'metaBp' | 'motivo'>;
const numeroDoFarol = (x: ContaDoFarol) => x.cmvBp && x.farol.faixa !== 'semDados' && x.farol.faixa !== 'naoOfertado' ? porcentagemDoCmv(x.cmvBp) : null;
const comparacaoComMeta = (x: ContaDoFarol) => x.metaBp === null ? 'não definida' : `${formatarPontosBase(x.metaBp)} · ${STATUS_DO_CMV[x.status].rotulo}`;
export function textoDoFarol(x: ContaDoFarol): string {
  return [numeroDoFarol(x), APRESENTACAO_DA_FAIXA[x.farol.faixa].rotulo, x.farol.motivo, x.farol.faixa !== 'naoOfertado' ? `Meta: ${comparacaoComMeta(x)}` : null].filter(Boolean).join(' · ');
}
export function FarolDeCmv({ conta: x, modo = 'detalhe' }: { conta: ContaDoFarol; modo?: 'lista' | 'detalhe' | 'impressao' }) {
  const { farol } = x;
  const numero = numeroDoFarol(x);
  const intervalo = intervaloDoFarol(farol.faixa, farol.cortes);
  const meta = comparacaoComMeta(x);
  return <span className="block min-w-0 space-y-1 whitespace-normal text-[12px] leading-snug">
    {numero && <span className="block font-semibold tabular-nums text-texto print:text-black">{numero}</span>}
    {modo === 'impressao' ? <span className="block font-semibold print:text-black">{APRESENTACAO_DA_FAIXA[farol.faixa].rotulo}</span> : <span className="block"><SeloDaFaixa faixa={farol.faixa} /></span>}
    {modo !== 'lista' && intervalo && <span className="block text-suave print:text-black">{intervalo}.</span>}
    {farol.motivo && <span className="block break-words text-suave print:text-black">{farol.motivo}</span>}
    {farol.faixa !== 'naoOfertado' && <span className="block text-suave print:text-black">Meta: {meta}.</span>}
  </span>;
}
