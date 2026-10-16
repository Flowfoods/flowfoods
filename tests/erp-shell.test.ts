/**
 * ERP 1.1 — shell único (/erp e /rodolfo), sem banco:
 *
 * - menu e hub mostram só os módulos que o alcance libera (Dono, Gerente,
 *   Operador, N3, perfil sem insumos) + os futuros desabilitados, sem link;
 * - o nível 1 ganha o Barney antigo como módulos e o ERP do parceiro dentro
 *   do parceiro;
 * - visão (Rede Completa ↔ loja): cookie forjado/velho cai na primeira opção
 *   permitida e a ACTION recusa loja fora do alcance (sem gravar cookie);
 * - tema: cookie lido só pelos layouts do shell, nunca pelo layout raiz (o
 *   site institucional segue estático);
 * - rotas fora do shell (login, setup, /entrar, /portal);
 * - guarda: toda tela do shell confere sessão/permissão, sem cor fixa em
 *   classe, sem import de rota para rota, kits antigos removidos.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import {
  iniciais,
  itemAtivo,
  modulosDoParceiro,
  MODULOS_FUTUROS,
  navegacaoDoParceiro,
  telasDaNavegacao,
} from '@/lib/erp/modulos';
import { comParceiroAtual, modulosDoNivel1, navegacaoDoNivel1, slugNoCaminho } from '@/lib/rodolfo/modulos';
import {
  escolhaDoCookie,
  escolhaPermitida,
  opcoesDeVisao,
  resolverVisao,
  rotuloDaVisao,
  valorDoCookieDeVisao,
} from '@/lib/erp/visao';
import { lerMenuRecolhido, lerTema } from '@/lib/erp/tema';

const vinculo = (v: Partial<VinculoDePermissao>): VinculoDePermissao => ({
  perfilBase: 'OPERADOR',
  perfilProprio: null,
  permissoesExtras: [],
  permissoesRemovidas: [],
  redeInteira: true,
  lojaIds: [],
  ...v,
});
const alcance = (v: Partial<VinculoDePermissao>) => resolverAlcance(vinculo(v));

const hrefs = (a: Alcance, base?: string) =>
  modulosDoParceiro(a, base).flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => i.href)));
const futuros = (a: Alcance) =>
  modulosDoParceiro(a)
    .filter((m) => !m.href)
    .map((m) => m.chave);

describe('ERP 1.1 · menu e hub do parceiro só com o que o alcance libera', () => {
  it('Dono: todas as telas construídas e os seis módulos futuros', () => {
    const a = alcance({ perfilBase: 'DONO' });
    expect(hrefs(a)).toEqual(['/erp/insumos', '/erp/insumos/novo', '/erp/lojas', '/erp/equipe', '/erp/historico', '/erp/acesso']);
    expect(futuros(a)).toEqual(['fichas', 'compras', 'estoque', 'dre', 'producao', 'etiquetas']);
  });

  it('Gerente: sem Equipe (não cuida da equipe); com Histórico (rede inteira)', () => {
    const h = hrefs(alcance({ perfilBase: 'GERENTE' }));
    expect(h).toContain('/erp/insumos');
    expect(h).toContain('/erp/historico');
    expect(h).not.toContain('/erp/equipe');
  });

  it('Operador: insumos, lojas e Seu acesso; sem Equipe e Histórico; futuros só os que ele vai ver', () => {
    const a = alcance({ perfilBase: 'OPERADOR' });
    expect(hrefs(a)).toEqual(['/erp/insumos', '/erp/lojas', '/erp/acesso']);
    expect(futuros(a)).toEqual(['fichas', 'estoque', 'producao', 'etiquetas']);
  });

  it('Gerente de uma loja só (N3): Histórico some (exige a rede inteira)', () => {
    const h = hrefs(alcance({ perfilBase: 'GERENTE', redeInteira: false, lojaIds: ['l1'] }));
    expect(h).not.toContain('/erp/historico');
    expect(h).toContain('/erp/lojas');
  });

  it('perfil sem "ver insumos": o módulo Insumos nem aparece; Seu acesso sempre aparece', () => {
    const a = alcance({ perfilBase: null, perfilProprio: ['lojas.ver'] });
    const mods = modulosDoParceiro(a);
    expect(mods.map((m) => m.chave)).not.toContain('insumo');
    expect(hrefs(a)).toEqual(['/erp/lojas', '/erp/acesso']);
    expect(futuros(a)).toEqual([]);
  });

  it('módulo futuro nunca tem link nem grupos, e traz a fase do plano', () => {
    for (const m of modulosDoParceiro(ALCANCE_FLOWFOODS).filter((x) => !x.href)) {
      expect(m.grupos).toEqual([]);
      expect(m.fase).toMatch(/^\d\.\d$/);
    }
    expect(MODULOS_FUTUROS.map((f) => f.fase)).toEqual(['1.2', '1.5', '1.6', '2.1', '3.1', '3.4']);
  });

  it('nível 1 dentro do parceiro: mesmas telas sob a base dele, com Cadastro e sem "Seu acesso"', () => {
    const h = hrefs(ALCANCE_FLOWFOODS, '/rodolfo/erp/valentins');
    expect(h).toEqual([
      '/rodolfo/erp/valentins/insumos',
      '/rodolfo/erp/valentins/insumos/novo',
      '/rodolfo/erp/valentins/lojas',
      '/rodolfo/erp/valentins/equipe',
      '/rodolfo/erp/valentins/historico',
      '/rodolfo/erp/valentins/cadastro',
    ]);
  });

  it('cada tela do menu do /erp existe no disco (nenhum destino para tela que não existe)', () => {
    for (const h of hrefs(alcance({ perfilBase: 'DONO' }))) {
      expect(existsSync(join('src', 'app', ...h.split('/').filter(Boolean), 'page.tsx')), h).toBe(true);
    }
    expect(existsSync(join('src', 'app', 'erp', 'page.tsx'))).toBe(true);
  });
});

describe('ERP 1.1 · nível 1: o Barney antigo vira módulo do mesmo shell', () => {
  it('Hoje, Leads, Cadência, Inbox, Visitas, Métricas, Portal, Parceiros e Config, todas com tela', () => {
    const h = modulosDoNivel1().flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => i.href)));
    expect(h).toEqual([
      '/rodolfo/hoje',
      '/rodolfo/leads',
      '/rodolfo/barney',
      '/rodolfo/inbox',
      '/rodolfo/visitas',
      '/rodolfo/metricas',
      '/rodolfo/portal',
      '/rodolfo/erp',
      '/rodolfo/config',
    ]);
    for (const x of h)
      expect(existsSync(join('src', 'app', 'rodolfo', '(painel)', ...x.split('/').slice(2), 'page.tsx')), x).toBe(true);
    expect(navegacaoDoNivel1().inicio.href).toBe('/rodolfo');
  });

  it('dentro de um parceiro conhecido, o módulo Parceiros Flow ganha o ERP dele; slug estranho não muda nada', () => {
    const nav = navegacaoDoNivel1();
    const parceiros = [{ slug: 'valentins', nome: "Grupo Valentin's" }];
    const dentro = comParceiroAtual(nav, '/rodolfo/erp/valentins/insumos', parceiros);
    const grupos = dentro.modulos.find((m) => m.chave === 'parceiros')!.grupos;
    expect(grupos.map((g) => g.rotulo)).toEqual(['Parceiros', "Grupo Valentin's"]);
    expect(grupos[1].itens.map((i) => i.href)).toContain('/rodolfo/erp/valentins/cadastro');
    expect(comParceiroAtual(nav, '/rodolfo/erp/outro/insumos', parceiros)).toBe(nav);
    expect(comParceiroAtual(nav, '/rodolfo/leads', parceiros)).toBe(nav);
    expect(slugNoCaminho('/rodolfo/erp/valentins')).toBe('valentins');
    expect(slugNoCaminho('/rodolfo/erp')).toBeNull();
  });

  it('item ativo é o de maior prefixo (detalhe acende a lista; tela do parceiro acende a do parceiro)', () => {
    const nav = navegacaoDoNivel1();
    expect(itemAtivo(nav, '/rodolfo/leads/abc')?.item.rotulo).toBe('Leads');
    expect(itemAtivo(nav, '/rodolfo')).toBeNull();
    const dentro = comParceiroAtual(nav, '/rodolfo/erp/v/lojas', [{ slug: 'v', nome: 'V' }]);
    expect(itemAtivo(dentro, '/rodolfo/erp/v/lojas')?.item.href).toBe('/rodolfo/erp/v/lojas');
    expect(itemAtivo(dentro, '/rodolfo/erp/v')?.item.rotulo).toBe('Módulos do parceiro');
  });

  it('busca ⌘K do parceiro só lista telas permitidas', () => {
    const operador = telasDaNavegacao(navegacaoDoParceiro(alcance({ perfilBase: 'OPERADOR' }))).map((t) => t.href);
    expect(operador).not.toContain('/erp/equipe');
    expect(operador).not.toContain('/erp/historico');
  });

  it('iniciais do avatar', () => {
    expect(iniciais('Rodolfo Cavalcante')).toBe('RC');
    expect(iniciais('ana')).toBe('AN');
    expect(iniciais('  ')).toBe('?');
  });
});

describe('ERP 1.1 · visão (Rede Completa ↔ loja) nunca concede', () => {
  const lojas = [
    { id: 'tij', nome: 'Tijuca', ativa: true },
    { id: 'pen', nome: 'Penha', ativa: true },
  ];
  const rede = alcance({ perfilBase: 'GERENTE' });
  const n3 = alcance({ perfilBase: 'GERENTE', redeInteira: false, lojaIds: ['pen'] });

  it('rede inteira: Rede Completa + lojas; padrão é a rede', () => {
    expect(opcoesDeVisao(rede, lojas).map((o) => o.valor)).toEqual(['rede', 'tij', 'pen']);
    expect(resolverVisao('p1', rede, lojas, undefined).visao).toEqual({ tipo: 'rede' });
    expect(resolverVisao('p1', rede, lojas, 'p1:tij').visao).toEqual({ tipo: 'loja', lojaId: 'tij', nome: 'Tijuca' });
  });

  it('N3: sem Rede Completa, só as lojas do vínculo (mesmo que a lista traga outra)', () => {
    expect(opcoesDeVisao(n3, lojas).map((o) => o.valor)).toEqual(['pen']);
    expect(resolverVisao('p1', n3, lojas, 'p1:rede').valor).toBe('pen');
  });

  it('cookie forjado (loja fora do alcance), de outro parceiro ou lixo cai na primeira opção permitida', () => {
    expect(resolverVisao('p1', n3, lojas, 'p1:tij').valor).toBe('pen');
    expect(resolverVisao('p1', rede, lojas, 'p2:tij').valor).toBe('rede');
    expect(resolverVisao('p1', rede, lojas, 'lixo').valor).toBe('rede');
    expect(resolverVisao('p1', rede, lojas, 'p1:').valor).toBe('rede');
    expect(escolhaDoCookie('p1', valorDoCookieDeVisao('p1', 'tij'))).toBe('tij');
  });

  it('N3 sem loja nenhuma: visão "nenhuma", sem inventar', () => {
    const vazio = alcance({ perfilBase: 'OPERADOR', redeInteira: false, lojaIds: [] });
    const r = resolverVisao('p1', vazio, lojas, 'p1:tij');
    expect(r.visao).toEqual({ tipo: 'nenhuma' });
    expect(rotuloDaVisao(r.visao)).toBe('Sem loja no seu acesso');
  });

  it('escolhaPermitida recusa loja fora do alcance, "rede" sem a rede e valor que não é texto', () => {
    expect(escolhaPermitida(n3, lojas, 'tij')).toBe(false);
    expect(escolhaPermitida(n3, lojas, 'rede')).toBe(false);
    expect(escolhaPermitida(n3, lojas, 'pen')).toBe(true);
    expect(escolhaPermitida(rede, lojas, { valor: 'rede' })).toBe(false);
  });
});

// A action de verdade (src/app/erp/actions.ts), com o contexto e o cookie
// trocados: o que ela decide é o que vale, venha a chamada de onde vier.
const estado = vi.hoisted(() => ({
  ctx: null as unknown,
  lojas: [] as { id: string; nome: string; ativa: boolean }[],
  gravados: [] as [string, string][],
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/headers', () => ({
  cookies: () => ({ set: (n: string, v: string) => estado.gravados.push([n, v]), get: () => undefined }),
  headers: () => new Headers(),
}));
vi.mock('@/lib/erp/sessao', () => ({ aparelhoAtual: () => 'Teste' }));
vi.mock('@/lib/erp/contexto', async () => {
  const { recusaDaAcao, exigirPermissao, pode } = await import('@/lib/erp/permissoes');
  return {
    exigirParceiroDaSessao: async () => estado.ctx,
    exigirPessoa: async () => ({}),
    visaoDaRequisicao: async () => ({ lojas: estado.lojas }),
    recusaDaAcao,
    exigirPermissao,
    pode,
  };
});

describe('ERP 1.1 · actions do shell no servidor', () => {
  beforeEach(() => {
    estado.gravados = [];
    estado.lojas = [{ id: 'pen', nome: 'Penha', ativa: true }];
  });

  it('acaoEscolherVisao recusa loja fora do alcance e NÃO grava o cookie; aceita a do alcance', async () => {
    const { acaoEscolherVisao } = await import('@/app/erp/actions');
    estado.ctx = {
      parceiro: { id: 'p1' },
      alcance: alcance({ perfilBase: 'GERENTE', redeInteira: false, lojaIds: ['pen'] }),
    };
    expect(await acaoEscolherVisao('tij')).toEqual({ ok: false, mensagem: 'Essa loja não está no seu acesso.' });
    expect(await acaoEscolherVisao('rede')).toMatchObject({ ok: false });
    expect(estado.gravados).toEqual([]);
    expect(await acaoEscolherVisao('pen')).toEqual({ ok: true });
    expect(estado.gravados).toEqual([['ff_visao', 'p1:pen']]);
  });

  it('acaoBuscarNoErp: quem não tem "ver insumos" recebe lista vazia sem consulta', async () => {
    const { acaoBuscarNoErp } = await import('@/app/erp/actions');
    const consultas: unknown[] = [];
    estado.ctx = {
      parceiro: { id: 'p1' },
      alcance: alcance({ perfilBase: null, perfilProprio: ['lojas.ver'] }),
      cliente: { insumo: { findMany: async (q: unknown) => (consultas.push(q), []) } },
    };
    expect(await acaoBuscarNoErp('arroz')).toEqual([]);
    expect(consultas).toEqual([]);
    estado.ctx = {
      parceiro: { id: 'p1' },
      alcance: alcance({ perfilBase: 'OPERADOR' }),
      cliente: {
        insumo: {
          findMany: async (q: unknown) => (
            consultas.push(q),
            [{ id: 'i1', nome: 'Arroz', unidade: 'KG', ativo: false }]
          ),
        },
      },
    };
    expect(await acaoBuscarNoErp('arroz')).toEqual([
      { tipo: 'insumo', rotulo: 'Arroz', detalhe: 'Insumo · Quilo', href: '/erp/insumos/i1', desativado: true },
    ]);
    expect(consultas).toHaveLength(1);
  });
});

describe('ERP 1.1 · tema por cookie, sem tocar no site', () => {
  it('lerTema e lerMenuRecolhido', () => {
    expect(lerTema('claro')).toBe('claro');
    expect(lerTema('escuro')).toBe('escuro');
    expect(lerTema('sistema')).toBe('sistema');
    expect(lerTema('roxo')).toBe('sistema');
    expect(lerTema(undefined)).toBe('sistema');
    expect(lerMenuRecolhido('recolhido')).toBe(true);
    expect(lerMenuRecolhido('aberto')).toBe(false);
  });

  it('o layout raiz e a home não leem cookie nem carregam os tokens do shell (o / continua estático)', () => {
    for (const f of [join('src', 'app', 'layout.tsx'), join('src', 'app', 'page.tsx')]) {
      const txt = readFileSync(f, 'utf8');
      expect(txt, f).not.toMatch(/cookies\(|ff_tema|tokens\.css|AppShell|force-dynamic/);
    }
  });

  it('os tokens (e o tema) só entram pelos layouts do shell e do login do nível 1', () => {
    const quem = arquivos('src').filter((f) => /import ['"][^'"]*tokens\.css['"]/.test(readFileSync(f, 'utf8')));
    expect(quem.sort()).toEqual(
      [
        join('src', 'app', 'rodolfo', '(acesso)', 'layout.tsx'),
        join('src', 'components', 'erp', 'shell', 'AppShell.tsx'),
      ].sort(),
    );
  });
});

function arquivos(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(arquivos(p));
    else if (/\.(ts|tsx|css)$/.test(n)) out.push(p);
  }
  return out;
}

describe('ERP 1.1 · rotas dentro e fora do shell', () => {
  const RODOLFO = join('src', 'app', 'rodolfo');

  it('login e definição de senha ficam FORA do shell (grupo próprio, sem AppShell)', () => {
    for (const p of ['login', 'setup']) {
      expect(existsSync(join(RODOLFO, '(acesso)', p, 'page.tsx'))).toBe(true);
      expect(existsSync(join(RODOLFO, '(painel)', p))).toBe(false);
      expect(existsSync(join(RODOLFO, p))).toBe(false);
    }
    expect(readFileSync(join(RODOLFO, '(acesso)', 'layout.tsx'), 'utf8')).not.toMatch(/AppShell/);
    expect(readFileSync(join(RODOLFO, 'layout.tsx'), 'utf8')).not.toMatch(/AppShell|exigirNivel1/);
  });

  it('o shell está no /erp e no /rodolfo/(painel); /entrar e /portal não usam', () => {
    expect(readFileSync(join('src', 'app', 'erp', 'layout.tsx'), 'utf8')).toMatch(/<AppShell/);
    expect(readFileSync(join(RODOLFO, '(painel)', 'layout.tsx'), 'utf8')).toMatch(/<AppShell/);
    for (const d of [join('src', 'app', 'entrar'), join('src', 'app', 'portal')]) {
      for (const f of arquivos(d)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/AppShell|components\/erp\/shell/);
    }
  });

  it('o middleware continua liberando o login e a definição de senha sem sessão', () => {
    const mw = readFileSync(join('src', 'middleware.ts'), 'utf8');
    expect(mw).toMatch(/new Set\(\['\/rodolfo\/login', '\/rodolfo\/setup'\]\)/);
  });

  it('toda página do shell do nível 1 confere a sessão (exigirNivel1 ou exigirParceiro)', () => {
    const faltam = arquivos(join(RODOLFO, '(painel)'))
      .filter((f) => f.endsWith('page.tsx'))
      .filter((f) => !/exigirNivel1\(|exigirParceiro\(/.test(readFileSync(f, 'utf8')));
    expect(faltam).toEqual([]);
  });
});

describe('ERP 1.1 · Regra Nº 2: um design system só, sem kit velho', () => {
  const telas = [
    ...arquivos(join('src', 'app', 'rodolfo')),
    ...arquivos(join('src', 'app', 'erp')),
    ...arquivos(join('src', 'components', 'erp')),
  ].filter((f) => f.endsWith('.tsx'));

  it('nenhuma cor fixa em classe nas telas do shell (só tokens: claro e escuro)', () => {
    const furos = telas.filter((f) =>
      /bg-\[#|text-\[#|border-\[#|text-surface|bg-surface|white\/\[|bg-white\/|border-white\/|bg-footer|text-bright|bg-black\//.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(furos).toEqual([]);
  });

  it('nenhuma rota importa de outra rota (telas compartilhadas moram em src/components/erp)', () => {
    const furos = arquivos('src')
      .filter((f) => !f.startsWith(join('src', 'app', 'rodolfo')))
      .filter((f) => /@\/app\/rodolfo\//.test(readFileSync(f, 'utf8')));
    expect(furos).toEqual([]);
  });

  it('os kits visuais antigos não existem mais (sem shim, sem re-export)', () => {
    for (const f of [
      'src/app/rodolfo/ui.tsx',
      'src/app/rodolfo/botoes.tsx',
      'src/app/rodolfo/logout-button.tsx',
      'src/app/rodolfo/erp/ui.tsx',
      'src/app/rodolfo/erp/campos.tsx',
      'src/app/rodolfo/erp/abas.tsx',
      'src/app/erp/abas.tsx',
      'src/app/entrar/marca.tsx',
    ]) {
      expect(existsSync(f), f).toBe(false);
    }
  });
});
