/**
 * Entrada das abas Requisições, Divergências e Contagens (1.8, UX.9): as três
 * são por loja. Uma loja só no acesso = a página leva direto para ela; mais de
 * uma = esta lista, com o que está pendente e atrasado (requisições) ou a
 * situação do estoque (contagens).
 */

import Link from 'next/link';
import type { EstadoDoEstoque } from '@/lib/erp/estoque-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Painel, Selo, Vazio } from '../../ui/superficies';
import { SeloDoEstado } from '../estoque/situacao';

type Qual = 'requisicoes' | 'divergencias' | 'contagens' | 'producao' | 'lista' | 'tarefas' | 'historico' | 'indicadores';

const DA_PRODUCAO = new Set<Qual>(['producao', 'lista', 'tarefas', 'historico', 'indicadores']);

const TITULO: Record<Qual, string> = {
  requisicoes: 'Requisições por loja',
  divergencias: 'Divergências por loja',
  contagens: 'Contagens por loja',
  producao: 'Produção por loja',
  lista: 'Lista do dia por loja',
  tarefas: 'Tarefas da cozinha por loja',
  historico: 'Histórico da produção por loja',
  indicadores: 'Indicadores da produção por loja',
};
const APOIO: Record<Qual, string> = {
  requisicoes: 'o setor pede, o estoque entrega',
  divergencias: 'requisição × contagem',
  contagens: 'período, cobertura e contagem do dia a dia',
  producao: 'planeje o lote pela ficha; os insumos saem pela requisição',
  lista: 'o que produzir hoje e o que falta comprar',
  tarefas: 'pegue o que vai fazer hoje e conclua quando ficar pronto',
  historico: 'o que foi produzido, quanto, por quem e quando',
  indicadores: 'por pessoa, com o período e a amostra',
};

export function TelaLojasDoEstoque({
  qual,
  lojas,
  base,
  contexto,
  destino,
  consulta = '',
}: {
  qual: Qual;
  /** `estado` só nas contagens: sem o estoque aberto não há período; a loja leva à abertura. */
  lojas: { id: string; nome: string; pendentes?: number; atrasadas?: number; estado?: EstadoDoEstoque; naLista?: number; semLote?: number; paraPegar?: number; emProducao?: number }[];
  base: string;
  contexto?: string;
  /** Produção: para onde a loja leva ("nova" = planejar um lote nela; padrão = o quadro). */
  destino?: 'quadro' | 'nova';
  /** Produção/nova: o que vai junto ao link da loja ("?ficha=…", vindo do botão Produzir da ficha). */
  consulta?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader icone={DA_PRODUCAO.has(qual) ? 'producao' : 'estoque'} cor={DA_PRODUCAO.has(qual) ? COR.producao : COR.estoque} titulo={destino === 'nova' ? 'Nova produção: em qual loja?' : TITULO[qual]} subtitulo={[contexto, APOIO[qual]].filter(Boolean).join(' · ')} />
      <Painel semRespiro>
        {lojas.length === 0 ? (
          <Vazio titulo="Nenhuma loja no seu acesso.">Peça a quem cuida da equipe para incluir as lojas em que você trabalha.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {lojas.map((l) => (
              <li key={l.id}>
                <Link href={`${destinoDaLoja(qual, base, l, destino)}${destino === 'nova' ? consulta : ''}`} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-texto/[0.03] sm:px-5">
                  <span className="font-medium text-texto">{l.nome}</span>
                  {(qual === 'requisicoes' || qual === 'producao') && (
                    <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums text-suave">
                      {l.atrasadas ? <Selo tom="erro">{l.atrasadas} com atraso</Selo> : null}
                      {l.pendentes ? `${l.pendentes} ${l.pendentes === 1 ? 'pendente' : 'pendentes'}` : 'nada pendente'}
                    </span>
                  )}
                  {qual === 'contagens' && l.estado && <SeloDoEstado l={{ estado: l.estado }} />}
                  {qual === 'tarefas' && (
                    <span className="shrink-0 text-[13px] tabular-nums text-suave">
                      {l.paraPegar || l.emProducao ? [l.paraPegar ? `${l.paraPegar} para pegar` : null, l.emProducao ? `${l.emProducao} em produção` : null].filter(Boolean).join(' · ') : 'nada para hoje'}
                    </span>
                  )}
                  {qual === 'lista' && (
                    <span className="shrink-0 text-[13px] tabular-nums text-suave">
                      {l.naLista ? `hoje: ${l.naLista} ${l.naLista === 1 ? 'pré-preparo' : 'pré-preparos'}${l.semLote ? ` · ${l.semLote} sem lote` : ''}` : 'sem lista hoje'}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}

/** Contagens: `<loja>/periodo` só existe com o estoque aberto; antes disso a loja leva à abertura. */
function destinoDaLoja(qual: Qual, base: string, l: { id: string; estado?: EstadoDoEstoque }, destino?: 'quadro' | 'nova') {
  if (qual === 'producao') return destino === 'nova' ? `${base}/${l.id}/nova` : `${base}/${l.id}`;
  if (qual === 'lista' || qual === 'tarefas' || qual === 'historico' || qual === 'indicadores') return `${base}/${l.id}`;
  if (qual === 'contagens') return l.estado === 'ABERTO' ? `${base}/${l.id}/periodo` : `${base}/${l.id}`;
  return `${base}/${l.id}/${qual}`;
}
