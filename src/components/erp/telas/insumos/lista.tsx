// Scanner avoid-ai-design, SD4d (P2) aceito: "Ingrediente · Seco" e "3 kg · R$ 115,00" seguem o subtítulo do contrato ("Rede Completa · N insumos") como linha de apoio da tabela densa. (O ignore do scanner não aceita id com minúscula.)
/**
 * Lista de insumos (1.1), a MESMA para o nível 1 e para a pessoa do parceiro.
 * Recebe a página já lida pelo cliente do portão de quem chama: esta tela não
 * escolhe parceiro nenhum. Tabela densa do kit Corporativo (linha 44 px,
 * cabeçalho em `forte`, números tabulares à direita); abaixo de 640 px vira
 * lista de cartões que abrem o detalhe em tela cheia. Filtros, ordem e página
 * moram na URL e o detalhe volta para eles.
 */

import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { formatarData } from '@/lib/erp/compra-campos';
import { formatarValidade, ROTULO_DA_OPCAO } from '@/lib/erp/validade';
import type { LinhaDeInsumo, TotalDoCadastro } from '@/lib/erp/insumos';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import {
  CONSERVACOES,
  FILTRO_A_CONFIRMAR,
  FILTRO_SEM_MARCA,
  MOTIVOS_DE_CADASTRO_INCOMPLETO,
  OPCOES_POR_PAGINA,
  POR_PAGINA_PADRAO,
  queryDosFiltros,
  temFiltro,
  TIPOS,
  type FiltrosDeInsumo,
} from '@/lib/erp/insumo-campos';
import { faixaDaPagina } from '@/lib/erp/paginacao';
import { UNIDADES, formatarDinheiro, formatarFracao, formatarQuantidade, valorDoCusto } from '@/lib/erp/unidades';
import { CAMPO, MARCAR } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { PaginacaoNumerada } from '../../ui/paginacao-numerada';
import { Painel, Selo, Vazio } from '../../ui/superficies';

/** Link da lista com estes filtros mudados (página volta à 1 se não for ela que muda). */
function hrefCom(base: string, f: FiltrosDeInsumo, mudar: Partial<FiltrosDeInsumo>): string {
  const q = queryDosFiltros({ ...f, pagina: 1, ...mudar });
  return q ? `${base}?${q}` : base;
}

function hrefDoDetalhe(base: string, id: string, f: FiltrosDeInsumo): string {
  const q = queryDosFiltros(f);
  return q ? `${base}/${id}?de=${encodeURIComponent(q)}` : `${base}/${id}`;
}

/** L.1: a caneta leva à edição e a edição volta para ESTA lista (mesma página, filtros e tamanho). */
function hrefDeEditar(base: string, id: string, f: FiltrosDeInsumo): string {
  const q = queryDosFiltros(f);
  return `${base}/${id}/editar?${q ? `de=${encodeURIComponent(q)}&` : ''}origem=lista`;
}

/** L.1: a lixeira leva à tela "Remover insumo" (que mostra os vínculos antes de qualquer coisa). */
function hrefDeRemover(base: string, id: string, f: FiltrosDeInsumo): string {
  const q = queryDosFiltros(f);
  return `${base}/${id}/remover${q ? `?de=${encodeURIComponent(q)}` : ''}`;
}

/** Os motivos do cadastro incompleto de uma linha, ou null (a linha completa não ganha nada). */
function MotivosDaLinha({ i, className = '' }: { i: LinhaDeInsumo; className?: string }) {
  if (i.motivosIncompleto.length === 0) return null;
  return (
    <span className={`block text-[12px] text-atencao ${className}`}>
      Cadastro incompleto: {i.motivosIncompleto.map((m) => MOTIVOS_DE_CADASTRO_INCOMPLETO[m]).join(' · ')}
    </span>
  );
}

/** Caneta e lixeira: 44 x 44, com o nome do insumo no rótulo (o leitor de tela diz qual linha é). */
const ICONE_DE_ACAO =
  'ff-transicao inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[7px] border border-linha-forte text-texto hover:border-texto/35 hover:bg-texto/5';

function AcoesDaLinha({ i, base, f }: { i: LinhaDeInsumo; base: string; f: FiltrosDeInsumo }) {
  // Pré-preparo muda pela ficha técnica: a lista não oferece caneta nem lixeira para ele.
  if (i.preparo) return <span className="text-[12px] text-suave">Pela ficha</span>;
  return (
    <span className="inline-flex gap-1.5">
      {i.ativo ? (
        <Link href={hrefDeEditar(base, i.id, f)} className={ICONE_DE_ACAO} aria-label={`Editar ${i.nome}`} title="Editar">
          <Pencil size={16} aria-hidden />
        </Link>
      ) : (
        // Desativado não se edita: reative no detalhe. O espaço fica para as lixeiras alinharem.
        <span aria-hidden className="inline-block h-11 w-11 shrink-0" />
      )}
      <Link href={hrefDeRemover(base, i.id, f)} className={ICONE_DE_ACAO} aria-label={`Remover ${i.nome}`} title="Remover">
        <Trash2 size={16} aria-hidden />
      </Link>
    </span>
  );
}

/**
 * Onde fica e, no insumo comprado, o prazo de uso depois de aberto (o da conservação principal). Pré-preparo mantém a validade da
 * ficha. I.1b: o insumo antigo em Seco que ninguém confirmou, numa categoria que costuma ser fria, diz "a confirmar".
 */
function conservacaoDaLinha(i: LinhaDeInsumo): string {
  if (!i.conservacaoInformada) return 'validade não informada';
  if (i.preparo) return validadesDaFicha(i);
  const prazo = i.validades.minutos[i.conservacao];
  return `${ROTULO_DA_OPCAO[i.conservacao]}${prazo ? ` · após aberto: ${formatarValidade(prazo)}` : ''}`;
}
function validadesDaFicha(i: LinhaDeInsumo): string {
  const lista = Object.entries(i.validades.minutos).map(([c, m]) => `${CONSERVACOES[c as keyof typeof CONSERVACOES]}: ${formatarValidade(m)}`);
  return lista.length ? lista.join(' · ') : CONSERVACOES[i.conservacao];
}

function Custo({ i }: { i: LinhaDeInsumo }) {
  // Pré-preparo (1.3): o custo é o da ficha que o produz, por unidade do rendimento.
  if (i.preparo) {
    return (
      <span className="whitespace-nowrap">
        <span className={`font-semibold ${i.preparo.incompleto ? 'text-atencao' : 'text-texto'}`}>{formatarFracao(i.preparo.porUnidade)}</span>
        <span className="ml-0.5 text-[12px] text-suave">/{UNIDADES[i.unidade].sigla}</span>
        {i.preparo.incompleto && <span className="block text-[12px] text-atencao">incompleto</span>}
      </span>
    );
  }
  if (i.custo === null) return <Selo tom="alerta">Custo não informado</Selo>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-texto">{valorDoCusto(i.custo)}</span>
      <span className="ml-0.5 text-[12px] text-suave">/{UNIDADES[i.unidade].sigla}</span>
      {/* 1.5: o custo é o da última compra; sem ela, o do preço cadastrado. */}
      <span className="block text-[12px] font-normal text-suave">{i.ultimaCompra ? `compra ${formatarData(i.ultimaCompra.entradaEm, true)}` : 'referência inicial'}</span>
    </span>
  );
}

/** I.1a: a categoria na lista; sem ela, o selo diz; em "Outros / a classificar", a palavra e o porquê no título. */
function CategoriaDaLinha({ i }: { i: LinhaDeInsumo }) {
  if (!i.categoria) return <Selo tom="alerta">Sem categoria</Selo>;
  if (i.categoria.chave === 'OUTROS') {
    return (
      <span className="block text-atencao" title={i.classificacaoMotivo ?? undefined}>
        {i.categoria.nome}
      </span>
    );
  }
  return <span className={`block ${i.categoria.ativa ? 'text-texto' : 'text-suave'}`}>{i.categoria.nome}{i.categoria.ativa ? '' : ' (desativada)'}</span>;
}

// Curtos: cabem em meia largura de 390 px sem cortar (o rótulo completo vai para o leitor de tela).
const ROTULO_DA_SITUACAO = { ativos: 'Ativos', desativados: 'Desativados', todos: 'Todos' } as const;

/** Barra de busca e filtros (GET: o estado vai para a URL). Mudar qualquer filtro volta à primeira página; o tamanho da página e a ordem ficam. */
export function FiltrosDaLista({
  base,
  filtros: f,
  categorias,
  marcas = [],
}: {
  base: string;
  filtros: FiltrosDeInsumo;
  categorias: readonly OpcaoDeCategoria[];
  /** L.1: as marcas de referência em uso no cadastro (para o filtro "Marca"). */
  marcas?: readonly { marca: string; n: number }[];
}) {
  const SELECT = `${CAMPO} pr-8`;
  // A marca do filtro pode não estar entre as 100 mais usadas (link antigo): ela continua escolhível, para o filtro não "sumir".
  const marcaForaDaLista = f.marca && f.marca !== FILTRO_SEM_MARCA && !marcas.some((m) => m.marca.toLowerCase() === f.marca!.toLowerCase());
  return (
    // `key` = os filtros de agora: depois de um link que muda o filtro sem recarregar ("Ver quais são" no aviso), os campos nascem de novo
    // com o valor da URL (um <select defaultValue> não acompanha a mudança sozinho).
    <form key={queryDosFiltros(f)} role="search" action={base} className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {f.ordem !== 'nome' && <input type="hidden" name="ordem" value={f.ordem} />}
      {f.direcao !== 'asc' && <input type="hidden" name="dir" value={f.direcao} />}
      {f.porPagina !== POR_PAGINA_PADRAO && <input type="hidden" name="por" value={f.porPagina} />}
      <div className="col-span-2 flex gap-2 lg:col-span-5">
        <label htmlFor="insumos-q" className="sr-only">
          Buscar insumo pelo nome ou pela marca
        </label>
        <input
          id="insumos-q"
          name="q"
          type="search"
          defaultValue={f.q}
          placeholder="Buscar pelo nome ou pela marca"
          className={`${CAMPO} min-w-0 flex-1`}
        />
        <button type="submit" className={classeDeBotao('secundario', 'shrink-0')}>
          Filtrar
        </button>
        {temFiltro(f) && (
          <Link href={hrefLimpo(base, f)} className={classeDeBotao('fantasma', 'shrink-0 px-3')}>
            Limpar
          </Link>
        )}
      </div>
      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="insumos-categoria" className="sr-only">
          Categoria
        </label>
        <select id="insumos-categoria" name="categoria" defaultValue={f.categoria ?? ''} className={SELECT}>
          <option value="">Todas as categorias</option>
          <option value="sem">Sem categoria</option>
          <option value="revisar">A revisar (sem categoria ou Outros)</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
              {c.ativa ? '' : ' (desativada)'}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="insumos-conservacao" className="sr-only">
          Conservação
        </label>
        <select id="insumos-conservacao" name="conservacao" defaultValue={f.conservacao ?? ''} className={SELECT}>
          <option value="">Todas as conservações</option>
          {(Object.keys(CONSERVACOES) as (keyof typeof CONSERVACOES)[]).map((k) => (
            <option key={k} value={k}>
              {ROTULO_DA_OPCAO[k]}
            </option>
          ))}
          <option value={FILTRO_A_CONFIRMAR}>Conservação a confirmar</option>
        </select>
      </div>
      <div>
        <label htmlFor="insumos-tipo" className="sr-only">
          Tipo
        </label>
        <select id="insumos-tipo" name="tipo" defaultValue={f.tipo ?? ''} className={SELECT}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="insumos-situacao" className="sr-only">
          Situação
        </label>
        <select id="insumos-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
          {(Object.keys(ROTULO_DA_SITUACAO) as (keyof typeof ROTULO_DA_SITUACAO)[]).map((k) => (
            <option key={k} value={k}>
              {ROTULO_DA_SITUACAO[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 lg:col-span-1">
        <label htmlFor="insumos-marca" className="sr-only">
          Marca de referência
        </label>
        <select id="insumos-marca" name="marca" defaultValue={f.marca ?? ''} className={SELECT}>
          <option value="">Todas as marcas</option>
          <option value={FILTRO_SEM_MARCA}>Sem marca informada</option>
          {marcaForaDaLista && <option value={f.marca!}>{f.marca}</option>}
          {marcas.map((m) => (
            <option key={m.marca} value={m.marca}>
              {m.marca} ({m.n})
            </option>
          ))}
        </select>
      </div>
      <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:min-h-[42px] lg:col-span-1">
        <input type="checkbox" name="preco" value="sem" defaultChecked={f.semPreco} className={MARCAR} />
        <span className="whitespace-nowrap">Só sem custo</span>
      </label>
      <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[7px] border border-linha-forte bg-campo px-3 text-sm text-texto sm:min-h-[42px] lg:col-span-1">
        <input type="checkbox" name="incompleto" value="1" defaultChecked={f.incompleto} className={MARCAR} aria-describedby="insumos-incompleto-ajuda" />
        <span className="whitespace-nowrap">Cadastro incompleto</span>
      </label>
      <p id="insumos-incompleto-ajuda" className="col-span-2 text-[12px] text-suave lg:col-span-3">
        Cadastro incompleto: sem categoria, em “Outros / a classificar”, com a conservação a confirmar ou, no pré-preparo, sem validade na ficha. Custo não informado é outra coisa: use “Só sem custo”.
      </p>
    </form>
  );
}

/** A lista sem nenhum filtro (busca, categoria, tipo...), mas na mesma ordem e com o mesmo tamanho de página. */
function hrefLimpo(base: string, f: FiltrosDeInsumo): string {
  return hrefCom(base, { ...f, q: '', tipo: null, categoria: null, conservacao: null, situacao: 'ativos', semPreco: false, marca: null, incompleto: false }, {});
}

/**
 * L.1: os filtros que estão valendo, cada um com o seu "tirar este" (volta à primeira página, os outros ficam), e o "Limpar filtros".
 * Quem usa leitor de tela ouve "Tirar o filtro Categoria: Proteína". Não aparece sem filtro.
 */
export function FiltrosAtivos({ base, filtros: f, categorias }: { base: string; filtros: FiltrosDeInsumo; categorias: readonly OpcaoDeCategoria[] }) {
  if (!temFiltro(f)) return null;
  const nomeDaCategoria =
    f.categoria === 'sem' ? 'Sem categoria' : f.categoria === 'revisar' ? 'A revisar' : (categorias.find((c) => c.id === f.categoria)?.nome ?? 'outra categoria');
  const itens: { chave: string; rotulo: string; sem: Partial<FiltrosDeInsumo> }[] = [];
  if (f.q) itens.push({ chave: 'q', rotulo: `Busca: “${f.q}”`, sem: { q: '' } });
  if (f.categoria) itens.push({ chave: 'categoria', rotulo: `Categoria: ${nomeDaCategoria}`, sem: { categoria: null } });
  if (f.tipo) itens.push({ chave: 'tipo', rotulo: `Tipo: ${TIPOS[f.tipo]}`, sem: { tipo: null } });
  if (f.conservacao) {
    const r = f.conservacao === FILTRO_A_CONFIRMAR ? 'a confirmar' : ROTULO_DA_OPCAO[f.conservacao];
    itens.push({ chave: 'conservacao', rotulo: `Conservação: ${r}`, sem: { conservacao: null } });
  }
  if (f.situacao !== 'ativos') itens.push({ chave: 'situacao', rotulo: `Situação: ${ROTULO_DA_SITUACAO[f.situacao]}`, sem: { situacao: 'ativos' } });
  if (f.marca) itens.push({ chave: 'marca', rotulo: f.marca === FILTRO_SEM_MARCA ? 'Sem marca informada' : `Marca: ${f.marca}`, sem: { marca: null } });
  if (f.semPreco) itens.push({ chave: 'preco', rotulo: 'Só sem custo', sem: { semPreco: false } });
  if (f.incompleto) itens.push({ chave: 'incompleto', rotulo: 'Cadastro incompleto', sem: { incompleto: false } });
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos" role="group">
      <span className="text-[13px] text-suave">Filtros ativos:</span>
      <ul className="flex flex-wrap gap-2">
        {itens.map((x) => (
          <li key={x.chave}>
            <Link
              href={hrefCom(base, f, x.sem)}
              className="ff-transicao inline-flex min-h-9 items-center gap-1.5 rounded-full border border-linha-forte px-3 text-[13px] text-texto hover:border-texto/35 hover:bg-texto/5 [@media(pointer:coarse)]:min-h-11"
            >
              <span>{x.rotulo}</span>
              <span aria-hidden>×</span>
              <span className="sr-only">. Tirar este filtro</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={hrefLimpo(base, f)} className={`${LINK_DE_TEXTO} inline-flex min-h-9 items-center [@media(pointer:coarse)]:min-h-11`}>
        Limpar filtros
      </Link>
    </div>
  );
}

/**
 * L.1: dois números com rótulos diferentes. "No cadastro" é do parceiro inteiro (ativos e desativados); "Nesta lista" é o que
 * a situação e os filtros deixaram. Nunca a quantidade da página (essa fica no rodapé: "Mostrando 1–25 de 137").
 */
export function ResumoDaLista({ total, totalDoCadastro, filtrado }: { total: number; totalDoCadastro: TotalDoCadastro; filtrado: boolean }) {
  const n = (x: number) => `${x} ${x === 1 ? 'insumo' : 'insumos'}`;
  const desativados = totalDoCadastro.todos - totalDoCadastro.ativos;
  return (
    <p className="text-[13px] tabular-nums text-suave">
      <span>
        No cadastro: <strong className="font-semibold text-texto">{n(totalDoCadastro.todos)}</strong> ({totalDoCadastro.ativos} {totalDoCadastro.ativos === 1 ? 'ativo' : 'ativos'}, {desativados}{' '}
        {desativados === 1 ? 'desativado' : 'desativados'})
      </span>
      <span aria-hidden> · </span>
      <span className="sr-only">. </span>
      <span>
        {filtrado ? 'Com os filtros' : 'Nesta lista'}: <strong className="font-semibold text-texto">{n(total)}</strong>
      </span>
    </p>
  );
}

function Ordenar({
  base,
  f,
  coluna,
  children,
  alinhar = 'left',
}: {
  base: string;
  f: FiltrosDeInsumo;
  coluna: 'nome' | 'custo';
  children: string;
  alinhar?: 'left' | 'right';
}) {
  const ativa = f.ordem === coluna;
  const proxima = ativa && f.direcao === 'asc' ? 'desc' : 'asc';
  return (
    <th
      scope="col"
      aria-sort={ativa ? (f.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`h-10 px-3 font-semibold first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5 ${alinhar === 'right' ? 'text-right' : ''}`}
    >
      <Link
        href={hrefCom(base, f, { ordem: coluna, direcao: proxima })}
        className={`ff-transicao inline-flex min-h-8 items-center gap-1 rounded-[5px] hover:text-texto ${ativa ? 'text-texto' : ''}`}
      >
        {children}
        <span aria-hidden className="text-[11px]">
          {ativa ? (f.direcao === 'asc' ? '▲' : '▼') : ''}
        </span>
        <span className="sr-only">
          {ativa ? `, em ordem ${f.direcao === 'asc' ? 'crescente' : 'decrescente'}. Clique para inverter` : ', clique para ordenar'}
        </span>
      </Link>
    </th>
  );
}

export function TelaListaInsumos({
  base,
  filtros: f,
  linhas,
  total,
  pagina,
  paginas,
  porPagina,
  totalDoCadastro,
  novoHref,
  comAcoes = false,
}: {
  /** /erp/insumos ou /rodolfo/erp/<slug>/insumos */
  base: string;
  filtros: FiltrosDeInsumo;
  linhas: LinhaDeInsumo[];
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  totalDoCadastro: TotalDoCadastro;
  /** Quem cadastra (e não está bloqueado) vê o atalho no vazio. */
  novoHref?: string;
  /** L.1: caneta e lixeira em cada linha — só para quem tem "cadastrar e editar insumos" e parceiro não bloqueado (o servidor confere de novo). */
  comAcoes?: boolean;
}) {
  // A página que o servidor devolveu manda nos links (página pedida além da última já veio ajustada).
  const filtrosDaPagina: FiltrosDeInsumo = { ...f, pagina, porPagina };
  const { de, ate } = faixaDaPagina(pagina, porPagina, linhas.length);
  const rodape = (
    <PaginacaoNumerada
      de={de}
      ate={ate}
      total={total}
      pagina={pagina}
      paginas={paginas}
      singular="insumo"
      plural="insumos"
      href={(p) => hrefCom(base, filtrosDaPagina, { pagina: p })}
      tamanhos={{ opcoes: OPCOES_POR_PAGINA, atual: porPagina, href: (n) => hrefCom(base, filtrosDaPagina, { porPagina: n }) }}
    />
  );
  const resumo = <ResumoDaLista total={total} totalDoCadastro={totalDoCadastro} filtrado={temFiltro(f)} />;

  if (total === 0) {
    return (
      <div className="space-y-3">
        {resumo}
        <Painel semRespiro>
          {temFiltro(f) ? (
            <Vazio
              titulo="Nada encontrado com esses filtros."
              acao={
                <Link href={hrefLimpo(base, f)} className={classeDeBotao('secundario')}>
                  Limpar filtros
                </Link>
              }
            >
              {totalDoCadastro.todos > 0
                ? `Há ${totalDoCadastro.todos} ${totalDoCadastro.todos === 1 ? 'insumo' : 'insumos'} no cadastro, mas nenhum combina com a busca e os filtros acima. Tire um filtro (no X de cada um) ou limpe todos.`
                : 'A busca e os filtros continuam acima, como você deixou.'}
            </Vazio>
          ) : totalDoCadastro.todos > 0 ? (
            <Vazio
              titulo="Nenhum insumo ativo."
              acao={
                <Link href={hrefCom(base, f, { situacao: 'todos' })} className={classeDeBotao('secundario')}>
                  Ver também os desativados
                </Link>
              }
            >
              Os {totalDoCadastro.todos} do cadastro estão desativados.
            </Vazio>
          ) : (
            <Vazio
              titulo="Nenhum insumo ainda."
              acao={
                novoHref ? (
                  <Link href={novoHref} className={classeDeBotao('primario')}>
                    Cadastrar o primeiro insumo
                  </Link>
                ) : undefined
              }
            >
              {novoHref
                ? 'Comece pelo que mais pesa no custo: carne, queijo, pão, embalagem do delivery.'
                : 'Quem cuida dos cadastros ainda não incluiu nenhum.'}
            </Vazio>
          )}
          {rodape}
        </Painel>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {resumo}
      <Painel semRespiro>
        {/* Celular: cartões que abrem o detalhe; as ações ficam numa linha própria (nada de link dentro de link). */}
        <ul className="divide-y divide-linha sm:hidden">
          {linhas.map((i) => (
            <li key={i.id}>
              <Link
                href={hrefDoDetalhe(base, i.id, filtrosDaPagina)}
                className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03]"
              >
                <span className="min-w-0">
                  <span className={`block truncate font-medium ${i.ativo ? 'text-texto' : 'text-suave'}`}>{i.nome}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {i.preparo ? 'Pré-preparo · custo da ficha' : `${TIPOS[i.tipo]} · ${formatarQuantidade(i.conteudoMilesimos, i.unidade)}`}
                    {!i.ativo && ' · Desativado'}
                  </span>
                  <span className={`block truncate text-[12px] ${i.categoria && i.categoria.chave !== 'OUTROS' ? 'text-suave' : 'text-atencao'}`}>{i.categoria?.nome ?? 'Sem categoria'}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {conservacaoDaLinha(i)}
                    {i.marcaReferencia && ` · Marca: ${i.marcaReferencia}`}
                  </span>
                  <MotivosDaLinha i={i} />
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <Custo i={i} />
                </span>
              </Link>
              {comAcoes && !i.preparo && (
                <div className="flex justify-end gap-2 px-4 pb-3">
                  {i.ativo && (
                    <Link href={hrefDeEditar(base, i.id, filtrosDaPagina)} className={classeDeBotao('secundario', 'px-3')} aria-label={`Editar ${i.nome}`}>
                      <Pencil size={16} aria-hidden />
                      Editar
                    </Link>
                  )}
                  <Link href={hrefDeRemover(base, i.id, filtrosDaPagina)} className={classeDeBotao('secundario', 'px-3')} aria-label={`Remover ${i.nome}`}>
                    <Trash2 size={16} aria-hidden />
                    Remover
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-sm sm:table">
          <caption className="sr-only">
            Insumos, {total} {total === 1 ? 'resultado' : 'resultados'} de {totalDoCadastro.todos} no cadastro. Custo inicial = o que se informou no cadastro, antes da primeira compra. Custo por unidade = o último preço de compra lançado ou, sem compra, o custo inicial mais frete, dividido pelo que vem na embalagem.
          </caption>
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <Ordenar base={base} f={filtrosDaPagina} coluna="nome">
                Insumo
              </Ordenar>
              <th scope="col" className="hidden h-10 px-3 font-semibold md:table-cell">
                Categoria
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Embalagem
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Custo inicial
              </th>
              <Ordenar base={base} f={filtrosDaPagina} coluna="custo" alinhar="right">
                Custo por unidade
              </Ordenar>
              <th scope="col" className="hidden h-10 px-3 text-right font-semibold md:table-cell">
                Outras embalagens
              </th>
              <th scope="col" className="hidden h-10 px-3 font-semibold lg:table-cell">
                Situação
              </th>
              {comAcoes && (
                <th scope="col" className="h-10 w-28 py-0 pl-3 pr-4 text-right font-semibold sm:pr-5">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {linhas.map((i) => (
              <tr key={i.id} id={`insumo-${i.id}`} className="ff-alvo ff-transicao border-t border-linha hover:bg-texto/[0.03]">
                <td className="h-11 py-2 pl-4 pr-3 sm:pl-5">
                  <Link href={hrefDoDetalhe(base, i.id, filtrosDaPagina)} className={`ff-transicao rounded-[5px] font-medium underline-offset-4 hover:underline ${i.ativo ? 'text-texto' : 'text-suave'}`}>
                    {i.nome}
                  </Link>
                  {i.preparo && (
                    <span className="ml-2 align-middle">
                      <Selo>Pré-preparo</Selo>
                    </span>
                  )}
                  <div className="text-[12px] text-suave">
                    {i.preparo ? 'Custo da ficha técnica' : TIPOS[i.tipo]}
                    {' · '}
                    {conservacaoDaLinha(i)}
                    {i.marcaReferencia && ` · Marca: ${i.marcaReferencia}`}
                    <span className="lg:hidden">{!i.ativo && ' · Desativado'}</span>
                  </div>
                  <MotivosDaLinha i={i} />
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <CategoriaDaLinha i={i} />
                </td>
                <td className="px-3 py-2 text-right text-suave">{i.preparo ? '—' : formatarQuantidade(i.conteudoMilesimos, i.unidade)}</td>
                <td className="px-3 py-2 text-right">
                  <div className={i.preparo ? 'text-suave' : 'text-texto'}>{i.precoEmbalagemCentavos > 0 ? formatarDinheiro(i.precoEmbalagemCentavos) : i.preparo ? 'da ficha' : '—'}</div>
                  {i.taxaEntregaCentavos > 0 && (
                    <div className="text-[12px] text-suave">+ {formatarDinheiro(i.taxaEntregaCentavos)} frete</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Custo i={i} />
                </td>
                <td className="hidden px-3 py-2 text-right text-suave md:table-cell">{i.variantes > 0 ? i.variantes : '—'}</td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  {i.ativo ? <Selo tom="ok">Ativo</Selo> : <Selo>Desativado</Selo>}
                </td>
                {comAcoes && (
                  <td className="py-1 pl-3 pr-4 text-right sm:pr-5">
                    <AcoesDaLinha i={i} base={base} f={filtrosDaPagina} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {rodape}
      </Painel>
    </div>
  );
}
