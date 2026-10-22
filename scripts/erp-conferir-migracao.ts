/**
 * Conferência pós-deploy das migrations `20261025000000_erp_faturamento` (2.1),
 * `20261026000000_erp_dre_despesas` (2.2a), `20261027000000_erp_dre_fechamento` (2.2b), `20261028000000_erp_cmv` (2.3),
 * `20261029000000_erp_producao` (3.1), `20261030000000_erp_lista_do_dia` (3.2), `20261031000000_erp_producao_equipe` (3.3) e
 * `20261101000000_erp_insumo_categorias` (I.1a), `20261102000000_erp_insumo_clareza` + `20261102010000_erp_insumo_conservacao_confirmada` (I.1b) e
 * `20261103000000_erp_cmv_categorias` (I.2a) + `20261103010000_erp_cmv_categorias_endurecimento` e `20261104000000_erp_cmv_real_categorias` (I.2b)
 * e `20261105000000_erp_fornecedor_cadastro` (F.1a: cadastro do fornecedor e CNPJ da loja).
 *
 *   npm run erp:conferir-migracao
 *
 * As migrations são tolerantes a linha antiga: CHECK que alguma linha viola fica NOT
 * VALID e o índice único do grão humano não é criado se houver duplicidade, e
 * avisa só com WARNING no terminal de quem rodou (o log do deploy automático
 * não mostra). Este script lê o catálogo do Postgres (pg_constraint, pg_index:
 * não passam pela RLS) e lista o que ficou pendente. Sai com código 1 se houver
 * pendência, 0 se estiver tudo no lugar. Só leitura.
 *
 * Para resolver: corrija as linhas e rode `ALTER TABLE "<tabela>" VALIDATE
 * CONSTRAINT "<nome>";` (e o CREATE UNIQUE INDEX da migration, se faltar).
 */

import { PrismaClient } from '@prisma/client';
import { documentoValido, formatarDocumento } from '../src/lib/erp/compra-campos';
import { doParceiro } from '../src/lib/erp/tenant';

export const CHECKS_DA_2_1 = [
  ['FaturamentoLancamento', 'FaturamentoLancamento_valor_teto'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_pedidos_teto'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_clientes_teto'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_valor_tem_pedido'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_data_minima'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_chave_do_espaco'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_integracao_tem_ref'],
  ['FaturamentoLancamento', 'FaturamentoLancamento_textos_curtos'],
  ['Loja', 'Loja_canais_ao_menos_um'],
] as const;

export const INDICE_DO_GRAO = 'FaturamentoLancamento_grao_humano';

/** Os CHECKs que a 2.2a acrescentou em tabelas que já existiam (a tabela nova tem os dela de nascença). */
export const CHECKS_DA_2_2A = [
  ['DreLinha', 'DreLinha_nome_curto'],
  ['DreLinha', 'DreLinha_codigo_curto'],
  ['DreLinha', 'DreLinha_calculada_tem_codigo'],
  ['Despesa', 'Despesa_valor_faixa'],
  ['Despesa', 'Despesa_competencia_minima'],
  ['Despesa', 'Despesa_competencia_fim'],
  ['Despesa', 'Despesa_descricao_curta'],
  ['Despesa', 'Despesa_canal_nulo'],
  ['Despesa', 'Despesa_textos_curtos'],
  ['Despesa', 'Despesa_recorrente_de_mes_inteiro'],
] as const;

/** Os CHECKs que a 2.2b acrescentou em tabelas que já existiam (as duas tabelas novas têm os dela de nascença). */
export const CHECKS_DA_2_2B = [
  ['DreMeta', 'DreMeta_sem_meta_zera'],
  ['DreMeta', 'DreMeta_nome_curto'],
  ['PeriodoApuracao', 'PeriodoApuracao_fechado_tem_data'],
  ['PeriodoApuracao', 'PeriodoApuracao_fechadoPor_curto'],
] as const;

/** O CHECK que a 2.3 acrescentou em tabela que já existia (a coluna `itensSemPreco` da contagem). */
export const CHECKS_DA_2_3 = [['Contagem', 'Contagem_itensSemPreco_nao_negativo']] as const;

/** Os CHECKs que a 3.1 acrescentou em tabelas que já existiam (a ordem de produção e o razão do estoque). */
export const CHECKS_DA_3_1 = [
  ['OrdemProducao', 'OrdemProducao_concluida_tem_resultado'],
  ['OrdemProducao', 'OrdemProducao_versao_naoneg'],
  ['OrdemProducao', 'OrdemProducao_cancelada_tem_motivo'],
  ['OrdemProducao', 'OrdemProducao_iniciada_tem_data'],
  ['OrdemProducao', 'OrdemProducao_quantidades_teto'],
  ['OrdemProducao', 'OrdemProducao_codigo_do_lote'],
  ['OrdemProducao', 'OrdemProducao_validade_faixa'],
  ['OrdemProducao', 'OrdemProducao_sem_preco_naoneg'],
  ['OrdemProducao', 'OrdemProducao_textos_curtos'],
  ['MovimentoEstoque', 'MovimentoEstoque_producao_entrada_tem_ordem'],
] as const;

/** O índice único (parceiro, requisição) da 3.1: não nasce se dado antigo repetir a requisição. */
export const INDICE_DA_REQUISICAO_DO_LOTE = 'OrdemProducao_parceiroId_requisicaoId_key';

/** Os gatilhos da 3.1: sem eles o lote concluído mudaria e a entrada do lote poderia cair em outra loja. */
export const GATILHOS_DA_3_1 = ['OrdemProducao_concluida_imutavel', 'MovimentoEstoque_producao_confere'] as const;

/** As duas tabelas da 3.2 (nascem com os CHECKs validados; o que se confere é a RLS, os índices únicos e os gatilhos). */
export const TABELAS_DA_3_2 = ['ListaProducao', 'ListaProducaoItem'] as const;

/** Uma lista por loja e dia; uma linha por lote. Sem eles, dois cliques duplicariam a lista ou dois itens o mesmo lote. */
export const INDICES_DA_3_2 = ['ListaProducao_parceiroId_lojaId_dia_key', 'ListaProducaoItem_parceiroId_ordemProducaoId_key'] as const;

/** Os gatilhos da 3.2: sem eles a linha que virou lote mudaria (ou apontaria lote de outra loja) e a lista mudaria de loja ou de dia. */
export const GATILHOS_DA_3_2 = ['ListaProducao_parceiro_imutavel', 'ListaProducaoItem_parceiro_imutavel', 'ListaProducao_loja_dia_imutaveis', 'ListaProducaoItem_lote_confere'] as const;

/** Os CHECKs que a 3.3 acrescentou na ordem de produção (quem pegou o lote e desde quando). */
export const CHECKS_DA_3_3 = [
  ['OrdemProducao', 'OrdemProducao_responsavel_com_pessoa'],
  ['OrdemProducao', 'OrdemProducao_responsavel_so_em_producao'],
  ['OrdemProducao', 'OrdemProducao_responsavel_antes_do_fim'],
  ['OrdemProducao', 'OrdemProducao_responsavel_nome_curto'],
] as const;

/** Os índices da 3.3: o histórico e os indicadores leem os lotes encerrados da loja por período. */
export const INDICES_DA_3_3 = ['OrdemProducao_parceiroId_lojaId_concluidaEm_idx', 'OrdemProducao_parceiroId_lojaId_canceladaEm_idx'] as const;

/** Os CHECKs que a I.1a acrescentou em "Insumo" (a tabela nova nasce com os dela validados). */
export const CHECKS_DA_I_1A = [
  ['Insumo', 'Insumo_classificadoPor_valido'],
  ['Insumo', 'Insumo_classificacaoMotivo_curto'],
  ['Insumo', 'Insumo_classificacao_so_com_categoria'],
  ['Insumo', 'Insumo_classificacaoLote_da_migracao'],
  ['Insumo', 'Insumo_chaveEnvio_completa'],
] as const;

/** Os índices da I.1a: a chave de envio é o que faz o reenvio do cadastro não duplicar; a chave da categoria, a semeadura repetida. */
export const INDICES_DA_I_1A = ['Insumo_parceiroId_chaveEnvio_key', 'Insumo_parceiroId_categoriaId_idx', 'CategoriaInsumo_parceiroId_chave_key', 'CategoriaInsumo_parceiroId_nome_key'] as const;

/** Os gatilhos da I.1a: sem eles a categoria do sistema poderia ser renomeada, desativada ou excluída. */
export const GATILHOS_DA_I_1A = ['CategoriaInsumo_parceiro_imutavel', 'CategoriaInsumo_sistema_protegida'] as const;

/** O CHECK que a I.1b acrescentou em "Insumo" (a marca de referência). */
export const CHECKS_DA_I_1B = [['Insumo', 'Insumo_marcaReferencia_curta']] as const;

/** O CHECK que a I.2a acrescentou em "Contagem" (as quatro tabelas novas nascem com os dela validados). */
export const CHECKS_DA_I_2A = [['Contagem', 'Contagem_retrato_so_na_fechada']] as const;

/** As quatro tabelas da I.2a (de tenant: RLS forçada como as outras). */
export const TABELAS_DA_I_2A = ['ContagemRetratoItem', 'CategoriaNaLoja', 'MetaCmvConjunto', 'MetaCmvCategoria'] as const;

/** Os índices da I.2a: o grão do conjunto de metas (NULLS NOT DISTINCT: a rede tem loja nula), o do retrato e o da meta por categoria. */
export const INDICES_DA_I_2A = [
  'MetaCmvConjunto_parceiroId_lojaId_vigenteDesde_key',
  'MetaCmvCategoria_parceiroId_conjuntoId_categoriaId_key',
  'ContagemRetratoItem_parceiroId_contagemId_insumoId_key',
  'CategoriaNaLoja_parceiroId_lojaId_categoriaId_key',
] as const;

/** O CHECK que a I.2b acrescentou em "MetaCmvConjunto" (a meta total da loja, de 0 a 100 %, só na loja que não segue a rede). */
export const CHECKS_DA_I_2B = [['MetaCmvConjunto', 'MetaCmvConjunto_total_proprio']] as const;

/** Os gatilhos da I.2a: sem eles o retrato mudaria, a soma dele não conferiria com a contagem e o conjunto de metas do passado seria reescrito. */
export const GATILHOS_DA_I_2A = [
  'ContagemRetratoItem_parceiro_imutavel',
  'ContagemRetratoItem_so_inclusao',
  'ContagemRetratoItem_sem_truncate',
  'ContagemRetratoItem_da_contagem_aberta',
  'Contagem_retrato_confere',
  'CategoriaNaLoja_parceiro_imutavel',
  'MetaCmvConjunto_parceiro_imutavel',
  'MetaCmvConjunto_so_o_mais_novo',
  'MetaCmvConjunto_sem_retroativo',
  'MetaCmvCategoria_parceiro_imutavel',
  'MetaCmvCategoria_do_conjunto_novo',
] as const;

/** Os CHECKs que a F.1a acrescentou em "Fornecedor" e "Loja" (nenhuma tabela nova: portão e RLS são os de sempre). */
export const CHECKS_DA_F_1A = [
  ['Fornecedor', 'Fornecedor_documento_formato'],
  ['Fornecedor', 'Fornecedor_inscricao_formato'],
  ['Fornecedor', 'Fornecedor_uf_valida'],
  ['Fornecedor', 'Fornecedor_cep_formato'],
  ['Fornecedor', 'Fornecedor_whatsapp_formato'],
  ['Fornecedor', 'Fornecedor_email_formato'],
  ['Fornecedor', 'Fornecedor_prazo_faixa'],
  ['Fornecedor', 'Fornecedor_textos_curtos'],
  ['Fornecedor', 'Fornecedor_chaveEnvio_completa'],
  ['Fornecedor', 'Fornecedor_completo_tem_o_basico'],
  ['Loja', 'Loja_cnpj_formato'],
] as const;

/** Os índices únicos da F.1a: a chave de envio (reenvio não duplica) e o documento fiscal (um fornecedor por CNPJ/CPF e parceiro). */
export const INDICE_DO_DOCUMENTO_DO_FORNECEDOR = 'Fornecedor_parceiroId_documento_key';
export const INDICES_DA_F_1A = ['Fornecedor_parceiroId_chaveEnvio_key', INDICE_DO_DOCUMENTO_DO_FORNECEDOR] as const;

export interface RelatorioDeFornecedores {
  /** O mesmo CNPJ/CPF em mais de um fornecedor do mesmo parceiro (o índice único não nasce enquanto isso existir). */
  repetidos: { parceiro: string; documento: string; nomes: string[] }[];
  /** Documento gravado que não passa nos dígitos verificadores (cadastro antigo): a tela mostra "Documento a conferir". */
  documentosAConferir: { parceiro: string; nome: string; documento: string }[];
  /** Quantos fornecedores ficaram "a completar" (todos os que existiam antes da F.1a). */
  aCompletar: number;
}

/**
 * Lê os fornecedores POR PARCEIRO, pelo portão (`doParceiro`): a RLS forçada só deixa o papel do tenant ver a linha, e o portão é o
 * único caminho para dado de tenant (o catálogo do Postgres não basta para listar nomes). Só leitura.
 */
export async function relatorioDeFornecedores(db: PrismaClient): Promise<RelatorioDeFornecedores> {
  const relatorio: RelatorioDeFornecedores = { repetidos: [], documentosAConferir: [], aCompletar: 0 };
  const parceiros = await db.$queryRaw<{ id: string; slug: string }[]>`SELECT "id", "slug" FROM "ParceiroFlow" ORDER BY "slug"`;
  for (const p of parceiros) {
    const linhas = await doParceiro(p.id, db).fornecedor.findMany({ select: { nome: true, documento: true, situacaoCadastro: true }, orderBy: { nome: 'asc' } });
    const porDocumento = new Map<string, string[]>();
    for (const f of linhas) {
      if (f.situacaoCadastro === 'A_COMPLETAR') relatorio.aCompletar += 1;
      if (!f.documento) continue;
      porDocumento.set(f.documento, [...(porDocumento.get(f.documento) ?? []), f.nome]);
      if (!documentoValido(f.documento)) relatorio.documentosAConferir.push({ parceiro: p.slug, nome: f.nome, documento: f.documento });
    }
    for (const [documento, nomes] of Array.from(porDocumento)) if (nomes.length > 1) relatorio.repetidos.push({ parceiro: p.slug, documento, nomes });
  }
  return relatorio;
}

/** O que a migration deixou pendente (frases prontas para o terminal); lista vazia = tudo no lugar. */
export async function conferirMigracao(db: Pick<PrismaClient, '$queryRaw'>): Promise<string[]> {
  const pendencias: string[] = [];
  const checks = await db.$queryRaw<{ tabela: string; nome: string; validado: boolean }[]>`
    SELECT c.conrelid::regclass::text AS tabela, c.conname AS nome, c.convalidated AS validado
    FROM pg_constraint c
    WHERE c.conname = ANY(${CHECKS_DA_2_1.map(([, nome]) => nome)})`;
  for (const [tabela, nome] of CHECKS_DA_2_1) {
    const achado = checks.find((c) => c.nome === nome);
    if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261025000000_erp_faturamento não foi aplicada por inteiro.`);
    else if (!achado.validado) {
      pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
    }
  }
  const indice = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = ${INDICE_DO_GRAO}`;
  if (!indice[0] || indice[0].n === 0) {
    pendencias.push(`Índice ${INDICE_DO_GRAO} NÃO existe: há mais de uma linha humana no mesmo loja × canal × dia. Corrija as duplicadas e rode o CREATE UNIQUE INDEX da migration.`);
  }
  // 2.2a: só se a migration dela já rodou (o catálogo não passa pela RLS).
  const aplicada = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'RegraDoPeriodo' AND relkind = 'r'`;
  if (aplicada[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_2_2A.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_2_2A) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261026000000_erp_dre_despesas não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
  }
  // 2.2b: só se a migration dela já rodou (o catálogo não passa pela RLS).
  const fechamento = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'DreFotografia' AND relkind = 'r'`;
  if (fechamento[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_2_2B.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_2_2B) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261027000000_erp_dre_fechamento não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    // Os gatilhos que fazem a fotografia valer (sem eles o fechado não seria imutável).
    const gatilhos = await db.$queryRaw<{ nome: string }[]>`
      SELECT tgname AS nome FROM pg_trigger
      WHERE NOT tgisinternal AND tgname = ANY(${['DreFotografia_imutavel', 'DreFotografiaLinha_so_inclusao', 'PeriodoApuracao_fechado_imutavel', 'PeriodoApuracao_fechado_tem_fotografia', 'DreFotografia_substituida_reabre_periodo', 'DreFotografia_so_periodo_aberto', 'PeriodoApuracao_aberto_sem_fotografia_vigente', 'DreFotografia_vigente_so_em_periodo_fechado', 'DreFotografia_sem_truncate', 'DreFotografiaLinha_sem_truncate']})`;
    for (const t of ['DreFotografia_imutavel', 'DreFotografiaLinha_so_inclusao', 'PeriodoApuracao_fechado_imutavel', 'PeriodoApuracao_fechado_tem_fotografia', 'DreFotografia_substituida_reabre_periodo', 'DreFotografia_so_periodo_aberto', 'PeriodoApuracao_aberto_sem_fotografia_vigente', 'DreFotografia_vigente_so_em_periodo_fechado', 'DreFotografia_sem_truncate', 'DreFotografiaLinha_sem_truncate']) {
      if (!gatilhos.some((g) => g.nome === t)) pendencias.push(`Gatilho ${t} NÃO existe: a migration 20261027000000_erp_dre_fechamento não foi aplicada por inteiro.`);
    }
  }
  // 2.3: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const cmv = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'Contagem' AND column_name = 'itensSemPreco'`;
  if (cmv[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_2_3.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_2_3) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261028000000_erp_cmv não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
  }
  // 3.1: só se a migration dela já rodou (a coluna `versao` existe; o catálogo não passa pela RLS).
  const producao = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'OrdemProducao' AND column_name = 'versao'`;
  if (producao[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_3_1.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_3_1) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261029000000_erp_producao não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    const indiceDoLote = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = ${INDICE_DA_REQUISICAO_DO_LOTE}`;
    if (!indiceDoLote[0] || indiceDoLote[0].n === 0) {
      pendencias.push(`Índice ${INDICE_DA_REQUISICAO_DO_LOTE} NÃO existe: duas ordens de produção apontam a mesma requisição. Corrija a repetida e rode o CREATE UNIQUE INDEX da migration 20261029000000_erp_producao.`);
    }
    const gatilhos = await db.$queryRaw<{ nome: string }[]>`SELECT tgname AS nome FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY(${[...GATILHOS_DA_3_1]})`;
    for (const t of GATILHOS_DA_3_1) {
      if (!gatilhos.some((g) => g.nome === t)) pendencias.push(`Gatilho ${t} NÃO existe: a migration 20261029000000_erp_producao não foi aplicada por inteiro.`);
    }
  }
  // 3.2: só se a migration dela já rodou (a tabela existe; o catálogo não passa pela RLS).
  const lista = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'ListaProducao' AND relkind = 'r'`;
  if (lista[0]?.n) {
    const tabelas = await db.$queryRaw<{ nome: string; rls: boolean; forcada: boolean }[]>`
      SELECT relname AS nome, relrowsecurity AS rls, relforcerowsecurity AS forcada FROM pg_class WHERE relkind = 'r' AND relname = ANY(${[...TABELAS_DA_3_2, 'Loja']})`;
    const loja = tabelas.find((t) => t.nome === 'Loja');
    for (const t of TABELAS_DA_3_2) {
      const achada = tabelas.find((x) => x.nome === t);
      if (!achada) pendencias.push(`Tabela ${t} NÃO existe: a migration 20261030000000_erp_lista_do_dia não foi aplicada por inteiro.`);
      // As antigas com RLS e a nova sem: o papel do tenant não alcançaria a tabela (o ERP quebraria) ou ela ficaria sem o cinto.
      else if (loja?.rls && !(achada.rls && achada.forcada)) pendencias.push(`Tabela ${t} sem RLS forçada (as outras têm): rode o bloco da RLS da migration 20261030000000_erp_lista_do_dia como dono das tabelas.`);
    }
    const indices = await db.$queryRaw<{ nome: string }[]>`SELECT indexname AS nome FROM pg_indexes WHERE indexname = ANY(${[...INDICES_DA_3_2]})`;
    for (const i of INDICES_DA_3_2) {
      if (!indices.some((x) => x.nome === i)) pendencias.push(`Índice ${i} NÃO existe: a migration 20261030000000_erp_lista_do_dia não foi aplicada por inteiro.`);
    }
    const gatilhos = await db.$queryRaw<{ nome: string }[]>`SELECT tgname AS nome FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY(${[...GATILHOS_DA_3_2]})`;
    for (const t of GATILHOS_DA_3_2) {
      if (!gatilhos.some((g) => g.nome === t)) pendencias.push(`Gatilho ${t} NÃO existe: a migration 20261030000000_erp_lista_do_dia não foi aplicada por inteiro.`);
    }
  }
  // 3.3: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const equipe = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'OrdemProducao' AND column_name = 'responsavelDesde'`;
  if (equipe[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_3_3.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_3_3) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261031000000_erp_producao_equipe não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    const indices = await db.$queryRaw<{ nome: string }[]>`SELECT indexname AS nome FROM pg_indexes WHERE indexname = ANY(${[...INDICES_DA_3_3]})`;
    for (const i of INDICES_DA_3_3) {
      if (!indices.some((x) => x.nome === i)) pendencias.push(`Índice ${i} NÃO existe: a migration 20261031000000_erp_producao_equipe não foi aplicada por inteiro.`);
    }
  }
  // I.1a: só se a migration dela já rodou (a tabela existe; o catálogo não passa pela RLS).
  const categorias = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'CategoriaInsumo' AND relkind = 'r'`;
  if (categorias[0]?.n) {
    const tabelas = await db.$queryRaw<{ nome: string; rls: boolean; forcada: boolean }[]>`
      SELECT relname AS nome, relrowsecurity AS rls, relforcerowsecurity AS forcada FROM pg_class WHERE relkind = 'r' AND relname = ANY(${['CategoriaInsumo', 'Loja']})`;
    const loja = tabelas.find((t) => t.nome === 'Loja');
    const dela = tabelas.find((t) => t.nome === 'CategoriaInsumo');
    // As antigas com RLS e a nova sem: o papel do tenant não alcançaria a tabela (o ERP quebraria) ou ela ficaria sem o cinto.
    if (loja?.rls && !(dela?.rls && dela.forcada)) {
      pendencias.push('Tabela CategoriaInsumo sem RLS forçada (as outras têm): rode o bloco da RLS da migration 20261101000000_erp_insumo_categorias como dono das tabelas.');
    }
    const checks = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_I_1A.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_I_1A) {
      const achado = checks.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261101000000_erp_insumo_categorias não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    const indices = await db.$queryRaw<{ nome: string }[]>`SELECT indexname AS nome FROM pg_indexes WHERE indexname = ANY(${[...INDICES_DA_I_1A]})`;
    for (const i of INDICES_DA_I_1A) {
      if (!indices.some((x) => x.nome === i)) pendencias.push(`Índice ${i} NÃO existe: a migration 20261101000000_erp_insumo_categorias não foi aplicada por inteiro.`);
    }
    const gatilhos = await db.$queryRaw<{ nome: string }[]>`SELECT tgname AS nome FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY(${[...GATILHOS_DA_I_1A]})`;
    for (const t of GATILHOS_DA_I_1A) {
      if (!gatilhos.some((g) => g.nome === t)) pendencias.push(`Gatilho ${t} NÃO existe: a migration 20261101000000_erp_insumo_categorias não foi aplicada por inteiro.`);
    }
  }
  // I.1b: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const clareza = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'Insumo' AND column_name = 'marcaReferencia'`;
  if (clareza[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_I_1B.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_I_1B) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261102000000_erp_insumo_clareza não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    // O valor novo do tipo (material de limpeza e uso) e a coluna da confirmação da conservação.
    const material = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'InsumoTipo' AND e.enumlabel = 'MATERIAL'`;
    if (!material[0]?.n) pendencias.push('O tipo MATERIAL NÃO existe em InsumoTipo: a migration 20261102000000_erp_insumo_clareza não foi aplicada por inteiro.');
    const confirmada = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'Insumo' AND column_name = 'conservacaoConfirmadaEm'`;
    if (!confirmada[0]?.n) pendencias.push('A coluna Insumo.conservacaoConfirmadaEm NÃO existe: a migration 20261102010000_erp_insumo_conservacao_confirmada não foi aplicada.');
  }
  // I.2a: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const cmvCategorias = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'Contagem' AND column_name = 'retratoGravadoEm'`;
  if (cmvCategorias[0]?.n) {
    const tabelas = await db.$queryRaw<{ nome: string; rls: boolean; forcada: boolean }[]>`
      SELECT relname AS nome, relrowsecurity AS rls, relforcerowsecurity AS forcada FROM pg_class WHERE relkind = 'r' AND relname = ANY(${[...TABELAS_DA_I_2A, 'Loja']})`;
    const loja = tabelas.find((t) => t.nome === 'Loja');
    for (const t of TABELAS_DA_I_2A) {
      const achada = tabelas.find((x) => x.nome === t);
      if (!achada) pendencias.push(`Tabela ${t} NÃO existe: a migration 20261103000000_erp_cmv_categorias não foi aplicada por inteiro.`);
      // As antigas com RLS e a nova sem: o papel do tenant não alcançaria a tabela (o ERP quebraria) ou ela ficaria sem o cinto.
      else if (loja?.rls && !(achada.rls && achada.forcada)) pendencias.push(`Tabela ${t} sem RLS forçada (as outras têm): rode o bloco da RLS da migration 20261103000000_erp_cmv_categorias como dono das tabelas.`);
    }
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_I_2A.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_I_2A) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261103000000_erp_cmv_categorias não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    const indices = await db.$queryRaw<{ nome: string }[]>`SELECT indexname AS nome FROM pg_indexes WHERE indexname = ANY(${[...INDICES_DA_I_2A]})`;
    for (const i of INDICES_DA_I_2A) {
      if (!indices.some((x) => x.nome === i)) pendencias.push(`Índice ${i} NÃO existe: a migration 20261103000000_erp_cmv_categorias não foi aplicada por inteiro.`);
    }
    const gatilhos = await db.$queryRaw<{ nome: string }[]>`SELECT tgname AS nome FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY(${[...GATILHOS_DA_I_2A]})`;
    for (const t of GATILHOS_DA_I_2A) {
      if (!gatilhos.some((g) => g.nome === t)) pendencias.push(`Gatilho ${t} NÃO existe: a migration 20261103000000_erp_cmv_categorias (e a 20261103010000_erp_cmv_categorias_endurecimento) não foi aplicada por inteiro.`);
    }
  }
  // I.2b: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const metaTotal = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'MetaCmvConjunto' AND column_name = 'metaTotalBp'`;
  if (metaTotal[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_I_2B.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_I_2B) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261104000000_erp_cmv_real_categorias não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
  }
  // F.1a: só se a migration dela já rodou (a coluna existe; o catálogo não passa pela RLS).
  const cadastro = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'Fornecedor' AND column_name = 'situacaoCadastro'`;
  if (cadastro[0]?.n) {
    const dela = await db.$queryRaw<{ nome: string; validado: boolean }[]>`
      SELECT c.conname AS nome, c.convalidated AS validado FROM pg_constraint c WHERE c.conname = ANY(${CHECKS_DA_F_1A.map(([, nome]) => nome)})`;
    for (const [tabela, nome] of CHECKS_DA_F_1A) {
      const achado = dela.find((c) => c.nome === nome);
      if (!achado) pendencias.push(`CHECK ${nome} (${tabela}) NÃO existe: a migration 20261105000000_erp_fornecedor_cadastro não foi aplicada por inteiro.`);
      else if (!achado.validado) {
        pendencias.push(`CHECK ${nome} ficou NOT VALID: corrija a linha antiga que o viola e rode ALTER TABLE "${tabela}" VALIDATE CONSTRAINT "${nome}";`);
      }
    }
    const indices = await db.$queryRaw<{ nome: string }[]>`SELECT indexname AS nome FROM pg_indexes WHERE indexname = ANY(${[...INDICES_DA_F_1A]})`;
    for (const i of INDICES_DA_F_1A) {
      if (indices.some((x) => x.nome === i)) continue;
      if (i !== INDICE_DO_DOCUMENTO_DO_FORNECEDOR) {
        pendencias.push(`Índice ${i} NÃO existe: a migration 20261105000000_erp_fornecedor_cadastro não foi aplicada por inteiro.`);
        continue;
      }
      pendencias.push(
        `Índice ${i} NÃO existe: há fornecedores do mesmo parceiro com o mesmo CNPJ/CPF. Corrija o cadastro de cada um (o documento certo, ou "Compras sem nota fiscal" e o documento em branco) e rode o CREATE UNIQUE INDEX "${i}" ON "Fornecedor"("parceiroId", "documento") WHERE "documento" IS NOT NULL; da migration 20261105000000_erp_fornecedor_cadastro. Enquanto isso o servidor já recusa documento repetido.`,
      );
      // O objeto de teste só com `$queryRaw` (sem cliente completo) não lista os pares; o cliente de verdade lista.
      const rel = typeof (db as Partial<PrismaClient>).$transaction === 'function' ? await relatorioDeFornecedores(db as PrismaClient) : null;
      for (const r of rel?.repetidos ?? []) {
        pendencias.push(`  CNPJ/CPF repetido no parceiro ${r.parceiro}: ${formatarDocumento(r.documento)} em ${r.nomes.map((n) => `“${n}”`).join(' e ')}.`);
      }
    }
  }
  return pendencias;
}

async function principal() {
  const db = new PrismaClient();
  try {
    const pendencias = await conferirMigracao(db);
    // F.1a: o que NÃO é pendência da migration, mas é dado antigo que a equipe precisa resolver (não muda o código de saída).
    const rel = await relatorioDeFornecedores(db).catch(() => null);
    if (rel && (rel.aCompletar > 0 || rel.documentosAConferir.length > 0)) {
      console.log(`Fornecedores: ${rel.aCompletar} a completar (cadastro anterior à F.1a: falta e-mail, WhatsApp e, se for o caso, razão social).`);
      for (const d of rel.documentosAConferir) console.log(`  Documento a conferir no parceiro ${d.parceiro}: “${d.nome}” tem ${d.documento}, que não passa nos dígitos verificadores.`);
    }
    if (pendencias.length === 0) {
      console.log('Migrations da 2.1, da 2.2a, da 2.2b, da 2.3, da 3.1, da 3.2, da 3.3, da I.1a, da I.1b, da I.2a, da I.2b e da F.1a conferidas: os CHECKs estão validados, o índice do grão humano, o da requisição do lote, as tabelas da lista do dia, das categorias e das metas por categoria (com RLS), os índices e os gatilhos existem.');
      return 0;
    }
    console.error(`Migrations da 2.1, da 2.2a, da 2.2b, da 2.3, da 3.1, da 3.2, da 3.3, da I.1a, da I.1b, da I.2a, da I.2b e da F.1a: ${pendencias.length} pendência(s):`);
    for (const p of pendencias) console.error(`  - ${p}`);
    return 1;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.endsWith('erp-conferir-migracao.ts')) {
  principal().then((c) => process.exit(c), (e) => {
    console.error(e);
    process.exit(2);
  });
}
