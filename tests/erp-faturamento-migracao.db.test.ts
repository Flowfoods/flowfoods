/**
 * ERP 2.1 · a migration `20261025000000_erp_faturamento` com DADO ANTIGO plantado.
 *
 * Cria dois bancos descartáveis, leva cada um até a migration anterior,
 * planta linhas de faturamento (boas e que violam cada CHECK novo, mais um
 * grão humano duplicado) e aplica a migration da 2.1:
 *  - nenhuma linha some e a migration NÃO falha por causa de dado antigo;
 *  - o CHECK violado fica NOT VALID (convalidated = false) e vale para escrita
 *    nova; os outros ficam validados;
 *  - com duplicidade humana o índice único parcial não é criado (aviso); sem
 *    ela, é criado e recusa o segundo lançamento do mesmo grão;
 *  - as lojas antigas ganham os três canais;
 *  - os CHECKs recusam por SQL cru: valor acima do teto, valor sem pedido,
 *    chave humana sem "manual:", integração sem origemRef, loja sem canal.
 *
 * Precisa de `psql` e de permissão para criar banco:
 *   ERP_DB_TESTE=postgresql://ff:ff@localhost:5432/ff_dev npx vitest run tests/erp-faturamento-migracao.db.test.ts
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL_TESTE = process.env.ERP_DB_TESTE;
const MIGRACOES = join(process.cwd(), 'prisma', 'migrations');
const DA_2_1 = '20261025000000_erp_faturamento';
const temPsql = spawnSync('psql', ['--version']).status === 0;

function urlDe(banco: string): string {
  const u = new URL(URL_TESTE!);
  u.pathname = `/${banco}`;
  u.search = '';
  return u.toString();
}

function psql(banco: string, args: string[]) {
  const r = spawnSync('psql', [urlDe(banco), '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, saida: (r.stdout ?? '').trim(), aviso: r.stderr ?? '' };
}
const sql = (banco: string, texto: string) => psql(banco, ['-c', texto]);
const arquivo = (banco: string, nome: string) => psql(banco, ['-f', join(MIGRACOES, nome, 'migration.sql')]);

function ate(anteriorA: string) {
  return readdirSync(MIGRACOES).filter((n) => /^\d{14}_/.test(n) && n < anteriorA).sort();
}

const CAMPOS = '(id,"parceiroId","lojaId",canal,data,"valorCentavos",pedidos,clientes,origem,"chaveIdempotencia","origemRef","atualizadoEm")';
const linha = (id: string, loja: string, canal: string, data: string, valor: number, pedidos: number, origem: string, chave: string, ref = 'NULL') =>
  `('${id}','p1','${loja}','${canal}','${data}',${valor},${pedidos},${pedidos},'${origem}','${chave}',${ref},now())`;

describe.skipIf(!URL_TESTE || !temPsql)('ERP 2.1 · migration com dado antigo (Postgres real)', { timeout: 180_000 }, () => {
  const sufixo = globalThis.crypto.randomUUID().slice(0, 8).replace(/-/g, '');
  const sujo = `ff_mig21s_${sufixo}`;
  const limpo = `ff_mig21l_${sufixo}`;

  function prepararAteAAnterior(banco: string) {
    expect(sql('postgres', `CREATE DATABASE ${banco}`).ok, `criar ${banco}`).toBe(true);
    for (const m of ate(DA_2_1)) {
      const r = arquivo(banco, m);
      expect(r.ok, m).toBe(true);
    }
    expect(
      sql(
        banco,
        `INSERT INTO "ParceiroFlow"(id,nome,slug,status) VALUES ('p1','P1','p1','ATIVO');
         INSERT INTO "Loja"(id,"parceiroId",nome,slug) VALUES ('l1','p1','Loja 1','l1'),('l2','p1','Loja 2','l2');`,
      ).ok,
    ).toBe(true);
  }

  beforeAll(() => {
    prepararAteAAnterior(sujo);
    prepararAteAAnterior(limpo);
    // Banco "sujo": cinco linhas que violam, uma de cada CHECK, mais duas boas.
    const r = sql(
      sujo,
      `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES
        ${linha('boa1', 'l1', 'LOJA', '2026-10-01', 100000, 20, 'MANUAL', 'manual:l1:-:LOJA:2026-10-01')},
        ${linha('boa2', 'l1', 'IFOOD', '2026-10-01', 50000, 10, 'INTEGRACAO', 'ifood:dia:abc', `'abc'`)},
        ${linha('v_valor_sem_pedido', 'l2', 'LOJA', '2026-10-01', 500, 0, 'MANUAL', 'manual:l2:-:LOJA:2026-10-01')},
        ${linha('v_data_antiga', 'l2', 'IFOOD', '2019-01-01', 500, 1, 'MANUAL', 'manual:l2:-:IFOOD:2019-01-01')},
        ${linha('v_chave_fora', 'l2', 'DELIVERY_PROPRIO', '2026-10-02', 500, 1, 'MANUAL', 'qualquer-coisa')},
        ${linha('v_integracao_sem_ref', 'l2', 'DELIVERY_PROPRIO', '2026-10-03', 500, 1, 'INTEGRACAO', 'ifood:dia:xyz')},
        ${linha('v_teto', 'l2', 'LOJA', '2026-10-04', 200000000, 5, 'MANUAL', 'manual:l2:-:LOJA:2026-10-04')};
       INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES
        ${linha('dup1', 'l1', 'DELIVERY_PROPRIO', '2026-10-05', 700, 1, 'MANUAL', 'manual:l1:-:DELIVERY_PROPRIO:2026-10-05')},
        ${linha('dup2', 'l1', 'DELIVERY_PROPRIO', '2026-10-05', 800, 1, 'IMPORTACAO', 'manual:l1:-:DELIVERY_PROPRIO:2026-10-05:b')};`,
    );
    expect(r.ok, r.aviso).toBe(true);
    // Banco "limpo": só linhas boas.
    expect(
      sql(
        limpo,
        `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES
          ${linha('boa1', 'l1', 'LOJA', '2026-10-01', 100000, 20, 'MANUAL', 'manual:l1:-:LOJA:2026-10-01')},
          ${linha('boa2', 'l1', 'IFOOD', '2026-10-01', 50000, 10, 'INTEGRACAO', 'ifood:dia:abc', `'abc'`)};`,
      ).ok,
    ).toBe(true);
  });

  afterAll(() => {
    sql('postgres', `DROP DATABASE IF EXISTS ${sujo} WITH (FORCE)`);
    sql('postgres', `DROP DATABASE IF EXISTS ${limpo} WITH (FORCE)`);
  });

  it('dado antigo que viola: a migration passa, avisa, e nenhuma linha some', () => {
    const antes = sql(sujo, 'SELECT count(*) FROM "FaturamentoLancamento"').saida;
    expect(antes).toBe('9');
    const r = arquivo(sujo, DA_2_1);
    expect(r.ok, r.aviso).toBe(true);
    expect(r.aviso).toContain('ficou NOT VALID');
    expect(r.aviso).toContain('grao_humano');
    expect(sql(sujo, 'SELECT count(*) FROM "FaturamentoLancamento"').saida).toBe(antes);
    expect(sql(sujo, 'SELECT count(*) FROM "Loja"').saida).toBe('2');
  });

  it('o CHECK violado fica NOT VALID; os que as linhas respeitam ficam validados', () => {
    const estado = Object.fromEntries(
      sql(sujo, `SELECT conname || '=' || convalidated FROM pg_constraint WHERE conname LIKE 'FaturamentoLancamento\\_%' OR conname = 'Loja_canais_ao_menos_um' ORDER BY 1`)
        .saida.split('\n')
        .map((l) => l.split('=')),
    );
    expect(estado['FaturamentoLancamento_valor_tem_pedido']).toBe('false');
    expect(estado['FaturamentoLancamento_data_minima']).toBe('false');
    expect(estado['FaturamentoLancamento_chave_do_espaco']).toBe('false');
    expect(estado['FaturamentoLancamento_integracao_tem_ref']).toBe('false');
    expect(estado['FaturamentoLancamento_valor_teto']).toBe('false');
    expect(estado['FaturamentoLancamento_pedidos_teto']).toBe('true');
    expect(estado['FaturamentoLancamento_clientes_teto']).toBe('true');
    expect(estado['FaturamentoLancamento_textos_curtos']).toBe('true');
    expect(estado['Loja_canais_ao_menos_um']).toBe('true');
  });

  it('com duplicidade humana antiga o índice não é criado; as lojas antigas vendem nos três canais', () => {
    expect(sql(sujo, `SELECT count(*) FROM pg_indexes WHERE indexname = 'FaturamentoLancamento_grao_humano'`).saida).toBe('0');
    expect(sql(sujo, `SELECT DISTINCT "canaisDeVenda"::text FROM "Loja"`).saida).toBe('{LOJA,DELIVERY_PROPRIO,IFOOD}');
  });

  it('o CHECK NOT VALID vale para escrita nova e a linha antiga boa continua editável', () => {
    const nova = sql(sujo, `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES ${linha('n1', 'l1', 'LOJA', '2026-10-09', 900, 0, 'MANUAL', 'manual:l1:-:LOJA:2026-10-09')}`);
    expect(nova.ok).toBe(false);
    expect(nova.aviso).toContain('FaturamentoLancamento_valor_tem_pedido');
    expect(sql(sujo, `UPDATE "FaturamentoLancamento" SET pedidos = 21 WHERE id = 'boa1'`).ok).toBe(true);
  });

  it('dado antigo bom: tudo validado, índice criado, mesma contagem', () => {
    const r = arquivo(limpo, DA_2_1);
    expect(r.ok, r.aviso).toBe(true);
    expect(r.aviso).not.toContain('WARNING');
    expect(sql(limpo, 'SELECT count(*) FROM "FaturamentoLancamento"').saida).toBe('2');
    expect(sql(limpo, `SELECT count(*) FROM pg_constraint WHERE (conname LIKE 'FaturamentoLancamento\\_%' OR conname = 'Loja_canais_ao_menos_um') AND NOT convalidated`).saida).toBe('0');
    expect(sql(limpo, `SELECT count(*) FROM pg_indexes WHERE indexname = 'FaturamentoLancamento_grao_humano'`).saida).toBe('1');
  });

  it('os CHECKs e o índice recusam por SQL cru', () => {
    const tenta = (id: string, resto: string, esperado: string) => {
      const r = sql(limpo, `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES ${resto.replace('$ID', id)}`);
      expect(r.ok, `${id} deveria ser recusada`).toBe(false);
      expect(r.aviso, id).toContain(esperado);
    };
    tenta('x1', linha('$ID', 'l1', 'LOJA', '2026-10-02', 100000001, 5, 'MANUAL', 'manual:l1:-:LOJA:2026-10-02'), 'FaturamentoLancamento_valor_teto');
    tenta('x2', linha('$ID', 'l1', 'LOJA', '2026-10-03', 100, 0, 'MANUAL', 'manual:l1:-:LOJA:2026-10-03'), 'FaturamentoLancamento_valor_tem_pedido');
    tenta('x3', linha('$ID', 'l1', 'LOJA', '2026-10-04', 100, 1, 'MANUAL', 'sem-prefixo'), 'FaturamentoLancamento_chave_do_espaco');
    tenta('x4', linha('$ID', 'l1', 'LOJA', '2026-10-05', 100, 1, 'INTEGRACAO', 'manual:l1:-:LOJA:2026-10-05', `'r'`), 'FaturamentoLancamento_chave_do_espaco');
    tenta('x5', linha('$ID', 'l1', 'LOJA', '2026-10-06', 100, 1, 'INTEGRACAO', 'ifood:pedido:9'), 'FaturamentoLancamento_integracao_tem_ref');
    tenta('x6', linha('$ID', 'l1', 'LOJA', '2019-12-31', 100, 1, 'MANUAL', 'manual:l1:-:LOJA:2019-12-31'), 'FaturamentoLancamento_data_minima');
    tenta('x7', linha('$ID', 'l1', 'LOJA', '2026-10-07', 100, 100001, 'MANUAL', 'manual:l1:-:LOJA:2026-10-07'), 'FaturamentoLancamento_clientes_teto');
    // Grão humano repetido com chave diferente: o índice parcial segura (a chave determinística não bastaria).
    tenta('x8', linha('$ID', 'l1', 'LOJA', '2026-10-01', 1, 1, 'IMPORTACAO', 'manual:l1:-:LOJA:2026-10-01:outra'), 'FaturamentoLancamento_grao_humano');
    // Integração no mesmo grão do humano pode (vários pedidos): o índice só vale para o humano.
    expect(sql(limpo, `INSERT INTO "FaturamentoLancamento"${CAMPOS} VALUES ${linha('i1', 'l1', 'IFOOD', '2026-10-01', 10, 1, 'INTEGRACAO', 'ifood:pedido:1', `'1'`)}, ${linha('i2', 'l1', 'IFOOD', '2026-10-01', 20, 1, 'INTEGRACAO', 'ifood:pedido:2', `'2'`)}`).ok).toBe(true);
    const loja = sql(limpo, `UPDATE "Loja" SET "canaisDeVenda" = '{}' WHERE id = 'l1'`);
    expect(loja.ok).toBe(false);
    expect(loja.aviso).toContain('Loja_canais_ao_menos_um');
    expect(sql(limpo, `UPDATE "Loja" SET "canaisDeVenda" = '{DELIVERY_PROPRIO}' WHERE id = 'l1'`).ok).toBe(true);
  });
});
