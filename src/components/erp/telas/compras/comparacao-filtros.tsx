/**
 * Comparação de fornecedores e de períodos (L.3) — os filtros. Formulário GET (o estado todo mora na URL e funciona sem JavaScript;
 * a planilha e a impressão leem a MESMA URL). Rótulo sempre à vista. Os mesmos critérios (lojas, data usada, fornecedor, insumo,
 * categoria) valem para os dois períodos: o formulário só tem UM de cada, e os dois lados nascem deles.
 */

import Link from 'next/link';
import type { Opcoes } from '@/lib/erp/compras-relatorio';
import { atalhosDeComparacao, LISTA_DE_MEDIDAS, MEDIDAS, queryDosPeriodos, type FiltrosDePeriodos, type MudancaDosPeriodos } from '@/lib/erp/compras-comparacao-campos';
import { LISTA_DE_BASES, OPCAO_DA_BASE, queryDoRelatorio, type FiltrosDoRelatorio } from '@/lib/erp/compras-relatorio-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { CAMPO, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltrosRecolhiveis } from '../insumos/filtros-recolhiveis';
import { AtalhosDePeriodo, SELECT, SeletorDeLojas } from './relatorio-filtros';

export const hrefDosPeriodos = (caminho: string, f: FiltrosDePeriodos, mudar: MudancaDosPeriodos = {}, opcoes: { semPagina?: boolean } = {}) => {
  const q = queryDosPeriodos(f, mudar, opcoes);
  return q ? `${caminho}?${q}` : caminho;
};

// ------------------------------------------------------------- períodos

export function FormularioDosPeriodos({ caminho, f, opcoes, hoje }: { caminho: string; f: FiltrosDePeriodos; opcoes: Opcoes; hoje: string }) {
  const r = f.rel;
  const ativos = [r.lojaIds.length > 0, !!r.fornecedorId, !!r.insumoId, !!r.q, !!r.categoriaId].filter(Boolean).length;
  const atalhos = atalhosDeComparacao(hoje);
  return (
    <form key={queryDosPeriodos(f)} role="search" action={caminho} className="space-y-3">
      {f.porPagina !== 50 && <input type="hidden" name="por" value={f.porPagina} />}
      {r.volta && <input type="hidden" name="volta" value={r.volta} />}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <fieldset className="col-span-2 grid grid-cols-2 gap-2">
          <legend className={ROTULO}>Período A (a base da comparação)</legend>
          <div>
            <label htmlFor="cmp-de" className="sr-only">
              Período A, de
            </label>
            <CampoData id="cmp-de" name="de" defaultValue={formatarData(r.de)} aria-label="Período A, data inicial (dd/mm/aaaa)" className="" />
          </div>
          <div>
            <label htmlFor="cmp-ate" className="sr-only">
              Período A, até
            </label>
            <CampoData id="cmp-ate" name="ate" defaultValue={formatarData(r.ate)} aria-label="Período A, data final (dd/mm/aaaa)" className="" />
          </div>
        </fieldset>
        <fieldset className="col-span-2 grid grid-cols-2 gap-2">
          <legend className={ROTULO}>Período B (o que você compara com A)</legend>
          <div>
            <label htmlFor="cmp-de2" className="sr-only">
              Período B, de
            </label>
            <CampoData id="cmp-de2" name="de2" defaultValue={formatarData(f.deB)} aria-label="Período B, data inicial (dd/mm/aaaa)" className="" />
          </div>
          <div>
            <label htmlFor="cmp-ate2" className="sr-only">
              Período B, até
            </label>
            <CampoData id="cmp-ate2" name="ate2" defaultValue={formatarData(f.ateB)} aria-label="Período B, data final (dd/mm/aaaa)" className="" />
          </div>
        </fieldset>
      </div>
      <FiltrosRecolhiveis ativos={ativos} id="comparacao-filtros" grade="grid-cols-2 lg:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmp-medida" className={ROTULO}>
            Medir o gasto por
          </label>
          <select id="cmp-medida" name="medida" defaultValue={f.medida} className={SELECT}>
            {LISTA_DE_MEDIDAS.map((m) => (
              <option key={m} value={m}>
                {MEDIDAS[m].rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmp-base" className={ROTULO}>
            Data usada
          </label>
          <select id="cmp-base" name="base" defaultValue={r.base} className={SELECT}>
            {LISTA_DE_BASES.map((b) => (
              <option key={b} value={b}>
                {OPCAO_DA_BASE[b]}
              </option>
            ))}
          </select>
        </div>
        <SeletorDeLojas lojas={opcoes.lojas} marcadas={r.lojaIds} />
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmp-fornecedor" className={ROTULO}>
            Fornecedor
          </label>
          <select id="cmp-fornecedor" name="fornecedor" defaultValue={r.fornecedorId} className={SELECT}>
            <option value="">Todos os fornecedores</option>
            {opcoes.fornecedores.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmp-q" className={ROTULO}>
            Nome do insumo
          </label>
          <input id="cmp-q" name="q" type="search" defaultValue={r.q} placeholder="Ex.: queijo, açaí" autoComplete="off" className={CAMPO} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmp-insumo" className={ROTULO}>
            Um insumo só
          </label>
          <select id="cmp-insumo" name="insumo" defaultValue={r.insumoId} className={SELECT}>
            <option value="">Todos os insumos</option>
            {opcoes.listaDeInsumos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmp-categoria" className={ROTULO}>
            Categoria do insumo
          </label>
          <select id="cmp-categoria" name="categoria" defaultValue={r.categoriaId} className={SELECT}>
            <option value="">Todas as categorias</option>
            {opcoes.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </FiltrosRecolhiveis>
      <p className="text-[12px] text-suave">{MEDIDAS[f.medida].explica} As lojas, o fornecedor, o insumo, a categoria e a data usada valem para os dois períodos.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={classeDeBotao('primario', 'w-full sm:w-auto')}>
          Comparar os períodos
        </button>
        <Link href={caminho} className={classeDeBotao('fantasma', 'px-3')}>
          Limpar
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" role="group" aria-label="Atalhos de comparação">
        <span className="text-[13px] text-suave">Comparar:</span>
        <ul className="flex flex-wrap gap-2">
          {atalhos.map((a) => {
            const atual = r.de === a.de && r.ate === a.ate && f.deB === a.deB && f.ateB === a.ateB;
            return (
              <li key={a.chave}>
                <Link
                  href={hrefDosPeriodos(caminho, f, { rel: { de: a.de, ate: a.ate, insumoId: r.insumoId }, deB: a.deB, ateB: a.ateB, pagina: 1 })}
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
    </form>
  );
}

/** Os filtros que estão valendo na comparação de períodos, cada um com o seu "tirar este". */
export function ChipsDosPeriodos({ caminho, f, opcoes, insumoNome }: { caminho: string; f: FiltrosDePeriodos; opcoes: Opcoes; insumoNome?: string }) {
  const r = f.rel;
  const itens: { chave: string; rotulo: string; sem: MudancaDosPeriodos }[] = [];
  if (r.lojaIds.length) {
    const nomes = r.lojaIds.map((id) => opcoes.lojas.find((l) => l.id === id)?.nome).filter(Boolean);
    itens.push({ chave: 'loja', rotulo: `Lojas: ${nomes.length ? nomes.join(', ') : 'fora do seu acesso'}`, sem: { rel: { lojaIds: [] } } });
  }
  if (r.fornecedorId) itens.push({ chave: 'fornecedor', rotulo: `Fornecedor: ${opcoes.fornecedores.find((x) => x.id === r.fornecedorId)?.nome ?? 'outro'}`, sem: { rel: { fornecedorId: '' } } });
  if (r.insumoId) itens.push({ chave: 'insumo', rotulo: `Insumo: ${insumoNome ?? opcoes.listaDeInsumos.find((x) => x.id === r.insumoId)?.nome ?? 'outro'}`, sem: { rel: { insumoId: '' } } });
  if (r.q && !r.insumoId) itens.push({ chave: 'q', rotulo: `Nome: “${r.q}”`, sem: { rel: { q: '' } } });
  if (r.categoriaId) itens.push({ chave: 'categoria', rotulo: `Categoria: ${opcoes.categorias.find((x) => x.id === r.categoriaId)?.nome ?? 'outra'}`, sem: { rel: { categoriaId: '' } } });
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros valendo">
      <span className="text-[13px] text-suave">Valendo nos dois períodos:</span>
      <ul className="flex flex-wrap gap-2">
        {itens.map((x) => (
          <li key={x.chave}>
            <Link
              href={hrefDosPeriodos(caminho, f, { ...x.sem, pagina: 1 })}
              className="ff-transicao inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-linha-forte px-3 text-[13px] text-texto hover:border-texto/35 hover:bg-texto/5 [@media(pointer:coarse)]:min-h-11"
            >
              <span className="min-w-0 truncate">{x.rotulo}</span>
              <span aria-hidden>×</span>
              <span className="sr-only">. Tirar este filtro</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={hrefDosPeriodos(caminho, f, { rel: { lojaIds: [], fornecedorId: '', insumoId: '', q: '', categoriaId: '' }, pagina: 1 })} className={`${LINK_DE_TEXTO} inline-flex min-h-9 items-center [@media(pointer:coarse)]:min-h-11`}>
        Limpar filtros
      </Link>
    </div>
  );
}

// ------------------------------------------------------------ fornecedores

const hrefDosFornecedores = (caminho: string, f: FiltrosDoRelatorio, mudar: Partial<FiltrosDoRelatorio> = {}) => {
  const q = queryDoRelatorio(f, mudar, { semPagina: true });
  return q ? `${caminho}?${q}` : caminho;
};

export function FormularioDosFornecedores({ caminho, f, opcoes, hoje, aberto }: { caminho: string; f: FiltrosDoRelatorio; opcoes: Opcoes; hoje: string; aberto: boolean }) {
  const ativos = [f.lojaIds.length > 0, !!f.insumoId || !!f.q].filter(Boolean).length;
  return (
    <form key={queryDoRelatorio(f)} role="search" action={caminho} className="space-y-3">
      <FiltrosRecolhiveis ativos={ativos} id="comparacao-fornecedores-filtros" grade="grid-cols-2 lg:grid-cols-4" abertoNoInicio={aberto}>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmpf-q" className={ROTULO}>
            Procurar o insumo
          </label>
          <input id="cmpf-q" name="q" type="search" defaultValue={f.q} placeholder="Nome ou marca" autoComplete="off" className={CAMPO} />
          <p className="mt-1 text-[12px] text-suave">Acha mesmo sem acento (açaí, acai).</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmpf-insumo" className={ROTULO}>
            Insumo
          </label>
          <select id="cmpf-insumo" name="insumo" defaultValue={f.insumoId} className={SELECT}>
            <option value="">{opcoes.listaDeInsumos.length ? 'Escolha o insumo' : 'Nenhum insumo com compra'}</option>
            {opcoes.listaDeInsumos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
          {opcoes.insumosTruncados && <p className="mt-1 text-[12px] text-suave">São muitos insumos; procure pelo nome para encurtar a lista.</p>}
        </div>
        <div>
          <label htmlFor="cmpf-de" className={ROTULO}>
            De
          </label>
          <CampoData id="cmpf-de" name="de" defaultValue={formatarData(f.de)} aria-label="Data inicial (dd/mm/aaaa)" className="" />
        </div>
        <div>
          <label htmlFor="cmpf-ate" className={ROTULO}>
            Até
          </label>
          <CampoData id="cmpf-ate" name="ate" defaultValue={formatarData(f.ate)} aria-label="Data final (dd/mm/aaaa)" className="" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cmpf-base" className={ROTULO}>
            Data usada
          </label>
          <select id="cmpf-base" name="base" defaultValue={f.base} className={SELECT}>
            {LISTA_DE_BASES.map((b) => (
              <option key={b} value={b}>
                {OPCAO_DA_BASE[b]}
              </option>
            ))}
          </select>
        </div>
        <SeletorDeLojas lojas={opcoes.lojas} marcadas={f.lojaIds} />
      </FiltrosRecolhiveis>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={classeDeBotao('primario', 'w-full sm:w-auto')}>
          Comparar os fornecedores
        </button>
        <Link href={caminho} className={classeDeBotao('fantasma', 'px-3')}>
          Limpar
        </Link>
      </div>
      <AtalhosDePeriodo caminho={caminho} f={f} hoje={hoje} />
    </form>
  );
}

/** Os filtros valendo na comparação de fornecedores (insumo e lojas), cada um com o seu "tirar este". */
export function ChipsDosFornecedores({ caminho, f, opcoes, insumoNome }: { caminho: string; f: FiltrosDoRelatorio; opcoes: Opcoes; insumoNome?: string }) {
  const itens: { chave: string; rotulo: string; sem: Partial<FiltrosDoRelatorio> }[] = [];
  if (f.lojaIds.length) {
    const nomes = f.lojaIds.map((id) => opcoes.lojas.find((l) => l.id === id)?.nome).filter(Boolean);
    itens.push({ chave: 'loja', rotulo: `Lojas: ${nomes.length ? nomes.join(', ') : 'fora do seu acesso'}`, sem: { lojaIds: [] } });
  }
  if (f.insumoId) itens.push({ chave: 'insumo', rotulo: `Insumo: ${insumoNome ?? opcoes.listaDeInsumos.find((x) => x.id === f.insumoId)?.nome ?? 'outro'}`, sem: { insumoId: '', q: '' } });
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros valendo">
      <span className="text-[13px] text-suave">Valendo:</span>
      <ul className="flex flex-wrap gap-2">
        {itens.map((x) => (
          <li key={x.chave}>
            <Link
              href={hrefDosFornecedores(caminho, f, x.sem)}
              className="ff-transicao inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-linha-forte px-3 text-[13px] text-texto hover:border-texto/35 hover:bg-texto/5 [@media(pointer:coarse)]:min-h-11"
            >
              <span className="min-w-0 truncate">{x.rotulo}</span>
              <span aria-hidden>×</span>
              <span className="sr-only">. Tirar este filtro</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
