/**
 * 0.6 — ajuda contextual, sem banco.
 *
 * O gate de "ajuda sempre atualizada": rota do ERP sem entrada, entrada órfã,
 * permissão inexistente, jargão/emoji/"!"/HTML no texto e texto alterado sem
 * subir a versão REPROVAM aqui. Mais: a rota casa a entrada certa, o filtro por
 * permissão (o operador não lê sobre preço), a decisão da caixa (fechada,
 * desligada, "mudou", pergunta da 1ª vez), o HTML do servidor já sem a caixa
 * para quem fechou ou desligou (sem flash), e as guardas (sem
 * `dangerouslySetInnerHTML`, `Dica` morta, uma explicação só por tela).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ajudaParaATela,
  contarFrases,
  coberturaDasRotas,
  ENTRADAS,
  fechamentoValido,
  normalizarFechadas,
  problemasDoRegistro,
  problemasDoTexto,
  type EntradaDeAjuda,
} from '@/lib/erp/ajuda';
import { caixaDaTela, entradaDoCaminho, rotaRelativa, type PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import { divergenciasDoLock, hashDaEntrada, lockNovo, type Lock } from '@/lib/erp/ajuda-integridade';
import { itemAtivo, modulosDoParceiro, navegacaoDoParceiro } from '@/lib/erp/modulos';
import { ALCANCE_FLOWFOODS, resolverAlcance, TODAS_AS_PERMISSOES, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import lockSalvo from '@/lib/erp/ajuda.lock.json';
import { PageHeader } from '@/components/erp/ui/cabecalho';

let caminhoAtual = '/erp';
vi.mock('next/navigation', () => ({
  usePathname: () => caminhoAtual,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const vinculo = (v: Partial<VinculoDePermissao>): VinculoDePermissao => ({
  perfilBase: 'OPERADOR',
  perfilProprio: null,
  permissoesExtras: [],
  permissoesRemovidas: [],
  redeInteira: true,
  lojaIds: [],
  ...v,
});
const DONO = resolverAlcance(vinculo({ perfilBase: 'DONO' }));
const GERENTE = resolverAlcance(vinculo({ perfilBase: 'GERENTE' }));
const OPERADOR = resolverAlcance(vinculo({ perfilBase: 'OPERADOR' }));

// ---------------------------------------------------------------- as rotas do disco
function paginas(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(paginas(p));
    else if (/^page\.[jt]sx?$/.test(n)) out.push(p);
  }
  return out;
}
const relativas = (raiz: string) =>
  paginas(raiz).map((f) => f.slice(raiz.length).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/?page\.[jt]sx?$/, ''));
const ROTAS_DO_PARCEIRO = relativas(join('src', 'app', 'erp'));
const ROTAS_DO_NIVEL1 = relativas(join('src', 'app', 'rodolfo', '(painel)', 'erp', '[slug]'));

/** A versão de hoje do texto de Insumos (sobe quando o texto muda; os testes não fixam um número). */
const VI = ENTRADAS.find((e) => e.chave === 'insumos')!.versao;

describe('0.6 · o gate: ajuda sempre atualizada', () => {
  it('toda página do /erp e do nível 1 dentro do parceiro tem entrada; nenhuma entrada sobra', () => {
    expect(ROTAS_DO_PARCEIRO.length).toBeGreaterThan(30);
    expect(ROTAS_DO_NIVEL1.length).toBeGreaterThan(30);
    const c = coberturaDasRotas(ROTAS_DO_PARCEIRO, ROTAS_DO_NIVEL1);
    expect(c.semAjuda).toEqual([]);
    expect(c.orfas).toEqual([]);
  });

  it('o gate enxerga page.tsx, page.ts, page.jsx e page.js (rota em .ts também precisa de ajuda)', () => {
    for (const n of ['page.tsx', 'page.ts', 'page.jsx', 'page.js']) expect(/^page\.[jt]sx?$/.test(n), n).toBe(true);
    for (const n of ['pagina.tsx', 'page.test.ts', 'layout.tsx', 'route.ts']) expect(/^page\.[jt]sx?$/.test(n), n).toBe(false);
  });

  it('rota nova sem ajuda reprova (e entrada órfã também)', () => {
    const c = coberturaDasRotas([...ROTAS_DO_PARCEIRO, 'estoque/nova-tela'], ROTAS_DO_NIVEL1);
    expect(c.semAjuda).toEqual(['estoque/nova-tela']);
    const sem = ENTRADAS.filter((e) => e.chave !== 'estoque-contagens');
    expect(coberturaDasRotas(ROTAS_DO_PARCEIRO, ROTAS_DO_NIVEL1, sem).semAjuda).toEqual(['estoque/contagens']);
    const orfa: EntradaDeAjuda[] = [...ENTRADAS, { chave: 'velha', area: 'rede', rotas: ['rota/que/sumiu'], titulo: 'Velha', versao: 1, aula: [{ texto: 'Texto.' }] }];
    expect(coberturaDasRotas(ROTAS_DO_PARCEIRO, ROTAS_DO_NIVEL1, orfa).orfas).toEqual(['rota/que/sumiu (velha)']);
  });

  it('a rota nova da seção 9 (/estoque/contagens) tem ajuda, no /erp e no espelho do nível 1', () => {
    expect(ROTAS_DO_PARCEIRO).toContain('estoque/contagens');
    expect(ROTAS_DO_NIVEL1).toContain('estoque/contagens');
    expect(entradaDoCaminho('/erp/estoque/contagens', ENTRADAS)?.chave).toBe('estoque-contagens');
    expect(entradaDoCaminho('/rodolfo/erp/casa-alfa/estoque/contagens', ENTRADAS)?.chave).toBe('estoque-contagens');
  });

  it('o registro cumpre as regras: chaves, versões, permissões do catálogo, jargão, frases', () => {
    expect(problemasDoRegistro()).toEqual([]);
    for (const e of ENTRADAS) for (const b of [...e.aula, ...(e.secoes ?? []).flatMap((s) => s.blocos)]) for (const p of b.para ?? []) expect(TODAS_AS_PERMISSOES).toContain(p);
  });

  it('o lint reprova jargão, "!", emoji, HTML, markdown, bloco longo e permissão inexistente', () => {
    for (const ruim of [
      'O servidor refaz a conta.',
      'O sistema calcula tudo.',
      'Isso mora no banco.',
      'Valor em BigInt.',
      'Em pontos-base.',
      'A RLS protege.',
      'Clique aqui para ver.',
      'Muito bom!',
      'Fica ótimo 🙂.',
      'Use <b>negrito</b>.',
      'Isso é **forte**.',
      `${'a'.repeat(330)}.`,
    ]) {
      expect(problemasDoTexto(ruim), ruim).not.toEqual([]);
    }
    expect(problemasDoTexto('A conta é refeita na hora de salvar.')).toEqual([]);
    const e = (patch: Partial<EntradaDeAjuda>): EntradaDeAjuda => ({ chave: 'x', area: 'rede', rotas: ['x'], titulo: 'X', versao: 1, aula: [{ texto: 'Texto curto.' }], ...patch });
    expect(problemasDoRegistro([e({ aula: [{ texto: 'Fala.', para: ['nada.ver' as never] }, { texto: 'Livre.' }] })]).join()).toContain('permissão inexistente');
    expect(problemasDoRegistro([e({ aula: [{ texto: 'Um. Dois. Três. Quatro. Cinco.' }] })]).join()).toContain('frases');
    expect(problemasDoRegistro([e({ aula: [{ texto: 'Só para quem edita.', para: ['insumos.editar'] }] })]).join()).toContain('bloco para todos');
    expect(problemasDoRegistro([e({}), e({ rotas: ['y'] })]).join()).toContain('repetida');
    expect(problemasDoRegistro([e({}), e({ chave: 'z' })]).join()).toContain('já é de');
    expect(contarFrases('Cebola 1,18 vale R$ 5,00. Sim?')).toBe(2);
  });

  it('a área de cada entrada é a área onde a tela acende no menu', () => {
    const nomeDaArea = (base: string, a: Alcance) => (rota: string) => {
      const nav = { ...navegacaoDoParceiro(a), modulos: modulosDoParceiro(a, base) };
      const ativo = itemAtivo(nav, `${base}/${rota.replace(/\[[^\]]+\]/g, 'x1')}`.replace(/\/$/, ''));
      return ativo?.modulo.chave ?? 'inicio';
    };
    const doParceiro = nomeDaArea('/erp', DONO);
    const doNivel1 = nomeDaArea('/rodolfo/erp/casa', ALCANCE_FLOWFOODS);
    for (const e of ENTRADAS) for (const r of e.rotas) expect(e.soNivel1 ? doNivel1(r) : doParceiro(r), `${e.chave} · ${r}`).toBe(e.area);
  });
});

describe('0.6 · versão: texto mudou, a versão sobe (ajuda.lock.json)', () => {
  it('o lock salvo bate com o registro', () => {
    expect(divergenciasDoLock(ENTRADAS, lockSalvo as Lock)).toEqual([]);
  });

  it('texto alterado sem subir a versão reprova; com versão nova pede o lock; versão sem texto novo também', () => {
    const lock = lockNovo(ENTRADAS, {});
    const clone = (patch: (e: EntradaDeAjuda) => EntradaDeAjuda) => ENTRADAS.map((e) => (e.chave === 'insumos' ? patch(e) : e));
    const mudou = clone((e) => ({ ...e, aula: [{ texto: 'Outro texto.' }, ...e.aula.slice(1)] }));
    expect(divergenciasDoLock(mudou, lock).join()).toContain('a versao nao subiu');
    expect(() => lockNovo(mudou, lock)).toThrow(/versao nao subiu/);
    const subiu = clone((e) => ({ ...e, versao: e.versao + 1, aula: [{ texto: 'Outro texto.' }, ...e.aula.slice(1)] }));
    expect(divergenciasDoLock(subiu, lock).join()).toContain('lock esta desatualizado');
    expect(lockNovo(subiu, lock).insumos.versao).toBe(VI + 1);
    expect(divergenciasDoLock(clone((e) => ({ ...e, versao: e.versao + 1 })), lock).join()).toContain('lock esta desatualizado');
  });

  it('o hash enxerga o texto e quem pode ler, não a rota', () => {
    const e = ENTRADAS.find((x) => x.chave === 'ficha')!;
    expect(hashDaEntrada(e)).toBe(hashDaEntrada({ ...e, rotas: ['outra'] }));
    expect(hashDaEntrada(e)).not.toBe(hashDaEntrada({ ...e, aula: e.aula.map((b) => ({ ...b, para: undefined })) }));
  });
});

describe('0.6 · a rota casa a entrada certa', () => {
  const chave = (c: string) => entradaDoCaminho(c, ENTRADAS)?.chave ?? null;

  it('mesma chave no /erp e no nível 1; o fixo vence o [id]', () => {
    expect(chave('/erp')).toBe('inicio');
    expect(chave('/rodolfo/erp/casa-alfa')).toBe('inicio');
    expect(chave('/erp/insumos')).toBe('insumos');
    expect(chave('/erp/insumos/novo')).toBe('insumo-novo');
    expect(chave('/erp/insumos/cl1/editar')).toBe('insumo-novo');
    expect(chave('/erp/insumos/cl1')).toBe('insumo');
    expect(chave('/erp/fichas/canais')).toBe('precificacao');
    expect(chave('/erp/fichas/cl1')).toBe('ficha');
    expect(chave('/erp/fichas/cl1/canais')).toBe('ficha-embalagens');
    expect(chave('/erp/compras/fornecedores')).toBe('fornecedores');
    expect(chave('/erp/compras/fornecedores/novo')).toBe('fornecedor-novo');
    expect(chave('/erp/compras/fornecedores/f1')).toBe('fornecedor');
    expect(chave('/erp/compras/c1')).toBe('compra');
    expect(chave('/erp/estoque/requisicoes')).toBe('requisicoes');
    expect(chave('/erp/estoque/loja1/requisicoes')).toBe('requisicoes');
    expect(chave('/erp/estoque/loja1/requisicoes/nova')).toBe('requisicao-nova');
    expect(chave('/erp/estoque/loja1/requisicoes/r1/atender')).toBe('requisicao-atender');
    expect(chave('/rodolfo/erp/casa/estoque/loja1/contagens/c1/conferir')).toBe('contagem-conferir');
    expect(chave('/rodolfo/erp/casa/cadastro')).toBe('cadastro-do-parceiro');
    expect(chave('/erp/estoque/loja1/')).toBe('estoque-loja');
  });

  it('fora do ERP não há ajuda: Barney, lista de parceiros, onboarding, login', () => {
    for (const c of ['/rodolfo/hoje', '/rodolfo/leads', '/rodolfo/erp', '/rodolfo/onboarding', '/entrar', '/', '/portal/abc', '/erpx', '/erp/nao-existe/x/y/z']) {
      expect(chave(c), c).toBeNull();
    }
    expect(rotaRelativa('/rodolfo/erp/casa/estoque?x=1')).toBe('estoque');
  });
});

describe('0.6 · aula por permissão, não por perfil nem por setor', () => {
  const texto = (a: Alcance, chave: string) => {
    const e = ajudaParaATela(a).find((x) => x.chave === chave)!;
    return [...e.aula, ...e.secoes.flatMap((s) => s.blocos)].join(' ');
  };

  it('o operador não recebe nada sobre preço e margem; a dona e o gerente recebem', () => {
    expect(texto(OPERADOR, 'ficha')).not.toMatch(/margem|iFood|preço|canal/i);
    expect(ajudaParaATela(OPERADOR).find((x) => x.chave === 'ficha')!.secoes).toEqual([]);
    expect(texto(DONO, 'ficha')).toMatch(/margem-alvo/);
    expect(ajudaParaATela(DONO).find((x) => x.chave === 'ficha')!.secoes.map((s) => s.id)).toEqual(['conta']);
    expect(texto(GERENTE, 'ficha')).toMatch(/margem-alvo/);
    // o mesmo vale para o que o operador não paga: bloco de compras no insumo
    expect(texto(OPERADOR, 'insumo')).not.toMatch(/nota/);
    expect(texto(DONO, 'insumo')).toMatch(/nota/);
    // nada do operador escapa: o registro inteiro que ele recebe não cita preço de venda
    expect(JSON.stringify(ajudaParaATela(OPERADOR).filter((e) => e.chave === 'ficha' || e.chave === 'precificacao'))).not.toMatch(/margem-alvo|sugerido/i);
  });

  it('perfil próprio vale pelas permissões, não pelo nome; setor não concede', () => {
    const soVer = resolverAlcance(vinculo({ perfilBase: null, perfilProprio: ['fichas.ver', 'precos.ver'] }));
    expect(texto(soVer, 'ficha')).toMatch(/margem-alvo/);
    const semPreco = resolverAlcance(vinculo({ perfilBase: 'GERENTE', permissoesRemovidas: ['precos.ver', 'precos.editar'] }));
    expect(texto(semPreco, 'ficha')).not.toMatch(/margem/i);
  });

  it('a tela de cadastro do parceiro só é entregue ao nível 1', () => {
    expect(ajudaParaATela(DONO).some((e) => e.chave === 'cadastro-do-parceiro')).toBe(false);
    expect(ajudaParaATela(ALCANCE_FLOWFOODS).some((e) => e.chave === 'cadastro-do-parceiro')).toBe(true);
  });

  it('todo mundo recebe uma aula (o primeiro bloco é para todos) em toda tela', () => {
    for (const a of [DONO, GERENTE, OPERADOR]) for (const e of ajudaParaATela(a)) expect(e.aula.length, e.chave).toBeGreaterThan(0);
  });
});

describe('0.6 · quando a caixa aparece', () => {
  const e = { chave: 'insumos', versao: 2 };
  const pref = (p: Partial<PreferenciaDeAjuda>): PreferenciaDeAjuda => ({ dicasLigadas: true, escolhida: true, fechadas: [], ...p });

  it('ligada e aberta: aparece; pergunta só até a 1ª resposta', () => {
    expect(caixaDaTela(e, pref({}))).toEqual({ mudou: false, perguntar: false });
    expect(caixaDaTela(e, pref({ escolhida: false }))).toEqual({ mudou: false, perguntar: true });
  });
  it('desligada, fechada nesta versão ou nível 1: não aparece', () => {
    expect(caixaDaTela(e, pref({ dicasLigadas: false }))).toBeNull();
    expect(caixaDaTela(e, pref({ fechadas: ['insumos@2'] }))).toBeNull();
    expect(caixaDaTela(e, null)).toBeNull();
  });
  it('versão nova do texto traz a caixa de volta com "mudou"; outra caixa fechada não conta', () => {
    expect(caixaDaTela(e, pref({ fechadas: ['insumos@1'] }))).toEqual({ mudou: true, perguntar: false });
    expect(caixaDaTela(e, pref({ fechadas: ['fichas@1', 'insumos-novo@1'] }))).toEqual({ mudou: false, perguntar: false });
  });
  it('fechar só aceita chave@versão que existe no registro agora', () => {
    expect(fechamentoValido(`insumos@${VI}`)).toBe(`insumos@${VI}`);
    for (const ruim of [`insumos@${VI + 1}`, 'nao-existe@1', 'insumos', '@1', `insumos@${VI}; drop table`, 'a'.repeat(200) + '@1', 'INSUMOS@1', null, 7, [`insumos@${VI}`]]) {
      expect(fechamentoValido(ruim), String(ruim)).toBeNull();
    }
  });
  it('a lista guardada é limpa na leitura (lixo, repetido, teto)', () => {
    expect(normalizarFechadas(['insumos@1', 'insumos@1', 'x', 3, '<b>@1', null as never])).toEqual(['insumos@1']);
    const muitas = Array.from({ length: 400 }, (_, n) => `c${n}@1`);
    expect(normalizarFechadas(muitas)).toHaveLength(300);
    expect(normalizarFechadas(muitas).at(-1)).toBe('c399@1');
    expect(normalizarFechadas(undefined)).toEqual([]);
  });
});

// ------------------------------------------------ o HTML que o servidor entrega (sem flash)
async function html(caminho: string, preferencia: PreferenciaDeAjuda | null, alcance: Alcance = DONO, versoes: Record<string, number> = {}) {
  caminhoAtual = caminho;
  const { AppShell } = await import('@/components/erp/shell/AppShell');
  const acao = async () => {};
  return renderToStaticMarkup(
    createElement(
      AppShell,
      {
        navegacao: navegacaoDoParceiro(alcance),
        contexto: 'Casa · Ativo',
        usuario: { nome: 'Maria', papel: 'Dona' },
        tema: 'claro',
        menuRecolhido: false,
        versao: 'Barney ERP',
        visao: { modo: 'parceiro', opcoes: [], valor: null, escolher: async () => ({ ok: true as const }) },
        notificacoes: [],
        links: [],
        sair: null,
        ajuda: {
          entradas: ajudaParaATela(alcance).map((e) => ({ ...e, versao: versoes[e.chave] ?? e.versao })),
          preferencia,
          acoes: preferencia ? { fechar: acao, dicas: acao } : null,
          contato: { url: 'https://wa.me/5521', display: '(21) 90000-0000' },
        },
        // A página de verdade: o PageHeader (onde a caixa mora, abaixo do h1) e o conteúdo.
        children: createElement(
          Fragment,
          null,
          createElement(PageHeader, { icone: 'insumo', cor: '#4D7C0F', titulo: 'Título da tela' }),
          createElement('div', { id: 'pagina' }, 'conteúdo da página'),
        ),
      },
    ),
  );
}
const PREF = (p: Partial<PreferenciaDeAjuda> = {}): PreferenciaDeAjuda => ({ dicasLigadas: true, escolhida: true, fechadas: [], ...p });

describe('0.6 · HTML do servidor: a caixa vem pronta, e nunca vem para quem fechou ou desligou', () => {
  it('ligada: caixa logo abaixo do título e acima do conteúdo, com o botão de fechar e o "?" no topo', async () => {
    const h = await html('/erp/insumos', PREF());
    expect(h).toContain('data-ajuda-caixa="insumos"');
    expect(h).toContain('Como funciona');
    expect(h).toContain('Entendi, não mostrar de novo');
    expect(h.indexOf('<h1')).toBeLessThan(h.indexOf('data-ajuda-caixa'));
    expect(h.indexOf('data-ajuda-caixa')).toBeLessThan(h.indexOf('conteúdo da página'));
    expect(h).toContain('aria-label="Ajuda desta tela"');
    expect(h).not.toContain('Quer as dicas de como usar cada tela?');
  });

  it('fechada nesta versão ou desligada: nenhuma caixa no HTML (sem flash); o "?" fica', async () => {
    for (const p of [PREF({ fechadas: [`insumos@${VI}`] }), PREF({ dicasLigadas: false })]) {
      const h = await html('/erp/insumos', p);
      expect(h).not.toContain('data-ajuda-caixa');
      expect(h).not.toContain('Entendi, não mostrar');
      expect(h).toContain('aria-label="Ajuda desta tela"');
      expect(h).toContain('conteúdo da página');
    }
  });

  it('fechar uma caixa não tira a das outras telas', async () => {
    const h = await html('/erp/fichas', PREF({ fechadas: ['insumos@1'] }));
    expect(h).toContain('data-ajuda-caixa="fichas"');
  });

  it('1ª vez: a pergunta vem dentro da caixa, sem modal; respondida, sai', async () => {
    const h = await html('/erp', PREF({ escolhida: false }));
    expect(h).toContain('Quer as dicas de como usar cada tela?');
    expect(h).toContain('Manter as dicas');
    expect(h).toContain('Desligar');
    expect(h).not.toContain('<dialog open');
    expect(await html('/erp', PREF({ escolhida: true }))).not.toContain('Manter as dicas');
  });

  it('o texto mudou (versão subiu): a caixa volta com a etiqueta Mudou para quem tinha fechado; quem nunca viu não ganha etiqueta', async () => {
    const h = await html('/erp/insumos', PREF({ fechadas: [`insumos@${VI}`] }), DONO, { insumos: VI + 1 });
    expect(h).toContain('data-ajuda-caixa="insumos"');
    expect(h).toContain('Mudou');
    expect(h).toContain(`name="caixa" value="insumos@${VI + 1}"`);
    expect(await html('/erp/insumos', PREF(), DONO, { insumos: VI + 1 })).not.toContain('Mudou');
    expect(await html('/erp/insumos', PREF({ fechadas: [`insumos@${VI + 1}`] }), DONO, { insumos: VI + 1 })).not.toContain('data-ajuda-caixa');
  });

  it('telas de contar: a caixa nasce recolhida (<details> fechado, funciona sem JS); as outras nascem abertas', async () => {
    const h = await html('/erp/estoque/loja1/abertura', PREF());
    expect(h).toContain('data-ajuda-caixa="estoque-abertura"');
    expect(h).toMatch(/<details class="group"><summary[\s\S]*Como funciona[\s\S]*Contagem de abertura/);
    expect(h).not.toMatch(/<details[^>]* open/);
    expect(h).toContain('Entendi, não mostrar de novo');
    expect(await html('/erp/estoque/loja1/contagens/c1', PREF())).toMatch(/<details class="group">/);
    expect(await html('/erp/fichas', PREF())).not.toContain('<details');
    // L.1: a lista de insumos também nasce recolhida (no celular a lista e os filtros ficam na primeira dobra); o detalhe do insumo não.
    expect(await html('/erp/insumos', PREF())).toMatch(/<details class="group"><summary[\s\S]*Como funciona/);
    expect(await html('/erp/insumos/abc', PREF())).not.toContain('<details');
    // a pergunta da 1ª vez pendente abre a caixa recolhida
    expect(await html('/erp/estoque/loja1/abertura', PREF({ escolhida: false }))).toMatch(/<details open="" class="group">/);
    // fechada: nenhuma caixa, recolhida ou não
    expect(await html('/erp/estoque/loja1/abertura', PREF({ fechadas: ['estoque-abertura@1'] }))).not.toContain('data-ajuda-caixa');
  });

  it('o seletor de visão mostra "Rede" no celular e "Rede Completa" a partir de sm', async () => {
    caminhoAtual = '/erp';
    const { SeletorVisao } = await import('@/components/erp/shell/SeletorVisao');
    const h = renderToStaticMarkup(
      createElement(SeletorVisao, { visao: { modo: 'parceiro', opcoes: [{ valor: 'rede', rotulo: 'Rede Completa', ativa: true }, { valor: 'l1', rotulo: 'Penha', ativa: true }] as never, valor: 'rede', escolher: async () => ({ ok: true as const }) } }),
    );
    expect(h).toMatch(/<span class="sm:hidden">Rede<\/span><span class="hidden sm:inline">Rede Completa<\/span>/);
  });

  it('o LinkDeAjuda sem JavaScript nasce escondido (como o "Ver tudo")', async () => {
    const { LinkDeAjuda, ContextoDaAjuda } = await import('@/components/erp/ui/link-de-ajuda');
    const h = renderToStaticMarkup(createElement(ContextoDaAjuda.Provider, { value: { abrir: () => {}, disponivel: true } }, createElement(LinkDeAjuda as never, { secao: 'conta' }, 'Como a conta é feita')));
    expect(h).toMatch(/<button[^>]*hidden=""[^>]*style="display:none"[^>]*>Como a conta é feita/);
    expect(renderToStaticMarkup(createElement(LinkDeAjuda as never, { secao: 'conta' }, 'x'))).toBe('');
  });

  it('o botão e os formulários funcionam sem JavaScript: são <form> e <button type="submit">', async () => {
    const h = await html('/erp/insumos', PREF());
    expect(h).toMatch(new RegExp(`<form[^>]*>[\\s\\S]*name="caixa" value="insumos@${VI}"[\\s\\S]*Entendi, não mostrar de novo<\\/button><\\/form>`));
    // "Ver tudo" não faz nada sem JavaScript: nasce escondido
    expect(h).toMatch(/<button[^>]*hidden[^>]*>Ver tudo sobre esta tela/);
  });

  it('nível 1 dentro do parceiro: o "?" aparece, caixa e pergunta nunca', async () => {
    const h = await html('/rodolfo/erp/casa/insumos', null, ALCANCE_FLOWFOODS);
    expect(h).toContain('aria-label="Ajuda desta tela"');
    expect(h).not.toContain('data-ajuda-caixa');
    expect(h).not.toContain('Quer as dicas');
  });

  it('telas fora do ERP (Barney, lista de parceiros) não têm "?"', async () => {
    for (const c of ['/rodolfo/hoje', '/rodolfo/erp']) {
      const h = await html(c, null, ALCANCE_FLOWFOODS);
      expect(h, c).not.toContain('aria-label="Ajuda desta tela"');
    }
  });

  it('o "?" tem nome, popup e atalho declarados', async () => {
    const h = await html('/erp/insumos', PREF());
    expect(h).toMatch(/<button[^>]*aria-label="Ajuda desta tela"[^>]*aria-haspopup="dialog"/);
    expect(h).toContain('aria-keyshortcuts="?"');
  });

  it('a caixa é uma seção nomeada (aria-labelledby) e não leva ícone, emoji nem gradiente', async () => {
    const h = await html('/erp/insumos', PREF());
    const caixa = /<section aria-labelledby="([^"]+)" data-ajuda-caixa[\s\S]*?<\/section>/.exec(h)!;
    expect(caixa[0]).toContain(`id="${caixa[1]}"`);
    expect(caixa[0]).not.toMatch(/<svg|gradient|\p{Extended_Pictographic}/u);
  });
});

// ------------------------------------------------------------------- guardas
function fontes(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(fontes(p));
    else if (/\.(tsx?|css)$/.test(n)) out.push(p);
  }
  return out;
}

describe('0.6 · guardas estáticas', () => {
  const SRC = fontes('src');
  const sem = (re: RegExp, onde: (f: string) => boolean = () => true) => SRC.filter((f) => onde(f) && re.test(readFileSync(f, 'utf8')));

  it('nenhum HTML cru em lugar nenhum do ERP: sem dangerouslySetInnerHTML', () => {
    expect(sem(/dangerouslySetInnerHTML/, (f) => /erp|rodolfo/.test(f))).toEqual([]);
  });

  it('a Dica morreu: o arquivo não existe e ninguém a usa (um caminho só para explicar)', () => {
    expect(existsSync(join('src', 'components', 'erp', 'ui', 'dica.tsx'))).toBe(false);
    expect(sem(/\bDica\b/)).toEqual([]);
    expect(sem(/ui\/dica['"]/)).toEqual([]);
  });

  it('as telas de contar não carregam mais a explicação solta, nem o "Como abre" recolhível', () => {
    expect(sem(/\bexplicacao\b/, (f) => f.includes(join('telas', 'estoque')))).toEqual([]);
    expect(sem(/<details[\s\S]{0,400}Como abre o estoque/)).toEqual([]);
  });

  it('a frase com jargão saiu da tela de preço', () => {
    expect(sem(/O servidor refaz/)).toEqual([]);
  });

  it('o /entrar não usa no-referrer (Origin: null derrubava o login sem JS); usa same-origin e mantém o token longe de sites de fora', () => {
    const layout = readFileSync(join('src', 'app', 'entrar', 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/referrer: 'same-origin'/);
    expect(layout).not.toMatch(/referrer: 'no-referrer'/);
  });

  it('só as actions da ajuda gravam a preferência, e só pela credenciais (o usuário vem da sessão)', () => {
    const grava = sem(/gravarPreferenciaDeAjuda\(/, (f) => !f.endsWith('credenciais.ts'));
    expect(grava.map((f) => f.replace(/\\/g, '/'))).toEqual(['src/app/erp/actions.ts']);
    const txt = readFileSync(join('src', 'app', 'erp', 'actions.ts'), 'utf8');
    const trecho = txt.slice(txt.indexOf('ajuda contextual (0.6)')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(trecho).not.toMatch(/usuarioId|get\('usuario|get\("usuario/);
    expect(trecho.match(/gravarPreferenciaDeAjuda\(tokenDoCookie\(\)/g)).toHaveLength(3);
  });
});
