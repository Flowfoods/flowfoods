/**
 * INT-1.1 (decisões 481 a 483) — sem banco: o ciclo dos módulos, a leitura dos formulários do nível 1 e as guardas de código.
 *  - transições: o que vale de cada estado, TEST × PRODUCAO, a sincronização só com tudo junto;
 *  - o app guarda o NOME da variável do cofre, nunca um valor com cara de segredo; categoria × ambiente × módulos;
 *  - o id da loja do iFood é UUID (maiúscula vira minúscula);
 *  - tabela global da integração só em `src/lib/integracoes/`; as funções que gravam a Central e a liberação não são chamadas
 *    por rota nem tela do parceiro.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACOES_DO_MODULO, ESTADOS_DO_MODULO, podeSincronizar, porQueNao, transicao } from '@/lib/integracoes/core/estados';
import { lerApp, lerConexao, lerIdDaLojaIfood, MODULOS_DA_CATEGORIA } from '@/lib/integracoes/core/campos';
import { ehModuloComLiberacao, MODULOS_COM_LIBERACAO } from '@/lib/erp/liberacao';

describe('INT-1.1 · o ciclo de um módulo', () => {
  it('a tabela de transições', () => {
    expect(transicao('NAO_SOLICITADO', 'solicitar', 'PRODUCAO')).toBe('SOLICITADO');
    expect(transicao('SOLICITADO', 'autorizar', 'PRODUCAO')).toBe('AUTORIZADO');
    expect(transicao('AUTORIZADO', 'ativar', 'PRODUCAO')).toBe('ATIVO');
    expect(transicao('ATIVO', 'pausar', 'PRODUCAO')).toBe('PAUSADO');
    expect(transicao('PAUSADO', 'retomar', 'PRODUCAO')).toBe('ATIVO');
    expect(transicao('ATIVO', 'erro-permissao', 'PRODUCAO')).toBe('ERRO_PERMISSAO');
    expect(transicao('ERRO_PERMISSAO', 'solicitar', 'PRODUCAO')).toBe('SOLICITADO');
    expect(transicao('ERRO_PERMISSAO', 'autorizar', 'PRODUCAO')).toBe('AUTORIZADO');
    expect(transicao('SOLICITADO', 'cancelar-pedido', 'PRODUCAO')).toBe('NAO_SOLICITADO');
  });

  it('o que não vale não muda (null): ativar sem autorização, ativar duas vezes, pausar o que não roda, 403 em quem nunca teve acesso', () => {
    expect(transicao('NAO_SOLICITADO', 'ativar', 'PRODUCAO')).toBeNull();
    expect(transicao('SOLICITADO', 'ativar', 'PRODUCAO')).toBeNull();
    expect(transicao('ATIVO', 'ativar', 'PRODUCAO')).toBeNull();
    expect(transicao('AUTORIZADO', 'pausar', 'PRODUCAO')).toBeNull();
    expect(transicao('NAO_SOLICITADO', 'erro-permissao', 'PRODUCAO')).toBeNull();
    expect(transicao('ERRO_PERMISSAO', 'ativar', 'PRODUCAO')).toBeNull();
    // Toda combinação devolve um estado conhecido ou null; nunca um valor fora da lista.
    for (const e of ESTADOS_DO_MODULO) for (const a of ACOES_DO_MODULO) for (const amb of ['TEST', 'PRODUCAO'] as const) {
      const r = transicao(e, a, amb);
      expect(r === null || (ESTADOS_DO_MODULO as readonly string[]).includes(r)).toBe(true);
    }
  });

  it('TEST: a loja de teste já vem autorizada para o app de teste; PRODUCAO: sempre pelo pedido e pela aprovação da loja', () => {
    expect(transicao('NAO_SOLICITADO', 'autorizar', 'TEST')).toBe('AUTORIZADO');
    expect(transicao('NAO_SOLICITADO', 'autorizar', 'PRODUCAO')).toBeNull();
    expect(porQueNao('NAO_SOLICITADO', 'autorizar', 'PRODUCAO')).toMatch(/aprovar no Portal do Parceiro/);
    expect(porQueNao('ATIVO', 'ativar', 'PRODUCAO')).toBe('Este módulo está ativo: não dá para ativar agora.');
  });

  it('sincroniza só com tudo junto: liberado, conexão ativa, módulo ativo e chave geral', () => {
    const tudo = { liberado: true, conexaoAtiva: true, estado: 'ATIVO' as const, chaveGeral: true, ambienteCombina: true, appPronto: true };
    expect(podeSincronizar(tudo)).toBe(true);
    expect(podeSincronizar({ ...tudo, liberado: false })).toBe(false);
    expect(podeSincronizar({ ...tudo, conexaoAtiva: false })).toBe(false);
    expect(podeSincronizar({ ...tudo, chaveGeral: false })).toBe(false);
    expect(podeSincronizar({ ...tudo, ambienteCombina: false })).toBe(false);
    expect(podeSincronizar({ ...tudo, appPronto: false })).toBe(false);
    for (const e of ESTADOS_DO_MODULO.filter((x) => x !== 'ATIVO')) expect(podeSincronizar({ ...tudo, estado: e }), e).toBe(false);
  });
});

describe('INT-1.1 · o app no provedor: só o nome da variável do cofre', () => {
  const base = { provedor: 'IFOOD', ambiente: 'TEST', nome: 'Teste (C)', categoria: 'TEST', clientId: 'a932c3e2-6117-4df2-8c72-1a7b9ccda4f4', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', modulos: ['ANALYTICS'] };

  it('o app de teste do plano entra como está', () => {
    const r = lerApp(base);
    expect(r.ok && r.dados).toEqual({ ...base, modulos: ['ANALYTICS'] });
  });

  it('um valor com cara de segredo no lugar do nome é recusado (minúsculas, símbolos, tamanho de chave)', () => {
    for (const valor of ['abc123def456ghi789jkl012mno345pqr678', 'sk_live_51H8xyz', 'IFOOD SECRET', 'x', 'A1', `A${'B'.repeat(64)}`]) {
      const r = lerApp({ ...base, nomeDoSegredo: valor });
      expect(r.ok, valor).toBe(false);
      if (!r.ok) expect(r.erros.nomeDoSegredo).toMatch(/Nunca cole o segredo aqui/);
    }
  });

  it('o segredo combina com o ambiente: app de teste só com IFOOD_TEST_..., app de produção nunca com ele (decisão 489)', () => {
    const r1 = lerApp({ ...base, nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET' });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.erros.nomeDoSegredo).toMatch(/começa com IFOOD_TEST_/);
    const r2 = lerApp({ ...base, ambiente: 'PRODUCAO', categoria: 'BI', nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.erros.nomeDoSegredo).toMatch(/não usa o segredo de teste/);
    expect(lerApp({ ...base, nomeDoSegredo: 'IFOOD_TEST_C_CLIENT_SECRET' }).ok).toBe(true);
    expect(lerApp({ ...base, ambiente: 'PRODUCAO', categoria: 'BI', nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET' }).ok).toBe(true);
    // "TESTE" não é "TEST_": o nome de produção que só começa parecido continua de produção.
    expect(lerApp({ ...base, ambiente: 'PRODUCAO', categoria: 'BI', nomeDoSegredo: 'IFOOD_TESTE_BI_CLIENT_SECRET' }).ok).toBe(true);
  });

  it('categoria × ambiente × módulos, como a política de homologação do iFood', () => {
    expect(lerApp({ ...base, ambiente: 'PRODUCAO' }).ok).toBe(false);
    expect(lerApp({ ...base, ambiente: 'PRODUCAO', nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', categoria: 'BI' }).ok).toBe(true);
    const bi = lerApp({ ...base, ambiente: 'PRODUCAO', nomeDoSegredo: 'IFOOD_BI_CLIENT_SECRET', categoria: 'BI', modulos: ['ANALYTICS', 'REVIEW'] });
    expect(!bi.ok && bi.erros.modulos).toMatch(/não pertence à categoria/);
    expect(MODULOS_DA_CATEGORIA.BI).toEqual(['ANALYTICS']);
    expect(lerApp({ ...base, modulos: [] }).ok).toBe(false);
    expect(lerApp({ ...base, modulos: ['ANALYTICS', 'PEDIDOS'] }).ok).toBe(false);
    expect(lerApp({ ...base, clientId: 'com espaço' }).ok).toBe(false);
  });
});

describe('INT-1.1 · a ligação de uma loja do iFood', () => {
  const ok = { lojaId: 'l1', provedor: 'IFOOD', ambiente: 'TEST', idExterno: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE', nomeExterno: 'Loja de teste' };

  it('o id da loja é UUID; maiúscula vira minúscula; espaço nas pontas sai', () => {
    expect(lerIdDaLojaIfood('  AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE ')).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(lerIdDaLojaIfood('1234')).toBeNull();
    expect(lerIdDaLojaIfood("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee'")).toBeNull();
    const r = lerConexao(ok);
    expect(r.ok && r.dados.idExterno).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(r.ok && r.dados.marcaId).toBeNull();
  });

  it('cada campo errado diz o que fazer', () => {
    const r = lerConexao({ lojaId: '', provedor: 'RAPPI', ambiente: 'HOMOLOG', idExterno: 'x', idCurto: 'com espaço', nomeExterno: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(['ambiente', 'idCurto', 'idExterno', 'lojaId', 'nomeExterno', 'provedor']);
  });
});

describe('INT-1.1 · a liberação de módulos (base)', () => {
  it('hoje só o Integração depende dela; os módulos que já existem não', () => {
    expect([...MODULOS_COM_LIBERACAO]).toEqual(['integracao']);
    expect(ehModuloComLiberacao('integracao')).toBe(true);
    for (const m of ['insumos', 'fichas', 'compras', 'estoque', 'dre']) expect(ehModuloComLiberacao(m), m).toBe(false);
  });
});

// ------------------------------------------------------------------ guardas de código
function arquivos(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(arquivos(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) out.push(p);
  }
  return out;
}

describe('INT-1.1 · guardas', () => {
  it('as tabelas globais da integração (apps e token) só são tocadas em src/lib/integracoes/', () => {
    const furos: string[] = [];
    for (const raiz of ['src', 'scripts', 'worker']) {
      for (const f of arquivos(raiz)) {
        if (f.startsWith(join('src', 'lib', 'integracoes') + '/')) continue;
        const txt = readFileSync(f, 'utf8');
        if (/\.\s*integracao(App|Token)\s*\./.test(txt)) furos.push(`${f}: integracaoApp/integracaoToken`);
        if (/\$(queryRaw|executeRaw)[\s\S]{0,400}"Integracao(App|Token)"/.test(txt)) furos.push(`${f}: SQL cru na tabela global`);
      }
    }
    expect(furos).toEqual([]);
  });

  it('rota e tela do parceiro não importam quem grava a Central ou a liberação (só o nível 1 e o serviço da integração)', () => {
    const furos: string[] = [];
    for (const raiz of [join('src', 'app', 'erp'), join('src', 'app', 'entrar'), join('src', 'components', 'erp'), join('src', 'lib', 'integracoes', 'core', 'do-parceiro.ts')]) {
      for (const f of raiz.endsWith('.ts') ? [raiz] : arquivos(raiz)) {
        const txt = readFileSync(f, 'utf8');
        if (/from\s+['"](@\/lib\/integracoes\/core|\.)\/(conexoes|apps)['"]/.test(txt)) furos.push(`${f}: importa a Central`);
        if (/\.\s*integracao(App|Token)\b/.test(txt)) furos.push(`${f}: tabela global`);
        if (/\b(mudarLiberacao|ligarConexao|desligarConexao|prepararModulo|mudarModulo|registrarApp)\b/.test(txt)) furos.push(`${f}: chama quem grava`);
      }
    }
    expect(furos).toEqual([]);
  });

  it('a Central do nível 1 não chama o iFood: nem o cliente, nem o token, nem o transporte (a única chamada é o comando da leitura TEST)', () => {
    const raiz = join('src', 'app', 'rodolfo', '(painel)', 'integracoes');
    const furos: string[] = [];
    for (const f of [...arquivos(raiz), join('src', 'lib', 'integracoes', 'core', 'central.ts')]) {
      const txt = readFileSync(f, 'utf8');
      if (/(from\s+|import\s*\(\s*|require\s*\(\s*)['"](@\/lib\/integracoes\/ifood|\.\.\/ifood)\//.test(txt)) furos.push(`${f}: importa o cliente do iFood`);
      // O armazém do token importa o serviço de token do iFood: a Central lê só as datas, por central.ts.
      if (/['"](@\/lib\/integracoes\/core\/armazem-token|\.\/armazem-token)['"]/.test(txt)) furos.push(`${f}: importa o armazém do token`);
      if (/\bfetch\s*\(/.test(txt)) furos.push(`${f}: fetch`);
      if (/testar conex/i.test(txt)) furos.push(`${f}: "testar conexão"`);
    }
    expect(arquivos(raiz).length).toBeGreaterThan(0);
    expect(furos).toEqual([]);
  });

  it('toda ação da Central abre conferindo a sessão do nível 1 (uma action responde a POST em qualquer rota)', () => {
    const txt = readFileSync(join('src', 'app', 'rodolfo', '(painel)', 'integracoes', 'actions.ts'), 'utf8');
    const acoes = [...txt.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
    expect(acoes.length).toBeGreaterThanOrEqual(7);
    for (const [, nome, primeira] of acoes) expect(primeira, nome).toMatch(/^\s+const (sessao|ctx) = await (exigirNivel1\(\)|exigirParceiro\(slug\));$/);
  });
});
