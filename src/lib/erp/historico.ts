/**
 * Leitura do `HistoricoAlteracao` para a tela: o que mudou, de quanto para
 * quanto, quem e quando. Puro na formatação (testável sem banco).
 */

import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { CONSERVACOES, TIPOS } from './insumo-campos';
import { TIPOS_DE_FICHA } from './ficha-campos';
import { SEPARADOR_DE_ITENS } from './compra-campos';
import { SEM_EMBALAGEM } from './canal-campos';
import { COMO_CLASSIFICOU } from './categoria-campos';
import { CUSTO_NAO_INFORMADO, UNIDADES, formatarCusto, formatarDinheiro, formatarQuantidade, type CustoExato, type Unidade } from './unidades';

const ENTIDADE: Record<string, string> = {
  ParceiroFlow: 'Parceiro',
  Loja: 'Loja',
  Marca: 'Marca',
  Insumo: 'Insumo',
  // I.1a: a categoria de insumo da rede (criar, renomear, reordenar, desativar, excluir).
  CategoriaInsumo: 'Categoria de insumo',
  // "Variante" é palavra de sistema; na tela é outra embalagem de compra do insumo.
  InsumoVariante: 'Embalagem',
  FichaTecnica: 'Ficha técnica',
  // 1.5
  NotaEntrada: 'Nota de compra',
  Contagem: 'Estoque',
  ContagemItem: 'Contagem',
  // 1.8
  Requisicao: 'Requisição',
  // 3.1: o lote de produção (quantidades para quem vê produção; o custo dele só para quem vê custos).
  OrdemProducao: 'Lote',
  // 3.2: a lista do dia de uma loja (o que produzir; nenhum valor em R$).
  ListaProducao: 'Lista do dia',
  // 1.9: a taxa do iFood do parceiro.
  CanalConfig: 'Canal de venda',
  Fornecedor: 'Fornecedor',
  // F.1b: a nota fiscal recebida por XML e o que o sistema lembra de cada item de cada fornecedor.
  DocumentoFiscal: 'Nota fiscal recebida',
  VinculoItemFornecedor: 'Item do fornecedor',
  // 2.1: o faturamento de um canal num dia. Só quem tem `faturamento.ver` recebe estas linhas.
  FaturamentoLancamento: 'Faturamento',
  // 2.2a: despesas, linhas do plano e a regra do período. Só quem tem `dre.ver` recebe estas linhas.
  Despesa: 'Despesa',
  DreLinha: 'Linha do DRE',
  RegraDoPeriodo: 'Período do DRE',
  // 2.2b: metas e fechamento do período (só quem tem `dre.ver` recebe estas linhas).
  DreMeta: 'Meta do DRE',
  // I.2a: as metas por categoria (conjunto da rede ou da loja) e quais categorias a loja usa.
  MetaCmvConjunto: 'Metas por categoria',
  CategoriaNaLoja: 'Categoria na loja',
  PeriodoApuracao: 'Fechamento do período',
  DreFotografia: 'Fotografia do fechamento',
  AcessoParceiro: 'Acesso',
  PerfilAcesso: 'Perfil',
};

const ACAO: Record<string, string> = {
  CRIOU: 'Criou',
  ALTEROU: 'Alterou',
  ATIVOU: 'Ativou',
  SUSPENDEU: 'Suspendeu',
  CANCELOU: 'Cancelou',
  CORTOU: 'Cortou',
  DESATIVOU: 'Desativou',
  REATIVOU: 'Reativou',
  GEROU_LINK: 'Gerou link de',
  DEFINIU_SENHA: 'Definiu a senha do',
  TROCOU_SENHA: 'Trocou a senha do',
  ATIVOU_ROSTO: 'Ativou o rosto no',
  REMOVEU_ROSTO: 'Tirou o rosto do',
  EXCLUIU: 'Excluiu',
  LIBEROU_ENTRADA: 'Liberou a entrada do',
  PEDIU_SENHA_NOVA: 'Pediu senha nova no',
  INICIOU: 'Começou',
  CONCLUIU: 'Concluiu',
  DESCARTOU: 'Descartou',
  RECONTOU: 'Recontou',
  // 1.7
  FECHOU_SOZINHA: 'Fechou sozinha',
  VENCEU: 'Fechou sem aplicar',
  // 1.8
  PEDIU: 'Pediu',
  ATENDEU: 'Entregou',
  DEVOLVEU: 'Recebeu de volta',
  // 2.2b
  FECHOU: 'Fechou',
  REABRIU: 'Reabriu',
  // 3.1
  PLANEJOU: 'Planejou',
  ESTORNOU: 'Estornou',
  // 3.2
  GEROU_LOTES: 'Gerou os lotes da',
  // 3.3: a cozinha pega o lote; quem pegou (ou a gerência) solta; a gerência passa para outra pessoa.
  PEGOU: 'Pegou',
  SOLTOU: 'Soltou',
  REATRIBUIU: 'Passou',
  // I.1a: categorias de insumo e a classificação dos insumos.
  RENOMEOU: 'Renomeou',
  REORDENOU: 'Reordenou',
  CONCILIOU: 'Conciliou',
  LIGOU: 'Ligou',
  CLASSIFICOU: 'Classificou',
  RECLASSIFICOU: 'Reclassificou',
};

/** I.1b: a palavra do custo que ninguém informou. Nunca "R$ 0,00": custo incompleto não é custo baixo. */
const SEM_CUSTO = CUSTO_NAO_INFORMADO;

/**
 * I.1b: no INSUMO, o que fica gravado nele é o custo INICIAL DE REFERÊNCIA (o que vale até a primeira compra lançada) e o
 * prazo de uso depois de aberto; o preço efetivamente pago mora nas notas de compra, não aqui. Os rótulos dizem isso.
 */
const CAMPO_DO_INSUMO: Record<string, string> = {
  precoEmbalagemCentavos: 'custo inicial de referência',
  custoPorUnidade: 'custo de referência por unidade',
  custoPorUnidadeCentavos: 'custo de referência por unidade',
};

const CAMPO: Record<string, string> = {
  nome: 'nome',
  slug: 'link',
  status: 'status',
  unidade: 'unidade',
  conteudoMilesimos: 'embalagem',
  precoEmbalagemCentavos: 'preço',
  taxaEntregaCentavos: 'frete',
  custoPorUnidade: 'custo por unidade',
  // Linhas gravadas antes do custo exato (centavos inteiros por unidade).
  custoPorUnidadeCentavos: 'custo por unidade',
  tipo: 'tipo',
  // I.1a
  categoria: 'categoria',
  posicao: 'posição na lista',
  classificadoPor: 'como foi classificada',
  loteDaClassificacao: 'lote da classificação',
  conservacao: 'conservação',
  validade: 'validade',
  // I.1b: o insumo comprado guarda o prazo depois de aberto (o pré-preparo e a ficha seguem em `validade`).
  prazoAposAbertura: 'prazo de uso após abertura',
  codigoBarras: 'código de barras',
  // I.1b
  marcaReferencia: 'marca de referência',
  ativo: 'situação',
  insumo: 'insumo',
  contado: 'contado',
  contados: 'contados',
  zerados: 'contados com zero',
  naoContados: 'não contados (entraram com zero)',
  semCusto: 'sem custo informado (valor pendente)',
  // I.2a: o estoque guardado insumo por insumo (base do CMV real por categoria).
  retratoPorInsumo: 'estoque guardado por insumo',
  valorCentavos: 'valor do estoque',
  email: 'e-mail',
  linkValeAte: 'link vale até',
  senha: 'senha',
  aparelho: 'aparelho',
  perfil: 'perfil',
  setores: 'setores',
  lojas: 'lojas',
  permissoesExtras: 'pode a mais',
  permissoesRemovidas: 'tirado do perfil',
  permissoes: 'permissões',
  base: 'copiado de',
  incluiu: 'incluiu',
  tirou: 'tirou',
  tentativas: 'tentativas',
  rendimento: 'rende',
  descricao: 'descrição',
  modoPreparo: 'modo de preparo',
  foto: 'foto',
  itens: 'insumos',
  fichaQueProduz: 'vem da ficha',
  // 1.5: nota e fornecedor
  fornecedor: 'fornecedor',
  loja: 'loja',
  data: 'data da nota',
  freteNotaCentavos: 'frete',
  totalCentavos: 'total',
  itensDaNota: 'itens',
  situacao: 'situação',
  documento: 'CNPJ/CPF',
  contato: 'contato',
  // F.1a: cadastro do fornecedor e CNPJ da loja
  razaoSocial: 'razão social',
  inscricaoEstadual: 'inscrição estadual',
  endereco: 'endereço',
  municipio: 'município',
  uf: 'UF',
  cep: 'CEP',
  whatsapp: 'WhatsApp',
  contatoComercial: 'contato comercial',
  prazoPagamento: 'prazo de pagamento',
  semNotaFiscal: 'compras sem nota fiscal',
  cadastro: 'cadastro',
  cnpj: 'CNPJ',
  // F.1b: nota fiscal recebida por XML e a memória de cada item do fornecedor
  emitente: 'emitente',
  chaveDeAcesso: 'chave de acesso',
  veioDoXml: 'veio do XML',
  notaDeCompra: 'nota de compra',
  itensVinculados: 'itens ligados',
  itemDoFornecedor: 'item do fornecedor',
  embalagemEscolhida: 'embalagem',
  fatorPorUnidade: 'embalagens por unidade da nota',
  // 1.7: contagem do dia a dia e regras da loja
  prazo: 'prazo',
  ajustes: 'ajustes no estoque',
  sobrou: 'sobrou (R$)',
  faltou: 'faltou (R$)',
  naoAjustados: 'sem contar (sem ajuste)',
  recontadosDepois: 'recontados depois em outra contagem',
  estoqueFinal: 'estoque final',
  cobertura: 'cobertura do período',
  pisoDoFechamento: 'piso do fechamento',
  frequencia: 'frequência da contagem',
  tolerancia: 'tolerância para fechar sozinha',
  // 1.8: requisição
  setor: 'setor',
  paraQuando: 'para quando',
  pedido: 'pedido',
  ficha: 'puxada da ficha',
  observacao: 'observação',
  saiu: 'saiu do estoque',
  corte: 'encerrada sem sair (corte)',
  negativo: 'saldo negativo (entregue mesmo assim)',
  voltou: 'voltou para o estoque',
  // 3.1: produção (lote)
  lote: 'lote',
  requisicaoDoLote: 'requisição dos insumos',
  planejado: 'planejado',
  produzido: 'saiu',
  rendimentoDoLote: 'rendimento',
  motivoDaDiferenca: 'motivo da diferença',
  validadeDoLote: 'validade do lote',
  entrouNoEstoque: 'entrou no estoque',
  estornoDoLote: 'voltou do estoque',
  custoDoLote: 'custo do lote',
  perdaEmReais: 'o que a diferença custou',
  // 3.2: a lista do dia
  producaoDoDia: 'o que produzir',
  lotesGerados: 'lotes gerados',
  daLista: 'da lista',
  // 3.3: quem está com o lote
  responsavel: 'quem faz',
  feitoPor: 'quem fez',
  pegoPor: 'pego por',
  // 1.9: custo por canal
  embalagensDelivery: 'embalagens do delivery',
  embalagensIfood: 'embalagens do iFood',
  comissao: 'comissão',
  pagamento: 'pagamento online',
  // 1.10: preço e margem por canal (na ficha) e margem-alvo (no canal)
  precoLoja: 'preço na loja',
  precoDelivery: 'preço no delivery',
  precoIfood: 'preço no iFood',
  margemLoja: 'margem líquida na loja',
  margemDelivery: 'margem líquida no delivery',
  margemIfood: 'margem líquida no iFood',
  custoLoja: 'custo da loja na hora',
  custoDelivery: 'custo do delivery na hora',
  custoIfood: 'custo do iFood na hora',
  margemAlvo: 'margem-alvo',
  // 2.1: faturamento por canal e dia, e os canais em que a loja vende
  faturamentoCentavos: 'faturamento',
  pedidos: 'pedidos',
  clientes: 'clientes',
  origem: 'origem',
  canaisDeVenda: 'canais de venda',
  // 2.2a: despesa, plano de contas e regra do período
  linhaDoDre: 'linha do DRE',
  linhaVisivel: 'aparece em Lançar despesa',
  despesaCentavos: 'valor',
  repeteTodoMes: 'repete todo mês',
  competencia: 'competência',
  vencimento: 'vencimento',
  pagaEm: 'paga em',
  grupo: 'grupo',
  regra: 'regra',
  valeDesde: 'vale a partir de',
  // 2.2b: metas e fechamento do período
  meta: 'meta',
  versaoDoFechamento: 'versão do fechamento',
  receitaBruta: 'receita bruta',
  resultado: 'resultado',
  ressalvas: 'ressalvas',
  cmv: 'CMV',
};

/** Retrato do instante (1.10): o custo do canal quando o preço mudou. Vai só no depois e sempre aparece. 3.3: quem fez o lote, na conclusão. */
const NA_HORA = new Set(['custoLoja', 'custoDelivery', 'custoIfood', 'feitoPor']);

/** Ordem de leitura dos campos conhecidos; os outros vêm depois, como vieram. */
const ORDEM = [
  'nome',
  'categoria',
  'posicao',
  'classificadoPor',
  'loteDaClassificacao',
  'producaoDoDia',
  'lotesGerados',
  'pegoPor',
  'responsavel',
  'feitoPor',
  'tipo',
  'planejado',
  'requisicaoDoLote',
  'produzido',
  'rendimentoDoLote',
  'motivoDaDiferenca',
  'custoDoLote',
  'perdaEmReais',
  'validadeDoLote',
  'entrouNoEstoque',
  'estornoDoLote',
  'rendimento',
  'descricao',
  'foto',
  'itens',
  'embalagensDelivery',
  'embalagensIfood',
  'comissao',
  'pagamento',
  'margemAlvo',
  'precoLoja',
  'margemLoja',
  'custoLoja',
  'precoDelivery',
  'margemDelivery',
  'custoDelivery',
  'precoIfood',
  'margemIfood',
  'custoIfood',
  'faturamentoCentavos',
  'pedidos',
  'clientes',
  'origem',
  'canaisDeVenda',
  'linhaDoDre',
  'grupo',
  'linhaVisivel',
  'despesaCentavos',
  'competencia',
  'repeteTodoMes',
  'vencimento',
  'pagaEm',
  'regra',
  'meta',
  'valeDesde',
  'modoPreparo',
  'conservacao',
  'validade',
  'prazoAposAbertura',
  'unidade',
  'conteudoMilesimos',
  'precoEmbalagemCentavos',
  'taxaEntregaCentavos',
  'custoPorUnidade',
  'custoPorUnidadeCentavos',
  'marcaReferencia',
  'codigoBarras',
  'fichaQueProduz',
  'documento',
  'razaoSocial',
  'inscricaoEstadual',
  'semNotaFiscal',
  'endereco',
  'municipio',
  'uf',
  'cep',
  'contatoComercial',
  'whatsapp',
  'email',
  'prazoPagamento',
  'cadastro',
  'contato',
  'cnpj',
  'loja',
  'fornecedor',
  'emitente',
  'itemDoFornecedor',
  'embalagemEscolhida',
  'fatorPorUnidade',
  'chaveDeAcesso',
  'veioDoXml',
  'notaDeCompra',
  'itensVinculados',
  'data',
  'itensDaNota',
  'freteNotaCentavos',
  'totalCentavos',
  'situacao',
  'versaoDoFechamento',
  'receitaBruta',
  'resultado',
  'cmv',
  'ressalvas',
  'ativo',
];
const posicao = (c: string) => (ORDEM.includes(c) ? ORDEM.indexOf(c) : ORDEM.length);

const STATUS: Record<string, string> = {
  ATIVO: 'Ativo',
  RASCUNHO: 'Rascunho',
  SUSPENSO: 'Suspenso',
  DESATIVADO: 'Desativado',
};

const SITUACAO_DA_NOTA: Record<string, string> = { LANCADA: 'Lançada', CANCELADA: 'Cancelada', RASCUNHO: 'Rascunho' };

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function rotuloEntidade(entidade: string): string {
  return ENTIDADE[entidade] ?? entidade;
}

export function rotuloAcao(acao: string): string {
  return ACAO[acao] ?? acao.charAt(0) + acao.slice(1).toLowerCase();
}

function valor(campo: string, v: unknown): string {
  // Preço 0 é "ainda não sei o preço": nunca R$ 0,00 (custo incompleto ≠ custo baixo).
  if (campo === 'precoEmbalagemCentavos' && v === 0) return SEM_CUSTO;
  if ((campo === 'taxaEntregaCentavos' || campo === 'freteNotaCentavos') && v === 0) return 'Sem frete';
  if (campo === 'situacao' && typeof v === 'string') return SITUACAO_DA_NOTA[v] ?? v;
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'tipo' && typeof v === 'string') {
    return TIPOS[v as keyof typeof TIPOS] ?? TIPOS_DE_FICHA[v as keyof typeof TIPOS_DE_FICHA] ?? v;
  }
  if (campo === 'conservacao' && typeof v === 'string') return CONSERVACOES[v as keyof typeof CONSERVACOES] ?? v;
  if (campo === 'unidade' && typeof v === 'string') return UNIDADES[v as Unidade]?.nome ?? v;
  if (campo === 'ativo' && typeof v === 'boolean') return v ? 'Ativo' : 'Desativado';
  if (campo === 'classificadoPor' && typeof v === 'string') return COMO_CLASSIFICOU[v] ?? v;
  if (campo === 'posicao' && typeof v === 'number') return `${v}ª`;
  if (campo === 'status' && typeof v === 'string') return STATUS[v] ?? v;
  if (campo.endsWith('Ate') && typeof v === 'string' && !Number.isNaN(Date.parse(v))) {
    return DATA_HORA.format(new Date(v)).replace(',', ' às');
  }
  if (campo.endsWith('Centavos') && typeof v === 'number') return formatarDinheiro(v);
  if (campo.endsWith('Milesimos') && typeof v === 'number') {
    return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }
  const t = String(v);
  // Texto longo (modo de preparo, lista de insumos): a linha do histórico mostra o começo.
  return t.length > LIMITE_DO_TEXTO ? `${t.slice(0, LIMITE_DO_TEXTO).trimEnd()}…` : t;
}

const LIMITE_DO_TEXTO = 160;

function objeto(j: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

/** `{ centavos, milesimos }` gravado no histórico → custo; qualquer outra coisa = sem preço. */
function custoExato(v: unknown): CustoExato | null {
  const o = v as { centavos?: unknown; milesimos?: unknown } | null;
  return o && Number.isSafeInteger(o.centavos) && Number.isSafeInteger(o.milesimos) && (o.milesimos as number) > 0
    ? { centavos: o.centavos as number, milesimos: o.milesimos as number }
    : null;
}

export interface Mudanca {
  campo: string;
  antes: string | null;
  depois: string;
}

/** Só os campos que mudaram (ou, numa criação, o que nasceu). */
export function descreverMudancas(antesJ: Prisma.JsonValue | null, depoisJ: Prisma.JsonValue | null, entidade?: string): Mudanca[] {
  const antes = objeto(antesJ);
  const depois = objeto(depoisJ);
  const campos = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]));
  const criacao = Object.keys(antes).length === 0;
  // I.1b: só no histórico do INSUMO (não no da outra embalagem nem no da ficha) os rótulos de custo e prazo mudam.
  const doInsumo = entidade === 'Insumo';
  const rotulo = (c: string) => (doInsumo ? CAMPO_DO_INSUMO[c] : undefined) ?? CAMPO[c] ?? c;
  // Quantidade com unidade junto ("1,5 kg") quando a linha diz a unidade; aí a
  // unidade não precisa de linha própria.
  const unidade = (o: Record<string, unknown>) =>
    typeof o.unidade === 'string' && o.unidade in UNIDADES ? (o.unidade as Unidade) : null;
  const juntarUnidade = campos.includes('conteudoMilesimos') && !!unidade(depois);
  const fmt = (c: string, o: Record<string, unknown>) => {
    if (c === 'conteudoMilesimos' && juntarUnidade && typeof o[c] === 'number' && unidade(o)) {
      return formatarQuantidade(o[c] as number, unidade(o)!);
    }
    // Foto: o nome do arquivo é sorteado, não é informação. Diz se tem e se trocou.
    if (c === 'foto') return typeof o[c] === 'string' ? (o === antes && !criacao ? 'foto anterior' : criacao ? 'com foto' : 'foto nova') : 'sem foto';
    // Custo de referência: a MESMA frase da tela ("R$ 18,98/kg", "R$ 0,004/un" ou "Custo não informado").
    if (c === 'custoPorUnidade' && unidade(o)) return formatarCusto(custoExato(o[c]), unidade(o)!);
    if (c === 'custoPorUnidadeCentavos' && unidade(o) && (o[c] === null || typeof o[c] === 'number')) {
      return o[c] === null ? SEM_CUSTO : `${formatarDinheiro(o[c] as number)}/${UNIDADES[unidade(o)!].sigla}`;
    }
    return valor(c, o[c]);
  };
  // O Postgres (jsonb) não guarda a ordem das chaves: a leitura segue a da tela.
  campos.sort((x, y) => posicao(x) - posicao(y));
  const out: Mudanca[] = [];
  for (const c of campos) {
    // Na criação, campo vazio não é informação ("código de barras: —").
    if (criacao && (depois[c] === null || depois[c] === undefined || depois[c] === '')) continue;
    // Preço do canal (1.10): de/para o sugerido em frase, sem riscar o sugerido ("R$ 29,90 (o sugerido era R$ 87,06)").
    if (!criacao && /^preco(Loja|Delivery|Ifood)$/.test(c) && typeof antes[c] === 'string' && typeof depois[c] === 'string') {
      const sugerido = (t: string) => /^sugerido \((.+)\)$/.exec(t)?.[1];
      const a = sugerido(antes[c] as string);
      const d = sugerido(depois[c] as string);
      if (a && !d) {
        out.push({ campo: CAMPO[c], antes: null, depois: `${depois[c]} (o sugerido era ${a})` });
        continue;
      }
      if (d && !a) {
        out.push({ campo: CAMPO[c], antes: antes[c] as string, depois: `o sugerido, ${d}` });
        continue;
      }
    }
    if (NA_HORA.has(c) && typeof depois[c] === 'string') {
      out.push({ campo: CAMPO[c], antes: null, depois: depois[c] as string });
      continue;
    }
    if (!criacao && JSON.stringify(antes[c]) === JSON.stringify(depois[c])) continue;
    if (c === 'unidade' && juntarUnidade && criacao) continue;
    // De quem é a embalagem (ou o lançamento de faturamento) já está no "alvo" da linha.
    if (c === 'insumo' || c === 'alvo' || c === 'faturamentoLojaId' || c === 'faturamentoDia') continue;
    // I.1a: o id da categoria é técnico (o "excluir categoria" o confere); a tela mostra o nome.
    if (c === 'categoriaId') continue;
    // Itens da nota (1.5): o que entrou e o que saiu (uma linha mudada sai e entra de novo).
    if (c === 'itensDaNota' && typeof depois[c] === 'string') {
      const a = new Set(criacao || typeof antes[c] !== 'string' ? [] : (antes[c] as string).split(SEPARADOR_DE_ITENS));
      const d = (depois[c] as string).split(SEPARADOR_DE_ITENS);
      const entrou = d.filter((x) => !a.has(x));
      const saiu = Array.from(a).filter((x) => !d.includes(x));
      if (criacao) out.push({ campo: 'itens', antes: null, depois: d.join(' · ') });
      else {
        if (entrou.length) out.push({ campo: 'entrou', antes: null, depois: entrou.join(' · ') });
        if (saiu.length) out.push({ campo: 'saiu', antes: null, depois: saiu.join(' · ') });
      }
      continue;
    }
    // Embalagens por canal (1.9): a mesma leitura dos itens, dizendo de qual canal ("embalagens do iFood · entrou").
    if ((c === 'embalagensDelivery' || c === 'embalagensIfood') && !criacao && typeof antes[c] === 'string' && typeof depois[c] === 'string') {
      // 1.10 (herança b da 1.9): de/para "Nenhuma" também é só o que entrou ou saiu, não a lista inteira.
      const itens = mudancasDosItens(antes[c] === SEM_EMBALAGEM ? '' : (antes[c] as string), depois[c] === SEM_EMBALAGEM ? '' : (depois[c] as string));
      if (itens) {
        out.push(...itens.map((m) => ({ ...m, campo: `${CAMPO[c]} · ${m.campo}` })));
        continue;
      }
    }
    // Itens da ficha (1.4): o que entrou, saiu e mudou, em vez de lista velha × lista nova. 3.2: a lista do dia também.
    if ((c === 'itens' || c === 'producaoDoDia') && !criacao && typeof antes[c] === 'string' && typeof depois[c] === 'string') {
      const itens = mudancasDosItens(antes[c] as string, depois[c] as string);
      if (itens) {
        out.push(...itens);
        continue;
      }
    }
    out.push({
      campo: rotulo(c),
      antes: criacao ? null : fmt(c, antes),
      depois: fmt(c, depois),
    });
  }
  return out;
}

/** "Cebola 300 g (fator 1,18)" → nome e o resto ("300 g (fator 1,18)"); fora do formato, null. */
const ITEM_EM_TEXTO = /^(.+?) (\d[\d.]*(?:,\d+)? (?:g|kg|ml|L|un)(?: \(fator [\d.,]+\))?)$/;

/**
 * Itens da ficha antes e depois (a frase "A 1 un · B 180 g") → o que entrou,
 * o que saiu e o que mudou de quantidade/fator, um por linha. Texto que não
 * segue o formato (linha antiga, nome estranho) → null: a tela mostra a lista
 * inteira como antes.
 */
export function mudancasDosItens(antes: string, depois: string): Mudanca[] | null {
  const ler = (t: string) => {
    if (t === '') return new Map<string, string>();
    const lista = t.split(' · ').map((x) => ITEM_EM_TEXTO.exec(x));
    if (lista.some((m) => !m)) return null;
    return new Map(lista.map((m) => [m![1], m![2]]));
  };
  const a = ler(antes);
  const d = ler(depois);
  const tamanho = (t: string) => (t === '' ? 0 : t.split(' · ').length);
  if (!a || !d || a.size !== tamanho(antes) || d.size !== tamanho(depois)) return null;
  const entrou = [...d].filter(([n]) => !a.has(n)).map(([n, q]) => `${n} ${q}`);
  const saiu = [...a].filter(([n]) => !d.has(n)).map(([n, q]) => `${n} ${q}`);
  const out: Mudanca[] = [];
  if (entrou.length) out.push({ campo: 'entrou', antes: null, depois: entrou.join(' · ') });
  if (saiu.length) out.push({ campo: 'saiu', antes: null, depois: saiu.join(' · ') });
  for (const [n, q] of d) if (a.has(n) && a.get(n) !== q) out.push({ campo: n, antes: a.get(n)!, depois: q });
  if (out.length === 0) out.push({ campo: 'insumos', antes: null, depois: 'mesma receita, outra ordem' });
  return out;
}

/**
 * De quem é a linha ("Pão brioche", "Pão brioche · Caixa 10 un"): sai do nome
 * gravado no retrato (depois, ou antes numa exclusão). Sem nome, null.
 */
export function alvoDaLinha(antesJ: Prisma.JsonValue | null, depoisJ: Prisma.JsonValue | null): string | null {
  const o = { ...objeto(antesJ), ...objeto(depoisJ) };
  const partes = [o.insumo, o.nome, o.alvo].filter((x): x is string => typeof x === 'string' && x.length > 0);
  return partes.length ? partes.join(' · ') : null;
}

/**
 * Precificação (1.10, veto do Guardião): quem não tem "ver preços e margens"
 * não recebe NADA de preço, margem, custo do canal, taxa ou alvo — nem no
 * histórico. As linhas de `CanalConfig` (taxa do iFood, margens-alvo) somem
 * inteiras; da ficha saem os campos de preço por canal, o custo na hora e as
 * embalagens por canal (a tela delas também é de quem vê preços). Uma
 * alteração que só tinha esses campos some inteira. Filtro no servidor, antes
 * de montar a tela: o payload não leva o que foi tirado.
 */
export const ENTIDADES_DE_PRECIFICACAO: readonly string[] = ['CanalConfig'];

/**
 * Faturamento (2.1, lição da decisão 90): quem não tem `faturamento.ver` não
 * recebe NADA de faturamento no histórico, em lista nenhuma. O filtro é no
 * servidor, na consulta: o payload não leva a linha.
 */
export const ENTIDADES_DE_FATURAMENTO: readonly string[] = ['FaturamentoLancamento'];

/**
 * DRE e despesas (2.2a, lição das decisões 90 e 133): quem não tem `dre.ver` não recebe
 * NADA disso no histórico — despesa (valor, loja, quem lançou), linha do plano, regra do
 * período, período e (2.2b) metas e fotografia. Filtro no servidor, na consulta: o payload
 * não leva a linha. `verDre` ausente = fechado.
 */
export const ENTIDADES_DE_DRE: readonly string[] = ['Despesa', 'DreLinha', 'DreMeta', 'MetaCmvConjunto', 'CategoriaNaLoja', 'RegraDoPeriodo', 'PeriodoApuracao', 'DreFotografia'];

/**
 * Custo do lote (3.1, lição da decisão 90): o histórico do lote cita o custo e o que a diferença de rendimento custou. Só
 * quem tem `insumos.ver` ("Ver insumos e custos") os recebe; sem ele, esses campos saem da linha no servidor, antes de
 * montar a tela, e a alteração que só tinha isso some. `verCustos` ausente = fechado.
 */
export const CAMPOS_DE_CUSTO_DA_PRODUCAO: ReadonlySet<string> = new Set(['custoDoLote', 'perdaEmReais']);

/** O retrato do lote sem o custo; null = só tinha isso (a linha some). */
export function semCustoDaProducao(antes: Prisma.JsonValue | null, depois: Prisma.JsonValue | null): { antes: Prisma.JsonValue | null; depois: Prisma.JsonValue | null } | null {
  const a = objeto(antes);
  const d = objeto(depois);
  if (![...Object.keys(a), ...Object.keys(d)].some((k) => CAMPOS_DE_CUSTO_DA_PRODUCAO.has(k))) return { antes, depois };
  const limpar = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !CAMPOS_DE_CUSTO_DA_PRODUCAO.has(k))) as Prisma.JsonObject;
  const r = { antes: antes === null ? null : limpar(a), depois: depois === null ? null : limpar(d) };
  return descreverMudancas(r.antes, r.depois).length ? r : null;
}
export const CAMPOS_DE_PRECIFICACAO: ReadonlySet<string> = new Set([
  'precoLoja',
  'precoDelivery',
  'precoIfood',
  'margemLoja',
  'margemDelivery',
  'margemIfood',
  'custoLoja',
  'custoDelivery',
  'custoIfood',
  'embalagensDelivery',
  'embalagensIfood',
  'margemAlvo',
  'comissao',
  'pagamento',
]);

/** O retrato sem os campos de precificação; null = só tinha isso (a linha some). */
export function semPrecificacao(antes: Prisma.JsonValue | null, depois: Prisma.JsonValue | null): { antes: Prisma.JsonValue | null; depois: Prisma.JsonValue | null } | null {
  const a = objeto(antes);
  const d = objeto(depois);
  const tinha = [...Object.keys(a), ...Object.keys(d)].some((k) => CAMPOS_DE_PRECIFICACAO.has(k));
  if (!tinha) return { antes, depois };
  const limpar = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !CAMPOS_DE_PRECIFICACAO.has(k))) as Prisma.JsonObject;
  const r = { antes: antes === null ? null : limpar(a), depois: depois === null ? null : limpar(d) };
  return descreverMudancas(r.antes, r.depois).length ? r : null;
}

export async function listarHistorico(
  cliente: ClienteDoParceiro,
  filtro: {
    entidade?: string;
    entidades?: string[];
    limite?: number;
    /** Só destas linhas (ex.: o insumo e as embalagens dele). */
    de?: { entidade: string; ids: string[] }[];
    /** Nunca estas entidades (1.5: notas e fornecedores para quem não vê compras). */
    semEntidades?: string[];
    /**
     * 1.10: quem lê pode ver preços e margens (`precos.ver`)? Obrigatório: todo
     * leitor decide. false = sem taxa, alvo, preço, margem, custo do canal.
     */
    verPrecos: boolean;
    /**
     * 2.1: quem lê pode ver faturamento (`faturamento.ver`)? Sem isto, as
     * linhas de `FaturamentoLancamento` (valor, pedidos, clientes, quem lançou)
     * não saem do servidor. Fecha para quem esquece: ausente = não vê.
     */
    verFaturamento?: boolean;
    /**
     * 2.2a: quem lê pode ver o DRE (`dre.ver`)? Sem isto, despesas, linhas do plano e a
     * regra do período não saem do servidor. Fecha para quem esquece: ausente = não vê.
     */
    verDre?: boolean;
    /**
     * 3.1: quem lê pode ver custos (`insumos.ver`)? Sem isto, o custo do lote e o que a diferença de rendimento custou não saem
     * do servidor. Fecha para quem esquece: ausente = não vê.
     */
    verCustos?: boolean;
    /** 2.1: só as alterações de faturamento desta loja neste dia (inclusive de lançamento já removido). */
    faturamentoDoDia?: { lojaId: string; dia: string };
  },
) {
  const entidades = filtro.entidades ?? (filtro.entidade ? [filtro.entidade] : null);
  const fora = [
    ...(filtro.semEntidades ?? []),
    ...(filtro.verPrecos ? [] : ENTIDADES_DE_PRECIFICACAO),
    ...(filtro.verFaturamento === true ? [] : ENTIDADES_DE_FATURAMENTO),
    ...(filtro.verDre === true ? [] : ENTIDADES_DE_DRE),
  ];
  const limite = filtro.limite ?? 100;
  const where = {
    ...(entidades ? { entidade: { in: entidades } } : {}),
    ...(fora.length ? { NOT: { entidade: { in: fora } } } : {}),
    ...(filtro.de ? { OR: filtro.de.map((d) => ({ entidade: d.entidade, entidadeId: { in: d.ids } })) } : {}),
    ...(filtro.faturamentoDoDia
      ? {
          entidade: 'FaturamentoLancamento',
          OR: ['antes', 'depois'].map((lado) => ({
            AND: [
              { [lado]: { path: ['faturamentoLojaId'], equals: filtro.faturamentoDoDia!.lojaId } },
              { [lado]: { path: ['faturamentoDia'], equals: filtro.faturamentoDoDia!.dia } },
            ],
          })),
        }
      : {}),
  };
  const out: ReturnType<typeof paraTela>[] = [];
  // Sem `precos.ver`, linhas que só tinham preço somem: lê mais um lote até completar o limite (no máximo 5 voltas).
  for (let volta = 0, pular = 0; volta < 5 && out.length < limite; volta++) {
    const lote = await cliente.historicoAlteracao.findMany({ where, orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }], skip: pular, take: limite });
    pular += lote.length;
    for (const h of lote) {
      let r = filtro.verPrecos ? { antes: h.antes, depois: h.depois } : semPrecificacao(h.antes, h.depois);
      if (r && filtro.verCustos !== true && h.entidade === 'OrdemProducao') r = semCustoDaProducao(r.antes, r.depois);
      if (r && out.length < limite) out.push(paraTela(h, r.antes, r.depois));
    }
    if (lote.length < limite || (filtro.verPrecos && filtro.verCustos === true)) break;
  }
  return out;
}

function paraTela(
  h: { id: string; entidade: string; acao: string; motivo: string | null; autorNome: string; ocorridoEm: Date },
  antes: Prisma.JsonValue | null,
  depois: Prisma.JsonValue | null,
) {
  return {
    id: h.id,
    entidade: h.entidade,
    acao: h.acao,
    motivo: h.motivo,
    autorNome: h.autorNome,
    ocorridoEm: h.ocorridoEm,
    alvo: alvoDaLinha(antes, depois),
    mudancas: descreverMudancas(antes, depois, h.entidade),
  };
}

export type LinhaDeHistorico = Awaited<ReturnType<typeof listarHistorico>>[number];
