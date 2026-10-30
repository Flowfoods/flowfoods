/** CMV de uma loja: apresenta o DTO autorizado, sem consulta, fórmula ou meta. */
import Link from 'next/link';
import type { WidgetCmvHome } from '@/lib/erp/home-cmv';
import type { EstadoDoWidgetHome } from '@/lib/erp/home-contratos';
import { formatarData } from '@/lib/erp/compra-campos';
import { percentualComDuasCasas } from '@/lib/erp/cmv-categorias-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { IconeDoModulo } from '../ui/cabecalho';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Selo, type Tom } from '../ui/superficies';

const ESTADOS: Record<EstadoDoWidgetHome, { rotulo: string; tom: Tom }> = {
  ok: { rotulo: 'Disponível', tom: 'neutro' },
  parcial: { rotulo: 'Parcial', tom: 'alerta' },
  sem_dados: { rotulo: 'Sem dados apurados', tom: 'neutro' },
  sem_base: { rotulo: 'Sem base', tom: 'alerta' },
  indisponivel: { rotulo: 'Indisponível', tom: 'neutro' },
  erro: { rotulo: 'Não foi possível carregar', tom: 'alerta' },
};
const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});
const itensSemPreco = (n: number | null) => n === null ? 'cobertura não registrada' : n.toLocaleString('pt-BR');
// O formatador de categorias usa o módulo; aqui o sinal do bp canônico permanece.
const percentualComSinal = (bp: number) => `${bp < 0 ? '−' : ''}${percentualComDuasCasas(bp)}`;

function SemValor({ texto }: { texto: string }) {
  return <><span aria-hidden>—</span><span className="sr-only">{texto}</span></>;
}

export function CmvDaHomeNaTela({ cmv }: { cmv: WidgetCmvHome }) {
  const estado = ESTADOS[cmv.estado];
  const referencia = cmv.referencia;
  const cobertura = cmv.cobertura;
  const foto = cmv.origem?.fotografia;
  const fechadaEm = foto ? new Date(foto.fechadaEm) : null;
  const percentual = cmv.percentual;
  const receita = percentual?.denominador;
  const fonte = cmv.fonteDoCmv === 'real' ? 'Real (consumo apurado)' : cmv.fonteDoCmv === 'compras' ? 'Pelas compras' : 'Base não disponível';

  return (
    <section aria-label="CMV da loja" className="min-w-0 rounded-[14px] border border-linha bg-painel">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <IconeDoModulo icone="dre" cor={COR.dre} tamanho={32} />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-texto">CMV</h2>
            <p className="break-words text-[12px] font-medium text-suave">{cmv.escopo.nome}</p>
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
          ) : <p>Período do CMV não disponível nesta consulta.</p>}
        </div>

        <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">Valor do CMV</dt>
            <dd className="mt-1 break-words font-display text-[26px] font-bold leading-tight tabular-nums text-texto">
              {cmv.valor.valor === null ? <SemValor texto="Valor do CMV não disponível" /> : formatarDinheiro(cmv.valor.valor)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">Percentual sobre a receita bruta</dt>
            <dd className="mt-1 break-words font-display text-[26px] font-bold leading-tight tabular-nums text-texto">
              {percentual?.pontosBase == null ? <SemValor texto="Percentual não disponível" /> : percentualComSinal(percentual.pontosBase)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">{receita?.rotulo ?? 'Receita bruta do mesmo recorte do DRE'}</dt>
            <dd className="mt-1 break-words text-[18px] font-semibold leading-tight tabular-nums text-texto">
              {receita?.valor == null ? <SemValor texto="Base de receita não disponível" /> : formatarDinheiro(receita.valor)}
            </dd>
          </div>
        </dl>

        <div className="space-y-1 break-words text-[12px] leading-relaxed text-suave">
          <p><span className="font-medium text-texto">Base do CMV:</span> {fonte}</p>
          {cmv.notaDaConta && <p>Nota da conta: {cmv.notaDaConta}</p>}
          {cmv.origem && <p>Fonte: DRE da loja · {cmv.origem.modo === 'fotografia' ? 'fotografia do fechamento' : 'leitura ao vivo'}</p>}
          {foto && (
            <p>
              Fotografia versão {foto.versao}
              {fechadaEm && Number.isFinite(fechadaEm.getTime()) && <> · fechada em {QUANDO.format(fechadaEm)}</>}
            </p>
          )}
          {cobertura && (
            <>
              {cobertura.diasApurados !== null && cobertura.diasDoPeriodo !== null && <p>Cobertura: {cobertura.diasApurados} de {cobertura.diasDoPeriodo} dias apurados nesta loja.</p>}
              {cobertura.faltasDeFaturamento !== null && cobertura.faltasDeFaturamento > 0 && <p>{cobertura.faltasDeFaturamento} lançamentos de canal em falta neste recorte.</p>}
              {cobertura.custosDoEstoque && (
                <p>Itens sem preço no estoque · inicial: {itensSemPreco(cobertura.custosDoEstoque.semPrecoInicial)} · final: {itensSemPreco(cobertura.custosDoEstoque.semPrecoFinal)}.</p>
              )}
            </>
          )}
        </div>

        {(cmv.avisos.length > 0 || cmv.semContar.length > 0) && (
          <div className="space-y-1 border-t border-linha pt-3 text-[13px] leading-relaxed text-texto">
            <p className="font-semibold">Atenção à leitura</p>
            <ul aria-label="Ressalvas do CMV" className="list-disc space-y-1 break-words pl-5">
              {cmv.avisos.map((aviso, indice) => <li key={`${aviso.codigo}-${indice}`}>{aviso.texto}</li>)}
              {cmv.semContar.map((parte, indice) => <li key={`sem-contar-${indice}`}>Não considerado: {parte}.</li>)}
            </ul>
          </div>
        )}

        <div className="space-y-2 border-t border-linha pt-3">
          <p className="break-words text-[12px] leading-relaxed text-suave">
            {cmv.fonteDoCmv === 'real' ? 'O consumo apurado segue a conta do DRE neste recorte.'
              : cmv.fonteDoCmv === 'compras' ? 'A base é o valor das compras usado no DRE enquanto não há consumo apurado.'
                : 'Confira a base e os avisos da conta no DRE da loja.'}
          </p>
          <Link href={cmv.detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 max-w-full items-center break-words'}>{cmv.detalhe.rotulo}</Link>
        </div>
      </div>
    </section>
  );
}
