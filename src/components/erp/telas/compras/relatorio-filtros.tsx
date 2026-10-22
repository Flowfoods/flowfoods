/**
 * Relatórios de compras (L.2) — os filtros: período com atalhos, data usada, lojas do acesso, fornecedor, insumo, categoria e como
 * agrupar. É um formulário GET (o estado todo mora na URL e funciona sem JavaScript); a planilha e a impressão leem a MESMA URL.
 * Rótulo sempre à vista (nada de placeholder no lugar de rótulo): quem não programa precisa saber o que cada caixa pergunta.
 */

import Link from 'next/link';
import type { Opcoes } from '@/lib/erp/compras-relatorio';
import {
  atalhosDePeriodo,
  BASES_DE_DATA,
  LISTA_DE_AGRUPAMENTOS,
  LISTA_DE_BASES,
  queryDoRelatorio,
  ROTULO_DO_AGRUPAMENTO,
  type FiltrosDoRelatorio,
} from '@/lib/erp/compras-relatorio-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { CAMPO, MARCAR, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltrosRecolhiveis } from '../insumos/filtros-recolhiveis';

type Modo = 'insumo' | 'periodo';

const SELECT = `${CAMPO} pr-8`;

export const hrefDoRelatorio = (caminho: string, f: FiltrosDoRelatorio, mudar: Partial<FiltrosDoRelatorio> = {}, opcoes: { semPagina?: boolean } = {}) => {
  const q = queryDoRelatorio(f, mudar, opcoes);
  return q ? `${caminho}?${q}` : caminho;
};

/** Fecha o que foi aberto numa linha (grupo, unidade, sem base) e volta à primeira página: o que se faz ao mudar de recorte. */
export const RECORTE_NOVO: Partial<FiltrosDoRelatorio> = { grupo: '', unidade: '', so: '', pagina: 1 };

/** Quantos filtros (fora o período e a data usada, que ficam à vista) estão valendo: o número do botão do celular. */
export function filtrosAtivosDoRelatorio(f: FiltrosDoRelatorio, modo: Modo): number {
  return [f.lojaIds.length > 0, !!f.fornecedorId, modo === 'periodo' && !!f.insumoId, modo === 'periodo' && !!f.q, !!f.categoriaId, f.situacao === 'canceladas'].filter(Boolean).length;
}

function SeletorDeLojas({ lojas, marcadas }: { lojas: Opcoes['lojas']; marcadas: string[] }) {
  if (lojas.length <= 1) {
    return (
      <div className="col-span-2">
        <span className={ROTULO}>Loja</span>
        <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">{lojas[0]?.nome ?? 'Nenhuma loja no seu acesso'}</p>
      </div>
    );
  }
  const resumo = marcadas.length === 0 ? `Todas as minhas lojas (${lojas.length})` : marcadas.length === 1 ? (lojas.find((l) => l.id === marcadas[0])?.nome ?? '1 loja') : `${marcadas.length} lojas`;
  return (
    <div className="col-span-2 lg:col-span-1">
      <span id="rel-lojas-rotulo" className={ROTULO}>
        Lojas
      </span>
      <details className="group relative">
        <summary
          aria-labelledby="rel-lojas-rotulo rel-lojas-resumo"
          className={`${CAMPO} flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden`}
        >
          <span id="rel-lojas-resumo" className="min-w-0 truncate">
            {resumo}
          </span>
          <span aria-hidden className="text-suave group-open:rotate-180">
            ▾
          </span>
        </summary>
        <fieldset className="mt-1 rounded-[7px] border border-linha-forte bg-campo p-1 lg:absolute lg:z-20 lg:w-full lg:shadow-[var(--ff-sombra)]">
          <legend className="sr-only">Escolha as lojas. Sem marcar nenhuma, vale todas as lojas do seu acesso.</legend>
          <p className="px-2 pb-1 pt-1 text-[12px] text-suave">Sem marcar nenhuma, vale todas as suas lojas.</p>
          <ul className="max-h-64 overflow-y-auto">
            {lojas.map((l) => (
              <li key={l.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[5px] px-2 text-sm hover:bg-texto/5">
                  <input type="checkbox" name="loja" value={l.id} defaultChecked={marcadas.includes(l.id)} className={MARCAR} />
                  <span className="min-w-0 truncate">
                    {l.nome}
                    {!l.ativa ? <span className="text-suave"> (desativada)</span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </details>
    </div>
  );
}

/** Os atalhos de período: hoje, ontem, 7 dias, este mês e o mês passado. Cada um é um link que mantém os outros filtros. */
export function AtalhosDePeriodo({ caminho, f, hoje }: { caminho: string; f: FiltrosDoRelatorio; hoje: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" role="group" aria-label="Atalhos de período">
      <span className="text-[13px] text-suave">Período:</span>
      <ul className="flex flex-wrap gap-2">
        {atalhosDePeriodo(hoje).map((a) => {
          const atual = f.de === a.de && f.ate === a.ate;
          return (
            <li key={a.chave}>
              <Link
                href={hrefDoRelatorio(caminho, f, { de: a.de, ate: a.ate, ...RECORTE_NOVO })}
                aria-current={atual ? 'true' : undefined}
                className="ff-transicao inline-flex min-h-9 items-center rounded-full border border-linha-forte px-3 text-[13px] text-texto hover:border-texto/35 hover:bg-texto/5 aria-[current=true]:border-texto aria-[current=true]:bg-forte aria-[current=true]:font-semibold [@media(pointer:coarse)]:min-h-11"
              >
                {a.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FormularioDoRelatorio({
  modo,
  caminho,
  f,
  opcoes,
  hoje,
}: {
  modo: Modo;
  caminho: string;
  f: FiltrosDoRelatorio;
  opcoes: Opcoes;
  hoje: string;
}) {
  const ativos = filtrosDoFormulario(f, modo);
  const semInsumo = modo === 'insumo' && !f.insumoId;
  return (
    <form key={queryDoRelatorio(f)} role="search" action={caminho} className="space-y-3">
      {f.porPagina !== 50 && <input type="hidden" name="por" value={f.porPagina} />}
      {modo === 'periodo' && f.ver === 'linhas' && <input type="hidden" name="ver" value="linhas" />}
      <FiltrosRecolhiveis ativos={ativos} id="relatorio-filtros" grade="grid-cols-2 lg:grid-cols-4" abertoNoInicio={semInsumo}>
        {modo === 'insumo' && (
          <>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-q" className={ROTULO}>
                Procurar o insumo
              </label>
              <input id="rel-q" name="q" type="search" defaultValue={f.q} placeholder="Nome ou marca" autoComplete="off" className={CAMPO} />
              <p className="mt-1 text-[12px] text-suave">Acha mesmo sem acento (açaí, acai).</p>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-insumo" className={ROTULO}>
                Insumo
              </label>
              <select id="rel-insumo" name="insumo" defaultValue={f.insumoId} className={SELECT}>
                <option value="">{opcoes.listaDeInsumos.length ? 'Escolha o insumo' : 'Nenhum insumo com compra'}</option>
                {opcoes.listaDeInsumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
              {opcoes.insumosTruncados && <p className="mt-1 text-[12px] text-suave">São muitos insumos; procure pelo nome para encurtar a lista.</p>}
            </div>
          </>
        )}
        <div>
          <label htmlFor="rel-de" className={ROTULO}>
            De
          </label>
          <CampoData id="rel-de" name="de" defaultValue={formatarData(f.de)} aria-label="Data inicial (dd/mm/aaaa)" className="" />
        </div>
        <div>
          <label htmlFor="rel-ate" className={ROTULO}>
            Até
          </label>
          <CampoData id="rel-ate" name="ate" defaultValue={formatarData(f.ate)} aria-label="Data final (dd/mm/aaaa)" className="" />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="rel-base" className={ROTULO}>
            Data usada
          </label>
          <select id="rel-base" name="base" defaultValue={f.base} className={SELECT}>
            {LISTA_DE_BASES.map((b) => (
              <option key={b} value={b}>
                {BASES_DE_DATA[b].rotulo}
              </option>
            ))}
          </select>
        </div>
        <SeletorDeLojas lojas={opcoes.lojas} marcadas={f.lojaIds} />
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="rel-fornecedor" className={ROTULO}>
            Fornecedor
          </label>
          <select id="rel-fornecedor" name="fornecedor" defaultValue={f.fornecedorId} className={SELECT}>
            <option value="">Todos os fornecedores</option>
            {opcoes.fornecedores.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </div>
        {modo === 'periodo' && (
          <>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-q" className={ROTULO}>
                Nome do insumo
              </label>
              <input id="rel-q" name="q" type="search" defaultValue={f.q} placeholder="Ex.: queijo, açaí" autoComplete="off" className={CAMPO} />
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-insumo" className={ROTULO}>
                Um insumo só
              </label>
              <select id="rel-insumo" name="insumo" defaultValue={f.insumoId} className={SELECT}>
                <option value="">Todos os insumos</option>
                {opcoes.listaDeInsumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-categoria" className={ROTULO}>
                Categoria do insumo
              </label>
              <select id="rel-categoria" name="categoria" defaultValue={f.categoriaId} className={SELECT}>
                <option value="">Todas as categorias</option>
                {opcoes.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-agrupar" className={ROTULO}>
                Agrupar por
              </label>
              <select id="rel-agrupar" name="agrupar" defaultValue={f.agrupar} className={SELECT}>
                {LISTA_DE_AGRUPAMENTOS.map((a) => (
                  <option key={a} value={a}>
                    {ROTULO_DO_AGRUPAMENTO[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label htmlFor="rel-situacao" className={ROTULO}>
                Notas
              </label>
              <select id="rel-situacao" name="situacao" defaultValue={f.situacao} className={SELECT}>
                <option value="lancadas">Lançadas (as compras)</option>
                <option value="canceladas">Canceladas (só para conferir)</option>
              </select>
            </div>
          </>
        )}
      </FiltrosRecolhiveis>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={classeDeBotao('primario', 'w-full sm:w-auto')}>
          {modo === 'insumo' ? 'Ver o histórico' : 'Ver as compras'}
        </button>
        <Link href={caminho} className={classeDeBotao('fantasma', 'px-3')}>
          Limpar
        </Link>
      </div>
      <AtalhosDePeriodo caminho={caminho} f={f} hoje={hoje} />
    </form>
  );
}

function filtrosDoFormulario(f: FiltrosDoRelatorio, modo: Modo): number {
  return filtrosAtivosDoRelatorio(f, modo) + (modo === 'insumo' && (f.insumoId || f.q) ? 1 : 0);
}

/** Os filtros que estão valendo, cada um com o seu "tirar este" (os outros ficam), e como se abriu uma linha. */
export function ChipsDoRelatorio({
  caminho,
  f,
  opcoes,
  modo,
  rotuloDoGrupo,
}: {
  caminho: string;
  f: FiltrosDoRelatorio;
  opcoes: Opcoes;
  modo: Modo;
  /** O nome do grupo aberto na tela (o fornecedor, o insumo ou o dia). */
  rotuloDoGrupo?: string;
}) {
  const itens: { chave: string; rotulo: string; sem: Partial<FiltrosDoRelatorio> }[] = [];
  if (f.lojaIds.length) {
    const nomes = f.lojaIds.map((id) => opcoes.lojas.find((l) => l.id === id)?.nome).filter(Boolean);
    itens.push({ chave: 'loja', rotulo: `Lojas: ${nomes.length ? nomes.join(', ') : 'fora do seu acesso'}`, sem: { lojaIds: [] } });
  }
  if (f.fornecedorId) itens.push({ chave: 'fornecedor', rotulo: `Fornecedor: ${opcoes.fornecedores.find((x) => x.id === f.fornecedorId)?.nome ?? 'outro'}`, sem: { fornecedorId: '' } });
  if (modo === 'periodo' && f.insumoId) itens.push({ chave: 'insumo', rotulo: `Insumo: ${opcoes.listaDeInsumos.find((x) => x.id === f.insumoId)?.nome ?? 'outro'}`, sem: { insumoId: '' } });
  if (f.q && !(modo === 'insumo' && f.insumoId)) itens.push({ chave: 'q', rotulo: `Nome: “${f.q}”`, sem: { q: '' } });
  if (f.categoriaId) itens.push({ chave: 'categoria', rotulo: `Categoria: ${opcoes.categorias.find((x) => x.id === f.categoriaId)?.nome ?? 'outra'}`, sem: { categoriaId: '' } });
  if (f.situacao === 'canceladas') itens.push({ chave: 'situacao', rotulo: 'Só notas canceladas', sem: { situacao: 'lancadas' } });
  if (f.grupo) itens.push({ chave: 'grupo', rotulo: `Aberto: ${rotuloDoGrupo ?? ROTULO_DO_AGRUPAMENTO[f.agrupar]}`, sem: { grupo: '' } });
  if (f.unidade) itens.push({ chave: 'unidade', rotulo: `Só a unidade: ${f.unidade === 'sem' ? 'sem unidade gravada' : f.unidade === 'KG' ? 'kg' : f.unidade === 'L' ? 'L' : 'un'}`, sem: { unidade: '' } });
  if (f.so) itens.push({ chave: 'so', rotulo: 'Só as linhas sem base', sem: { so: '' } });
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros valendo">
      <span className="text-[13px] text-suave">Valendo:</span>
      <ul className="flex flex-wrap gap-2">
        {itens.map((x) => (
          <li key={x.chave}>
            <Link
              href={hrefDoRelatorio(caminho, f, { ...x.sem, pagina: 1 })}
              className="ff-transicao inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-linha-forte px-3 text-[13px] text-texto hover:border-texto/35 hover:bg-texto/5 [@media(pointer:coarse)]:min-h-11"
            >
              <span className="min-w-0 truncate">{x.rotulo}</span>
              <span aria-hidden>×</span>
              <span className="sr-only">. Tirar este filtro</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={hrefDoRelatorio(caminho, { ...f, lojaIds: [], fornecedorId: '', insumoId: '', q: '', categoriaId: '', situacao: 'lancadas', grupo: '', unidade: '', so: '' })} className={`${LINK_DE_TEXTO} inline-flex min-h-9 items-center [@media(pointer:coarse)]:min-h-11`}>
        Limpar filtros
      </Link>
    </div>
  );
}
