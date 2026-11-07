import Link from 'next/link';
import { CANAIS } from '@/lib/erp/canal-campos';
import { porcentagemDoCmv, type CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { Selo } from '../../ui/superficies';
import { APRESENTACAO_DA_FAIXA } from './farol';

/** Apresentação da conta autorizada pelo servidor; não recalcula nem reclassifica o CMV. */
export function CmvCompacto({ conta: x }: { conta: CmvDoCanal }) {
  const faixa = APRESENTACAO_DA_FAIXA[x.farol.faixa];
  const semDados = x.farol.faixa === 'semDados';
  const numero = x.cmvBp && !semDados && x.farol.faixa !== 'naoOfertado' ? porcentagemDoCmv(x.cmvBp) : null;
  const estado = x.farol.faixa === 'faixasNaoConfiguradas' ? 'Sem faixas'
    : semDados ? (!x.fisico.completo ? 'Custo incompleto' : x.fisico.valor.num <= 0n ? 'Conferir custo' : x.precoCentavos === null ? 'Sem preço' : 'Sem dados')
    : faixa.rotulo;
  const faltaPrecoTambem = semDados && x.precoCentavos === null && estado !== 'Sem preço';
  const meta = !x.ofertado ? null : x.metaBp === null ? 'Sem meta' : x.status === 'acima' ? 'Acima da meta' : null;

  return <span className="block min-w-0 space-y-1 text-[12px] leading-snug">
    {numero && <span className="block text-sm font-semibold tabular-nums text-texto">{numero}</span>}
    <span className="block"><Selo tom={faixa.tom} cheio={faixa.cheio}><span className="min-w-0 whitespace-normal">{estado}</span></Selo></span>
    {faltaPrecoTambem && <span className="block text-suave">Sem preço</span>}
    {meta && <span className="block text-suave">{meta}</span>}
  </span>;
}

export function LinkDosDetalhesDoCmv({ href, nome }: { href: string; nome: string }) {
  return <Link href={`${href}#preco-por-canal`} className="ff-transicao inline-flex min-h-11 items-center rounded-[5px] text-[12px] text-suave underline underline-offset-4 hover:text-texto sm:min-h-8 [@media(pointer:coarse)]:min-h-11" aria-label={`Ver preço, meta e detalhes do CMV de ${nome}`}>Detalhes do CMV</Link>;
}

/** Abaixo de 400 px, três linhas curtas evitam espremer os estados em colunas estreitas. */
export function CmvPorCanalCompacto({ contas, href, nome }: { contas: readonly CmvDoCanal[]; href: string; nome: string }) {
  if (!contas.length) return null;
  return <div className="min-w-0 space-y-1.5">
    <p className="text-[12px] font-medium text-suave">CMV por canal</p>
    <dl className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
      {contas.map(x => <div key={x.canal} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2 rounded-[7px] border border-linha p-2 min-[400px]:block min-[400px]:space-y-1.5">
        <dt className="text-[12px] font-medium text-texto">{CANAIS[x.canal].curto}</dt>
        <dd className="min-w-0"><CmvCompacto conta={x} /></dd>
      </div>)}
    </dl>
    <LinkDosDetalhesDoCmv href={href} nome={nome} />
  </div>;
}
