/** Contrato operacional da classificação de fichas. Sem banco, custo ou parceiro no DTO. */
import { nomeObrigatorio, type Leitura } from './insumo-campos';

export const LIMITE_NOME_CLASSIFICACAO = 80;
export const TAMANHO_PAGINA_CLASSIFICACAO = 50;

export type EscolhaDeClassificacao =
  | { tipo: 'nenhuma' }
  | { tipo: 'existente'; id: string }
  | { tipo: 'nova'; nome: string };
export type ClassificacaoDigitada = { secao: EscolhaDeClassificacao; subsecao: EscolhaDeClassificacao };
export type SecaoDaFicha = { id: string; nome: string; ativa: boolean; versao: string };
export type SubsecaoDaFicha = SecaoDaFicha & { secaoId: string; secaoAtiva: boolean };
export type RegistroDeClassificacao =
  | { nivel: 'secao'; registro: SecaoDaFicha }
  | { nivel: 'subsecao'; registro: SubsecaoDaFicha };
export type ClassificacaoDaFicha = { secao: SecaoDaFicha | null; subsecao: SubsecaoDaFicha | null };
export type PaginaDeClassificacao = {
  itens: RegistroDeClassificacao[];
  proximoCursor: string | null;
  selecionados: RegistroDeClassificacao[];
  impacto?: Record<string, { fichas: number; subsecoes: number }>;
};
export type PedidoBuscaClassificacao = {
  contexto: 'formulario' | 'filtro' | 'gestao';
  nivel: 'secao' | 'subsecao';
  secaoId?: string;
  q?: string;
  cursor?: string;
  selecionados?: string[];
};
export type ResultadoBuscaClassificacao = { ok: true; pagina: PaginaDeClassificacao } | { ok: false; erro: string };
export type AcaoBuscarClassificacao = (pedido: PedidoBuscaClassificacao) => Promise<ResultadoBuscaClassificacao>;
export type ResultadoGestaoClassificacao =
  | { ok: true; alterado: RegistroDeClassificacao | null; excluido: { nivel: 'secao' | 'subsecao'; id: string } | null; mensagem: string }
  | { ok: false; erros: Partial<Record<string, string>>; conflito?: boolean; existente?: RegistroDeClassificacao };
export type EstadoGestaoClassificacao = null | ({ vez: number } & ResultadoGestaoClassificacao);
export type AcaoGerirClassificacao = (anterior: EstadoGestaoClassificacao, form: FormData) => Promise<EstadoGestaoClassificacao>;
export type PedidoGestaoClassificacao = {
  intencao: 'renomear' | 'arquivar' | 'restaurar' | 'excluir';
  nivel: 'secao' | 'subsecao';
  id: string;
  versao: string;
  nome?: unknown;
};

export function classificacaoVazia(): ClassificacaoDigitada {
  return { secao: { tipo: 'nenhuma' }, subsecao: { tipo: 'nenhuma' } };
}

export function classificacaoParaCampos(atual: ClassificacaoDaFicha): ClassificacaoDigitada {
  return {
    secao: atual.secao ? { tipo: 'existente', id: atual.secao.id } : { tipo: 'nenhuma' },
    subsecao: atual.subsecao ? { tipo: 'existente', id: atual.subsecao.id } : { tipo: 'nenhuma' },
  };
}

export function idDeClassificacaoValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) && id !== 'sem';
}

export function lerNomeDaClassificacao(valor: unknown): Leitura<string> {
  const r = nomeObrigatorio(LIMITE_NOME_CLASSIFICACAO).safeParse(valor);
  // O CHECK conta caracteres Unicode; um único emoji ocupa dois code units em JS, mas só um no Postgres.
  if (r.success && [...r.data].length < 2) return { ok: false, erros: { nome: 'Dê um nome com pelo menos 2 caracteres.' } };
  return r.success ? { ok: true, dados: r.data } : { ok: false, erros: { nome: r.error.issues[0].message } };
}

/** Proíbe campos ambíguos e repete a dependência do pai, inclusive em chamadas diretas. */
export function lerClassificacaoDigitada(valor: unknown): Leitura<ClassificacaoDigitada> {
  const erros: Record<string, string> = {};
  const objeto = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
  function escolha(nivel: 'secao' | 'subsecao'): EscolhaDeClassificacao {
    const v = objeto[nivel];
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      erros[nivel] = 'Escolha uma opção válida.';
      return { tipo: 'nenhuma' };
    }
    const e = v as Record<string, unknown>;
    const campos = e.tipo === 'existente' ? ['tipo', 'id'] : e.tipo === 'nova' ? ['tipo', 'nome'] : ['tipo'];
    if (Object.keys(e).some(k => !campos.includes(k))) erros[nivel] = 'Envie a escolha ou o nome novo, sem misturar os dois.';
    if (e.tipo === 'nenhuma') return { tipo: 'nenhuma' };
    if (e.tipo === 'existente' && idDeClassificacaoValido(e.id)) return { tipo: 'existente', id: e.id };
    if (e.tipo === 'nova') {
      const nome = lerNomeDaClassificacao(e.nome);
      if (nome.ok) return { tipo: 'nova', nome: nome.dados };
      erros[nivel] = nome.erros.nome;
    } else erros[nivel] = 'Escolha uma opção válida.';
    return { tipo: 'nenhuma' };
  }
  const secao = escolha('secao'), subsecao = escolha('subsecao');
  if (secao.tipo === 'nenhuma' && subsecao.tipo !== 'nenhuma') erros.subsecao = 'Escolha a seção antes da subseção.';
  if (secao.tipo === 'nova' && subsecao.tipo === 'existente') erros.subsecao = 'Uma seção nova só recebe uma subseção nova ou nenhuma.';
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados: { secao, subsecao } };
}

/** Ausência é compatibilidade com importação e formulários antigos, nunca limpeza implícita. */
export function classificacaoDoFormulario(form: FormData): unknown {
  if (!form.has('classificacaoNoFormulario')) return undefined;
  if (form.get('classificacaoNoFormulario') !== 'sim') return null;
  const escolha = (nivel: 'secao' | 'subsecao') => {
    const tipo = form.get(`${nivel}Modo`);
    const id = form.get(`${nivel}Id`), nome = form.get(`${nivel}Nome`);
    return { tipo, ...(id !== null && id !== '' ? { id } : {}), ...(nome !== null && nome !== '' ? { nome } : {}) };
  };
  return { secao: escolha('secao'), subsecao: escolha('subsecao') };
}
