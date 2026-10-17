/**
 * O plano de contas do DRE (2.2a, decisão 137) — regras com banco. A estrutura e
 * o padrão moram em `dre-plano.ts`; aqui estão a leitura e as três escritas da
 * casa: criar linha, renomear e ocultar/reexibir. Todas pedem `metas.editar`
 * (a rede inteira): o plano é da rede, não de uma loja.
 *
 *  - LEITURA sem escrever: `planoDoParceiro` devolve o plano do banco completado
 *    pelo padrão do código, então parceiro novo ou suspenso abre o DRE sem gravar nada;
 *  - `garantirPlano`: a primeira escrita do DRE (despesa, linha, renomear) grava
 *    o padrão que faltar, POR CÓDIGO, idempotente (dez escritas paralelas = uma
 *    linha por código, sob uma trava);
 *  - renomear é condicional ao `atualizadoEm` lido (duas abas); as despesas seguem
 *    pelo id, então mostram o nome novo; o histórico guarda antes e depois;
 *  - ocultar tira a linha do formulário de despesa; se ela tem valor no período
 *    continua na tela do DRE, marcada "oculta". Linha nunca se apaga e o grupo dela
 *    nunca muda (oculte e crie outra). Calculada não se renomeia nem se oculta.
 */

import { diferenca } from './insumo-campos';
import {
  chaveDoNome,
  ehGrupoDeDespesa,
  lerNomeDaLinha,
  PLANO_PADRAO,
  planoEfetivo,
  ROTULO_DO_GRUPO,
  type GrupoDoDre,
  type LinhaDoBanco,
  type LinhaDoPlano,
} from './dre-plano';
import { recusa, type Alcance } from './permissoes';
import { ehErroDeUnicidade, type ClienteDoParceiro } from './tenant';

export const MENSAGEM_LINHA_NAO_ENCONTRADA = 'Linha do DRE não encontrada.';
export const MENSAGEM_CONFLITO_DA_LINHA = 'Alguém mudou esta linha agora há pouco. Recarregue a página para ver a versão de agora; nada foi gravado.';
const NOME_REPETIDO = 'Já existe uma linha com esse nome. Escolha outro (ou reexiba a que está oculta).';

const SELECAO = { id: true, codigo: true, nome: true, grupo: true, calculada: true, sentido: true, ordem: true, ativa: true, atualizadoEm: true } as const;

/** O plano de agora (do banco completado pelo padrão do código). Não escreve. */
export async function planoDoParceiro(cliente: ClienteDoParceiro): Promise<LinhaDoPlano[]> {
  const linhas = (await cliente.dreLinha.findMany({ select: SELECAO })) as LinhaDoBanco[];
  return planoEfetivo(linhas);
}

/**
 * Grava o padrão que falta, por código. Idempotente e sem corrida: pega uma trava do parceiro
 * só quando falta alguma coisa. Linha antiga com o mesmo nome e sem código é adotada (ganha o
 * código) em vez de duplicar. Dentro de uma transação de escrita.
 */
export async function garantirPlano(tx: ClienteDoParceiro): Promise<void> {
  const codigos = async () => new Set((await tx.dreLinha.findMany({ where: { codigo: { not: null } }, select: { codigo: true } })).map((l) => l.codigo!));
  const jaTem = await codigos();
  if (PLANO_PADRAO.every((p) => jaTem.has(p.codigo))) return;
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`erp-plano:${tx.parceiroId}`}, 0))::text AS "trava"`;
  const tem = await codigos();
  const faltam = PLANO_PADRAO.map((p, i) => ({ p, ordem: (i + 1) * 10 })).filter(({ p }) => !tem.has(p.codigo));
  if (faltam.length === 0) return;
  const novas: typeof faltam = [];
  for (const f of faltam) {
    const adotada = await tx.dreLinha.updateMany({ where: { codigo: null, nome: f.p.nome }, data: { codigo: f.p.codigo, grupo: f.p.grupo, calculada: f.p.calculada, sentido: f.p.sentido } });
    if (adotada.count === 0) novas.push(f);
  }
  if (novas.length > 0) {
    await tx.dreLinha.createMany({
      data: novas.map(({ p, ordem }) => ({ parceiroId: tx.parceiroId, codigo: p.codigo, nome: p.nome, grupo: p.grupo, calculada: p.calculada, sentido: p.sentido, ordem, ativa: true })),
      skipDuplicates: true,
    });
  }
}

/** A linha escolhida no formulário: pelo código do padrão, ou `id:<id>` de linha da casa. Null se não existe neste parceiro. */
export async function resolverLinha(tx: ClienteDoParceiro, chave: string): Promise<LinhaDoBanco | null> {
  if (typeof chave !== 'string' || chave.length === 0 || chave.length > 80) return null;
  const l = chave.startsWith('id:')
    ? await tx.dreLinha.findUnique({ where: { id: chave.slice(3) }, select: SELECAO })
    : await tx.dreLinha.findFirst({ where: { codigo: chave }, select: SELECAO });
  return (l as LinhaDoBanco | null) ?? null;
}

const retrato = (l: { nome: string; grupo: GrupoDoDre; ativa: boolean }) => ({ nome: l.nome, grupo: ROTULO_DO_GRUPO[l.grupo], linhaVisivel: l.ativa ? 'Visível' : 'Oculta' });

export type ResultadoDoPlano = { ok: true; id: string; mudou: boolean } | { ok: false; erros: Partial<Record<'nome' | 'grupo' | 'geral', string>>; conflito?: boolean };

const falha = (geral: string, extra: { conflito?: boolean } = {}): ResultadoDoPlano => ({ ok: false, erros: { geral }, ...extra });

/** Cria uma linha da casa num grupo de despesa. Nome 1..60, único no plano (sem ligar para maiúscula e acento). */
export async function criarLinha(cliente: ClienteDoParceiro, alcance: Alcance, entrada: { nome: unknown; grupo: unknown }, autorNome: string): Promise<ResultadoDoPlano> {
  const negado = recusa(alcance, 'metas.editar');
  if (negado) return falha(negado);
  const nome = lerNomeDaLinha(entrada.nome);
  if (!nome.ok) return { ok: false, erros: { nome: nome.erro } };
  if (!ehGrupoDeDespesa(entrada.grupo)) return { ok: false, erros: { grupo: 'Escolha o grupo da linha.' } };
  const grupo = entrada.grupo;
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDoPlano> => {
      await garantirPlano(tx);
      const todas = await tx.dreLinha.findMany({ select: { nome: true, grupo: true, ordem: true } });
      if (todas.some((l) => chaveDoNome(l.nome) === chaveDoNome(nome.nome))) return { ok: false, erros: { nome: NOME_REPETIDO } };
      const ordem = Math.max(0, ...todas.filter((l) => l.grupo === grupo).map((l) => l.ordem)) + 10;
      const criada = await tx.dreLinha.create({ data: { parceiroId: tx.parceiroId, nome: nome.nome, grupo, calculada: false, sentido: 'MENOR_MELHOR', ordem, ativa: true }, select: { id: true } });
      await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'DreLinha', entidadeId: criada.id, acao: 'CRIOU', depois: retrato({ nome: nome.nome, grupo, ativa: true }), autorNome } });
      return { ok: true, id: criada.id, mudou: true };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: NOME_REPETIDO } };
    throw e;
  }
}

/** Lê a linha para mudar: garante o plano, confere calculada e a versão que a tela leu. */
async function linhaParaMudar(tx: ClienteDoParceiro, chave: string, versaoLida: string): Promise<{ l: LinhaDoBanco } | { erro: ResultadoDoPlano }> {
  // Linha virtual (o parceiro ainda não gravou o plano): a tela leu versão vazia. Se alguém já a gravou e mexeu, é conflito.
  const antes = await resolverLinha(tx, chave);
  if (!antes && !chave.startsWith('id:')) await garantirPlano(tx);
  const l = antes ?? (await resolverLinha(tx, chave));
  if (!l) return { erro: falha(MENSAGEM_LINHA_NAO_ENCONTRADA) };
  if (l.calculada) return { erro: falha('Esta linha é calculada pelo sistema: não se renomeia nem se oculta.') };
  // A tela leu a linha virtual (versão vazia) e alguém gravou o plano no meio: só é conflito se a linha já mudou do padrão.
  const padrao = PLANO_PADRAO.find((p) => p.codigo === l.codigo);
  const intocada = versaoLida === '' && !!padrao && l.nome === padrao.nome && l.ativa;
  const recemGravada = !antes;
  if (!recemGravada && !intocada && versaoLida !== l.atualizadoEm.toISOString()) return { erro: falha(MENSAGEM_CONFLITO_DA_LINHA, { conflito: true }) };
  return { l };
}

/** Renomeia. As despesas seguem pelo id (mostram o nome novo) e o histórico guarda o antes e o depois. */
export async function renomearLinha(cliente: ClienteDoParceiro, alcance: Alcance, entrada: { linha: unknown; nome: unknown; versao: unknown }, autorNome: string): Promise<ResultadoDoPlano> {
  const negado = recusa(alcance, 'metas.editar');
  if (negado) return falha(negado);
  const nome = lerNomeDaLinha(entrada.nome);
  if (!nome.ok) return { ok: false, erros: { nome: nome.erro } };
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDoPlano> => {
      const r = await linhaParaMudar(tx, String(entrada.linha ?? ''), String(entrada.versao ?? ''));
      if ('erro' in r) return r.erro;
      const { l } = r;
      if (l.nome === nome.nome) return { ok: true, id: l.id, mudou: false };
      const outras = await tx.dreLinha.findMany({ where: { id: { not: l.id } }, select: { nome: true } });
      if (outras.some((o) => chaveDoNome(o.nome) === chaveDoNome(nome.nome))) return { ok: false, erros: { nome: NOME_REPETIDO } };
      const u = await tx.dreLinha.updateMany({ where: { id: l.id, atualizadoEm: l.atualizadoEm }, data: { nome: nome.nome } });
      if (u.count === 0) return falha(MENSAGEM_CONFLITO_DA_LINHA, { conflito: true });
      const d = diferenca(retrato(l), retrato({ ...l, nome: nome.nome }));
      if (d) await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'DreLinha', entidadeId: l.id, acao: 'ALTEROU', antes: d.antes, depois: d.depois, autorNome } });
      return { ok: true, id: l.id, mudou: true };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: NOME_REPETIDO } };
    throw e;
  }
}

/** Oculta (some do formulário de despesa) ou reexibe. Quem tem valor no período continua na tela do DRE. */
export async function ocultarLinha(cliente: ClienteDoParceiro, alcance: Alcance, entrada: { linha: unknown; ocultar: boolean; versao: unknown }, autorNome: string): Promise<ResultadoDoPlano> {
  const negado = recusa(alcance, 'metas.editar');
  if (negado) return falha(negado);
  return cliente.transacao(async (tx): Promise<ResultadoDoPlano> => {
    const r = await linhaParaMudar(tx, String(entrada.linha ?? ''), String(entrada.versao ?? ''));
    if ('erro' in r) return r.erro;
    const { l } = r;
    const ativa = !entrada.ocultar;
    if (l.ativa === ativa) return { ok: true, id: l.id, mudou: false };
    const u = await tx.dreLinha.updateMany({ where: { id: l.id, atualizadoEm: l.atualizadoEm }, data: { ativa } });
    if (u.count === 0) return falha(MENSAGEM_CONFLITO_DA_LINHA, { conflito: true });
    const d = diferenca(retrato(l), retrato({ ...l, ativa }));
    if (d) await tx.historicoAlteracao.create({ data: { parceiroId: tx.parceiroId, entidade: 'DreLinha', entidadeId: l.id, acao: 'ALTEROU', antes: d.antes, depois: d.depois, autorNome } });
    return { ok: true, id: l.id, mudou: true };
  });
}
