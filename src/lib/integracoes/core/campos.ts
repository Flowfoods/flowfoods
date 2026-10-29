/**
 * Central de Integrações (INT-1.1) — leitura dos formulários do nível 1, pura (sem banco): o que chega como texto vira dado
 * conferido, ou a frase do campo. O banco confere de novo (CHECKs e gatilhos da migration 20261115000000).
 */

export const PROVEDORES = ['IFOOD'] as const;
export type Provedor = (typeof PROVEDORES)[number];
export const AMBIENTES = ['TEST', 'PRODUCAO'] as const;
export type AmbienteDeIntegracao = (typeof AMBIENTES)[number];
export const MODULOS = ['ANALYTICS', 'FINANCIAL', 'REVIEW', 'MERCHANT'] as const;
export type Modulo = (typeof MODULOS)[number];
export const CATEGORIAS = ['TEST', 'BI', 'FINANCAS', 'AVALIACOES'] as const;
export type CategoriaDeApp = (typeof CATEGORIAS)[number];

/** Que módulos cada categoria de app libera no iFood (política de homologação, para os apps que a FlowFoods usa). */
export const MODULOS_DA_CATEGORIA: Record<CategoriaDeApp, readonly Modulo[]> = {
  TEST: MODULOS,
  BI: ['ANALYTICS'],
  FINANCAS: ['MERCHANT', 'FINANCIAL'],
  AVALIACOES: ['MERCHANT', 'REVIEW'],
};

export const ROTULO_DO_AMBIENTE: Record<AmbienteDeIntegracao, string> = { TEST: 'Ambiente de teste', PRODUCAO: 'Produção' };
export const ROTULO_DO_MODULO: Record<Modulo, string> = { ANALYTICS: 'Analytics', FINANCIAL: 'Financeiro', REVIEW: 'Avaliações', MERCHANT: 'Loja' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_CURTO = /^[A-Za-z0-9-]{1,40}$/;
const CLIENT_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const NOME_DO_SEGREDO = /^[A-Z][A-Z0-9_]{2,63}$/;

const texto = (x: unknown) => (typeof x === 'string' ? x.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
const temControle = (s: string) => /[\u0000-\u001f\u007f]/.test(s);

export function ehProvedor(x: unknown): x is Provedor {
  return typeof x === 'string' && (PROVEDORES as readonly string[]).includes(x);
}
export function ehAmbiente(x: unknown): x is AmbienteDeIntegracao {
  return typeof x === 'string' && (AMBIENTES as readonly string[]).includes(x);
}
export function ehModulo(x: unknown): x is Modulo {
  return typeof x === 'string' && (MODULOS as readonly string[]).includes(x);
}
export function ehCategoria(x: unknown): x is CategoriaDeApp {
  return typeof x === 'string' && (CATEGORIAS as readonly string[]).includes(x);
}

/** O id da loja no iFood (merchantId): UUID; a API devolve minúsculo, e é assim que se grava (maiúscula colada do Portal vira minúscula). */
export function lerIdDaLojaIfood(x: unknown): string | null {
  const s = texto(x).toLowerCase();
  return UUID.test(s) ? s : null;
}

export interface DadosDaConexao {
  lojaId: string;
  marcaId: string | null;
  provedor: Provedor;
  ambiente: AmbienteDeIntegracao;
  idExterno: string;
  idCurto: string | null;
  nomeExterno: string;
}

export type CampoDaConexao = 'lojaId' | 'marcaId' | 'provedor' | 'ambiente' | 'idExterno' | 'idCurto' | 'nomeExterno';
export type LeituraDaConexao = { ok: true; dados: DadosDaConexao } | { ok: false; erros: Partial<Record<CampoDaConexao, string>> };

export function lerConexao(e: Record<string, unknown>): LeituraDaConexao {
  const erros: Partial<Record<CampoDaConexao, string>> = {};
  const lojaId = texto(e.lojaId);
  if (!lojaId || lojaId.length > 60) erros.lojaId = 'Escolha a loja do parceiro.';
  const marcaTexto = texto(e.marcaId);
  const marcaId = marcaTexto ? marcaTexto : null;
  if (marcaId && marcaId.length > 60) erros.marcaId = 'Escolha a marca da lista.';
  if (!ehProvedor(e.provedor)) erros.provedor = 'Escolha o provedor.';
  if (!ehAmbiente(e.ambiente)) erros.ambiente = 'Escolha o ambiente.';
  const idExterno = e.provedor === 'IFOOD' ? lerIdDaLojaIfood(e.idExterno) : null;
  if (!idExterno) erros.idExterno = 'Cole o id da loja no iFood como aparece no Portal do Parceiro (8-4-4-4-12 letras e números).';
  const curto = texto(e.idCurto);
  const idCurto = curto ? curto : null;
  if (idCurto && !ID_CURTO.test(idCurto)) erros.idCurto = 'O id curto tem só letras, números e hífen (até 40).';
  const nomeExterno = texto(e.nomeExterno);
  if (!nomeExterno || nomeExterno.length > 120 || temControle(nomeExterno)) erros.nomeExterno = 'Escreva o nome da loja como aparece no iFood (até 120 caracteres).';
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: { lojaId, marcaId, provedor: e.provedor as Provedor, ambiente: e.ambiente as AmbienteDeIntegracao, idExterno: idExterno!, idCurto, nomeExterno } };
}

export interface DadosDoApp {
  provedor: Provedor;
  ambiente: AmbienteDeIntegracao;
  nome: string;
  categoria: CategoriaDeApp;
  clientId: string;
  nomeDoSegredo: string;
  modulos: Modulo[];
}

export type CampoDoApp = 'provedor' | 'ambiente' | 'nome' | 'categoria' | 'clientId' | 'nomeDoSegredo' | 'modulos';
export type LeituraDoApp = { ok: true; dados: DadosDoApp } | { ok: false; erros: Partial<Record<CampoDoApp, string>> };

/**
 * O app no provedor. O segredo NUNCA passa por aqui: só o nome da variável do cofre (ex.: IFOOD_TEST_CLIENT_SECRET). Um valor
 * com cara de segredo no lugar do nome é recusado (minúsculas, tamanho de chave), para ninguém colar a chave por engano.
 */
export function lerApp(e: Record<string, unknown>): LeituraDoApp {
  const erros: Partial<Record<CampoDoApp, string>> = {};
  if (!ehProvedor(e.provedor)) erros.provedor = 'Escolha o provedor.';
  if (!ehAmbiente(e.ambiente)) erros.ambiente = 'Escolha o ambiente.';
  const nome = texto(e.nome);
  if (!nome || nome.length > 80 || temControle(nome)) erros.nome = 'Dê um nome ao app (até 80 caracteres).';
  if (!ehCategoria(e.categoria)) erros.categoria = 'Escolha a categoria do app no iFood.';
  else if (ehAmbiente(e.ambiente) && (e.categoria === 'TEST') !== (e.ambiente === 'TEST')) {
    erros.categoria = 'O app de teste é do ambiente de teste; o de produção é BI, Finanças ou Avaliações.';
  }
  const clientId = texto(e.clientId);
  if (!CLIENT_ID.test(clientId)) erros.clientId = 'Cole o Client ID do app (sem espaços).';
  const nomeDoSegredo = texto(e.nomeDoSegredo);
  if (!NOME_DO_SEGREDO.test(nomeDoSegredo)) {
    erros.nomeDoSegredo = 'Escreva só o NOME da variável do cofre, em maiúsculas (ex.: IFOOD_TEST_CLIENT_SECRET). Nunca cole o segredo aqui.';
  }
  const lista = Array.isArray(e.modulos) ? e.modulos : typeof e.modulos === 'string' ? [e.modulos] : [];
  const modulos = Array.from(new Set(lista.filter(ehModulo)));
  if (modulos.length === 0 || modulos.length !== lista.length) erros.modulos = 'Marque os módulos que o app usa.';
  else if (ehCategoria(e.categoria) && modulos.some((m) => !MODULOS_DA_CATEGORIA[e.categoria as CategoriaDeApp].includes(m))) {
    erros.modulos = 'Algum módulo marcado não pertence à categoria deste app no iFood.';
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    dados: { provedor: e.provedor as Provedor, ambiente: e.ambiente as AmbienteDeIntegracao, nome, categoria: e.categoria as CategoriaDeApp, clientId, nomeDoSegredo, modulos },
  };
}
