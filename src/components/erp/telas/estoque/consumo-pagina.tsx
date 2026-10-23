/**
 * Consumo e conciliação de estoque (L.4) — o miolo das páginas, igual nas duas árvores (`/erp` e `/rodolfo/erp/<slug>`): a página
 * resolve a sessão e a permissão (`estoque.ver`) e entrega o contexto; aqui se lê o recorte da URL, aplica a loja do topo (só quando a
 * pessoa não marcou nenhuma), busca no banco e escolhe entre a tela, a versão para imprimir e os movimentos de um número.
 */

import { pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { consumoDaTela, movimentosDaTela } from '@/lib/erp/consumo-estoque';
import { lerFiltrosDoConsumo } from '@/lib/erp/consumo-estoque-campos';
import { TETO_DA_IMPRESSAO_DO_CONSUMO } from '@/lib/erp/consumo-estoque-planilha';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { Painel, Vazio } from '../../ui/superficies';
import { ImpressaoDoConsumo } from './consumo-impressao';
import { TelaDosMovimentos, type LinksDeOrigem } from './consumo-movimentos';
import { TelaDoConsumo } from './consumo-tela';

type Params = Record<string, string | string[] | undefined>;
type Ctx = { parceiro: { id: string; nome: string }; alcance: Alcance; cliente: ClienteDoParceiro };

/** As bases de cada árvore: o nível 1 usa `/rodolfo/erp/<slug>/...`, a pessoa do parceiro `/erp/...`. */
export interface BasesDoConsumo {
  /** A raiz da árvore: `/erp` ou `/rodolfo/erp/<slug>`. */
  raiz: string;
}

const geradoEm = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

function Nada({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Painel semRespiro>
      <Vazio titulo={titulo}>{texto}</Vazio>
    </Painel>
  );
}

export async function PaginaDoConsumo({ ctx, bases, searchParams }: { ctx: Ctx; bases: BasesDoConsumo; searchParams: Params }) {
  const { visao } = await visaoDaRequisicao(ctx);
  const hoje = hojeNoRio();
  const caminho = `${bases.raiz}/estoque/relatorios/consumo`;
  let f = lerFiltrosDoConsumo(searchParams, hoje);
  // A volta (de onde a pessoa veio) só vale como caminho interno da área.
  f = { ...f, volta: caminhoDeVolta(f.volta, `${bases.raiz}/`, 2000) ?? '' };
  // A loja escolhida no topo decide o recorte só quando a pessoa não marcou nenhuma: a visão filtra, nunca concede.
  let visaoDaLoja: string | null = null;
  if (f.lojaIds.length === 0 && visao.tipo === 'loja') {
    f = { ...f, lojaIds: [visao.lojaId] };
    visaoDaLoja = visao.nome;
  }
  if (searchParams.imprimir === '1') {
    const r = await consumoDaTela(ctx.cliente, ctx.alcance, { ...f, pagina: 1, porPagina: TETO_DA_IMPRESSAO_DO_CONSUMO });
    if (r.demorou) return <Nada titulo={r.demorou.titulo} texto={`${r.demorou.texto} A versão para imprimir lê o recorte inteiro.`} />;
    if (!r.resumo || !r.pagina) return <Nada titulo="Nada para imprimir." texto={f.periodoInvalido ?? 'Nenhuma loja do seu acesso entra neste relatório.'} />;
    return <ImpressaoDoConsumo caminho={caminho} contexto={ctx.parceiro.nome} f={f} r={r} geradoEm={geradoEm()} hoje={hoje} teto={TETO_DA_IMPRESSAO_DO_CONSUMO} />;
  }
  const r = await consumoDaTela(ctx.cliente, ctx.alcance, f);
  return (
    <TelaDoConsumo
      enderecos={{
        caminho,
        exportar: `${caminho}/exportar`,
        divergencias: pode(ctx.alcance, 'estoque.ajustar') ? `${bases.raiz}/estoque/divergencias` : null,
      }}
      contexto={ctx.parceiro.nome}
      f={f}
      r={r}
      hoje={hoje}
      visaoDaLoja={visaoDaLoja}
    />
  );
}

export async function PaginaDosMovimentos({ ctx, bases, searchParams }: { ctx: Ctx; bases: BasesDoConsumo; searchParams: Params }) {
  const { visao } = await visaoDaRequisicao(ctx);
  const hoje = hojeNoRio();
  const caminho = `${bases.raiz}/estoque/relatorios/consumo`;
  let f = lerFiltrosDoConsumo(searchParams, hoje);
  f = { ...f, volta: caminhoDeVolta(f.volta, `${bases.raiz}/`, 2000) ?? '' };
  if (f.lojaIds.length === 0 && visao.tipo === 'loja') f = { ...f, lojaIds: [visao.lojaId] };
  const r = await movimentosDaTela(ctx.cliente, ctx.alcance, f);
  // Cada link de origem confere a permissão da loja do movimento (o link nunca ensina o que a pessoa não pode abrir).
  const links: Record<string, LinksDeOrigem> = {};
  for (const l of r.lojasUsadas) {
    links[l.id] = {
      nota: pode(ctx.alcance, 'compras.ver', { lojaId: l.id }),
      requisicao: pode(ctx.alcance, 'requisicao.pedir', { lojaId: l.id }) || pode(ctx.alcance, 'requisicao.atender', { lojaId: l.id }),
      lote: pode(ctx.alcance, 'producao.ver', { lojaId: l.id }),
    };
  }
  return (
    <TelaDosMovimentos
      enderecos={{ caminho, exportar: `${caminho}/exportar`, estoqueBase: `${bases.raiz}/estoque`, comprasBase: `${bases.raiz}/compras`, producaoBase: `${bases.raiz}/producao` }}
      contexto={ctx.parceiro.nome}
      f={f}
      r={r}
      links={links}
    />
  );
}
