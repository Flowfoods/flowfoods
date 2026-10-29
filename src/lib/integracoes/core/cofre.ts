/**
 * Central de Integrações (INT-1.2, decisão 484) — cofre e configuração.
 *
 *  - O segredo do app mora só no cofre (variáveis do Dokploy). O banco guarda o NOME da variável; aqui se lê o valor pelo nome,
 *    na hora de usar. Nenhuma mensagem, log ou erro carrega o valor.
 *  - O token de acesso que o provedor devolve é guardado cifrado (AES-256-GCM, chave de 32 bytes em
 *    INTEGRACAO_CHAVE_CIFRAGEM, gerada pelo serviço `segredos` do compose). O texto cifrado é amarrado ao app (dado adicional
 *    autenticado): o token de um app não decifra como token de outro. Trocar a chave invalida o cache: o serviço pede um token
 *    novo (não há o que migrar).
 *  - Chave geral INTEGRACAO_IFOOD_ATIVA: só "true" liga. Qualquer outro valor, ausência incluída, deixa tudo desligado.
 *  - O endereço da API só pode ser o oficial (https://merchant-api.ifood.com.br): credencial nunca vai para outro destino por erro
 *    de configuração.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class ErroDeCofre extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeCofre';
  }
}

type Ambiente = Readonly<Record<string, string | undefined>>;

/**
 * Só nome de segredo de app de provedor (decisão 487): `<PROVEDOR>_..._CLIENT_SECRET`, até 64 caracteres. Antes, qualquer nome de
 * variável servia, e um cadastro errado mandaria a chave de cifragem ou a URL do banco ao iFood como segredo do app.
 */
const NOME_DE_VARIAVEL = /^IFOOD_[A-Z0-9]+(?:_[A-Z0-9]+)*_CLIENT_SECRET$/;
const nomeValido = (nome: string) => typeof nome === 'string' && nome.length <= 64 && NOME_DE_VARIAVEL.test(nome);

/** O valor do segredo pelo nome da variável. Sem a variável: erro com o nome (nunca com valor). */
export function lerSegredo(nome: string, env: Ambiente = process.env): string {
  if (!nomeValido(nome)) throw new ErroDeCofre('Nome de variável do cofre inválido: só IFOOD_<NOME>_CLIENT_SECRET.');
  const valor = env[nome];
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErroDeCofre(`Falta a variável ${nome} no cofre (Dokploy → Environment). Sem ela, a integração não autentica.`);
  }
  return valor.trim();
}

/** Tem o segredo? (para a tela dizer "configurado" sem ler nem mostrar o valor). */
export function temSegredo(nome: string, env: Ambiente = process.env): boolean {
  return nomeValido(nome) && typeof env[nome] === 'string' && env[nome]!.trim() !== '';
}

/** A chave de cifragem: 64 caracteres hexadecimais (o que o serviço `segredos` gera) ou base64 de 32 bytes. */
export function chaveDeCifragem(env: Ambiente = process.env): Buffer {
  const bruto = (env.INTEGRACAO_CHAVE_CIFRAGEM ?? '').trim();
  if (!bruto) throw new ErroDeCofre('Falta a variável INTEGRACAO_CHAVE_CIFRAGEM (o serviço "segredos" do compose a gera; no painel, 64 caracteres hexadecimais).');
  const chave = /^[0-9a-fA-F]{64}$/.test(bruto) ? Buffer.from(bruto, 'hex') : /^[A-Za-z0-9+/]{43}=?$/.test(bruto) ? Buffer.from(bruto, 'base64') : null;
  if (!chave || chave.length !== 32) throw new ErroDeCofre('INTEGRACAO_CHAVE_CIFRAGEM precisa ter 32 bytes (64 caracteres hexadecimais).');
  return chave;
}

const VERSAO = 'v1';
const b64 = (b: Buffer) => b.toString('base64url');

/** Cifra o texto (o token) amarrado a `contexto` (ex.: "integracao-token:<appId>"). Cada chamada usa um IV novo. */
export function cifrar(texto: string, contexto: string, chave: Buffer): string {
  if (chave.length !== 32) throw new ErroDeCofre('Chave de cifragem inválida.');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(Buffer.from(contexto, 'utf8'));
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [VERSAO, b64(iv), b64(c.getAuthTag()), b64(corpo)].join('.');
}

/** Decifra; qualquer coisa errada (outra chave, outro contexto, texto mexido, formato) é erro — nunca devolve lixo. */
export function decifrar(cifrado: string, contexto: string, chave: Buffer): string {
  const partes = typeof cifrado === 'string' ? cifrado.split('.') : [];
  if (partes.length !== 4 || partes[0] !== VERSAO) throw new ErroDeCofre('Token cifrado em formato desconhecido.');
  try {
    const [, iv, tag, corpo] = partes;
    const d = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'), { authTagLength: 16 });
    d.setAAD(Buffer.from(contexto, 'utf8'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(corpo, 'base64url')), d.final()]).toString('utf8');
  } catch {
    throw new ErroDeCofre('Não foi possível decifrar o token guardado (chave trocada ou texto mexido). Peça um token novo.');
  }
}

/** Chave geral: só a palavra "true" liga a integração do iFood. */
export function integracaoIfoodAtiva(env: Ambiente = process.env): boolean {
  return (env.INTEGRACAO_IFOOD_ATIVA ?? '').trim() === 'true';
}

export const API_IFOOD_PADRAO = 'https://merchant-api.ifood.com.br';
const HOST_DA_API_IFOOD = 'merchant-api.ifood.com.br';

/** O endereço da API do iFood: só o host oficial, em HTTPS, sem usuário/senha nem caminho extra. Padrão: o oficial. */
export function baseDaApiIfood(env: Ambiente = process.env): string {
  const bruto = (env.IFOOD_API_BASE ?? '').trim() || API_IFOOD_PADRAO;
  let u: URL;
  try {
    u = new URL(bruto);
  } catch {
    throw new ErroDeCofre('IFOOD_API_BASE não é um endereço válido.');
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) {
    throw new ErroDeCofre('IFOOD_API_BASE precisa ser só https://merchant-api.ifood.com.br, sem caminho, usuário ou parâmetros.');
  }
  if (host !== HOST_DA_API_IFOOD) throw new ErroDeCofre(`IFOOD_API_BASE precisa ser https://${HOST_DA_API_IFOOD} (o endereço oficial da API do iFood).`);
  return `https://${host}`;
}

export interface SituacaoDaConfiguracao {
  ativa: boolean;
  /** O que falta ou está errado, em frases (sem valor nenhum). Vazio = pronto para ligar (ou ligado e pronto). */
  problemas: string[];
}

/**
 * Conferência da configuração da integração do iFood para os nomes de segredo dos apps cadastrados (a tela do nível 1 mostra
 * o que falta mesmo com a chave desligada). Ligada, tudo precisa estar certo — senão quem inicia o serviço da integração recusa
 * com estas frases (`exigirConfiguracao`).
 */
export function conferirConfiguracao(nomesDosSegredos: readonly string[], env: Ambiente = process.env): SituacaoDaConfiguracao {
  const ativa = integracaoIfoodAtiva(env);
  const problemas: string[] = [];
  const tenta = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      problemas.push(e instanceof ErroDeCofre ? e.message : 'Erro na configuração.');
    }
  };
  tenta(() => chaveDeCifragem(env));
  tenta(() => baseDaApiIfood(env));
  if (nomesDosSegredos.length === 0) problemas.push('Nenhum app cadastrado na Central de Integrações.');
  for (const nome of nomesDosSegredos) tenta(() => lerSegredo(nome, env));
  return { ativa, problemas };
}

/** Para o início do serviço da integração: ligada e com problema, falha com a lista; desligada, devolve false (não roda). */
export function exigirConfiguracao(nomesDosSegredos: readonly string[], env: Ambiente = process.env): boolean {
  const s = conferirConfiguracao(nomesDosSegredos, env);
  if (!s.ativa) return false;
  if (s.problemas.length > 0) throw new ErroDeCofre(`A integração do iFood está ligada, mas a configuração não está pronta:\n- ${s.problemas.join('\n- ')}`);
  return true;
}
