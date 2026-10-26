/**
 * Relatórios de compras (L.2) — o miolo das páginas, igual nas duas árvores (`/erp` e `/rodolfo/erp/<slug>`): a página resolve a
 * sessão e a permissão (`compras.ver`) e entrega o contexto; aqui se lê o recorte da URL, aplica a loja do topo (só quando a
 * pessoa não marcou nenhuma), busca no banco e escolhe entre a tela e a versão para imprimir.
 */

import { visaoDaRequisicao } from '@/lib/erp/contexto';
import type { Alcance } from '@/lib/erp/permissoes';
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { RelatorioGrande } from '../../ui/relatorio-grande';
import { relatorioCompleto, relatorioDaTela } from '@/lib/erp/compras-relatorio';
import { lerFiltrosDoRelatorio, recorteDaVisao, somarDias, TETO_DA_IMPRESSAO } from '@/lib/erp/compras-relatorio-campos';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { Vazio, Painel } from '../../ui/superficies';
import { TelaDeImpressao, TelaDoRelatorio, type Modo } from './relatorio-tela';

type Params = Record<string, string | string[] | undefined>;

async function paginaDoRelatorio({
  ctx,
  modo,
  caminho,
  comprasBase,
  insumosBase,
  searchParams,
}: {
  ctx: { parceiro: { id: string; nome: string }; alcance: Alcance; cliente: ClienteDoParceiro };
  modo: Modo;
  caminho: string;
  comprasBase: string;
  insumosBase?: string;
  searchParams: Params;
}) {
  const { visao } = await visaoDaRequisicao(ctx);
  const hoje = hojeNoRio();
  // O histórico de um insumo olha mais longe que o mês: sem datas na URL, os últimos 90 dias. O período é sempre dito na tela.
  let f = lerFiltrosDoRelatorio(searchParams, hoje, modo === 'insumo' ? { de: somarDias(hoje, -89) } : {});
  // L.3: a comparação abre estas linhas com `volta`; só vale caminho interno da área (`/erp/` ou `/rodolfo/erp/<slug>/`).
  f = { ...f, volta: caminhoDeVolta(f.volta, comprasBase.slice(0, -'compras'.length), 2000) ?? '' };
  // A loja escolhida no topo decide o recorte só quando a pessoa não marcou nenhuma e o endereço não pediu a rede (decisão 478):
  // a visão filtra, nunca concede.
  const daVisao = recorteDaVisao(f, visao);
  f = daVisao.f;
  const { soALoja: visaoDaLoja, alemDaLoja } = daVisao;
  if (searchParams.imprimir === '1') {
    if (modo === 'insumo' && !f.insumoId) {
      return (
        <Painel semRespiro>
          <Vazio titulo="Escolha um insumo antes de imprimir.">Volte ao histórico, escolha o insumo e depois use “Imprimir ou salvar em PDF”.</Vazio>
        </Painel>
      );
    }
    const d = await relatorioCompleto(ctx.cliente, ctx.alcance, f, TETO_DA_IMPRESSAO);
    if (!d.totais || !d.grupos || !d.linhas) {
      return (
        <Painel semRespiro>
          <Vazio titulo="Nada para imprimir.">{f.periodoInvalido ?? 'Nenhuma loja do seu acesso entra neste relatório.'}</Vazio>
        </Painel>
      );
    }
    return (
      <TelaDeImpressao
        modo={modo}
        caminho={caminho}
        contexto={ctx.parceiro.nome}
        f={f}
        dados={{ lojasUsadas: d.lojasUsadas, totais: d.totais, grupos: d.grupos, linhas: d.linhas, canceladas: d.canceladas, semEmissao: d.semEmissao }}
        geradoEm={new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
      />
    );
  }
  let r = await relatorioDaTela(ctx.cliente, ctx.alcance, f, modo);
  // Procurou pelo nome e só um insumo com compra tem esse nome: é ele (a pessoa não precisa escolher de uma lista de um).
  if (modo === 'insumo' && !f.insumoId && f.q && r.opcoes.listaDeInsumos.length === 1) {
    f = { ...f, insumoId: r.opcoes.listaDeInsumos[0].id };
    r = await relatorioDaTela(ctx.cliente, ctx.alcance, f, modo);
  }
  return (
    <TelaDoRelatorio modo={modo} caminho={caminho} comprasBase={comprasBase} contexto={ctx.parceiro.nome} f={f} r={r} hoje={hoje} insumosBase={insumosBase} visaoDaLoja={visaoDaLoja} alemDaLoja={alemDaLoja} />
  );
}

/** Se o relatório não couber agora (passou do teto de tempo ou há outros grandes rodando), a frase no lugar dos números, sem 500. */
export async function PaginaDoRelatorio(props: Parameters<typeof paginaDoRelatorio>[0]) {
  try {
    return await paginaDoRelatorio(props);
  } catch (e) {
    if (e instanceof ErroDeRelatorio) return <RelatorioGrande erro={e} caminho={props.caminho} />;
    throw e;
  }
}
