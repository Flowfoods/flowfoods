/**
 * ERP 0.4 — permissões, sem banco: catálogo e perfis base, resolução
 * (perfil base / próprio + extras − removidas), escopo de lojas, a checagem
 * única (`exigirPermissao`), sem escalada (`cobre`), último administrador, os
 * formulários de pessoa e perfil, e a guarda estrutural: toda página e server
 * action do /erp passa pela checagem.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALCANCE_FLOWFOODS,
  alcancaLoja,
  CATALOGO,
  cobre,
  deixaSemAdministrador,
  ehAdministrador,
  ErroDePermissao,
  exigirPermissao,
  faltaParaCobrir,
  filtroDeLojas,
  LISTA_DE_SETORES,
  normalizarPermissoes,
  PERFIS_BASE,
  pode,
  recusa,
  recusaDaAcao,
  resolverAlcance,
  SETORES,
  TODAS_AS_PERMISSOES,
  type Alcance,
  type Permissao,
  type VinculoDePermissao,
} from '@/lib/erp/permissoes';
import {
  ajusteMinimo,
  diferencaDePermissoes,
  entradaDoFormulario,
  lerPerfil,
  lerPermissoesDaPessoa,
  retratoDaPessoa,
} from '@/lib/erp/equipe';
import { contextoDaSessao } from '@/lib/erp/contexto-base';

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

describe('ERP 0.4 · catálogo e perfis base', () => {
  it('toda permissão é módulo.ação, única, com rótulo humano (sem jargão técnico)', () => {
    expect(new Set(TODAS_AS_PERMISSOES).size).toBe(TODAS_AS_PERMISSOES.length);
    for (const m of CATALOGO) {
      for (const [p, d] of Object.entries(m.permissoes)) {
        expect(p).toMatch(/^[a-z]+\.[a-z]+$/);
        expect(d.rotulo.length).toBeGreaterThan(5);
        expect(d.rotulo).not.toMatch(/\.|RBAC|escopo|permiss/i);
      }
    }
  });

  it('já traz os módulos futuros do contrato (ficha, compras, estoque, produção, etiquetas, faturamento, DRE, preço)', () => {
    for (const p of [
      'fichas.editar',
      'compras.lancar',
      'estoque.contar',
      'requisicao.pedir',
      'producao.registrar',
      'etiquetas.imprimir',
      'faturamento.lancar',
      'dre.ver',
      'metas.editar',
      'precos.editar',
    ]) {
      expect(TODAS_AS_PERMISSOES).toContain(p);
    }
  });

  it('dono tem tudo; gerente não cuida da equipe nem dos preços; operador não cadastra insumo', () => {
    expect([...PERFIS_BASE.DONO.permissoes].sort()).toEqual([...TODAS_AS_PERMISSOES].sort());
    expect(PERFIS_BASE.GERENTE.permissoes).not.toContain('acessos.gerir');
    expect(PERFIS_BASE.GERENTE.permissoes).not.toContain('precos.editar');
    expect(PERFIS_BASE.GERENTE.permissoes).toContain('insumos.editar');
    expect(PERFIS_BASE.OPERADOR.permissoes).toContain('insumos.ver');
    expect(PERFIS_BASE.OPERADOR.permissoes).not.toContain('insumos.editar');
    expect(PERFIS_BASE.OPERADOR.permissoes).not.toContain('acessos.gerir');
    for (const b of Object.values(PERFIS_BASE)) for (const p of b.permissoes) expect(TODAS_AS_PERMISSOES).toContain(p);
  });

  it('os 10 setores do contrato', () => {
    expect(LISTA_DE_SETORES).toHaveLength(10);
    expect(Object.values(SETORES)).toEqual([
      'Cozinha',
      'Salão',
      'Administrativo',
      'Estoque',
      'Caixa',
      'Motoboy',
      'Freelancer',
      'Compras',
      'Marketing e CRM',
      'Gerência',
    ]);
  });
});

describe('ERP 0.4 · resolução: perfil + extras − removidas', () => {
  it('perfil base', () => {
    const a = alcance({ perfilBase: 'GERENTE' });
    expect(a.nivel).toBe('REDE');
    expect(a.permissoes.has('insumos.editar')).toBe(true);
    expect(a.permissoes.has('acessos.gerir')).toBe(false);
  });

  it('perfil próprio: a lista do perfil (nome fora do catálogo é ignorado)', () => {
    const a = alcance({ perfilBase: null, perfilProprio: ['insumos.ver', 'estoque.contar', 'inventado.tudo'] });
    expect([...a.permissoes].sort()).toEqual(['estoque.contar', 'insumos.ver']);
  });

  it('extras somam, removidas tiram, e removida vence extra', () => {
    const a = alcance({
      perfilBase: 'OPERADOR',
      permissoesExtras: ['insumos.editar', 'dre.ver'],
      permissoesRemovidas: ['estoque.contar', 'dre.ver'],
    });
    expect(a.permissoes.has('insumos.editar')).toBe(true);
    expect(a.permissoes.has('estoque.contar')).toBe(false);
    expect(a.permissoes.has('dre.ver')).toBe(false);
  });

  it('sem a rede inteira, o que exige rede cai (cadastrar loja, histórico da rede)', () => {
    const a = alcance({ perfilBase: 'DONO', redeInteira: false, lojaIds: ['x'] });
    expect(a.nivel).toBe('LOJA');
    expect(a.permissoes.has('lojas.gerir')).toBe(false);
    expect(a.permissoes.has('historico.ver')).toBe(false);
    expect(a.permissoes.has('acessos.gerir')).toBe(true);
    expect(ehAdministrador(a)).toBe(false);
  });
});

describe('ERP 0.4 · escopo de lojas e a checagem única', () => {
  const daLojaX = alcance({ perfilBase: 'GERENTE', redeInteira: false, lojaIds: ['x'] });
  const rede = alcance({ perfilBase: 'GERENTE' });

  it('loja no alcance; filtro da consulta', () => {
    expect(alcancaLoja(daLojaX, 'x')).toBe(true);
    expect(alcancaLoja(daLojaX, 'y')).toBe(false);
    expect(alcancaLoja(rede, 'y')).toBe(true);
    expect(filtroDeLojas(rede)).toBeUndefined();
    expect(filtroDeLojas(daLojaX)).toEqual({ in: ['x'] });
  });

  it('permissão por loja com lojaId fora do alcance é recusada; sem lojaId, vale', () => {
    expect(pode(daLojaX, 'estoque.contar', { lojaId: 'x' })).toBe(true);
    expect(pode(daLojaX, 'estoque.contar', { lojaId: 'y' })).toBe(false);
    expect(recusa(daLojaX, 'estoque.contar', { lojaId: 'y' })).toBe('Essa loja não está no seu acesso.');
    expect(pode(daLojaX, 'estoque.contar')).toBe(true);
    expect(pode(rede, 'estoque.contar', { lojaId: 'qualquer' })).toBe(true);
  });

  it('exigirPermissao estoura ErroDePermissao com frase humana; recusaDaAcao devolve a frase', () => {
    const op = { alcance: alcance({ perfilBase: 'OPERADOR' }) };
    expect(() => exigirPermissao(op, 'insumos.editar')).toThrow(ErroDePermissao);
    expect(() => exigirPermissao(op, 'insumos.editar')).toThrow(/cadastrar e editar insumos/);
    expect(() => exigirPermissao(op, 'insumos.ver')).not.toThrow();
    expect(recusaDaAcao(op, 'insumos.editar')).toMatch(/Fale com quem cuida da equipe/);
    expect(recusaDaAcao(op, 'insumos.ver')).toBeNull();
  });

  it('nível 1 pode tudo, em qualquer loja', () => {
    for (const p of TODAS_AS_PERMISSOES) expect(pode(ALCANCE_FLOWFOODS, p, { lojaId: 'qualquer' })).toBe(true);
  });

  it('contexto da sessão leva o alcance do vínculo; sem alcance, nada passa', () => {
    const parceiro = { id: 'p1', nome: 'A', slug: 'a', status: 'ATIVO' } as never;
    const base = {
      sessaoId: 's',
      metodo: 'SENHA' as const,
      criadaEm: new Date(),
      usuario: { id: 'u', nome: 'Maria', email: 'm@x.com' },
      parceiro,
      acessoId: 'v',
      parceiros: [],
      perfilRotulo: 'Operador',
      setores: [],
      ajuda: { dicasLigadas: true, escolhida: false, fechadas: [] },
    };
    expect(contextoDaSessao({ ...base, alcance: daLojaX }).alcance).toBe(daLojaX);
    expect(() => contextoDaSessao({ ...base, alcance: null })).toThrow(/sem alcance/);
  });
});

describe('ERP 0.4 · sem escalada (ninguém dá o que não tem)', () => {
  const dono = alcance({ perfilBase: 'DONO' });
  const gerente = alcance({ perfilBase: 'GERENTE' });
  const adminDaLojaX = alcance({
    perfilBase: 'GERENTE',
    permissoesExtras: ['acessos.gerir'],
    redeInteira: false,
    lojaIds: ['x'],
  });

  it('dono cobre gerente e operador; gerente não cobre dono', () => {
    expect(cobre(dono, gerente)).toBe(true);
    expect(cobre(dono, alcance({ perfilBase: 'OPERADOR', redeInteira: false, lojaIds: ['y'] }))).toBe(true);
    expect(cobre(gerente, dono)).toBe(false);
    expect(faltaParaCobrir(gerente, dono).permissoes).toContain('acessos.gerir');
  });

  it('extra que o ator não tem é escalada', () => {
    const alvo = alcance({ perfilBase: 'OPERADOR', permissoesExtras: ['precos.editar'] });
    expect(cobre(gerente, alvo)).toBe(false);
    expect(faltaParaCobrir(gerente, alvo).permissoes).toEqual(['precos.editar']);
  });

  it('lojas: quem tem só X não dá a rede inteira nem a loja Y', () => {
    expect(cobre(adminDaLojaX, alcance({ perfilBase: 'OPERADOR', redeInteira: false, lojaIds: ['x'] }))).toBe(true);
    expect(cobre(adminDaLojaX, alcance({ perfilBase: 'OPERADOR', redeInteira: false, lojaIds: ['y'] }))).toBe(false);
    expect(cobre(adminDaLojaX, alcance({ perfilBase: 'OPERADOR', redeInteira: false, lojaIds: ['x', 'y'] }))).toBe(
      false,
    );
    expect(cobre(adminDaLojaX, alcance({ perfilBase: 'OPERADOR' }))).toBe(false);
    expect(faltaParaCobrir(adminDaLojaX, alcance({ perfilBase: 'OPERADOR' })).lojas).toBe(true);
  });

  it('nível 1 cobre todo mundo', () => {
    expect(cobre(ALCANCE_FLOWFOODS, dono)).toBe(true);
  });
});

describe('ERP 0.4 · último administrador', () => {
  const dono = alcance({ perfilBase: 'DONO' });
  const gerente = alcance({ perfilBase: 'GERENTE' });
  const donoDaLoja = alcance({ perfilBase: 'DONO', redeInteira: false, lojaIds: ['x'] });

  it('administrador = cuidar da equipe + rede inteira', () => {
    expect(ehAdministrador(dono)).toBe(true);
    expect(ehAdministrador(gerente)).toBe(false);
    expect(ehAdministrador(donoDaLoja)).toBe(false);
  });

  it('tirar o único administrador trava; com outro, passa; parceiro sem nenhum não trava', () => {
    expect(deixaSemAdministrador([dono, gerente], [gerente])).toBe(true);
    expect(deixaSemAdministrador([dono, gerente], [gerente, gerente])).toBe(true);
    expect(deixaSemAdministrador([dono, dono], [dono])).toBe(false);
    expect(deixaSemAdministrador([dono], [donoDaLoja])).toBe(true);
    expect(deixaSemAdministrador([gerente], [])).toBe(false);
  });
});

describe('ERP 0.4 · formulários de pessoa e perfil', () => {
  it('pessoa: sem perfil = operador; sem lojas = rede inteira; setores e permissões normalizados', () => {
    const r = lerPermissoesDaPessoa({ setores: ['COZINHA', 'XPTO', 'COZINHA'], extras: ['insumos.editar', 'lixo'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.perfil).toEqual({ base: 'OPERADOR' });
    expect(r.dados.redeInteira).toBe(true);
    expect(r.dados.setores).toEqual(['COZINHA']);
    expect(r.dados.extras).toEqual(['insumos.editar']);
  });

  it('pessoa: perfil próprio por "p:<id>"; lojas escolhidas exigem pelo menos uma; perfil inválido recusa', () => {
    const r = lerPermissoesDaPessoa({ perfil: 'p:abc', lojas: 'escolhidas', lojaIds: ['l1', 'l1', 'l2'] });
    expect(r.ok && r.dados.perfil).toEqual({ proprioId: 'abc' });
    expect(r.ok && r.dados.lojaIds).toEqual(['l1', 'l2']);
    expect(lerPermissoesDaPessoa({ lojas: 'escolhidas' }).ok).toBe(false);
    expect(lerPermissoesDaPessoa({ perfil: 'ADMIN' }).ok).toBe(false);
  });

  it('ajuste mínimo: extra que o perfil já dá some; removida que o perfil não dá some', () => {
    const doPerfil: Permissao[] = ['insumos.ver', 'estoque.contar'];
    expect(ajusteMinimo(doPerfil, ['insumos.ver', 'insumos.editar'], ['estoque.contar', 'dre.ver'])).toEqual({
      extras: ['insumos.editar'],
      removidas: ['estoque.contar'],
    });
  });

  it('perfil próprio: nome obrigatório, não pode repetir nome de perfil pronto, precisa de pelo menos uma permissão', () => {
    expect(lerPerfil({ nome: 'Cozinha', base: 'OPERADOR', permissoes: ['insumos.ver'] }).ok).toBe(true);
    expect(lerPerfil({ nome: 'gerente', base: 'GERENTE', permissoes: ['insumos.ver'] }).ok).toBe(false);
    expect(lerPerfil({ nome: 'X', base: 'OPERADOR', permissoes: ['insumos.ver'] }).ok).toBe(false);
    expect(lerPerfil({ nome: 'Vazio', base: 'OPERADOR', permissoes: [] }).ok).toBe(false);
  });

  it('FormData com listas vira entrada (getAll, não fromEntries)', () => {
    const f = new FormData();
    f.append('nome', 'Ana');
    f.append('setores', 'COZINHA');
    f.append('setores', 'SALAO');
    f.append('lojaIds', 'l1');
    const e = entradaDoFormulario(f);
    expect(e.setores).toEqual(['COZINHA', 'SALAO']);
    expect(e.lojaIds).toEqual(['l1']);
    expect(e.nome).toBe('Ana');
  });

  it('histórico leva nomes legíveis, não ids', () => {
    const r = retratoDaPessoa(
      {
        perfilRotulo: 'Gerente',
        setores: ['COZINHA'],
        redeInteira: false,
        lojaIds: ['l1'],
        extras: ['dre.ver'],
        removidas: [],
      },
      new Map([['l1', 'Vila da Penha']]),
    );
    expect(r).toEqual({
      perfil: 'Gerente',
      setores: 'Cozinha',
      lojas: 'Vila da Penha',
      permissoesExtras: 'Ver DRE e CMV',
    });
    expect(diferencaDePermissoes(['insumos.ver'], ['insumos.ver', 'insumos.editar'])).toEqual({
      incluiu: 'Cadastrar e editar insumos',
    });
  });

  it('normalizar mantém a ordem do catálogo', () => {
    expect(normalizarPermissoes(['acessos.gerir', 'insumos.ver'])).toEqual(['insumos.ver', 'acessos.gerir']);
  });
});

// ------------------------------------------------------------- guarda

function arquivos(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(arquivos(p));
    else out.push(p);
  }
  return out;
}

describe('ERP 0.4 · toda página e server action do /erp passa pela checagem', () => {
  const ERP = join('src', 'app', 'erp');
  // "Seu acesso" é da própria pessoa (rosto, sair): não depende de permissão.
  // O hub (/erp, 1.1) só lista o que `modulosDoParceiro(alcance)` libera e é o
  // destino de quem abre tela fora do acesso: não pode exigir permissão.
  const PAGINAS_LIVRES = new Set([join(ERP, 'acesso', 'page.tsx'), join(ERP, 'page.tsx')]);
  // Escolher a visão (Rede Completa ↔ loja) não é permissão: só filtra DENTRO do
  // alcance, e a action confere a escolha contra as lojas do alcance (visao.ts).
  const ACOES_LIVRES = new Set([
    'acaoOpcoesDeAtivarRosto',
    'acaoConfirmarRosto',
    'acaoRemoverRosto',
    'acaoEscolherVisao',
  ]);

  it('páginas chamam exigirPermissaoNaPagina', () => {
    const faltam = arquivos(ERP)
      .filter((f) => f.endsWith('page.tsx') && !PAGINAS_LIVRES.has(f))
      .filter((f) => !/exigirPermissaoNaPagina\(ctx, '[a-z]+\.[a-z]+'/.test(readFileSync(f, 'utf8')));
    expect(faltam).toEqual([]);
  });

  it('cada server action exportada confere a permissão (ou é da própria pessoa)', () => {
    const faltam: string[] = [];
    for (const f of arquivos(ERP).filter((x) => x.endsWith('actions.ts'))) {
      const txt = readFileSync(f, 'utf8');
      // Função auxiliar que confere (contexto() / cadastrarEstruturaDaSessao) vale para quem a chama.
      const auxiliares = Array.from(txt.matchAll(/async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g))
        .filter(([, , corpo]) => /recusaDaAcao\(/.test(corpo))
        .map(([, nome]) => nome);
      for (const [, nome, corpo] of txt.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
        if (ACOES_LIVRES.has(nome)) continue;
        const confere =
          /recusaDaAcao\(|exigirPermissao\(/.test(corpo) ||
          auxiliares.some((a) => new RegExp(`\\b${a}\\(`).test(corpo));
        if (!confere) faltam.push(`${f}: ${nome}`);
      }
    }
    expect(faltam).toEqual([]);
  });

  it('tela não usa jargão técnico como texto principal', () => {
    const telas = [...arquivos(ERP), ...arquivos(join('src', 'components', 'erp', 'telas'))].filter((f) =>
      f.endsWith('.tsx'),
    );
    const furos = telas.filter((f) =>
      />[^<{]*\b(RBAC|escopo|insumos\.editar|acessos\.gerir)\b/i.test(readFileSync(f, 'utf8')),
    );
    expect(furos).toEqual([]);
  });
});

// Para o TypeScript: Alcance é estrutural (usado nas asserções acima).
export type _A = Alcance;
