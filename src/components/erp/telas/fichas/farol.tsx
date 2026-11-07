import type { CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { porcentagemDoCmv, STATUS_DO_CMV } from '@/lib/erp/cmv-produto-campos';
import { FAIXAS_DO_CMV, type CortesDoFarol, type ResultadoDoFarol } from '@/lib/erp/cmv-faixas-campos';
import { formatarPontosBase } from '@/lib/erp/unidades';
import { Selo, type Tom } from '../../ui/superficies';

/** Apresentação somente: a identidade vem do classificador exato compartilhado. */
export const APRESENTACAO_DA_FAIXA: Record<ResultadoDoFarol['faixa'], { rotulo: string; tom: Tom; cheio?: boolean }> = {
  muitoFavoravel: { rotulo: 'Muito favorável', tom: 'ok', cheio: true },
  favoravel: { rotulo: 'Favorável', tom: 'ok' },
  confortavel: { rotulo: 'Confortável', tom: 'ok' },
  atencao: { rotulo: 'Atenção', tom: 'alerta' },
  critico: { rotulo: 'Crítico', tom: 'erro' },
  semDados: { rotulo: 'Sem dados', tom: 'neutro' },
  naoOfertado: { rotulo: 'Não ofertado', tom: 'neutro' },
  faixasNaoConfiguradas: { rotulo: 'Faixas não configuradas', tom: 'neutro' },
};

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
  const a = APRESENTACAO_DA_FAIXA[faixa];
  return <Selo tom={a.tom} cheio={a.cheio}><span className="min-w-0 whitespace-normal">{a.rotulo}</span></Selo>;
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
