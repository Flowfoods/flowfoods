/**
 * INT-1.4 (decisão 486) — o comando da leitura TEST, no servidor (nunca no CI):
 *
 *   docker compose exec worker sh -c '. ./scripts/exportar-segredos.sh && npm run integracao:ler-test -- --client-id <Client ID do app Teste (C)> [--loja <uuid>] [--dia AAAA-MM-DD] [--token-novo]'
 *
 * Passos: confere a chave geral (INTEGRACAO_IFOOD_ATIVA) e a configuração (segredo pelo nome, chave de cifragem, endereço);
 * acha o app de TEST na Central (ou cadastra com o Client ID, que é público; o segredo continua só no cofre); faz a leitura
 * (`leitura-test.ts`) pelo cliente da INT-1.3; grava a evidência num arquivo (sem token, sem segredo) e um registro de auditoria.
 * Um 403 descarta o token guardado: depois de corrigir o módulo no Developer, a próxima execução pede outro.
 *
 * Saída: 0 = leitura oficial com HTTP 200 nos três passos; 1 = o iFood recusou ou falhou; 2 = recusado antes de chamar.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { appPorId, listarApps, registrarApp, type AppDeIntegracao } from '../core/apps';
import { armazemDoBanco } from '../core/armazem-token';
import { ErroDeCofre, exigirConfiguracao, integracaoIfoodAtiva, lerSegredo } from '../core/cofre';
import { ServicoDeToken, type ArmazemDeToken } from './auth';
import { criarClienteIfood, semSegredo, type RegistroDeChamada } from './http';
import { ErroDaLeitura, lerTest, ontemEmBrasilia } from './leitura-test';
import { Limitador } from './limitador';
import type { Transporte } from './transporte';

export interface OpcoesDoComando {
  clientId?: string;
  loja?: string;
  dia?: string;
  saida?: string;
  tokenNovo?: boolean;
}

const OPCOES_COM_VALOR = { '--client-id': 'clientId', '--loja': 'loja', '--dia': 'dia', '--saida': 'saida' } as const;

export function lerArgumentos(argv: readonly string[]): { ok: true; opcoes: OpcoesDoComando } | { ok: false; erro: string } {
  const opcoes: OpcoesDoComando = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token-novo') {
      opcoes.tokenNovo = true;
      continue;
    }
    const chave = OPCOES_COM_VALOR[a as keyof typeof OPCOES_COM_VALOR];
    if (!chave) return { ok: false, erro: `Opção desconhecida: ${a}. Use --client-id, --loja, --dia, --saida e --token-novo.` };
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith('--')) return { ok: false, erro: `Falta o valor de ${a}.` };
    opcoes[chave] = valor;
    i++;
  }
  return { ok: true, opcoes };
}

export interface DependenciasDoComando {
  transporte: Transporte;
  env: Readonly<Record<string, string | undefined>>;
  agora: () => number;
  log: (linha: string) => void;
  armazem?: ArmazemDeToken;
  gravar?: (caminho: string, conteudo: string) => Promise<void>;
}

const gravarArquivo = async (caminho: string, conteudo: string) => {
  await mkdir(join(caminho, '..'), { recursive: true, mode: 0o700 });
  await writeFile(caminho, conteudo, { encoding: 'utf8', mode: 0o600 });
};

const linhaDaChamada = (r: RegistroDeChamada) =>
  `  ${r.metodo} ${r.caminho} → ${r.status ?? 'sem resposta'} (${r.tipo}, tentativa ${r.tentativa}, ${r.duracaoMs} ms${r.requestId ? `, requestId ${r.requestId}` : ''})`;

async function acharApp(o: OpcoesDoComando, log: (l: string) => void): Promise<AppDeIntegracao | null> {
  const deTest = (await listarApps()).filter((a) => a.provedor === 'IFOOD' && a.ambiente === 'TEST');
  if (o.clientId) {
    const ja = deTest.find((a) => a.clientId === o.clientId);
    if (ja) return ja;
    const r = await registrarApp(
      { provedor: 'IFOOD', ambiente: 'TEST', nome: 'Teste (C)', categoria: 'TEST', clientId: o.clientId, nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['ANALYTICS', 'MERCHANT'] },
      'Comando da leitura TEST (INT-1.4)',
    );
    if (!r.ok) {
      log(`Não cadastrei o app de teste: ${Object.values(r.erros).join(' ')}`);
      return null;
    }
    log(`App de teste cadastrado na Central (Client ID ${o.clientId}; segredo em IFOOD_TEST_CLIENT_SECRET, no cofre).`);
    return appPorId(r.id);
  }
  if (deTest.length === 1) return deTest[0];
  log(deTest.length === 0 ? 'Nenhum app de TEST na Central: rode com --client-id <Client ID do app Teste (C)> (o Client ID é público; o segredo fica no cofre).' : `Há ${deTest.length} apps de TEST na Central; diga qual com --client-id.`);
  return null;
}

export async function executarLeituraTest(o: OpcoesDoComando, d: DependenciasDoComando): Promise<number> {
  const { log, env } = d;
  if (!integracaoIfoodAtiva(env)) {
    log('A chave geral está desligada (INTEGRACAO_IFOOD_ATIVA). Para a leitura TEST, ligue no Dokploy: sozinha ela não sincroniza nada (sincronizar pede módulo liberado, conexão e módulo ativos).');
    return 2;
  }
  const app = await acharApp(o, log);
  if (!app) return 2;
  try {
    exigirConfiguracao([app.nomeDoSegredo], env);
  } catch (e) {
    if (e instanceof ErroDeCofre) {
      log(e.message);
      return 2;
    }
    throw e;
  }

  const limitador = new Limitador();
  const paraToken = { id: app.id, ambiente: app.ambiente, clientId: app.clientId, nomeDoSegredo: app.nomeDoSegredo, homologacao: app.estadoHomologacao };
  const tokens = new ServicoDeToken({ armazem: d.armazem ?? armazemDoBanco, transporte: d.transporte, limitador, env });
  if (o.tokenNovo) {
    await tokens.invalidar(paraToken);
    log('Token guardado descartado (--token-novo): esta execução pede um novo.');
  }
  const chamadas: RegistroDeChamada[] = [];
  const cliente = criarClienteIfood({
    app: paraToken,
    tokens,
    limitador,
    transporte: d.transporte,
    env,
    registrar: (r) => {
      chamadas.push(r);
      log(linhaDaChamada(r));
    },
  });

  const dia = o.dia ?? ontemEmBrasilia(d.agora());
  log(`Leitura TEST com o app "${app.nome}" (Client ID ${app.clientId}), dia ${dia}${o.loja ? `, loja ${o.loja}` : ''}:`);
  let leitura;
  try {
    leitura = await lerTest({ app, cliente, dia, loja: o.loja, agora: d.agora() });
  } catch (e) {
    if (e instanceof ErroDaLeitura) {
      log(e.message);
      return 2;
    }
    throw e;
  }
  if (leitura.passos.some((p) => p.status === 403)) await tokens.invalidar(paraToken);

  // A evidência: sem token e sem segredo (conferido de novo antes de gravar).
  const texto = semSegredo(JSON.stringify({ ...leitura, chamadas }, null, 2));
  let segredo = '';
  try {
    segredo = lerSegredo(app.nomeDoSegredo, env);
  } catch {
    segredo = '';
  }
  if (segredo && texto.includes(segredo)) {
    log('A evidência conteria o segredo do app: não foi gravada.');
    return 1;
  }
  const arquivo = join(o.saida ?? join(tmpdir(), 'integracao-leituras'), `leitura-test-${dia}-${leitura.quando.replace(/[:.]/g, '-')}.json`);
  await (d.gravar ?? gravarArquivo)(arquivo, texto);
  await prisma.auditLog.create({
    data: {
      evento: 'integracao.leitura-test',
      dados: {
        appId: app.id,
        clientId: app.clientId,
        dia,
        loja: leitura.loja,
        ok: leitura.ok,
        passos: leitura.passos.map((p) => ({ nome: p.nome, status: p.status, requestId: p.requestId, tentativas: p.tentativas })),
      },
    },
  });

  log(leitura.conclusao);
  for (const p of leitura.passos) {
    const r = p.resumo;
    log(`- ${p.nome}: ${p.ok ? 'ok' : 'falhou'} · HTTP ${p.status ?? 'sem resposta'}${p.requestId ? ` · requestId ${p.requestId}` : ''}${r ? ` · página ${r.currentPage ?? '?'} de ${r.totalPages ?? '?'}, ${r.totalItems ?? '?'} itens no total, ${r.itensNaPagina ?? '?'} nesta página` : ''}`);
  }
  log(`Evidência (sem token nem segredo): ${arquivo}`);
  return leitura.ok ? 0 : 1;
}
