/** Despesas de uma loja: apresenta o recorte e os grupos já conferidos com o DRE, sem consulta ou recálculo. */
import Link from 'next/link';
import type { EstadoDoWidgetHome } from '@/lib/erp/home-contratos';
import { GRUPOS_DAS_DESPESAS_DA_HOME, RECORTE_DAS_DESPESAS_DA_HOME, type ComposicaoDespesasHome, type WidgetDespesasHome } from '@/lib/erp/home-despesas';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { IconeDoModulo } from '../ui/cabecalho';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Selo, type Tom } from '../ui/superficies';

const ESTADOS: Record<EstadoDoWidgetHome, { rotulo: string; tom: Tom }> = {
  ok: { rotulo: 'Disponível', tom: 'neutro' },
  parcial: { rotulo: 'Parcial', tom: 'alerta' },
  sem_dados: { rotulo: 'Sem dados', tom: 'neutro' },
  sem_base: { rotulo: 'Sem base', tom: 'alerta' },
  indisponivel: { rotulo: 'Indisponível', tom: 'neutro' },
  erro: { rotulo: 'Não foi possível carregar', tom: 'alerta' },
};
const QUANDO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function SemValor({ texto }: { texto: string }) {
  return <><span aria-hidden>—</span><span className="sr-only">{texto}</span></>;
}

/**
 * Guarda estrutural da apresentação: os oito grupos na ordem do DRE, inteiros
 * seguros e o total igual à soma deles. Não refaz a conta: a conferência com os
 * subtotais do DRE pertence ao adaptador; aqui só se recusa DTO incompatível.
 */
export function gruposLegiveis(w: WidgetDespesasHome, c: ComposicaoDespesasHome): boolean {
  if (c.estado !== 'ok' || c.base !== 'competencia_sem_cmv_e_deducoes' || !(w.estado === 'ok' || w.estado === 'parcial')) return false;
  const total = w.valor.valor;
  if (w.valor.unidade !== 'centavos' || !Number.isSafeInteger(total) || !Array.isArray(c.grupos) || c.grupos.length !== GRUPOS_DAS_DESPESAS_DA_HOME.length) return false;
  let soma = 0n;
  for (const [i, g] of c.grupos.entries()) {
    if (!g || g.grupo !== GRUPOS_DAS_DESPESAS_DA_HOME[i] || typeof g.rotulo !== 'string' || !g.rotulo.trim()
      || !Number.isSafeInteger(g.centavos) || typeof g.comLancamento !== 'boolean' || (!g.comLancamento && g.centavos !== 0)) return false;
    soma += BigInt(g.centavos);
  }
  return soma === BigInt(total as number) && c.grupos.some((g) => g.comLancamento);
}

/** Estado mostrado quando a composição não é legível: erro e sem dados ficam; o resto vira indisponível. */
export const estadoSemComposicaoLegivel = (e: EstadoDoWidgetHome): EstadoDoWidgetHome => (e === 'erro' || e === 'sem_dados' ? e : 'indisponivel');

export function DespesasDaHomeNaTela({ widget }: { widget: WidgetDespesasHome }) {
  const c = widget.composicaoPorGrupo;
  if (!c) return null;
  const legivel = gruposLegiveis(widget, c);
  // Um DTO incompatível nunca vira número: apresenta-se como indisponível.
  const estado = ESTADOS[legivel ? widget.estado : estadoSemComposicaoLegivel(widget.estado)];
  const referencia = widget.referencia;
  const cobertura = widget.cobertura;
  const foto = widget.origem?.fotografia;
  const fechadaEm = foto ? new Date(foto.fechadaEm) : null;
  const mensagem = widget.estado === 'erro' ? 'Não foi possível carregar as despesas desta loja.'
    : widget.estado === 'sem_dados' ? 'Sem despesas apuradas nesta leitura.' : 'As despesas estão indisponíveis nesta leitura.';

  return (
    <section aria-label="Despesas da loja" className="min-w-0 rounded-[14px] border border-linha bg-painel">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconeDoModulo icone="compras" cor={COR.dre} tamanho={32} />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-texto">Despesas</h2>
            <p className="break-words text-[12px] font-medium text-suave">{widget.escopo.nome}</p>
          </div>
        </div>
        <Selo tom={estado.tom}>{estado.rotulo}</Selo>
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1 break-words text-[12px] leading-relaxed text-suave">
          {referencia ? (
            <>
              <p className="font-medium text-texto">Período de apuração · {referencia.rotulo}</p>
              {referencia.inicio && referencia.fim && <p>De {formatarData(referencia.inicio)} a {formatarData(referencia.fim)}</p>}
              <p>{referencia.apuradoAte ? <>Apurado até {formatarData(referencia.apuradoAte)}</> : 'Nenhum dia apurado neste período.'}</p>
            </>
          ) : <p>Período das despesas não disponível nesta consulta.</p>}
          <p>{RECORTE_DAS_DESPESAS_DA_HOME}</p>
        </div>

        {legivel ? (
          <>
            <dl className="min-w-0">
              <dt className="text-[12px] text-suave">Total de despesas da loja</dt>
              <dd className="mt-1 break-words font-display text-[26px] font-bold leading-tight tabular-nums text-texto [overflow-wrap:anywhere]">{formatarDinheiro(widget.valor.valor as number)}</dd>
            </dl>
            <table className="w-full table-fixed border-collapse text-[13px]">
              <caption className="mb-2 text-left font-semibold text-texto">Despesas por grupo do DRE</caption>
              <thead><tr className="border-b border-linha text-suave"><th scope="col" className="w-3/5 px-2 py-2 text-left font-medium">Grupo</th><th scope="col" className="px-2 py-2 text-right font-medium">Valor</th></tr></thead>
              <tbody>
                {c.grupos.map((g) => (
                  <tr key={g.grupo} className="border-b border-linha">
                    <th scope="row" className="break-words px-2 py-3 text-left align-top font-medium text-texto [overflow-wrap:anywhere]">{g.rotulo}</th>
                    <td className="px-2 py-3 text-right align-top font-semibold tabular-nums text-texto [overflow-wrap:anywhere]">{g.comLancamento ? formatarDinheiro(g.centavos) : <SemValor texto="Sem lançamento" />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row" className="px-2 py-3 text-left font-semibold text-texto">Total</th><td className="px-2 py-3 text-right font-semibold tabular-nums text-texto [overflow-wrap:anywhere]">{formatarDinheiro(widget.valor.valor as number)}</td></tr></tfoot>
            </table>
            {c.grupos.some((g) => g.centavos < 0) && <p className="text-[12px] leading-relaxed text-suave">Há valores negativos nesta composição; eles aparecem com o sinal na tabela.</p>}
          </>
        ) : (
          <div className="space-y-2 rounded-[10px] border border-linha bg-texto/[0.02] px-4 py-5">
            <p className="text-[12px] text-suave">Total de despesas da loja</p>
            <p className="font-display text-[26px] font-bold leading-tight text-texto"><SemValor texto="Valor das despesas não disponível" /></p>
            <p className="text-[14px] font-semibold text-texto">{mensagem}</p>
          </div>
        )}

        <div className="space-y-1 break-words text-[12px] leading-relaxed text-suave">
          {widget.origem && <p>Fonte: DRE da loja · {widget.origem.modo === 'fotografia' ? 'fotografia do fechamento' : 'leitura ao vivo'}</p>}
          {foto && (
            <p>
              Fotografia versão {foto.versao}
              {fechadaEm && Number.isFinite(fechadaEm.getTime()) && <> · fechada em {QUANDO.format(fechadaEm)}</>}
            </p>
          )}
          {cobertura && cobertura.diasApurados !== null && cobertura.diasDoPeriodo !== null && <p>Cobertura: {cobertura.diasApurados} de {cobertura.diasDoPeriodo} dias apurados nesta loja.</p>}
        </div>

        {widget.avisos.length > 0 && (
          <ul aria-label="Avisos das despesas" className="list-disc space-y-1 break-words border-t border-linha pt-3 pl-5 text-[13px] leading-relaxed text-texto">
            {widget.avisos.map((aviso, indice) => <li key={`${aviso.codigo}-${indice}`}>{aviso.texto}</li>)}
          </ul>
        )}

        <div className="border-t border-linha pt-3">
          <Link href={widget.detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 max-w-full items-center break-words'}>{widget.detalhe.rotulo}</Link>
        </div>
      </div>
    </section>
  );
}
