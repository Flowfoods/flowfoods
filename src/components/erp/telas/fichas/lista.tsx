// Scanner avoid-ai-design, SD4d (P2) aceito: "Prato · rende 1 porção" e "R$ 3,20 · R$ 1,60 por porção" seguem o subtítulo do contrato ("Rede Completa · N fichas") como linha de apoio, igual aos insumos da 1.1. (O ignore do scanner não aceita id com minúscula.)
/**
 * Lista de fichas técnicas (1.2), a MESMA para o nível 1 e para a pessoa do
 * parceiro. Recebe a página já lida pelo cliente do portão de quem chama.
 * Tabela densa do kit Corporativo com a foto em miniatura (bate o olho e
 * sabe o que é); abaixo de 640 px vira cartões. Filtros e página na URL.
 * Custo incompleto aparece como selo, nunca como um número baixo.
 */

import Link from 'next/link';
import { validadesEmTexto } from '@/lib/erp/validade';
import type { LinhaDeFicha } from '@/lib/erp/fichas';
import {
  custoIncompleto,
  FICHAS_POR_PAGINA,
  formatarRendimento,
  porUnidadeDeRendimento,
  queryDosFiltrosDeFicha,
  temFiltroDeFicha,
  TIPOS_DE_FICHA,
  type FiltrosDeFicha,
} from '@/lib/erp/ficha-campos';
import { formatarFracao } from '@/lib/erp/unidades';
import { CAMPO, MARCAR } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Paginacao } from '../../ui/paginacao';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { Miniatura } from './miniatura';
import { CANAIS } from '@/lib/erp/canal-campos';
import { FAROL, formatarPorcentagem, type PrecoDoCanal } from '@/lib/erp/preco-campos';

/** 1.10: a margem líquida de um canal na lista — o número, e a palavra quando sai do alvo (nunca só a cor). */
function MargemNaLista({ p }: { p: PrecoDoCanal }) {
  if (!p.margens) return p.porQue && p.preco ? <span className="text-[12px] text-atencao">incompleta</span> : <span className="text-suave">—</span>;
  const f = p.margens.farol;
  // Sem preço próprio vale o sugerido, que fica no alvo por construção: número em cinza, sem farol.
  if (p.preco?.origem === 'sugerido') {
    return (
      <span className="text-suave">
        {formatarPorcentagem(p.margens.liquidaBp)}
        <span className="sr-only"> pelo preço sugerido</span>
      </span>
    );
  }
  return (
    <>
      <span className={f === 'prejuizo' ? 'text-erro font-semibold' : 'font-semibold text-texto'}>{formatarPorcentagem(p.margens.liquidaBp)}</span>
      {f && f !== 'noAlvo' && <span className={`block text-[12px] ${f === 'prejuizo' ? 'text-erro' : 'text-atencao'}`}>{FAROL[f].rotulo}</span>}
    </>
  );
}

/**
 * Celular e tablet: só os canais FORA do alvo, com o número e a palavra; o
 * resto resumido ("iFood 30,6% abaixo do alvo; os outros no alvo").
 */
function margemEmLinha(precos: readonly PrecoDoCanal[]): string | null {
  if (precos.every((p) => !p.margens && !p.preco)) return null;
  const fora = precos.filter((p) => (p.margens && p.preco?.origem === 'proprio' && p.margens.farol && p.margens.farol !== 'noAlvo') || (!p.margens && p.porQue && p.preco));
  const noAlvo = precos.filter((p) => p.margens && !fora.includes(p));
  const semPreco = precos.filter((p) => !p.margens && !fora.includes(p));
  const partes = fora.map((p) =>
    p.margens ? `${CANAIS[p.canal].curto} ${formatarPorcentagem(p.margens.liquidaBp)} ${FAROL[p.margens.farol!].rotulo}` : `${CANAIS[p.canal].curto} incompleta`,
  );
  if (noAlvo.length) partes.push(fora.length ? (noAlvo.length === 1 ? `${CANAIS[noAlvo[0].canal].curto} no alvo` : 'os outros no alvo') : 'no alvo nos canais com preço');
  if (semPreco.length) partes.push(`${semPreco.map((p) => CANAIS[p.canal].curto).join(' e ')} sem preço`);
  return `Margem líquida: ${partes.join('; ')}`;
}

function hrefCom(base: string, f: FiltrosDeFicha, mudar: Partial<FiltrosDeFicha>): string {
  const q = queryDosFiltrosDeFicha({ ...f, pagina: 1, ...mudar });
  return q ? `${base}?${q}` : base;
}

function hrefDoDetalhe(base: string, id: string, f: FiltrosDeFicha): string {
  const q = queryDosFiltrosDeFicha(f);
  return q ? `${base}/${id}?de=${encodeURIComponent(q)}` : `${base}/${id}`;
}

/** Custo por porção (ou kg); `empilhado` (celular): o "por porção" vai embaixo e o nome ganha espaço. */
function CustoPorRende({ l, empilhado = false }: { l: LinhaDeFicha; empilhado?: boolean }) {
  if (custoIncompleto(l.custo)) return <Selo tom="alerta">{empilhado ? 'Incompleto' : 'Custo incompleto'}</Selo>;
  return (
    <span className={empilhado ? 'block' : 'whitespace-nowrap'}>
      <span className={`font-semibold text-texto ${empilhado ? 'block' : ''}`}>{formatarFracao(l.custo.porRendimento)}</span>
      <span className={`text-[12px] text-suave ${empilhado ? 'block' : 'ml-1'}`}>{porUnidadeDeRendimento(l.unidadeRendimento, l.tipo)}</span>
    </span>
  );
}

const ROTULO_DA_SITUACAO = { ativas: 'Ativas', desativadas: 'Desativadas', todas: 'Todas' } as const;

/** Busca e filtros (GET: o estado vai para a URL). */
export function FiltrosDasFichas({ base, filtros: f }: { base: string; filtros: FiltrosDeFicha }) {
  const SELECT = `${CAMPO} pr-8`;
  return (
    <form role="search" action={base} className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(18rem,1fr)_repeat(2,minmax(10.5rem,auto))_auto]">
      <div className="col-span-2 flex gap-2 lg:col-span-1">
        <label htmlFor="fichas-q" className="sr-only">
          Buscar ficha pelo nome
        </label>
        <input id="fichas-q" name="q" type="search" defaultValue={f.q} placeholder="Buscar pelo nome" className={`${CAMPO} min-w-0 flex-1`} />
        <button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>
          Filtrar
        </button>
        {temFiltroDeFicha(f) && (
          <Link href={base} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>
            Limpar
          </Link>
        )}
      </div>
      <div>
        <label htmlFor="fichas-tipo" className="sr-only">
          Tipo
        </label>
        <select id="fichas-tipo" name="tipo" defaultValue={f.tipo ?? ''} className={SELECT}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_DE_FICHA).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fichas-situacao" className="sr-only">
          Situação
        </label>
        <select id="fichas-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
          {(Object.keys(ROTULO_DA_SITUACAO) as (keyof typeof ROTULO_DA_SITUACAO)[]).map((k) => (
            <option key={k} value={k}>
              {ROTULO_DA_SITUACAO[k]}
            </option>
          ))}
        </select>
      </div>
      <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:min-h-[42px] lg:col-span-1">
        <input type="checkbox" name="custo" value="incompleto" defaultChecked={f.incompleto} className={MARCAR} />
        <span className="whitespace-nowrap">Só custo incompleto</span>
      </label>
    </form>
  );
}

export function TelaListaFichas({
  base,
  filtros: f,
  linhas,
  total,
  pagina,
  paginas,
  novaHref,
  importarHref,
  precos,
}: {
  /** /erp/fichas ou /rodolfo/erp/<slug>/fichas */
  base: string;
  filtros: FiltrosDeFicha;
  linhas: LinhaDeFicha[];
  total: number;
  pagina: number;
  paginas: number;
  /** Quem cria (e não está bloqueado) vê os atalhos no vazio. */
  novaHref?: string;
  importarHref?: string;
  /** 1.10: preço e margem por canal das fichas de prato (só para quem vê preços). */
  precos?: ReadonlyMap<string, PrecoDoCanal[]>;
}) {
  if (total === 0) {
    return (
      <Painel>
        {temFiltroDeFicha(f) ? (
          <Vazio
            titulo="Nada encontrado com esses filtros."
            acao={
              <Link href={base} className={classeDeBotao('secundario')}>
                Limpar filtros
              </Link>
            }
          >
            A busca e os filtros continuam acima, como você deixou.
          </Vazio>
        ) : (
          <Vazio
            titulo="Nenhuma ficha técnica ainda."
            acao={
              novaHref ? (
                <span className="flex flex-wrap justify-center gap-2">
                  <Link href={novaHref} className={classeDeBotao('primario')}>
                    Montar a primeira ficha
                  </Link>
                  {importarHref && (
                    <Link href={importarHref} className={classeDeBotao('secundario')}>
                      Importar planilha
                    </Link>
                  )}
                </span>
              ) : undefined
            }
          >
            {novaHref
              ? 'Comece pelos campeões de venda: a receita, a foto e quanto custa cada porção.'
              : 'Quem cuida das receitas ainda não montou nenhuma.'}
          </Vazio>
        )}
      </Painel>
    );
  }

  const de = (pagina - 1) * FICHAS_POR_PAGINA + 1;
  const ate = de + linhas.length - 1;

  return (
    <Painel semRespiro>
      <ul className="divide-y divide-linha sm:hidden">
        {linhas.map((l) => (
          <li key={l.id}>
            <Link href={hrefDoDetalhe(base, l.id, f)} className="ff-transicao flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-texto/[0.03]">
              <Miniatura base={base} id={l.id} foto={l.foto} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${l.ativa ? 'text-texto' : 'text-suave'}`}>{l.nome}</span>
                <span className="block truncate text-[12px] text-suave">
                  {TIPOS_DE_FICHA[l.tipo]} · rende {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
                  {!l.ativa && ' · Desativada'}
                </span>
                {/* 1.5 (herança d): validade em linha própria, quebrando em vez de cortar. */}
                {validadesEmTexto(l.validades) && <span className="mt-0.5 block text-[12px] leading-snug text-suave">{validadesEmTexto(l.validades)}</span>}
                {precos?.get(l.id) && margemEmLinha(precos.get(l.id)!) && (
                  <span className="mt-0.5 block text-[12px] leading-snug tabular-nums text-suave">{margemEmLinha(precos.get(l.id)!)}</span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <CustoPorRende l={l} empilhado />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">
          Fichas técnicas, {total} no total. Custo = soma dos insumos pelo custo de referência; por porção = custo dividido pelo rendimento.
        </caption>
        <thead>
          {precos && (
            <tr className="hidden bg-forte text-[12px] text-suave lg:table-row">
              <td colSpan={4} />
              <th scope="colgroup" colSpan={3} className="border-b border-linha px-3 pr-5 pt-2 text-center font-semibold">
                Margem líquida
              </th>
            </tr>
          )}
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
              Ficha
            </th>
            <th scope="col" className="hidden h-10 px-3 font-semibold md:table-cell">
              Rende
            </th>
            <th scope="col" className={`hidden h-10 px-3 text-right font-semibold ${precos ? '' : 'md:table-cell'}`}>
              Insumos
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Custo da receita
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Por porção ou kg
            </th>
            {precos &&
              (['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const).map((c) => (
                <th key={c} scope="col" className="hidden h-10 px-3 text-right font-semibold lg:table-cell">
                  <span className="sr-only">Margem líquida no </span>
                  {CANAIS[c].curto}
                </th>
              ))}
            <th scope="col" className={`hidden h-10 px-3 pr-5 font-semibold ${precos ? '' : 'lg:table-cell'}`}>
              Situação
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => (
            <tr key={l.id} className="ff-transicao border-t border-linha hover:bg-texto/[0.03]">
              <td className="py-2 pl-4 pr-3 sm:pl-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Miniatura base={base} id={l.id} foto={l.foto} />
                  <div className="min-w-0">
                    <Link
                      href={hrefDoDetalhe(base, l.id, f)}
                      className={`ff-transicao rounded-[5px] font-medium underline-offset-4 hover:underline ${l.ativa ? 'text-texto' : 'text-suave'}`}
                    >
                      {l.nome}
                    </Link>
                    <div className="max-w-[15rem] truncate text-[12px] text-suave lg:max-w-[28rem]">
                      {TIPOS_DE_FICHA[l.tipo]}
                      {l.preparos > 0 ? ` · com ${l.preparos === 1 ? '1 pré-preparo' : `${l.preparos} pré-preparos`}` : ''}
                      {l.descricao ? ` · ${l.descricao}` : ''}
                      <span className={precos ? '' : 'lg:hidden'}>{!l.ativa && ' · Desativada'}</span>
                    </div>
                    {validadesEmTexto(l.validades) && <div className="text-[12px] leading-snug text-suave">{validadesEmTexto(l.validades)}</div>}
                    {precos?.get(l.id) && margemEmLinha(precos.get(l.id)!) && (
                      <div className="text-[12px] leading-snug tabular-nums text-suave lg:hidden">{margemEmLinha(precos.get(l.id)!)}</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-suave md:table-cell">
                {formatarRendimento(l.rendimentoMilesimos, l.unidadeRendimento, l.tipo)}
              </td>
              <td className={`hidden px-3 py-2 text-right text-suave ${precos ? '' : 'md:table-cell'}`}>{l.itens}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {custoIncompleto(l.custo) ? (
                  <span className="text-suave" title={`Falta preço em: ${l.custo.faltaPreco.join(', ')}`}>
                    {formatarFracao(l.custo.total)} + ?
                  </span>
                ) : (
                  formatarFracao(l.custo.total)
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <CustoPorRende l={l} />
              </td>
              {precos &&
                (precos.get(l.id) ? (
                  precos.get(l.id)!.map((p) => (
                    <td key={p.canal} className="hidden whitespace-nowrap px-3 py-2 text-right last:pr-5 lg:table-cell">
                      <MargemNaLista p={p} />
                    </td>
                  ))
                ) : (
                  <td colSpan={3} className="hidden px-3 py-2 pr-5 text-right text-[12px] text-suave lg:table-cell">
                    não se vende
                  </td>
                ))}
              <td className={`hidden py-2 pl-3 pr-5 ${precos ? '' : 'lg:table-cell'}`}>
                {l.ativa ? <Selo tom="ok">Ativa</Selo> : <Selo>Desativada</Selo>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {precos && (
        <p className="hidden border-t border-linha px-5 py-2.5 text-[12px] text-suave lg:block">
          Margem líquida = o que sobra do preço depois dos insumos, das embalagens e da taxa do canal. Em cinza: sem preço próprio (vale o sugerido, que
          fica no alvo).
        </p>
      )}
      <Paginacao
        de={de}
        ate={ate}
        total={total}
        singular="ficha"
        plural="fichas"
        anterior={pagina > 1 ? hrefCom(base, f, { pagina: pagina - 1 }) : null}
        proxima={pagina < paginas ? hrefCom(base, f, { pagina: pagina + 1 }) : null}
      />
    </Painel>
  );
}
