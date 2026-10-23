/**
 * Consumo e conciliação de estoque (L.4) — a tela. A MESMA nas duas árvores (`/erp` e `/rodolfo/erp/<slug>`).
 *
 * Ordem de leitura: título e o que está valendo, filtros, a ponte de cada unidade (inicial → … → final, kg, L e un nunca somados),
 * o "antes de ler" (lacunas e o que ficou fora do livro), a tabela por insumo e loja (cartões no celular e no tablet) e, com um
 * insumo escolhido, o linha a linha de cada caixa. Cada número abre os movimentos que o formam. Nada é lançado nem mudado aqui.
 *
 * O que a tela nunca faz: dar baixa de insumo, somar unidades diferentes, chamar a diferença da contagem de consumo ou de perda,
 * mostrar R$ a quem não vê custo, ou chamar de "uso" o que não passou pela requisição.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ConsumoDaTela, LinhaDoConsumo, ResumoDaUnidade } from '@/lib/erp/consumo-estoque';
import {
  BUCKETS,
  COLUNAS_DA_TELA,
  DICA_DA_COLUNA,
  NOTA_DA_DATA,
  NOTA_DA_TRANSFERENCIA,
  NOTA_DO_AJUSTE,
  NOTA_DO_BRUTO,
  NOTA_DO_USO,
  ROTULO_DA_COLUNA,
  avisosDoConsumo,
  comprasBrutaELiquida,
  dinheiroComSinal,
  dinheiroLimpo,
  fraseDoPeriodoDoConsumo,
  pl,
  quantidadeComSinal,
  quantidadeLimpa,
  queryDoConsumo,
  somaDaColuna,
  usoBrutoELiquido,
  type BucketId,
  type ColunaDeLink,
  type ColunaId,
  type FiltrosDoConsumo,
  type Soma,
} from '@/lib/erp/consumo-estoque-campos';
import { faixaDaPagina } from '@/lib/erp/paginacao';
import { COR } from '@/lib/erp/modulos';
import { UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { PaginacaoNumerada } from '../../ui/paginacao-numerada';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { Cartao } from '../compras/relatorio-partes';
import { ChipsDoConsumo, FormularioDoConsumo, hrefDoConsumo } from './consumo-filtros';

const SIGLA = (u: Unidade) => UNIDADES[u].sigla;

/** Os endereços que a tela monta (os mesmos nas duas árvores; a página entrega prontos). */
export interface EnderecosDoConsumo {
  /** A própria tela: `/erp/estoque/relatorios/consumo`. */
  caminho: string;
  /** A planilha: `.../consumo/exportar`. */
  exportar: string;
  /** Divergências (1.8), para quem pode ajustar saldo; senão nulo. */
  divergencias: string | null;
}

type Liga = (col: ColunaDeLink, extra?: Partial<FiltrosDoConsumo>) => string;

const TD_NUM = 'px-3 py-2.5 text-right align-top';

// ------------------------------------------------------------------ um número que abre os movimentos

function Numero({
  somas,
  coluna,
  unidade,
  href,
  verValores,
  rotuloDoLink,
  forte = false,
}: {
  somas: Soma;
  coluna: ColunaId | 'inicial' | 'final';
  unidade: Unidade;
  href: string;
  verValores: boolean;
  rotuloDoLink: string;
  forte?: boolean;
}) {
  const saldo = coluna === 'inicial' || coluna === 'final';
  if (!saldo && somas.n === 0 && somas.q === 0) {
    return (
      <span className="text-suave">
        <span aria-hidden>—</span>
        <span className="sr-only">nada</span>
      </span>
    );
  }
  const texto = saldo ? quantidadeLimpa(somas.q, unidade) : quantidadeComSinal(somas.q, unidade);
  return (
    <>
      <Link
        href={href}
        aria-label={`${rotuloDoLink}: ${texto}${saldo ? '' : `, ${pl(somas.n, 'movimento', 'movimentos')}`}. Ver os movimentos`}
        className={`ff-toque ff-transicao rounded-[5px] tabular-nums text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto ${forte ? 'font-semibold' : ''}`}
      >
        {texto}
      </Link>
      {verValores && (somas.v !== 0 || saldo) && <span className="block text-[12px] tabular-nums text-suave">{saldo ? dinheiroLimpo(somas.v) : dinheiroComSinal(somas.v)}</span>}
    </>
  );
}

function Lacunas({ l }: { l: LinhaDoConsumo }) {
  if (l.lacunas.length === 0 && l.confere) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {!l.confere && <Selo tom="alerta">A conta não fecha</Selo>}
      {l.lacunas.map((x) => (
        <Selo key={x.chave} tom={x.dura ? 'alerta' : 'neutro'}>
          {x.rotulo}
        </Selo>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ a ponte de cada unidade

const LINHAS_DA_PONTE: { coluna: ColunaId; rotulo: string; explica: string }[] = [
  { coluna: 'compras', rotulo: 'Compras', explica: 'notas lançadas' },
  { coluna: 'produzido', rotulo: 'Produzido', explica: 'lotes que entraram' },
  { coluna: 'uso', rotulo: 'Uso', explica: 'requisição registrada' },
  { coluna: 'perdas', rotulo: 'Perdas', explica: 'lançadas com motivo' },
  { coluna: 'devolucoes', rotulo: 'Devoluções', explica: 'voltaram ao estoque' },
  { coluna: 'estornos', rotulo: 'Estornos', explica: 'notas canceladas ou corrigidas, lotes desfeitos' },
  { coluna: 'ajustes', rotulo: 'Ajustes', explica: 'abertura, contagem e ajuste manual' },
];

function PonteDaUnidade({ u, liga, verValores, linhasNoRecorte }: { u: ResumoDaUnidade; liga: Liga; verValores: boolean; linhasNoRecorte: number }) {
  const un = SIGLA(u.unidade);
  const compras = comprasBrutaELiquida(u.somas);
  const uso = usoBrutoELiquido(u.somas);
  const confere = u.diferencaMilesimos === 0;
  const qtd = (m: number) => quantidadeComSinal(m, u.unidade);
  return (
    <Painel
      titulo={`Em ${un}: do saldo inicial ao final`}
      subtitulo={`${pl(u.linhas, 'insumo × loja', 'insumos × lojas')}${linhasNoRecorte > u.linhas ? ' nesta unidade' : ''}. Sinal: + entra no estoque, − sai.`}
      semRespiro
    >
      <table className="w-full text-sm">
        <caption className="sr-only">
          Ponte do estoque em {un}: o saldo inicial, o que entrou e saiu em cada coluna e o saldo final. Cada número abre os movimentos dele.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              Coluna
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Quantidade
            </th>
            <th scope="col" className={`h-10 pl-3 pr-4 text-right font-semibold sm:pr-5 ${verValores ? '' : 'hidden'}`}>
              R$ (como o livro gravou)
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-t border-linha">
            <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-medium sm:pl-5">
              Saldo inicial
              <span className="block text-[12px] font-normal text-suave">{DICA_DA_COLUNA.inicial}</span>
            </th>
            <td className={TD_NUM}>
              <Numero somas={{ n: 0, q: u.inicial.q, v: u.inicial.v }} coluna="inicial" unidade={u.unidade} href={liga('inicial')} verValores={false} rotuloDoLink={`Saldo inicial em ${un}`} forte />
            </td>
            {verValores && <td className={`${TD_NUM} pr-4 sm:pr-5`}>{dinheiroLimpo(u.inicial.v)}</td>}
          </tr>
          {LINHAS_DA_PONTE.map((c) => {
            const s = somaDaColuna(u.somas, c.coluna);
            return (
              <tr key={c.coluna} className="border-t border-linha">
                <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-medium sm:pl-5">
                  {c.rotulo}
                  <span className="block text-[12px] font-normal text-suave">{c.explica}</span>
                </th>
                <td className={TD_NUM}>
                  <Numero somas={{ ...s, v: 0 }} coluna={c.coluna} unidade={u.unidade} href={liga(c.coluna)} verValores={false} rotuloDoLink={`${c.rotulo} em ${un}`} />
                </td>
                {verValores && <td className={`${TD_NUM} pr-4 sm:pr-5`}>{s.n === 0 && s.q === 0 ? <span className="text-suave">—</span> : dinheiroComSinal(s.v)}</td>}
              </tr>
            );
          })}
          <tr className="border-t border-linha">
            <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-medium sm:pl-5">
              Transferências entre lojas
              <span className="block text-[12px] font-normal text-suave">ainda não existe no sistema</span>
            </th>
            <td className={`${TD_NUM} text-suave`}>
              <span aria-hidden>—</span>
              <span className="sr-only">ainda não existe</span>
            </td>
            {verValores && (
              <td className={`${TD_NUM} pr-4 text-suave sm:pr-5`}>
                <span aria-hidden>—</span>
              </td>
            )}
          </tr>
          <tr className="border-t border-linha-forte bg-forte">
            <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-semibold sm:pl-5">
              Saldo final
              <span className="mt-1 flex flex-wrap gap-1.5 font-normal">
                {confere ? <Selo tom="ok">Confere: inicial + movimentos = final</Selo> : <Selo tom="alerta">Não confere: diferença de {quantidadeComSinal(u.diferencaMilesimos, u.unidade)}</Selo>}
              </span>
            </th>
            <td className={TD_NUM}>
              <Numero somas={{ n: 0, q: u.final.q, v: u.final.v }} coluna="final" unidade={u.unidade} href={liga('final')} verValores={false} rotuloDoLink={`Saldo final em ${un}`} forte />
            </td>
            {verValores && <td className={`${TD_NUM} pr-4 font-semibold sm:pr-5`}>{dinheiroLimpo(u.final.v)}</td>}
          </tr>
        </tbody>
      </table>
      <p className="border-t border-linha px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">
        <span className="font-semibold text-texto">Compras:</span> {qtd(compras.bruto.q)} lançadas, {qtd(compras.desfeito.q)} em cancelamentos e correções de nota = <span className="font-semibold text-texto">{qtd(compras.liquido.q)} líquidas</span>.{' '}
        <span className="font-semibold text-texto">Uso:</span> {qtd(uso.bruto.q)} requisitados, {qtd(uso.desfeito.q)} devolvidos = <span className="font-semibold text-texto">{qtd(uso.liquido.q)} líquidos</span>.
      </p>
    </Painel>
  );
}

// ------------------------------------------------------------------ a tabela por insumo e loja

function ligaDaLinha(caminho: string, f: FiltrosDoConsumo, l: LinhaDoConsumo, volta: string): Liga {
  return (col, extra = {}) => hrefDoConsumo(`${caminho}/movimentos`, f, { lojaIds: [l.lojaId], insumoId: l.insumoId, q: '', col, bucket: '', pagina: 1, volta, ...extra }, { semPagina: true });
}

function nomeDaLinha(caminho: string, f: FiltrosDoConsumo, l: LinhaDoConsumo, umaLoja: boolean, aberta: boolean) {
  const abrir = hrefDoConsumo(caminho, f, { lojaIds: [l.lojaId], insumoId: l.insumoId, q: '', pagina: 1, col: '' }, { semPagina: true });
  return (
    <>
      {aberta ? (
        <span className="font-medium text-texto">{l.insumo}</span>
      ) : (
        <Link href={abrir} className="ff-toque ff-transicao rounded-[5px] font-medium text-texto underline-offset-4 hover:underline">
          {l.insumo}
        </Link>
      )}
      <span className="block text-[12px] text-suave">
        em {SIGLA(l.unidade)}
        {!umaLoja ? ` · ${l.loja}` : ''}
        {!l.ativo ? ' · desativado' : ''}
      </span>
      <Lacunas l={l} />
    </>
  );
}

export function TabelaDoConsumo({
  r,
  f,
  caminho,
  volta,
  verValores,
  umaLoja,
}: {
  r: ConsumoDaTela;
  f: FiltrosDoConsumo;
  caminho: string;
  volta: string;
  verValores: boolean;
  umaLoja: boolean;
}) {
  const linhas = r.pagina!.linhas;
  const aberta = !!f.insumoId;
  const { de, ate } = faixaDaPagina(r.numeroDaPagina, f.porPagina, linhas.length);
  const rodape = (
    <PaginacaoNumerada
      de={de}
      ate={ate}
      total={r.pagina!.total}
      pagina={r.numeroDaPagina}
      paginas={r.paginas}
      singular="insumo"
      plural="insumos"
      href={(p) => `${hrefDoConsumo(caminho, f, { pagina: p })}#insumos`}
      tamanhos={{ opcoes: [25, 50, 100], atual: f.porPagina, href: (n) => `${hrefDoConsumo(caminho, f, { porPagina: n, pagina: 1 })}#insumos` }}
    />
  );
  return (
    <Painel id="insumos" titulo="Por insumo e loja" subtitulo="Cada número abre os movimentos que o formam. Em cartão, só as colunas que mexeram no período." semRespiro className="scroll-mt-24">
      <ul className="divide-y divide-linha xl:hidden">
        {linhas.map((l) => {
          const liga = ligaDaLinha(caminho, f, l, volta);
          const un = SIGLA(l.unidade);
          const colunas = COLUNAS_DA_TELA.filter((c) => {
            const s = somaDaColuna(l.somas, c);
            return s.n > 0 || s.q !== 0;
          });
          return (
            <li key={`${l.lojaId}|${l.insumoId}`} className="space-y-2 px-4 py-3">
              <p>{nomeDaLinha(caminho, f, l, umaLoja, aberta)}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] tabular-nums">
                <div>
                  <dt className="text-[12px] text-suave">Saldo inicial</dt>
                  <dd>
                    <Link
                      href={liga('inicial')}
                      aria-label={`Saldo inicial de ${l.insumo}: ${quantidadeLimpa(l.inicial.q, l.unidade)}. Ver os movimentos`}
                      className="inline-flex min-h-11 items-center rounded-[5px] text-texto underline decoration-linha-forte underline-offset-4"
                    >
                      {quantidadeLimpa(l.inicial.q, l.unidade)}
                    </Link>
                    {verValores && <span className="block text-[12px] text-suave">{dinheiroLimpo(l.inicial.v)}</span>}
                  </dd>
                </div>
                {colunas.map((c) => {
                  const s = somaDaColuna(l.somas, c);
                  return (
                    <div key={c}>
                      <dt className="text-[12px] text-suave">{ROTULO_DA_COLUNA[c]}</dt>
                      <dd>
                        <Link
                          href={liga(c)}
                          aria-label={`${ROTULO_DA_COLUNA[c]} de ${l.insumo}: ${quantidadeComSinal(s.q, l.unidade)}, ${pl(s.n, 'movimento', 'movimentos')}. Ver os movimentos`}
                          className="inline-flex min-h-11 items-center rounded-[5px] text-texto underline decoration-linha-forte underline-offset-4"
                        >
                          {quantidadeComSinal(s.q, l.unidade)}
                        </Link>
                        {verValores && <span className="block text-[12px] text-suave">{dinheiroComSinal(s.v)}</span>}
                      </dd>
                    </div>
                  );
                })}
                <div>
                  <dt className="text-[12px] text-suave">Saldo final</dt>
                  <dd>
                    <Link
                      href={liga('final')}
                      aria-label={`Saldo final de ${l.insumo}: ${quantidadeLimpa(l.final.q, l.unidade)}. Ver os movimentos`}
                      className="inline-flex min-h-11 items-center rounded-[5px] font-semibold text-texto underline decoration-linha-forte underline-offset-4"
                    >
                      {quantidadeLimpa(l.final.q, l.unidade)}
                    </Link>
                    {verValores && <span className="block text-[12px] text-suave">{dinheiroLimpo(l.final.v)}</span>}
                  </dd>
                </div>
              </dl>
              {colunas.length < COLUNAS_DA_TELA.length && <p className="text-[12px] text-suave">Sem movimento em {COLUNAS_DA_TELA.filter((c) => !colunas.includes(c)).map((c) => ROTULO_DA_COLUNA[c].toLowerCase()).join(', ')} ({un}).</p>}
            </li>
          );
        })}
      </ul>
      <table className="hidden w-full text-sm xl:table">
        <caption className="sr-only">
          Consumo e conciliação por insumo e loja, {r.pagina!.total} no total: saldo inicial, compras, produzido, uso, perdas, devoluções, estornos, ajustes e saldo final. Cada número abre os movimentos dele.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              Insumo
            </th>
            <th scope="col" className="h-10 px-2 text-right font-semibold" title={DICA_DA_COLUNA.inicial}>
              Saldo inicial
            </th>
            {COLUNAS_DA_TELA.map((c) => (
              <th key={c} scope="col" className="h-10 px-2 text-right font-semibold" title={DICA_DA_COLUNA[c]}>
                {ROTULO_DA_COLUNA[c]}
              </th>
            ))}
            <th scope="col" className="h-10 pl-2 pr-5 text-right font-semibold" title={DICA_DA_COLUNA.final}>
              Saldo final
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => {
            const liga = ligaDaLinha(caminho, f, l, volta);
            return (
              <tr key={`${l.lojaId}|${l.insumoId}`} className="ff-transicao border-t border-linha align-top hover:bg-texto/[0.03]">
                <td className="py-2.5 pl-5 pr-3">{nomeDaLinha(caminho, f, l, umaLoja, aberta)}</td>
                <td className={`${TD_NUM} px-2`}>
                  <Numero somas={{ n: 0, q: l.inicial.q, v: l.inicial.v }} coluna="inicial" unidade={l.unidade} href={liga('inicial')} verValores={verValores} rotuloDoLink={`Saldo inicial de ${l.insumo}`} />
                </td>
                {COLUNAS_DA_TELA.map((c) => (
                  <td key={c} className={`${TD_NUM} px-2`}>
                    <Numero somas={somaDaColuna(l.somas, c)} coluna={c} unidade={l.unidade} href={liga(c)} verValores={verValores} rotuloDoLink={`${ROTULO_DA_COLUNA[c]} de ${l.insumo}`} />
                  </td>
                ))}
                <td className={`${TD_NUM} pl-2 pr-5`}>
                  <Numero somas={{ n: 0, q: l.final.q, v: l.final.v }} coluna="final" unidade={l.unidade} href={liga('final')} verValores={verValores} rotuloDoLink={`Saldo final de ${l.insumo}`} forte />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rodape}
    </Painel>
  );
}

// ------------------------------------------------------------------ o linha a linha de um insumo

const GRUPOS_DO_DETALHE: { titulo: string; buckets: BucketId[] }[] = [
  { titulo: 'Entradas', buckets: ['abertura', 'compra', 'producao', 'transf_entrada'] },
  { titulo: 'Saídas', buckets: ['uso_producao', 'uso_setor', 'perda', 'transf_saida'] },
  { titulo: 'Desfazer e devolver', buckets: ['devolucao_producao', 'devolucao_setor', 'nota_cancelada', 'nota_corrigida', 'lote_estornado', 'estorno_outro'] },
  { titulo: 'Ajustes de inventário', buckets: ['contagem_sobra', 'contagem_falta', 'ajuste'] },
];

function colunaDe(b: BucketId): ColunaId {
  return BUCKETS[b].coluna;
}

export function DetalheDaLinha({ l, f, caminho, volta, verValores }: { l: LinhaDoConsumo; f: FiltrosDoConsumo; caminho: string; volta: string; verValores: boolean }) {
  const liga = (b: BucketId) => hrefDoConsumo(`${caminho}/movimentos`, f, { lojaIds: [l.lojaId], insumoId: l.insumoId, q: '', col: colunaDe(b), bucket: b, pagina: 1, volta }, { semPagina: true });
  const ligaSaldo = (col: 'inicial' | 'final') => hrefDoConsumo(`${caminho}/movimentos`, f, { lojaIds: [l.lojaId], insumoId: l.insumoId, q: '', col, bucket: '', pagina: 1, volta }, { semPagina: true });
  const soma = (b: BucketId): Soma => l.somas[b] ?? { n: 0, q: 0, v: 0 };
  return (
    <Painel
      titulo={`${l.insumo} · ${l.loja}: linha a linha`}
      subtitulo="Cada movimento do livro cai numa linha só, então nada conta duas vezes. Sinal: + entra, − sai."
      semRespiro
    >
      <table className="w-full text-sm">
        <caption className="sr-only">
          Linha a linha de {l.insumo} em {l.loja}: o saldo inicial, cada tipo de movimento com a origem, quantos movimentos e a quantidade, e o saldo final.
        </caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              O que foi
            </th>
            <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">
              Movimentos
            </th>
            <th scope="col" className={`h-10 px-3 text-right font-semibold ${verValores ? '' : 'pr-4 sm:pr-5'}`}>
              Quantidade
            </th>
            {verValores && (
              <th scope="col" className="h-10 pl-3 pr-4 text-right font-semibold sm:pr-5">
                R$
              </th>
            )}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-t border-linha">
            <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-medium sm:pl-5">
              Saldo inicial
              <span className="block text-[12px] font-normal text-suave">o livro até o dia anterior ao início</span>
            </th>
            <td className="hidden sm:table-cell" />
            <td className={TD_NUM}>
              <Link href={ligaSaldo('inicial')} className="ff-toque rounded-[5px] font-semibold text-texto underline decoration-linha-forte underline-offset-4">
                {quantidadeLimpa(l.inicial.q, l.unidade)}
              </Link>
            </td>
            {verValores && <td className={`${TD_NUM} pr-4 sm:pr-5`}>{dinheiroLimpo(l.inicial.v)}</td>}
          </tr>
          {GRUPOS_DO_DETALHE.map((g) => (
            <GrupoDoDetalhe key={g.titulo} g={g} soma={soma} liga={liga} unidade={l.unidade} verValores={verValores} insumo={l.insumo} />
          ))}
          <tr className="border-t border-linha-forte bg-forte">
            <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-semibold sm:pl-5">
              Saldo final
              <span className="mt-1 flex flex-wrap gap-1.5 font-normal">
                {l.confere ? <Selo tom="ok">Confere: inicial + movimentos = final</Selo> : <Selo tom="alerta">Não confere: diferença de {quantidadeComSinal(l.diferencaMilesimos, l.unidade)}</Selo>}
              </span>
            </th>
            <td className="hidden sm:table-cell" />
            <td className={TD_NUM}>
              <Link href={ligaSaldo('final')} className="ff-toque rounded-[5px] font-semibold text-texto underline decoration-linha-forte underline-offset-4">
                {quantidadeLimpa(l.final.q, l.unidade)}
              </Link>
            </td>
            {verValores && <td className={`${TD_NUM} pr-4 font-semibold sm:pr-5`}>{dinheiroLimpo(l.final.v)}</td>}
          </tr>
        </tbody>
      </table>
      <div className="space-y-2 border-t border-linha px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">
        <p>
          Saldo guardado hoje: <span className="tabular-nums text-texto">{quantidadeLimpa(l.saldoGuardado, l.unidade)}</span>.{' '}
          {l.ultimaContagemEm ? `Última contagem aplicada: ${l.ultimaContagemEm.split('-').reverse().join('/')}.` : 'Nenhuma contagem aplicada até aqui.'}
        </p>
        {l.lacunas.length > 0 && (
          <ul className="space-y-1.5">
            {l.lacunas.map((x) => (
              <li key={x.chave}>
                <span className="font-semibold text-texto">{x.rotulo}.</span> {x.texto}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Painel>
  );
}

function GrupoDoDetalhe({
  g,
  soma,
  liga,
  unidade,
  verValores,
  insumo,
}: {
  g: { titulo: string; buckets: BucketId[] };
  soma: (b: BucketId) => Soma;
  liga: (b: BucketId) => string;
  unidade: Unidade;
  verValores: boolean;
  insumo: string;
}) {
  return (
    <>
      <tr className="border-t border-linha">
        <th scope="colgroup" colSpan={verValores ? 4 : 3} className="bg-texto/[0.03] py-1.5 pl-4 pr-3 text-left text-[12px] font-semibold text-suave sm:pl-5">
          {g.titulo}
        </th>
      </tr>
      {g.buckets.map((b) => {
        const s = soma(b);
        const def = BUCKETS[b];
        const vazio = s.n === 0 && s.q === 0;
        const inexistente = def.origem === 'ainda não existe';
        return (
          <tr key={b} className="border-t border-linha align-top">
            <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-medium sm:pl-5">
              {def.rotulo}
              <span className="block text-[12px] font-normal text-suave">
                {inexistente ? 'ainda não existe no sistema' : `de onde vem: ${def.origem}`}
                <span className="sm:hidden">{vazio ? '' : ` · ${pl(s.n, 'movimento', 'movimentos')}`}</span>
              </span>
            </th>
            <td className="hidden px-3 py-2.5 text-right sm:table-cell">{vazio ? <span className="text-suave">—</span> : s.n}</td>
            <td className={`${TD_NUM} ${verValores ? '' : 'pr-4 sm:pr-5'}`}>
              {vazio ? (
                <span className="text-suave">
                  <span aria-hidden>—</span>
                  <span className="sr-only">nada</span>
                </span>
              ) : (
                <Link
                  href={liga(b)}
                  aria-label={`${def.rotulo} de ${insumo}: ${quantidadeComSinal(s.q, unidade)}, ${pl(s.n, 'movimento', 'movimentos')}. Ver os movimentos`}
                  className="ff-toque ff-transicao rounded-[5px] text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto"
                >
                  {quantidadeComSinal(s.q, unidade)}
                </Link>
              )}
            </td>
            {verValores && <td className={`${TD_NUM} pr-4 sm:pr-5`}>{vazio ? <span className="text-suave">—</span> : dinheiroComSinal(s.v)}</td>}
          </tr>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ notas e barra de saída

export function NotasDoConsumo({ r, f }: { r: ConsumoDaTela; f: FiltrosDoConsumo }) {
  const itens: ReactNode[] = [
    <li key="uso">
      <strong className="font-semibold text-texto">O que é “Uso”.</strong> {NOTA_DO_USO}
    </li>,
    <li key="data">
      <strong className="font-semibold text-texto">Data dos movimentos.</strong> {NOTA_DA_DATA}
    </li>,
    <li key="bruto">
      <strong className="font-semibold text-texto">Bruto e líquido.</strong> {NOTA_DO_BRUTO}
    </li>,
    <li key="ajuste">
      <strong className="font-semibold text-texto">Diferença da contagem.</strong> {NOTA_DO_AJUSTE}
    </li>,
    <li key="transf">
      <strong className="font-semibold text-texto">Transferência.</strong> {NOTA_DA_TRANSFERENCIA}
    </li>,
    <li key="valor">
      <strong className="font-semibold text-texto">Dinheiro.</strong>{' '}
      {r.verValores ? 'Os R$ são os que o livro gravou na hora de cada movimento: mudar o preço de um insumo depois não reescreve o passado. Insumo sem preço na época entra com valor zero e é avisado.' : 'Os valores em reais aparecem só para quem pode ver compras e notas.'}
    </li>,
  ];
  return (
    <Painel titulo="Para ler os números" semRespiro>
      <ul className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">{itens}</ul>
      <p className="sr-only">{fraseDoPeriodoDoConsumo(f)}</p>
    </Painel>
  );
}

export function BarraDeSaidaDoConsumo({ exportar, imprimir, query, parte = 'linhas' }: { exportar: string; imprimir: string | null; query: string; parte?: 'linhas' | 'movimentos' }) {
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Levar o relatório">
      <a href={`${exportar}?${q({ parte })}`} className={classeDeBotao('secundario')}>
        Planilha {parte === 'movimentos' ? 'dos movimentos' : 'do consumo'}
      </a>
      {imprimir && (
        <Link href={`${imprimir}?${q({ imprimir: '1' })}`} className={classeDeBotao('secundario')}>
          Imprimir ou salvar em PDF
        </Link>
      )}
    </div>
  );
}


// ------------------------------------------------------------------ a tela

export function TelaDoConsumo({
  enderecos,
  contexto,
  f,
  r,
  hoje,
  visaoDaLoja,
}: {
  enderecos: EnderecosDoConsumo;
  contexto: string;
  f: FiltrosDoConsumo;
  r: ConsumoDaTela;
  hoje: string;
  visaoDaLoja?: string | null;
}) {
  const { caminho } = enderecos;
  const resumo = r.resumo;
  const volta = hrefDoConsumo(caminho, f, {}, { semPagina: false });
  const vazio = r.motivoVazio
    ? r.motivoVazio === 'periodo'
      ? { titulo: 'O período não faz sentido.', texto: f.periodoInvalido ?? '' }
      : { titulo: 'Nenhuma dessas lojas está no seu acesso.', texto: 'O relatório só mostra as lojas que você pode ver. Escolha entre as que aparecem em “Lojas”, ou deixe sem marcar para ver todas as suas.' }
    : null;
  const linhas = r.pagina?.linhas ?? [];
  const insumoNome = f.insumoId ? linhas[0]?.insumo : undefined;
  const subtitulo = [contexto, insumoNome, r.lojasUsadas.length === 1 ? r.lojasUsadas[0].nome : null, fraseDoPeriodoDoConsumo(f)].filter(Boolean).join(' · ');
  const avisos = resumo
    ? avisosDoConsumo({
        de: f.de,
        ate: f.ate,
        hoje,
        verValores: r.verValores,
        lojasSemEstoque: r.lojasSemEstoque,
        aguardando: r.aguardando,
        contagensEmAndamento: r.contagensEmAndamento,
        linhas: resumo.linhas,
        comLacunaDura: resumo.comLacunaDura,
        semContagem: resumo.semContagem,
        semValor: resumo.semValor,
        movimentosSemOrigem: resumo.movimentosSemOrigem,
      })
    : [];
  const ligaGeral: Liga = (col, extra = {}) => hrefDoConsumo(`${caminho}/movimentos`, f, { col, bucket: '', pagina: 1, volta, ...extra }, { semPagina: true });
  return (
    <div className="space-y-6">
      <PageHeader icone="estoque" cor={COR.estoque} titulo="Consumo e conciliação" subtitulo={subtitulo}>
        <FormularioDoConsumo caminho={caminho} f={f} opcoes={r.opcoes} hoje={hoje} />
        {visaoDaLoja && (
          <p className="text-[13px] text-suave">
            Mostrando só <strong className="font-semibold text-texto">{visaoDaLoja}</strong>, a loja escolhida no topo. Para ver outras, marque-as em “Lojas”.
          </p>
        )}
        <ChipsDoConsumo caminho={caminho} f={f} opcoes={r.opcoes} insumoNome={insumoNome} />
        <p className="text-[13px] text-suave">
          “Uso” é a <strong className="font-semibold text-texto">requisição registrada</strong> (a baixa que o estoque deu), não o consumo medido na prateleira. A diferença da contagem entra como ajuste.
        </p>
      </PageHeader>

      {vazio && (
        <Painel semRespiro>
          <Vazio titulo={vazio.titulo} acao={<Link href={caminho} className={classeDeBotao('secundario')}>Limpar e recomeçar</Link>}>
            {vazio.texto}
          </Vazio>
        </Painel>
      )}

      {resumo && r.pagina && (
        <>
          {resumo.linhas === 0 ? (
            <Painel semRespiro>
              <Vazio
                titulo={r.lojasSemEstoque.length > 0 && r.lojasSemEstoque.length === r.lojasUsadas.length ? 'O estoque ainda não foi aberto.' : 'Nenhum insumo com movimento ou saldo neste recorte.'}
                acao={
                  f.lojaIds.length || f.insumoId || f.q || f.categoriaId || f.so ? (
                    <Link href={hrefDoConsumo(caminho, f, { lojaIds: [], insumoId: '', q: '', categoriaId: '', so: '', pagina: 1 })} className={classeDeBotao('secundario')}>
                      Tirar os filtros
                    </Link>
                  ) : undefined
                }
              >
                {r.lojasSemEstoque.length > 0
                  ? `${r.lojasSemEstoque.join(', ')}: sem a primeira contagem (a abertura) não há saldo nem movimento. `
                  : ''}
                Confira o período: o relatório lê o livro do estoque dia a dia.
              </Vazio>
            </Painel>
          ) : (
            <>
              <section aria-labelledby="cons-resumo" className="space-y-3">
                <h2 id="cons-resumo" className="sr-only">
                  A ponte do estoque por unidade
                </h2>
                <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-3">
                  <Cartao rotulo="Insumos com movimento ou saldo" ver={resumo.comLacunaDura > 0 && f.so !== 'atencao' ? { href: hrefDoConsumo(caminho, f, { so: 'atencao', pagina: 1, col: '' }), texto: `Ver os ${resumo.comLacunaDura} que pedem atenção` } : undefined}>
                    <p className="font-display text-[26px] font-bold leading-none tabular-nums">{resumo.linhas.toLocaleString('pt-BR')}</p>
                    <p className="mt-1.5 text-[12px] text-suave">
                      insumos × lojas · {resumo.comLacunaDura > 0 ? `${pl(resumo.comLacunaDura, 'pede atenção', 'pedem atenção')}` : 'nenhum com lacuna que pede atenção'}
                    </p>
                  </Cartao>
                  <Cartao rotulo="Conta do livro" ver={avisos.length > 0 ? { href: '#antes-de-ler', texto: avisos.length === 1 ? 'Ver o aviso sobre este relatório' : `Ver os ${avisos.length} avisos sobre este relatório` } : undefined}>
                    {resumo.unidades.every((u) => u.diferencaMilesimos === 0) ? (
                      <>
                        <p className="font-display text-[26px] font-bold leading-none">Confere</p>
                        <p className="mt-1.5 text-[12px] text-suave">Em todas as unidades: saldo inicial + movimentos = saldo final.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-display text-[26px] font-bold leading-none">Não confere</p>
                        <p className="mt-1.5 text-[12px] text-suave">Algum insumo tem diferença entre o saldo final e a soma dos movimentos: veja os selos “A conta não fecha”.</p>
                      </>
                    )}
                  </Cartao>
                  <Cartao rotulo="Sem contagem no período" ver={resumo.semContagem > 0 && f.so !== 'semcontagem' ? { href: hrefDoConsumo(caminho, f, { so: 'semcontagem', pagina: 1, col: '' }), texto: `Ver os ${resumo.semContagem}` } : undefined}>
                    <p className="font-display text-[26px] font-bold leading-none tabular-nums">{resumo.semContagem.toLocaleString('pt-BR')}</p>
                    <p className="mt-1.5 text-[12px] text-suave">insumos mexeram e nenhuma contagem aplicada os pegou: o saldo final é o do livro, não da prateleira.</p>
                  </Cartao>
                </div>
              </section>

              {avisos.length > 0 && (
                <Painel id="antes-de-ler" titulo="Antes de ler" subtitulo="O que muda o jeito de ler este relatório." semRespiro className="scroll-mt-24">
                  <ul className="space-y-2 px-4 py-3 text-[13px] leading-relaxed text-suave sm:px-5">
                    {avisos.map((a) => (
                      <li key={a.chave}>
                        {a.texto}
                        {a.chave === 'aguardando' && ' '}
                        {a.chave === 'lacunas' && enderecos.divergencias && (
                          <>
                            {' '}
                            <Link href={enderecos.divergencias} className={`${LINK_DE_TEXTO} ff-toque`}>
                              Ver as Divergências (requisição × contagem)
                            </Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </Painel>
              )}

              {resumo.unidades.map((u) => (
                <PonteDaUnidade key={u.unidade} u={u} liga={ligaGeral} verValores={r.verValores} linhasNoRecorte={resumo.linhas} />
              ))}

              <TabelaDoConsumo r={r} f={f} caminho={caminho} volta={volta} verValores={r.verValores} umaLoja={r.lojasUsadas.length === 1} />

              {f.insumoId && linhas.map((l) => <DetalheDaLinha key={`${l.lojaId}|${l.insumoId}`} l={l} f={f} caminho={caminho} volta={volta} verValores={r.verValores} />)}

              {!f.insumoId && linhas.length > 0 && (
                <p className="text-[13px] text-suave">Abra um insumo (o nome dele) para ver o linha a linha: cada tipo de movimento, de onde vem e quantos foram.</p>
              )}

              <NotasDoConsumo r={r} f={f} />

              <BarraDeSaidaDoConsumo exportar={enderecos.exportar} imprimir={caminho} query={queryDoConsumo(f, {}, { semPagina: true })} />
            </>
          )}
        </>
      )}
      {!vazio && !resumo && (
        <Aviso tom="alerta" titulo="Não foi possível montar o relatório.">
          Confira o período e os filtros.
        </Aviso>
      )}
      {resumo && resumo.linhas === 0 && !vazio && <NotasDoConsumo r={r} f={f} />}
    </div>
  );
}
