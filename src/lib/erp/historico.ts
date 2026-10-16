/**
 * Leitura do `HistoricoAlteracao` para a tela: o que mudou, de quanto para
 * quanto, quem e quando. Puro na formatação (testável sem banco).
 */

import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { CONSERVACOES, TIPOS } from './insumo-campos';
import { TIPOS_DE_FICHA } from './ficha-campos';
import { SEPARADOR_DE_ITENS } from './compra-campos';
import { UNIDADES, formatarCusto, formatarDinheiro, formatarQuantidade, type CustoExato, type Unidade } from './unidades';

const ENTIDADE: Record<string, string> = {
  ParceiroFlow: 'Parceiro',
  Loja: 'Loja',
  Marca: 'Marca',
  Insumo: 'Insumo',
  // "Variante" é palavra de sistema; na tela é outra embalagem de compra do insumo.
  InsumoVariante: 'Embalagem',
  FichaTecnica: 'Ficha técnica',
  // 1.5
  NotaEntrada: 'Nota de compra',
  Contagem: 'Estoque',
  ContagemItem: 'Contagem',
  // 1.8
  Requisicao: 'Requisição',
  // 1.9: a taxa do iFood do parceiro.
  CanalConfig: 'Canal de venda',
  Fornecedor: 'Fornecedor',
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
  conservacao: 'conservação',
  validade: 'validade',
  codigoBarras: 'código de barras',
  ativo: 'situação',
  insumo: 'insumo',
  contado: 'contado',
  contados: 'contados',
  zerados: 'contados com zero',
  naoContados: 'não contados (entraram com zero)',
  semCusto: 'sem preço (valor pendente)',
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
  // 1.9: custo por canal
  embalagensDelivery: 'embalagens do delivery',
  embalagensIfood: 'embalagens do iFood',
  comissao: 'comissão',
  pagamento: 'pagamento online',
};

/** Ordem de leitura dos campos conhecidos; os outros vêm depois, como vieram. */
const ORDEM = [
  'nome',
  'tipo',
  'rendimento',
  'descricao',
  'foto',
  'itens',
  'embalagensDelivery',
  'embalagensIfood',
  'comissao',
  'pagamento',
  'modoPreparo',
  'conservacao',
  'validade',
  'unidade',
  'conteudoMilesimos',
  'precoEmbalagemCentavos',
  'taxaEntregaCentavos',
  'custoPorUnidade',
  'custoPorUnidadeCentavos',
  'codigoBarras',
  'fichaQueProduz',
  'documento',
  'contato',
  'loja',
  'fornecedor',
  'data',
  'itensDaNota',
  'freteNotaCentavos',
  'totalCentavos',
  'situacao',
  'ativo',
];
const posicao = (c: string) => (ORDEM.includes(c) ? ORDEM.indexOf(c) : ORDEM.length);

const STATUS: Record<string, string> = {
  ATIVO: 'Ativo',
  RASCUNHO: 'Aguardando liberação',
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
  if (campo === 'precoEmbalagemCentavos' && v === 0) return 'Sem preço';
  if ((campo === 'taxaEntregaCentavos' || campo === 'freteNotaCentavos') && v === 0) return 'Sem frete';
  if (campo === 'situacao' && typeof v === 'string') return SITUACAO_DA_NOTA[v] ?? v;
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'tipo' && typeof v === 'string') {
    return TIPOS[v as keyof typeof TIPOS] ?? TIPOS_DE_FICHA[v as keyof typeof TIPOS_DE_FICHA] ?? v;
  }
  if (campo === 'conservacao' && typeof v === 'string') return CONSERVACOES[v as keyof typeof CONSERVACOES] ?? v;
  if (campo === 'unidade' && typeof v === 'string') return UNIDADES[v as Unidade]?.nome ?? v;
  if (campo === 'ativo' && typeof v === 'boolean') return v ? 'Ativo' : 'Desativado';
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
export function descreverMudancas(antesJ: Prisma.JsonValue | null, depoisJ: Prisma.JsonValue | null): Mudanca[] {
  const antes = objeto(antesJ);
  const depois = objeto(depoisJ);
  const campos = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]));
  const criacao = Object.keys(antes).length === 0;
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
    // Custo de referência: a MESMA frase da tela ("R$ 18,98/kg", "R$ 0,004/un" ou "Sem preço").
    if (c === 'custoPorUnidade' && unidade(o)) return formatarCusto(custoExato(o[c]), unidade(o)!);
    if (c === 'custoPorUnidadeCentavos' && unidade(o) && (o[c] === null || typeof o[c] === 'number')) {
      return o[c] === null ? 'Sem preço' : `${formatarDinheiro(o[c] as number)}/${UNIDADES[unidade(o)!].sigla}`;
    }
    return valor(c, o[c]);
  };
  // O Postgres (jsonb) não guarda a ordem das chaves: a leitura segue a da tela.
  campos.sort((x, y) => posicao(x) - posicao(y));
  const out: Mudanca[] = [];
  for (const c of campos) {
    // Na criação, campo vazio não é informação ("código de barras: —").
    if (criacao && (depois[c] === null || depois[c] === undefined || depois[c] === '')) continue;
    if (!criacao && JSON.stringify(antes[c]) === JSON.stringify(depois[c])) continue;
    if (c === 'unidade' && juntarUnidade && criacao) continue;
    // De quem é a embalagem já está no "alvo" da linha.
    if (c === 'insumo') continue;
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
      const itens = mudancasDosItens(antes[c] as string, depois[c] as string);
      if (itens) {
        out.push(...itens.map((m) => ({ ...m, campo: `${CAMPO[c]} · ${m.campo}` })));
        continue;
      }
    }
    // Itens da ficha (1.4): o que entrou, saiu e mudou, em vez de lista velha × lista nova.
    if (c === 'itens' && !criacao && typeof antes[c] === 'string' && typeof depois[c] === 'string') {
      const itens = mudancasDosItens(antes[c] as string, depois[c] as string);
      if (itens) {
        out.push(...itens);
        continue;
      }
    }
    out.push({
      campo: CAMPO[c] ?? c,
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
    const lista = t.split(' · ').map((x) => ITEM_EM_TEXTO.exec(x));
    if (lista.some((m) => !m)) return null;
    return new Map(lista.map((m) => [m![1], m![2]]));
  };
  const a = ler(antes);
  const d = ler(depois);
  if (!a || !d || a.size !== antes.split(' · ').length || d.size !== depois.split(' · ').length) return null;
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
  const partes = [o.insumo, o.nome].filter((x): x is string => typeof x === 'string' && x.length > 0);
  return partes.length ? partes.join(' · ') : null;
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
  } = {},
) {
  const entidades = filtro.entidades ?? (filtro.entidade ? [filtro.entidade] : null);
  const linhas = await cliente.historicoAlteracao.findMany({
    where: {
      ...(entidades ? { entidade: { in: entidades } } : {}),
      ...(filtro.semEntidades?.length ? { NOT: { entidade: { in: filtro.semEntidades } } } : {}),
      ...(filtro.de ? { OR: filtro.de.map((d) => ({ entidade: d.entidade, entidadeId: { in: d.ids } })) } : {}),
    },
    orderBy: { ocorridoEm: 'desc' },
    take: filtro.limite ?? 100,
  });
  return linhas.map((h) => ({
    id: h.id,
    entidade: h.entidade,
    acao: h.acao,
    motivo: h.motivo,
    autorNome: h.autorNome,
    ocorridoEm: h.ocorridoEm,
    alvo: alvoDaLinha(h.antes, h.depois),
    mudancas: descreverMudancas(h.antes, h.depois),
  }));
}

export type LinhaDeHistorico = Awaited<ReturnType<typeof listarHistorico>>[number];
