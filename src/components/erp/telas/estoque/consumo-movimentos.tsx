/**
 * Consumo e conciliação de estoque (L.4) — "Movimentos": as linhas do livro que formam um número do relatório (uma coluna, um
 * saldo inicial ou final), do mais novo ao mais velho, com a quantidade COM SINAL, o saldo de antes e de depois, a origem de cada um
 * e a volta para o relatório. A MESMA tela nas duas árvores. Nada é lançado nem mudado aqui.
 */

import Link from 'next/link';
import type { MovimentoDoConsumo, MovimentosDaTela } from '@/lib/erp/consumo-estoque';
import {
  BUCKETS,
  DICA_DA_COLUNA,
  ROTULO_DO_LINK,
  dinheiroComSinal,
  fraseDoPeriodoDoConsumo,
  somarDias,
  quantidadeComSinal,
  quantidadeLimpa,
  queryDoConsumo,
  type FiltrosDoConsumo,
} from '@/lib/erp/consumo-estoque-campos';
import { faixaDaPagina } from '@/lib/erp/paginacao';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { PaginacaoNumerada } from '../../ui/paginacao-numerada';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { Voltar } from '../cadastro/partes';
import { Cartao } from '../compras/relatorio-partes';
import { ChipsDoConsumo, hrefDoConsumo } from './consumo-filtros';
import { BarraDeSaidaDoConsumo } from './consumo-tela';

/** O que a pessoa pode abrir a partir de cada movimento, loja a loja (cada link confere a permissão da loja). */
export interface LinksDeOrigem {
  nota: boolean;
  requisicao: boolean;
  lote: boolean;
}

export interface EnderecosDosMovimentos {
  /** A tela principal do consumo (de onde se veio e para onde se volta). */
  caminho: string;
  exportar: string;
  estoqueBase: string;
  comprasBase: string;
  producaoBase: string;
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (iso: string) => DATA_HORA.format(new Date(iso)).replace(',', ' às');

/** `volta`: o `?volta=` para a tela de origem trazer a pessoa de volta a estes movimentos (vazio se o endereço ficou comprido demais). */
function Origem({ m, e, links, volta }: { m: MovimentoDoConsumo; e: EnderecosDosMovimentos; links: LinksDeOrigem | undefined; volta: string }) {
  const L = 'ff-toque ff-transicao rounded-[5px] underline decoration-linha-forte underline-offset-4 hover:text-texto hover:decoration-texto';
  const texto = m.motivo;
  if (m.requisicaoId && links?.requisicao) {
    return (
      <>
        <Link href={`${e.estoqueBase}/${m.lojaId}/requisicoes/${m.requisicaoId}${volta}`} className={L}>
          {m.requisicaoNumero !== null ? `Requisição #${m.requisicaoNumero}` : 'Ver a requisição'}
        </Link>
        {m.codigoLote && <span className="block text-[12px]">do lote {m.codigoLote}</span>}
      </>
    );
  }
  if (m.requisicaoId) return <span>{m.requisicaoNumero !== null ? `Requisição #${m.requisicaoNumero}` : 'Requisição'}{m.codigoLote ? ` do lote ${m.codigoLote}` : ''}</span>;
  if (m.ordemProducaoId && !m.requisicaoId) {
    return links?.lote ? (
      <Link href={`${e.producaoBase}/${m.lojaId}/${m.ordemProducaoId}${volta}`} className={L}>
        {m.codigoLote ? `Lote ${m.codigoLote}` : 'Ver o lote'}
      </Link>
    ) : (
      <span>{m.codigoLote ? `Lote ${m.codigoLote}` : 'Lote'}</span>
    );
  }
  if (m.contagemId) {
    const rotulo = m.contagemTipo === 'ABERTURA' ? 'Abertura do estoque' : `Contagem${m.contagemTitulo ? ` · ${m.contagemTitulo}` : ''}`;
    const href = m.contagemTipo === 'ABERTURA' ? `${e.estoqueBase}/${m.lojaId}/abertura/conferir` : `${e.estoqueBase}/${m.lojaId}/contagens/${m.contagemId}/conferir${volta}`;
    return (
      <Link href={href} className={L}>
        {rotulo}
      </Link>
    );
  }
  if (m.notaId) {
    return links?.nota ? (
      <Link href={`${e.comprasBase}/${m.notaId}${volta}`} className={L}>
        {texto ?? 'Ver a nota'}
      </Link>
    ) : (
      <span>{texto ?? 'Nota de compra'}</span>
    );
  }
  return m.semOrigem ? <span className="text-atencao">Sem origem{texto ? `: ${texto}` : ''}</span> : <span>{texto ?? '—'}</span>;
}

function Tipo({ m }: { m: MovimentoDoConsumo }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium text-texto">{BUCKETS[m.bucket].rotulo}</span>
      {m.estorno && <Selo tom="alerta">Estorno</Selo>}
    </span>
  );
}

export function TelaDosMovimentos({
  enderecos,
  contexto,
  f,
  r,
  links,
}: {
  enderecos: EnderecosDosMovimentos;
  contexto: string;
  f: FiltrosDoConsumo;
  r: MovimentosDaTela;
  links: Record<string, LinksDeOrigem>;
}) {
  const movPath = `${enderecos.caminho}/movimentos`;
  // As telas de origem voltam para ESTA página (com o recorte, a coluna e a página em que a pessoa estava).
  const aqui = hrefDoConsumo(movPath, f);
  const comVolta = aqui.length <= 1500 ? `?volta=${encodeURIComponent(aqui)}` : '';
  const voltar = f.volta || hrefDoConsumo(enderecos.caminho, f, { col: '', bucket: '', pagina: 1 }, { semPagina: true });
  const lista = r.lista;
  const col = f.col;
  const verValores = r.verValores;
  const titulo = col ? `Movimentos: ${ROTULO_DO_LINK[col]}${f.bucket ? ` · ${BUCKETS[f.bucket].rotulo}` : ''}` : 'Movimentos';
  const vazio = r.motivoVazio
    ? r.motivoVazio === 'demorou'
      ? { titulo: r.demorou?.titulo ?? 'O relatório não coube agora.', texto: r.demorou?.texto ?? 'Tente de novo em instantes.' }
      : r.motivoVazio === 'periodo'
        ? { titulo: 'O período não faz sentido.', texto: f.periodoInvalido ?? '' }
        : { titulo: 'Nenhuma dessas lojas está no seu acesso.', texto: 'O relatório só mostra as lojas que você pode ver.' }
    : null;
  const movimentos = lista?.movimentos ?? [];
  const { de, ate } = faixaDaPagina(r.numeroDaPagina, f.porPagina, movimentos.length);
  const br = (d: string) => d.split('-').reverse().join('/');
  const periodoDoNumero = col === 'inicial' ? `tudo o que o livro tinha até ${br(somarDias(f.de, -1))}` : col === 'final' ? `tudo o que o livro tinha até ${br(f.ate)}` : fraseDoPeriodoDoConsumo(f);
  const subtitulo = [contexto, f.insumoId ? movimentos[0]?.insumo : null, r.lojasUsadas.length === 1 ? r.lojasUsadas[0].nome : null, periodoDoNumero].filter(Boolean).join(' · ');
  return (
    <div className="space-y-6">
      <Voltar href={voltar}>Voltar para o consumo e a conciliação</Voltar>
      <PageHeader icone="estoque" cor={COR.estoque} titulo={titulo} subtitulo={subtitulo}>
        <ChipsDoConsumo caminho={movPath} f={f} opcoes={r.opcoes} insumoNome={f.insumoId ? movimentos[0]?.insumo : undefined} />
        {col && <p className="text-[13px] text-suave">{DICA_DA_COLUNA[col]}</p>}
      </PageHeader>

      {vazio && (
        <Painel semRespiro>
          <Vazio titulo={vazio.titulo} acao={<Link href={voltar} className={classeDeBotao('secundario')}>Voltar para o consumo</Link>}>
            {vazio.texto}
          </Vazio>
        </Painel>
      )}

      {!vazio && !col && (
        <Painel semRespiro>
          <Vazio titulo="Escolha um número para abrir." acao={<Link href={voltar} className={classeDeBotao('secundario')}>Voltar para o consumo</Link>}>
            Cada número do relatório abre aqui os movimentos que o formam.
          </Vazio>
        </Painel>
      )}

      {!vazio && col && lista && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
            <Cartao rotulo="Movimentos">
              <p className="font-display text-[26px] font-bold leading-none tabular-nums">{lista.total.toLocaleString('pt-BR')}</p>
              <p className="mt-1.5 text-[12px] text-suave">do livro do estoque, do mais novo ao mais velho.</p>
            </Cartao>
            <Cartao rotulo="Soma da quantidade">
              {lista.unidadeUnica ? (
                <>
                  <p className="font-display text-[26px] font-bold leading-none tabular-nums">{col === 'inicial' || col === 'final' ? quantidadeLimpa(lista.somaMilesimos, lista.unidadeUnica) : quantidadeComSinal(lista.somaMilesimos, lista.unidadeUnica)}</p>
                  {verValores && <p className="mt-1.5 text-[12px] tabular-nums text-suave">{dinheiroComSinal(lista.somaCentavos)} como o livro gravou</p>}
                </>
              ) : (
                <p className="text-sm text-suave">{lista.total === 0 ? 'Nada aqui.' : 'Há unidades diferentes (kg, L e un): a soma só vale com uma unidade por vez. Escolha um insumo.'}</p>
              )}
            </Cartao>
          </div>

          <Painel titulo="Movimentos do livro" subtitulo="Quantidade com sinal: + entrou, − saiu. Estorno é o movimento que desfaz outro; o original continua no livro." semRespiro>
            {movimentos.length === 0 ? (
              <Vazio titulo="Nenhum movimento aqui.">Confira o período e os filtros.</Vazio>
            ) : (
              <>
                <ul className="divide-y divide-linha md:hidden">
                  {movimentos.map((m) => (
                    <li key={m.id} className="space-y-1.5 px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-medium text-texto">{m.insumo}</span>
                          <span className="block text-[12px] text-suave">{m.loja}</span>
                        </span>
                        <span className="shrink-0 text-right font-semibold tabular-nums">
                          {quantidadeComSinal(m.quantidadeMilesimos, m.unidade)}
                          {verValores && <span className="block text-[12px] font-normal text-suave">{dinheiroComSinal(m.valorCentavos)}</span>}
                        </span>
                      </div>
                      <Tipo m={m} />
                      <p className="text-[12px] tabular-nums text-suave">
                        {quando(m.ocorridoEm)} · saldo {quantidadeLimpa(m.antesMilesimos, m.unidade)} para {quantidadeLimpa(m.depoisMilesimos, m.unidade)}
                      </p>
                      <p className="text-[12px] text-suave">
                        <Origem m={m} e={enderecos} links={links[m.lojaId]} volta={comVolta} />
                      </p>
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full text-sm md:table">
                  <caption className="sr-only">Movimentos do livro do estoque que formam o número aberto, do mais novo ao mais velho: quando, insumo, o que foi, quantidade, saldo e origem.</caption>
                  <thead>
                    <tr className="bg-forte text-left text-[12px] text-suave">
                      <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                        Quando entrou no livro
                      </th>
                      <th scope="col" className="h-10 px-3 font-semibold">
                        Insumo
                      </th>
                      <th scope="col" className="h-10 px-3 font-semibold">
                        O que foi
                      </th>
                      <th scope="col" className="h-10 px-3 text-right font-semibold">
                        Quantidade
                      </th>
                      <th scope="col" className="h-10 px-3 text-right font-semibold">
                        Saldo
                      </th>
                      <th scope="col" className="h-10 pl-3 pr-5 font-semibold">
                        Origem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {movimentos.map((m) => (
                      <tr key={m.id} className="border-t border-linha align-top">
                        <td className="whitespace-nowrap py-2.5 pl-5 pr-3 text-suave">{quando(m.ocorridoEm)}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-texto">{m.insumo}</span>
                          <span className="block text-[12px] text-suave">{m.loja}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Tipo m={m} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {quantidadeComSinal(m.quantidadeMilesimos, m.unidade)}
                          {verValores && <span className="block text-[12px] font-normal text-suave">{dinheiroComSinal(m.valorCentavos)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-suave">
                          {quantidadeLimpa(m.antesMilesimos, m.unidade)} <span aria-hidden>›</span>
                          <span className="sr-only"> passa a </span> <span className="font-semibold text-texto">{quantidadeLimpa(m.depoisMilesimos, m.unidade)}</span>
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-[13px] text-suave">
                          <Origem m={m} e={enderecos} links={links[m.lojaId]} volta={comVolta} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginacaoNumerada
                  de={de}
                  ate={ate}
                  total={lista.total}
                  pagina={r.numeroDaPagina}
                  paginas={r.paginas}
                  singular="movimento"
                  plural="movimentos"
                  href={(p) => hrefDoConsumo(movPath, f, { pagina: p })}
                  tamanhos={{ opcoes: [25, 50, 100], atual: f.porPagina, href: (n) => hrefDoConsumo(movPath, f, { porPagina: n, pagina: 1 }) }}
                />
              </>
            )}
          </Painel>

          <BarraDeSaidaDoConsumo exportar={enderecos.exportar} imprimir={null} query={queryDoConsumo(f, {}, { semPagina: true })} parte="movimentos" />
        </>
      )}
    </div>
  );
}

