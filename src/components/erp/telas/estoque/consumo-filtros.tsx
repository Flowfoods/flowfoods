/**
 * Consumo e conciliação de estoque (L.4) — os filtros: período com atalhos, lojas do acesso, insumo (por nome ou um só), categoria e o
 * que mostrar. É um formulário GET (o estado todo mora na URL e funciona sem JavaScript); a planilha e a impressão leem a MESMA URL.
 * Rótulo sempre à vista: quem não programa precisa saber o que cada caixa pergunta.
 */

import Link from 'next/link';
import type { OpcoesDoConsumo } from '@/lib/erp/consumo-estoque';
import { atalhosDePeriodo, queryDoConsumo, type FiltrosDoConsumo } from '@/lib/erp/consumo-estoque-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { CAMPO, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltrosRecolhiveis } from '../insumos/filtros-recolhiveis';
import { SELECT, SeletorDeLojas } from '../compras/relatorio-filtros';

export const hrefDoConsumo = (caminho: string, f: FiltrosDoConsumo, mudar: Partial<FiltrosDoConsumo> = {}, opcoes: { semPagina?: boolean } = {}) => {
  const q = queryDoConsumo(f, mudar, opcoes);
  return q ? `${caminho}?${q}` : caminho;
};

/** Fecha o que foi aberto e volta à primeira página: o que se faz ao mudar de recorte. */
export const RECORTE_NOVO_DO_CONSUMO: Partial<FiltrosDoConsumo> = { col: '', pagina: 1 };

const ATIVOS = (f: FiltrosDoConsumo) => [f.lojaIds.length > 0, !!f.insumoId || !!f.q, !!f.categoriaId, f.so !== ''].filter(Boolean).length;

export function AtalhosDoConsumo({ caminho, f, hoje }: { caminho: string; f: FiltrosDoConsumo; hoje: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" role="group" aria-label="Atalhos de período">
      <span className="text-[13px] text-suave">Período:</span>
      <ul className="flex flex-wrap gap-2">
        {atalhosDePeriodo(hoje).map((a) => {
          const atual = f.de === a.de && f.ate === a.ate;
          return (
            <li key={a.chave}>
              <Link
                href={hrefDoConsumo(caminho, f, { de: a.de, ate: a.ate, ...RECORTE_NOVO_DO_CONSUMO })}
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

export function FormularioDoConsumo({ caminho, f, opcoes, hoje }: { caminho: string; f: FiltrosDoConsumo; opcoes: OpcoesDoConsumo; hoje: string }) {
  return (
    <form key={queryDoConsumo(f)} role="search" action={caminho} className="space-y-3">
      {f.porPagina !== 50 && <input type="hidden" name="por" value={f.porPagina} />}
      {f.volta && <input type="hidden" name="volta" value={f.volta} />}
      <div className="grid grid-cols-2 gap-2 lg:max-w-xl">
        <div>
          <label htmlFor="cons-de" className={ROTULO}>
            De
          </label>
          <CampoData id="cons-de" name="de" defaultValue={formatarData(f.de)} aria-label="Data inicial (dd/mm/aaaa)" className="" />
        </div>
        <div>
          <label htmlFor="cons-ate" className={ROTULO}>
            Até
          </label>
          <CampoData id="cons-ate" name="ate" defaultValue={formatarData(f.ate)} aria-label="Data final (dd/mm/aaaa)" className="" />
        </div>
      </div>
      <FiltrosRecolhiveis ativos={ATIVOS(f)} id="consumo-filtros" grade="grid-cols-2 lg:grid-cols-4">
        <SeletorDeLojas lojas={opcoes.lojas} marcadas={f.lojaIds} />
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cons-q" className={ROTULO}>
            Nome do insumo
          </label>
          <input id="cons-q" name="q" type="search" defaultValue={f.q} placeholder="Ex.: cebola, açaí" autoComplete="off" className={CAMPO} />
          <p className="mt-1 text-[12px] text-suave">Acha mesmo sem acento (açaí, acai).</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cons-insumo" className={ROTULO}>
            Um insumo só
          </label>
          <select id="cons-insumo" name="insumo" defaultValue={f.insumoId} className={SELECT}>
            <option value="">Todos os insumos</option>
            {opcoes.listaDeInsumos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
          {opcoes.insumosTruncados && <p className="mt-1 text-[12px] text-suave">São muitos insumos; procure pelo nome para encurtar a lista.</p>}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cons-categoria" className={ROTULO}>
            Categoria do insumo
          </label>
          <select id="cons-categoria" name="categoria" defaultValue={f.categoriaId} className={SELECT}>
            <option value="">Todas as categorias</option>
            {opcoes.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cons-so" className={ROTULO}>
            Mostrar
          </label>
          <select id="cons-so" name="so" defaultValue={f.so} className={SELECT}>
            <option value="">Todos os insumos com movimento ou saldo</option>
            <option value="atencao">Só o que pede atenção</option>
            <option value="semcontagem">Só o que ficou sem contagem no período</option>
          </select>
        </div>
      </FiltrosRecolhiveis>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={classeDeBotao('primario', 'w-full sm:w-auto')}>
          Ver o consumo
        </button>
        <Link href={caminho} className={classeDeBotao('fantasma', 'px-3')}>
          Limpar
        </Link>
      </div>
      <AtalhosDoConsumo caminho={caminho} f={f} hoje={hoje} />
    </form>
  );
}

/** Os filtros que estão valendo, cada um com o seu "tirar este". */
export function ChipsDoConsumo({ caminho, f, opcoes, insumoNome }: { caminho: string; f: FiltrosDoConsumo; opcoes: OpcoesDoConsumo; insumoNome?: string }) {
  const itens: { chave: string; rotulo: string; sem: Partial<FiltrosDoConsumo> }[] = [];
  if (f.lojaIds.length) {
    const nomes = f.lojaIds.map((id) => opcoes.lojas.find((l) => l.id === id)?.nome).filter(Boolean);
    itens.push({ chave: 'loja', rotulo: `Lojas: ${nomes.length ? nomes.join(', ') : 'fora do seu acesso'}`, sem: { lojaIds: [] } });
  }
  if (f.insumoId) itens.push({ chave: 'insumo', rotulo: `Insumo: ${insumoNome ?? opcoes.listaDeInsumos.find((x) => x.id === f.insumoId)?.nome ?? 'outro'}`, sem: { insumoId: '', q: '' } });
  if (f.q && !f.insumoId) itens.push({ chave: 'q', rotulo: `Nome: “${f.q}”`, sem: { q: '' } });
  if (f.categoriaId) itens.push({ chave: 'categoria', rotulo: `Categoria: ${opcoes.categorias.find((x) => x.id === f.categoriaId)?.nome ?? 'outra'}`, sem: { categoriaId: '' } });
  if (f.so) itens.push({ chave: 'so', rotulo: f.so === 'atencao' ? 'Só o que pede atenção' : 'Só sem contagem no período', sem: { so: '' } });
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros valendo">
      <span className="text-[13px] text-suave">Valendo:</span>
      <ul className="flex flex-wrap gap-2">
        {itens.map((x) => (
          <li key={x.chave}>
            <Link
              href={hrefDoConsumo(caminho, f, { ...x.sem, ...RECORTE_NOVO_DO_CONSUMO })}
              className="ff-transicao inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-linha-forte px-3 text-[13px] text-texto hover:border-texto/35 hover:bg-texto/5 [@media(pointer:coarse)]:min-h-11"
            >
              <span className="min-w-0 truncate">{x.rotulo}</span>
              <span aria-hidden>×</span>
              <span className="sr-only">. Tirar este filtro</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={hrefDoConsumo(caminho, f, { lojaIds: [], insumoId: '', q: '', categoriaId: '', so: '', ...RECORTE_NOVO_DO_CONSUMO })}
        className={`${LINK_DE_TEXTO} inline-flex min-h-9 items-center [@media(pointer:coarse)]:min-h-11`}
      >
        Limpar filtros
      </Link>
    </div>
  );
}
