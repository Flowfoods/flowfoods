/**
 * Início de trabalho (24/10/2026, referência: painéis da Nina e Início do
 * iFood): o que a pessoa precisa ver ao abrir o ERP — poucos números e "o que
 * precisa de você", com o atalho para resolver. Cada bloco só existe com a
 * permissão dele (faturamento, preços, estoque, produção por loja); quem não tem nada disso vê só
 * as áreas, como antes. Reaproveita as leituras das telas (nenhuma conta nova).
 */

import { obterMes } from './faturamento';
import { alcancaLoja, pode, type Alcance } from './permissoes';
import { saudeDoCardapio } from './saude-do-cardapio';
import { situacaoDoEstoque } from './estoque';
import { lojasDaListaDoDia } from './producao-lista';
import { dreDoPeriodo } from './dre';
import { cmvDaHome, type WidgetCmvHome } from './home-cmv';
import { comprasAnaliticas, lerComprasDaHome } from './home-compras';
import { lerXmlAguardandoDaHome, xmlAguardandoDaHome, type XmlAguardandoHome } from './home-xml-aguardando';
import { despesasIndisponiveis, estoqueAnalitico, faturamentoAnalitico, producaoAnalitica, type AnaliticoDaHome, type LeituraHome, type WidgetAnaliticoHome } from './home-analitico';
import { hojeNoRio } from './compra-campos';
import type { ClienteDoParceiro } from './tenant';
import type { Visao } from './visao';

export interface IndicadorDoDia {
  chave: string;
  rotulo: string;
  /** Centavos (dinheiro), contagem "x de y" ou um número simples (painel do nível 1: respostas, pedidos). */
  /**
   * `fracao` desenha uma barra: cheia é "ok"; parcial é alerta (falta algo), salvo quando `parcialEhNormal` — andamento do
   * dia, como os envios da prospecção (decisão 473), em que metade do teto ao meio-dia não é problema.
   */
  valor: { tipo: 'dinheiro'; centavos: number | null } | { tipo: 'fracao'; de: number; total: number; parcialEhNormal?: boolean } | { tipo: 'numero'; numero: number | null };
  contexto: string;
  /** A abrangência real deste indicador; cardápio continua sendo cadastro da rede. */
  escopo?: string;
  href: string;
}

export interface PendenciaDoDia {
  chave: string;
  titulo: string;
  texto: string;
  href: string;
  acao: string;
  escopo?: string;
}

export interface PainelDoDia {
  indicadores: IndicadorDoDia[];
  pendencias: PendenciaDoDia[];
  /** Metadados independentes das fontes autorizadas; o painel institucional N1 continua sem eles. */
  estados?: EstadoDoResumo[];
  /** Momento da consulta do resumo, não data de alteração dos registros. */
  consultadoEm?: string;
  /** CMV canônico de uma loja autorizada; omitido na rede e sem dre.ver. */
  cmv?: WidgetCmvHome;
  /** H2 de uma loja; rede conserva resumo atual e orienta seleção explícita. */
  analitico?: AnaliticoDaHome;
  /** Contagem da fila atual atribuída à loja; consulta independente do dinheiro de Compras. */
  xmlAguardando?: XmlAguardandoHome;
}

export interface EstadoDoResumo {
  chave: 'faturamento' | 'cardapio' | 'estoque' | 'producao';
  estado: 'ok' | 'parcial' | 'sem_dados' | 'erro';
  rotulo: string;
  escopo: string;
  referencia: string;
  /** Texto de produto controlado: nunca a razão de uma rejeição/erro interno. */
  mensagem?: string;
  href: string;
  acao: string;
}

function leituraAutorizada<T>(autorizada: boolean, ler: () => Promise<T>): Promise<T | null> {
  return autorizada ? Promise.resolve().then(ler) : Promise.resolve(null);
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function painelDoDia(cliente: ClienteDoParceiro, alcance: Alcance, base: string, hojeOuAgora: string | Date = new Date(), visao?: Visao): Promise<PainelDoDia> {
  const indicadores: IndicadorDoDia[] = [];
  const pendencias: PendenciaDoDia[] = [];
  // Um único relógio define mês, dia da lista e aprofundamento. A data textual
  // dos chamadores antigos fixa meio-dia UTC, que permanece no mesmo dia no Rio.
  const agora = typeof hojeOuAgora === 'string' ? new Date(`${hojeOuAgora}T12:00:00.000Z`) : hojeOuAgora;
  const hoje = hojeNoRio(agora);
  const mes = hoje.slice(0, 7);

  // A visão já vem resolvida no servidor, mas nunca amplia o alcance se um
  // chamador enviar loja de fora ou Rede Completa para um perfil restrito.
  if (visao?.tipo === 'nenhuma' || (visao?.tipo === 'rede' && alcance.lojas !== 'todas')
    || (visao?.tipo === 'loja' && (!/^[a-z0-9]{1,64}$/i.test(visao.lojaId) || !alcancaLoja(alcance, visao.lojaId)))) return { indicadores, pendencias };
  const lojaId = visao?.tipo === 'loja' ? visao.lojaId : undefined;
  const alcanceDaVisao: Alcance = lojaId ? { ...alcance, lojas: [lojaId] } : alcance;
  const escopo = visao?.tipo === 'loja' ? visao.nome : alcance.lojas === 'todas' ? 'Rede Completa' : 'Lojas do seu acesso';
  const queryFaturamento = new URLSearchParams({ mes });
  if (lojaId) queryFaturamento.set('loja', lojaId);
  else if (visao?.tipo === 'rede') queryFaturamento.set('rede', '1');
  const faturamentoHref = base + '/faturamento?' + queryFaturamento.toString();
  const estoqueHref = lojaId ? base + '/estoque/' + encodeURIComponent(lojaId) : base + '/estoque';
  const producaoHref = lojaId ? `${base}/producao/lista/${encodeURIComponent(lojaId)}?dia=${hoje}` : '';

  const autorizado = {
    faturamento: pode(alcanceDaVisao, 'faturamento.ver'),
    cardapio: pode(alcance, 'fichas.ver') && pode(alcance, 'precos.ver'),
    estoque: pode(alcanceDaVisao, 'estoque.ver'),
    // Primeira fatia: somente a loja escolhida. Rede não vira um total fictício.
    producao: !!lojaId && pode(alcanceDaVisao, 'producao.ver', { lojaId }),
    cmv: !!lojaId && pode(alcanceDaVisao, 'dre.ver', { lojaId }),
    compras: !!lojaId && pode(alcanceDaVisao, 'compras.ver', { lojaId }),
    xml: !!lojaId && pode(alcanceDaVisao, 'compras.ver', { lojaId }),
  };
  const [leituraFat, leituraSaude, leituraEstoque, leituraProducao, leituraCmv, leituraCompras, leituraXml] = await Promise.allSettled([
    leituraAutorizada(autorizado.faturamento, () => obterMes(cliente, alcanceDaVisao, { mes, ...(lojaId ? { lojaId } : {}) }, hoje)),
    leituraAutorizada(autorizado.cardapio, () => saudeDoCardapio(cliente)),
    leituraAutorizada(autorizado.estoque, () => situacaoDoEstoque(cliente, alcanceDaVisao)),
    leituraAutorizada(autorizado.producao, () => lojasDaListaDoDia(cliente, alcanceDaVisao, agora)),
    // Uma única leitura do DRE, do mesmo cliente/loja e dia de negócio. Não
    // usa fallback de query/rede nem troca o período corrente por outro com dado.
    leituraAutorizada(autorizado.cmv, () => lojaId
      ? dreDoPeriodo(cliente, alcanceDaVisao, { tipo: 'loja', lojaId }, hoje, hoje)
      : Promise.resolve(null)),
    leituraAutorizada(autorizado.compras, () => lojaId ? lerComprasDaHome(cliente, alcanceDaVisao, lojaId, hoje) : Promise.resolve(null)),
    leituraAutorizada(autorizado.xml, () => lojaId ? lerXmlAguardandoDaHome(cliente, alcanceDaVisao, lojaId) : Promise.resolve(null)),
  ]);
  // Rejeições são tratadas por fonte e não entram no DTO, no HTML ou em logs.
  const fat = leituraFat.status === 'fulfilled' ? leituraFat.value : null;
  const saude = leituraSaude.status === 'fulfilled' ? leituraSaude.value : null;
  const estoque = leituraEstoque.status === 'fulfilled' ? leituraEstoque.value : null;
  const producao = leituraProducao.status === 'fulfilled' ? leituraProducao.value?.find((l) => l.id === lojaId) : null;
  const estados: EstadoDoResumo[] = [];
  const lancados = new Set(fat?.lojas.flatMap((l) => l.dias.filter((d) => d.total !== null).map((d) => d.data)) ?? []);
  if (autorizado.faturamento) {
    const estado = leituraFat.status === 'rejected' ? 'erro' : !lancados.size ? 'sem_dados' : fat!.faltas > 0 ? 'parcial' : 'ok';
    estados.push({
      chave: 'faturamento', estado, escopo,
      rotulo: `Faturamento de ${MESES[Number(mes.slice(5, 7)) - 1]}`,
      referencia: `Mês civil · ${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`,
      mensagem: estado === 'erro' ? 'Não foi possível carregar o faturamento.'
        : estado === 'sem_dados' ? (fat?.lojas.length ? 'Ainda não há lançamentos neste mês.' : 'Nenhuma loja disponível para faturamento neste contexto.')
        : estado === 'parcial' ? `${plural(fat!.faltas, 'canal sem lançamento', 'canais sem lançamento')} neste mês. O valor não está completo.` : undefined,
      href: faturamentoHref, acao: 'Ver o faturamento',
    });
  }
  if (autorizado.cardapio) {
    const estado = leituraSaude.status === 'rejected' ? 'erro' : !saude?.pratos ? 'sem_dados' : 'ok';
    estados.push({
      chave: 'cardapio', estado, escopo: 'Da rede', rotulo: 'Pratos prontos para o preço', referencia: 'Situação atual do cadastro',
      mensagem: estado === 'erro' ? 'Não foi possível carregar a situação do cardápio.' : estado === 'sem_dados' ? 'Ainda não há pratos neste resumo da rede.' : undefined,
      href: `${base}/fichas`, acao: 'Ver as fichas técnicas',
    });
  }
  if (autorizado.estoque) {
    const estado = leituraEstoque.status === 'rejected' ? 'erro' : !estoque?.some((l) => l.ativa) ? 'sem_dados' : 'ok';
    estados.push({
      chave: 'estoque', estado, escopo, rotulo: 'Lojas com estoque aberto', referencia: 'Posição atual',
      mensagem: estado === 'erro' ? 'Não foi possível carregar a situação do estoque.'
        : estado === 'sem_dados' ? (estoque?.length ? 'Nenhuma loja ativa neste contexto.' : 'Nenhuma loja disponível para estoque neste contexto.') : undefined,
      href: estoqueHref, acao: 'Ver o estoque',
    });
  }
  if (autorizado.producao) {
    const estado = leituraProducao.status === 'rejected' ? 'erro' : !producao?.naLista ? 'sem_dados' : 'ok';
    estados.push({
      chave: 'producao', estado, escopo,
      rotulo: 'Pré-preparos na lista de hoje', referencia: `Hoje · ${hoje.split('-').reverse().join('/')}`,
      mensagem: estado === 'erro' ? 'Não foi possível carregar a lista de produção de hoje.'
        : estado === 'sem_dados' ? (producao ? 'Nenhum pré-preparo listado hoje.' : 'Nenhuma loja ativa disponível para produção neste contexto.') : undefined,
      href: producaoHref, acao: 'Ver a lista',
    });
  }

  if (fat && fat.lojas.length > 0) {
    indicadores.push({
      chave: 'faturamento',
      escopo,
      rotulo: `Faturamento de ${MESES[Number(mes.slice(5, 7)) - 1]}`,
      // Nenhum lançamento não comprova faturamento zero. Um dia informado
      // como "Não vendeu" continua sendo um zero real, distinto de ausência.
      valor: { tipo: 'dinheiro', centavos: lancados.size ? fat.total.valorCentavos : null },
      contexto: lancados.size ? `${plural(lancados.size, 'dia lançado', 'dias lançados')} · ${plural(fat.total.pedidos, 'pedido', 'pedidos')}` : 'nenhum dia lançado ainda',
      href: faturamentoHref,
    });
    if (fat.faltas > 0) {
      pendencias.push({
        chave: 'faturamento-faltas',
        escopo,
        titulo: `${plural(fat.faltas, 'canal sem lançamento', 'canais sem lançamento')} neste mês`,
        texto: 'Dia que a loja vendeu e ninguém lançou deixa o faturamento e o DRE incompletos.',
        href: faturamentoHref,
        acao: 'Lançar o que falta',
      });
    }
  }

  if (saude && saude.pratos > 0) {
    indicadores.push({
      chave: 'cardapio',
      escopo: 'Da rede',
      rotulo: 'Pratos prontos para o preço',
      valor: { tipo: 'fracao', de: saude.prontos, total: saude.pratos },
      contexto: 'CMV calculado em todos os canais que o prato vende',
      href: `${base}/fichas`,
    });
    if (saude.custoIncompleto > 0) {
      pendencias.push({
        chave: 'cardapio-custo',
        escopo: 'Da rede',
        titulo: `${plural(saude.custoIncompleto, 'prato', 'pratos')} com custo incompleto`,
        texto: 'Falta preço em algum insumo da receita: sem ele não há CMV nem sugestão de preço.',
        href: `${base}/fichas?custo=incompleto`,
        acao: 'Ver as fichas',
      });
    } else if (saude.prontos < saude.pratos) {
      pendencias.push({
        chave: 'cardapio-preco',
        escopo: 'Da rede',
        titulo: `${plural(saude.pratos - saude.prontos, 'prato espera', 'pratos esperam')} meta ou preço`,
        texto: 'O custo está completo; falta a meta de CMV do canal ou o preço escolhido.',
        href: `${base}/fichas`,
        acao: 'Ver a saúde do cardápio',
      });
    }
  }

  if (estoque && estoque.some((l) => l.ativa)) {
    const ativas = estoque.filter((l) => l.ativa);
    const abertas = ativas.filter((l) => l.estado === 'ABERTO').length;
    indicadores.push({
      chave: 'estoque',
      escopo,
      rotulo: 'Lojas com estoque aberto',
      valor: { tipo: 'fracao', de: abertas, total: ativas.length },
      contexto: abertas === ativas.length ? 'compras e requisições já mexem no saldo' : 'a primeira contagem vira o saldo inicial',
      href: estoqueHref,
    });
    const emContagem = ativas.filter((l) => l.estado === 'EM_CONTAGEM');
    const naoAbertas = ativas.filter((l) => l.estado === 'NAO_ABERTO');
    if (emContagem.length > 0) {
      const c = emContagem[0].contagem;
      pendencias.push({
        chave: 'estoque-contagem',
        escopo,
        titulo: `Contagem de abertura em andamento${emContagem.length === 1 ? ` em ${emContagem[0].nome}` : ` em ${emContagem.length} lojas`}`,
        texto: c ? `${c.contados} de ${c.total} itens contados. Termine para o saldo começar a valer.` : 'Termine para o saldo começar a valer.',
        href: estoqueHref,
        acao: 'Continuar a contagem',
      });
    }
    if (naoAbertas.length > 0) {
      pendencias.push({
        chave: 'estoque-abrir',
        escopo,
        titulo: `${plural(naoAbertas.length, 'loja', 'lojas')} sem estoque aberto`,
        texto: 'Sem saldo inicial, a compra não entra no estoque e o CMV real do mês fica sem base.',
        href: estoqueHref,
        acao: 'Abrir o estoque',
      });
    }
  }

  if (producao) {
    indicadores.push({
      chave: 'producao', escopo, rotulo: 'Pré-preparos na lista de hoje',
      valor: { tipo: 'numero', numero: producao.naLista },
      contexto: `${plural(producao.semLote, 'pré-preparo ainda sem lote ativo', 'pré-preparos ainda sem lote ativo')}. A lista inclui os que já viraram lote.`,
      href: producaoHref,
    });
    if (producao.semLote > 0) {
      pendencias.push({
        chave: 'producao-sem-lote', escopo,
        titulo: plural(producao.semLote, 'pré-preparo ainda sem lote ativo', 'pré-preparos ainda sem lote ativo'),
        texto: 'Confira na lista de hoje os pré-preparos que estão sem lote ativo.',
        href: producaoHref, acao: 'Ver a lista',
      });
    }
  }

  // Compartilhado também na Home que só pode ver CMV. É hora da consulta,
  // não a data de alteração dos registros nem garantia de fotografia global.
  const consultadoEm = new Date().toISOString();
  let xmlAguardando: XmlAguardandoHome | null = null;
  if (autorizado.xml && visao?.tipo === 'loja') {
    const contextoXml = { alcance: alcanceDaVisao, loja: { id: visao.lojaId, nome: visao.nome }, raiz: base, hoje, consultadoEm };
    try {
      xmlAguardando = xmlAguardandoDaHome(leituraXml.status === 'rejected' ? { estado: 'erro' } : { estado: 'lido', dados: leituraXml.value }, contextoXml);
    } catch {
      xmlAguardando = xmlAguardandoDaHome({ estado: 'erro' }, contextoXml);
    }
  }
  let cmv: WidgetCmvHome | null = null;
  if (autorizado.cmv && visao?.tipo === 'loja') {
    const contextoCmv = { alcance: alcanceDaVisao, loja: { id: visao.lojaId, nome: visao.nome }, raiz: base, consultadoEm };
    try {
      cmv = cmvDaHome(leituraCmv.status === 'rejected' ? { estado: 'erro' } : { estado: 'lido', dre: leituraCmv.value }, contextoCmv);
    } catch {
      // Incompatibilidade de projeção tampouco derruba os outros módulos.
      cmv = cmvDaHome({ estado: 'erro' }, contextoCmv);
    }
  }
  let analitico: AnaliticoDaHome | undefined;
  if (visao?.tipo === 'rede') analitico = { tipo: 'rede' };
  if (visao?.tipo === 'loja') {
    const contexto = { alcance: alcanceDaVisao, loja: { id: visao.lojaId, nome: visao.nome }, raiz: base, hoje, consultadoEm };
    const leitura = <T,>(r: PromiseSettledResult<T | null>): LeituraHome<T> => r.status === 'fulfilled' ? { estado: 'lido', dados: r.value } : { estado: 'erro' };
    const projetar = <T,>(ler: () => T, falha: () => T): T => { try { return ler(); } catch { return falha(); } };
    // Cada projeção é independente e usa somente a leitura já autorizada.
    const faturamento = projetar(() => faturamentoAnalitico(leitura(leituraFat), contexto), () => faturamentoAnalitico({ estado: 'erro' }, contexto));
    const compras = projetar(() => comprasAnaliticas(leitura(leituraCompras), contexto), () => comprasAnaliticas({ estado: 'erro' }, contexto));
    const posicao = projetar(() => estoqueAnalitico(leitura(leituraEstoque), contexto), () => estoqueAnalitico({ estado: 'erro' }, contexto));
    const lista = projetar(() => producaoAnalitica(leitura(leituraProducao), contexto), () => producaoAnalitica({ estado: 'erro' }, contexto));
    const despesas = despesasIndisponiveis(contexto); // Sem contrato financeiro: nenhuma consulta nova.
    const widgets = [faturamento?.widget, cmv, compras, despesas, posicao, lista].filter((w): w is WidgetAnaliticoHome => !!w);
    analitico = { tipo: 'loja', loja: contexto.loja, widgets, ...(faturamento ? { faturamentoDiario: faturamento.diario } : {}) };
  }
  return {
    indicadores, pendencias,
    ...(estados.length ? { estados } : {}), ...(cmv ? { cmv } : {}),
    ...(analitico ? { analitico } : {}),
    ...(xmlAguardando ? { xmlAguardando } : {}),
    ...(estados.length || cmv || xmlAguardando || (analitico?.tipo === 'loja' && analitico.widgets.length) ? { consultadoEm } : {}),
  };
}
