/**
 * Comparação de fornecedores e de períodos (L.3) — o miolo das páginas, igual nas duas árvores (`/erp` e `/rodolfo/erp/<slug>`): a
 * página resolve a sessão e a permissão (`compras.ver`) e entrega o contexto; aqui se lê o recorte da URL, aplica a loja do topo
 * (só quando a pessoa não marcou nenhuma), busca no banco e escolhe entre a tela e a versão para imprimir.
 */

import { visaoDaRequisicao } from '@/lib/erp/contexto';
import type { Alcance } from '@/lib/erp/permissoes';
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { comparacaoDeFornecedores, comparacaoDePeriodos } from '@/lib/erp/compras-comparacao';
import { lerFiltrosDeFornecedores, lerFiltrosDePeriodos } from '@/lib/erp/compras-comparacao-campos';
import { hojeNoRio } from '@/lib/erp/compra-campos';
import { recorteDaVisao } from '@/lib/erp/compras-relatorio-campos';
import { caminhoDeVolta } from '@/lib/erp/volta';
import { Painel, Vazio } from '../../ui/superficies';
import { RelatorioGrande } from '../../ui/relatorio-grande';
import { ImpressaoDosFornecedores, TelaDosFornecedores } from './comparacao-fornecedores';
import { ImpressaoDosPeriodos, TelaDosPeriodos } from './comparacao-periodos';

type Params = Record<string, string | string[] | undefined>;
type Ctx = { parceiro: { id: string; nome: string }; alcance: Alcance; cliente: ClienteDoParceiro };

const geradoEm = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

function Nada({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Painel semRespiro>
      <Vazio titulo={titulo}>{texto}</Vazio>
    </Painel>
  );
}

async function paginaDosFornecedores({ ctx, caminho, comprasBase, insumosBase, searchParams }: { ctx: Ctx; caminho: string; comprasBase: string; insumosBase?: string; searchParams: Params }) {
  const { visao } = await visaoDaRequisicao(ctx);
  const hoje = hojeNoRio();
  let f = { ...lerFiltrosDeFornecedores(searchParams, hoje), volta: '' };
  // A loja escolhida no topo decide o recorte só quando a pessoa não marcou nenhuma e o endereço não pediu a rede (decisão 478):
  // a visão filtra, nunca concede.
  const daVisao = recorteDaVisao(f, visao);
  f = daVisao.f;
  const { soALoja: visaoDaLoja, alemDaLoja } = daVisao;
  if (searchParams.imprimir === '1') {
    if (!f.insumoId) return <Nada titulo="Escolha um insumo antes de imprimir." texto="Volte à comparação, escolha o insumo e depois use “Imprimir ou salvar em PDF”." />;
    const r = await comparacaoDeFornecedores(ctx.cliente, ctx.alcance, f);
    if (r.motivoVazio || !r.insumo) return <Nada titulo="Nada para imprimir." texto={f.periodoInvalido ?? 'Nenhuma loja do seu acesso entra neste relatório.'} />;
    return <ImpressaoDosFornecedores caminho={caminho} contexto={ctx.parceiro.nome} f={f} r={r} geradoEm={geradoEm()} />;
  }
  const r = await comparacaoDeFornecedores(ctx.cliente, ctx.alcance, f);
  // Procurou pelo nome e só um insumo com compra tem esse nome: é ele (a leitura já saiu dele; aqui só o endereço e o formulário o assumem).
  if (r.insumoDaBusca) f = { ...f, insumoId: r.insumoDaBusca };
  return <TelaDosFornecedores caminho={caminho} comprasBase={comprasBase} contexto={ctx.parceiro.nome} f={f} r={r} hoje={hoje} insumosBase={insumosBase} visaoDaLoja={visaoDaLoja} alemDaLoja={alemDaLoja} />;
}

async function paginaDosPeriodos({ ctx, caminho, comprasBase, searchParams }: { ctx: Ctx; caminho: string; comprasBase: string; searchParams: Params }) {
  const { visao } = await visaoDaRequisicao(ctx);
  const hoje = hojeNoRio();
  let f = lerFiltrosDePeriodos(searchParams, hoje);
  // A volta (de onde a pessoa veio) só vale como caminho interno da área.
  f = { ...f, rel: { ...f.rel, volta: caminhoDeVolta(f.rel.volta, comprasBase.slice(0, -'compras'.length), 2000) ?? '' } };
  const daVisao = recorteDaVisao(f.rel, visao);
  f = { ...f, rel: daVisao.f };
  const { soALoja: visaoDaLoja, alemDaLoja } = daVisao;
  if (searchParams.imprimir === '1') {
    const r = await comparacaoDePeriodos(ctx.cliente, ctx.alcance, f);
    if (!r.comparacao || !r.a || !r.b) {
      return <Nada titulo="Nada para imprimir." texto={r.passouDoTeto ? 'Este recorte tem combinações demais de insumo e fornecedor. Filtre por loja, fornecedor, categoria ou insumo.' : (f.periodoInvalido ?? 'Nenhuma loja do seu acesso entra neste relatório.')} />;
    }
    return <ImpressaoDosPeriodos caminho={caminho} contexto={ctx.parceiro.nome} f={f} r={r} geradoEm={geradoEm()} hoje={hoje} />;
  }
  const r = await comparacaoDePeriodos(ctx.cliente, ctx.alcance, f);
  // Procurou pelo nome e só um insumo com compra tem esse nome: é ele (a leitura já saiu dele; aqui só o endereço e o formulário o assumem).
  if (r.insumoDaBusca) f = { ...f, rel: { ...f.rel, insumoId: r.insumoDaBusca } };
  return <TelaDosPeriodos caminho={caminho} comprasBase={comprasBase} contexto={ctx.parceiro.nome} f={f} r={r} hoje={hoje} visaoDaLoja={visaoDaLoja} alemDaLoja={alemDaLoja} />;
}

/** Se o relatório não couber agora (passou do teto de tempo ou há outros grandes rodando), a frase no lugar dos números, sem 500. */
export async function PaginaDosFornecedores(props: Parameters<typeof paginaDosFornecedores>[0]) {
  try {
    return await paginaDosFornecedores(props);
  } catch (e) {
    if (e instanceof ErroDeRelatorio) return <RelatorioGrande erro={e} caminho={props.caminho} />;
    throw e;
  }
}

export async function PaginaDosPeriodos(props: Parameters<typeof paginaDosPeriodos>[0]) {
  try {
    return await paginaDosPeriodos(props);
  } catch (e) {
    if (e instanceof ErroDeRelatorio) return <RelatorioGrande erro={e} caminho={props.caminho} />;
    throw e;
  }
}
