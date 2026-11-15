import Link from 'next/link';
import type { ResultadoConferenciaFinancial } from '@/lib/integracoes/core/conferencia-financial';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Contagem, Painel } from '@/components/erp/ui/superficies';
import { diaAnalytics, dinheiroAnalytics, instanteAnalytics } from './formato-analytics';
import { MedidaFinancial } from './medidas-conferencia-financial';

type Consulta = Extract<ResultadoConferenciaFinancial, { ok: true }>;
const taxa = (bp: number) => `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function RecibosFontesFinancial({ consulta, retorno, destaque }: { consulta: Consulta; retorno: string; destaque?: string }) {
  const { recibos, conexoes } = consulta;
  if (!recibos.total) return null;
  return <Painel id="recibos" titulo="Recibos de fontes" subtitulo="Por ordem de recebimento, com as taxas declaradas em cada envio."
    acessorio={<Contagem>{recibos.total} {recibos.total === 1 ? 'recibo' : 'recibos'}</Contagem>} semRespiro>
    <ul className="divide-y divide-linha">
      {recibos.itens.map(r => <li key={r.id} id={`recibo-${r.id}`}>
        <details className="min-w-0" open={r.id === destaque || undefined}>
          <summary className="min-h-11 cursor-pointer break-words px-4 py-3 text-sm font-semibold sm:px-5">
            {instanteAnalytics(r.recebidoEm.toISOString())} · {conexoes.find(c => c.id === r.conexaoId)?.nome ?? 'Conexão da loja'} · Produto {r.produto}
            <span className="ml-2 inline-block font-mono text-xs font-normal text-suave">Pacote {r.pacoteSha256.slice(0, 10)}</span>
          </summary>
          <div className="space-y-4 px-4 pb-4 text-[13px] sm:px-5">
            <p>Envio manual · {r.ambiente === 'TEST' ? 'Teste' : 'Produção'} · Recebido para conferência</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {([['Linhas do arquivo', r.linhasArquivo], ['Pedidos distintos', r.pedidosDistintos], ['Páginas de eventos', r.paginasEventos], ['Eventos', r.quantidadeEventos]] as const)
                .map(([nome, n]) => <div key={nome}><dt className="text-suave">{nome}</dt><dd className="font-semibold tabular-nums">{n.toLocaleString('pt-BR')}</dd></div>)}
            </dl>
            <section aria-label="Comparação do arquivo mensal com os eventos">
              <h3 className="font-semibold">Lançamentos com impacto no repasse</h3>
              {r.somas ? <>
                <dl className="mt-2 grid gap-3 sm:grid-cols-3">
                  <MedidaFinancial rotulo="Arquivo mensal" valor={dinheiroAnalytics(r.somas.arquivoCentavos)} />
                  <MedidaFinancial rotulo="Eventos financeiros" valor={dinheiroAnalytics(r.somas.eventosCentavos)} />
                  <MedidaFinancial rotulo="Eventos menos arquivo" valor={dinheiroAnalytics((BigInt(r.somas.eventosCentavos) - BigInt(r.somas.arquivoCentavos)).toString())} />
                </dl>
                <p className="mt-2 text-suave">Os totais consideram os arquivos deste envio. O fechamento da competência exige conferir a cobertura das duas fontes.</p>
              </> : <p className="mt-1 text-suave">Somas indisponíveis neste recibo. Reapresente o pacote original à FlowFoods para calculá-las.</p>}
            </section>
            <section aria-label="Vigências declaradas">
              <h3 className="font-semibold">Vigências declaradas</h3>
              <ul className="mt-1 divide-y divide-linha">{r.vigencias.map(v => <li key={v.inicio} className="grid gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[minmax(0,2fr)_1fr_1fr]">
                <span>{diaAnalytics(v.inicio)} a {diaAnalytics(v.fim)}</span>
                <span>Comissão {taxa(v.comissaoBp)}</span><span>Pagamento {taxa(v.pagamentoBp)}</span>
              </li>)}</ul>
            </section>
            <details className="rounded-[7px] border border-linha">
              <summary className="min-h-11 cursor-pointer p-3 font-medium">Identificação e hashes SHA-256</summary>
              <dl className="space-y-2 px-3 pb-3">
                {([['Recibo', r.id], ['Conjunto de fontes', r.pacoteSha256], ['Arquivo CSV.gz', r.arquivoSha256],
                  ['Manifesto apresentado', r.manifestoSha256], ['Páginas de eventos', r.eventosSha256], ['Vigências', r.vigenciasSha256],
                  ['Protocolo do arquivo', r.requestIdSha256]] as const).map(([nome, valor]) =>
                  <div key={nome}><dt className="text-suave">{nome}</dt><dd><code className="select-all break-all font-mono text-xs">{valor}</code></dd></div>)}
              </dl>
            </details>
          </div>
        </details>
      </li>)}
    </ul>
    {recibos.paginas > 1 && <nav aria-label="Páginas dos recibos de fontes" className="flex flex-wrap items-center justify-between gap-3 border-t border-linha px-4 py-2 sm:px-5">
      <span className="text-[13px] text-suave">Página {recibos.pagina} de {recibos.paginas}</span>
      <div className="flex gap-4">
        {recibos.pagina > 1 && <Link className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`} href={`${retorno}&pagina=${recibos.pagina - 1}#recibos`}>Anterior</Link>}
        {recibos.pagina < recibos.paginas && <Link className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`} href={`${retorno}&pagina=${recibos.pagina + 1}#recibos`}>Próxima</Link>}
      </div>
    </nav>}
  </Painel>;
}
