/**
 * Decisão 520 — pontos de ajuda em "Lançar despesa" (nova e editar) e em "Despesa" (o detalhe), nas duas áreas.
 *
 *  - cada ponto do registro tem âncora na tela renderizada pelo servidor, no campo ou na seção que explica, dentro do shell de
 *    verdade em `/erp/...` (dona, com preferência) e em `/rodolfo/erp/<slug>/...` (nível 1, sem preferência);
 *  - o texto educativo que saiu do corpo (subtítulo de "A que período pertence", o de "Conta a pagar" no formulário e o "Não muda
 *    o DRE." do detalhe) está num card e não some: sem o ponto (fora do shell), o texto de antes volta; o card não se repete no corpo;
 *  - o que fica no corpo é o essencial: "Opcional.", a consequência da loja escolhida, a conta ao vivo, o aviso de período fechado;
 *  - quem não tem a permissão do bloco não recebe o bloco: o card do início só para quem vê o DRE; marcar como paga, só para quem lança.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let caminhoAtual = '/erp/dre/despesas/nova';
vi.mock('next/navigation', () => ({
  usePathname: () => caminhoAtual,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, () => {}], useFormStatus: () => ({ pending: false }) }));

import { ajudaParaATela, entradaPorChave, problemasDoRegistro } from '@/lib/erp/ajuda';
import { ATRIBUTO_POR_ULTIMO, ordemDaSequencia, passosDaSequencia } from '@/lib/erp/ajuda-sequencia';
import type { PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import type { DespesaCompleta } from '@/lib/erp/despesas';
import { COR, navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import type { AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { FormDespesa, type InicialDaDespesa, type LinhaParaOFormulario } from '@/components/erp/telas/dre/form-despesa';
import { TelaDaDespesa } from '@/components/erp/telas/dre/detalhe-despesa';

const vinculo = (v: Partial<VinculoDePermissao>): VinculoDePermissao => ({
  perfilBase: null,
  perfilProprio: null,
  permissoesExtras: [],
  permissoesRemovidas: [],
  redeInteira: true,
  lojaIds: [],
  ...v,
});
const DONO = resolverAlcance(vinculo({ perfilBase: 'DONO' }));
/** Lança despesa e não vê o DRE (o administrativo do critério 15): não vê o card de Despesas do início. */
const SO_LANCA = resolverAlcance(vinculo({ perfilProprio: ['despesas.lancar', 'lojas.ver'] }));
/** Vê o DRE e não lança despesa: abre a despesa só para ler. */
const SO_VE = resolverAlcance(vinculo({ perfilProprio: ['dre.ver', 'lojas.ver'] }));
const PREF: PreferenciaDeAjuda = { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] };

/** As duas áreas: a mesma tela, com o shell de cada uma (o nível 1 lê o registro inteiro e não tem preferência). */
const AREAS = [
  { nome: 'parceiro', raiz: '/erp', alcance: DONO, preferencia: PREF as PreferenciaDeAjuda | null },
  { nome: 'nível 1', raiz: '/rodolfo/erp/casa-alfa', alcance: ALCANCE_FLOWFOODS, preferencia: null },
] as const;

const n = (s: string) => s.replace(/&nbsp;|\u00a0|\u202f/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

async function noShell(filho: ReturnType<typeof createElement>, caminho: string, alcance: Alcance, preferencia: PreferenciaDeAjuda | null) {
  caminhoAtual = caminho;
  const { AppShell } = await import('@/components/erp/shell/AppShell');
  const acao = async () => {};
  return n(
    renderToStaticMarkup(
      createElement(AppShell, {
        navegacao: navegacaoDoParceiro(alcance, NENHUM_MODULO_LIBERADO),
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
          entradas: ajudaParaATela(alcance),
          preferencia,
          acoes: preferencia ? { fechar: acao, dicas: acao, pontosVistos: acao, pontoNunca: acao } : null,
          hoje: 20_000,
          contato: { url: 'https://wa.me/5521', display: '(21) 90000-0000' },
        },
        children: filho,
      } as never),
    ),
  );
}

// ------------------------------------------------------------------ o formulário e a despesa, montados à mão (sem banco)

const HOJE = '2026-10-17';
const LINHAS: LinhaParaOFormulario[] = [
  { chave: 'impostos', nome: 'Impostos sobre a venda (DAS)', grupo: 'DEDUCAO' },
  { chave: 'aluguel', nome: 'Aluguel', grupo: 'OCUPACAO' },
  { chave: 'energia', nome: 'Energia', grupo: 'UTILIDADES' },
];
const LOJAS = [
  { id: 'loja-vp', nome: 'Vila da Penha' },
  { id: 'loja-meier', nome: 'Méier' },
];
const FECHADO_SETEMBRO = { nome: 'Setembro', inicio: '2026-09-01', fim: '2026-09-30' };

const inicial = (p: Partial<InicialDaDespesa> = {}): InicialDaDespesa => ({
  lojaId: 'loja-vp',
  linha: 'aluguel',
  descricao: 'Aluguel da Penha',
  valor: '3.100,00',
  tipo: 'mes',
  dia: '17/10/2026',
  mes: '2026-10',
  de: '',
  ate: '',
  recorrente: false,
  vencimento: '',
  ...p,
});

/** O formulário como a página monta (cabeçalho com o card da tela + formulário). `periodoFechado`: a edição de despesa já fechada. */
function telaDoFormulario(raiz: string, opcoes: { inicial?: Partial<InicialDaDespesa>; periodoFechado?: boolean } = {}) {
  const periodos: AvisoDePeriodos = { fechados: [FECHADO_SETEMBRO], emCurso: 'Outubro', href: `${raiz}/dre/periodos` };
  return createElement(
    'div',
    null,
    createElement(PageHeader, { icone: 'compras', cor: COR.dre, titulo: 'Lançar despesa', subtitulo: 'Casa · aluguel, salário, luz e outras' }),
    createElement(FormDespesa, {
      acao: async () => null,
      linhas: LINHAS,
      lojas: LOJAS,
      podeRede: true,
      inicial: inicial(opcoes.inicial),
      hoje: HOJE,
      envio: 'a'.repeat(32),
      versao: '',
      voltar: `${raiz}/dre/despesas`,
      rotuloDoBotao: 'Lançar despesa',
      bloqueio: null,
      periodoFechado: opcoes.periodoFechado,
      periodos,
    }),
  );
}

function despesa(opcoes: { fechado?: string | null }): DespesaCompleta {
  return {
    despesa: {
      id: 'd1',
      lojaId: 'loja-vp',
      lojaNome: 'Vila da Penha',
      linhaId: 'l-aluguel',
      linhaNome: 'Aluguel',
      linhaChave: 'aluguel',
      linhaOculta: false,
      descricao: 'Aluguel da Penha',
      valorCentavos: 310_000,
      competencia: { inicio: '2026-10-01', fim: '2026-10-31' },
      recorrente: true,
      repeteDeId: null,
      vencimento: '2026-10-05',
      pagaEm: null,
      atualizadoPorNome: 'Marina',
      versao: '2026-10-01T12:00:00.000Z',
      atualizadoEm: new Date('2026-10-01T12:00:00Z'),
      criadoEm: new Date('2026-10-01T12:00:00Z'),
    },
    pagamento: 'vencida',
    tipo: 'mes',
    origem: null,
    filha: null,
    fechado: opcoes.fechado ?? null,
    historico: [],
  } as DespesaCompleta;
}

function telaDaDespesa(raiz: string, opcoes: { podeLancar?: boolean; fechado?: string | null } = {}) {
  const acao = async () => null;
  return createElement(TelaDaDespesa, {
    d: despesa(opcoes),
    base: `${raiz}/dre/despesas`,
    hoje: HOJE,
    podeLancar: opcoes.podeLancar ?? true,
    periodosHref: `${raiz}/dre/periodos`,
    bloqueio: null,
    acoes: { pagar: acao, desfazer: acao, parar: acao, remover: acao },
  } as never);
}

// ------------------------------------------------------------------ como ler o HTML

const ancora = (h: string, ponto: string) => h.indexOf(`data-ponto="${ponto}"`);
const quantas = (h: string, ponto: string) => h.split(`data-ponto="${ponto}"`).length - 1;

/** Os botões de ponto na ordem da página, com a marca "por último" de cada um. */
function botoes(h: string): { id: string; porUltimo: boolean }[] {
  return Array.from(h.matchAll(/<(?:button|summary)\b[^>]*\bdata-ponto="([a-z0-9-]+)"[^>]*>/g)).map((m) => ({ id: m[1], porUltimo: m[0].includes(`${ATRIBUTO_POR_ULTIMO}=""`) }));
}
const sequencia = (h: string) => passosDaSequencia(ordemDaSequencia(botoes(h).map((b) => ({ ...b, optouFora: false })), (b) => b.porUltimo), null);

/** O botão do ponto está no cabeçalho do painel com este título (entre o título e o fim do cabeçalho). */
function noCabecalho(h: string, titulo: string, ponto: string) {
  const i = h.indexOf(`>${titulo}</h2>`);
  expect(i, `painel "${titulo}"`).toBeGreaterThan(-1);
  const fim = h.indexOf('</header>', i);
  const p = h.indexOf(`data-ponto="${ponto}"`, i);
  expect(p > i && p < fim, `"${ponto}" no cabeçalho de "${titulo}"`).toBe(true);
}

/** O texto de todos os blocos de um ponto, como chega à tela de quem tem este alcance. */
function card(alcance: Alcance, chave: string, ponto: string): string {
  const e = ajudaParaATela(alcance).find((x) => x.chave === chave);
  return (e?.pontos.find((p) => p.id === `${chave}.${ponto}`)?.blocos ?? []).join(' ');
}
const blocos = (alcance: Alcance, chave: string, ponto: string) => ajudaParaATela(alcance).find((x) => x.chave === chave)?.pontos.find((p) => p.id === `${chave}.${ponto}`)?.blocos ?? [];

const NOVA = '/dre/despesas/nova';
const EDITAR = '/dre/despesas/d1/editar';
const DETALHE = '/dre/despesas/d1';

// ================================================================== o registro

describe('decisão 520 · os pontos de Lançar despesa e de Despesa no registro', () => {
  it('o registro continua válido; 6 pontos nas duas telas, ids estáveis, na ordem da página; aula e versão iguais', () => {
    expect(problemasDoRegistro()).toEqual([]);
    const ids = (chave: string) => (entradaPorChave(chave)?.pontos ?? []).map((p) => p.id);
    expect(ids('dre-despesa-nova')).toEqual(['linha', 'competencia', 'repete', 'vencimento']);
    expect(ids('dre-despesa')).toEqual(['como-conta', 'pagamento']);
    // Os pontos não entram no hash do lock: a caixa "Como funciona" não volta com "Mudou" para quem fechou.
    expect(entradaPorChave('dre-despesa-nova')?.versao).toBe(1);
    expect(entradaPorChave('dre-despesa')?.versao).toBe(1);
  });

  it('em que linha e em que período a despesa conta: grupo, deduções, competência, até ontem, fotografia, rede × loja', () => {
    const linha = card(DONO, 'dre-despesa-nova', 'linha');
    for (const t of ['A linha decide o grupo do DRE', 'Deduções da venda, que descontam a receita', 'card de Despesas de uma loja', 'menos as deduções da venda']) expect(linha, t).toContain(t);
    const comp = card(DONO, 'dre-despesa-nova', 'competencia');
    for (const t of ['O DRE conta pela competência', 'a luz de outubro é de outubro, mesmo paga em novembro', 'no período em curso, só até ontem', 'fotografia do DRE']) expect(comp, t).toContain(t);
    const comoConta = card(DONO, 'dre-despesa', 'como-conta');
    for (const t of ['a competência decide o período', 'só até ontem', 'no DRE da loja e no da rede', 'a da rede entra só no DRE da rede, sem dividir entre as lojas', 'sem as deduções da venda']) expect(comoConta, t).toContain(t);
  });

  it('a que repete todo mês: volta em Lançar as do mês passado, o DRE avisa Falta lançar, Não repete mais encerra', () => {
    const r = card(DONO, 'dre-despesa-nova', 'repete');
    for (const t of ['Lançar as do mês passado', 'nada entra sozinho', 'o DRE avisa Falta lançar', 'Não repete mais']) expect(r, t).toContain(t);
  });

  it('vencimento e pagamento não mudam o DRE; A pagar é o filtro da lista', () => {
    expect(card(DONO, 'dre-despesa-nova', 'vencimento')).toContain('O vencimento não muda o DRE');
    expect(card(DONO, 'dre-despesa-nova', 'vencimento')).toContain('filtro A pagar');
    expect(card(DONO, 'dre-despesa', 'pagamento')).toContain('Vencimento e pagamento não mudam o DRE');
    expect(card(DONO, 'dre-despesa', 'pagamento')).toContain('filtro A pagar');
    expect(card(DONO, 'dre-despesa', 'pagamento')).toContain('não pode ser futura');
  });
});

// ================================================================== o texto que saiu do corpo foi para um card

describe('decisão 520 · o texto educativo sai do corpo e mora no card (não some)', () => {
  /** Cada frase que saiu do corpo, a tela onde estava e o que o card precisa dizer no lugar. */
  const MOVIDOS = [
    {
      onde: 'formulário · A que período pertence',
      frase: 'O DRE conta pela competência: a luz de outubro é de outubro, mesmo paga em novembro.',
      tela: (raiz: string) => telaDoFormulario(raiz),
      caminho: NOVA,
      ponto: ['dre-despesa-nova', 'competencia'],
      noCard: ['O DRE conta pela competência', 'a luz de outubro é de outubro, mesmo paga em novembro'],
    },
    {
      onde: 'formulário · Conta a pagar',
      frase: 'O vencimento não muda o DRE; ele só põe a despesa no filtro “A pagar”.',
      tela: (raiz: string) => telaDoFormulario(raiz),
      caminho: NOVA,
      ponto: ['dre-despesa-nova', 'vencimento'],
      noCard: ['O vencimento não muda o DRE', 'ela fica no filtro A pagar'],
    },
    {
      onde: 'editar · Conta a pagar (a mesma tela de lançar)',
      frase: 'O vencimento não muda o DRE; ele só põe a despesa no filtro “A pagar”.',
      tela: (raiz: string) => telaDoFormulario(raiz, { inicial: { vencimento: '05/10/2026' } }),
      caminho: EDITAR,
      ponto: ['dre-despesa-nova', 'vencimento'],
      noCard: ['O vencimento não muda o DRE'],
    },
    {
      onde: 'despesa · Conta a pagar',
      frase: 'Não muda o DRE.',
      tela: (raiz: string) => telaDaDespesa(raiz),
      caminho: DETALHE,
      ponto: ['dre-despesa', 'pagamento'],
      noCard: ['Vencimento e pagamento não mudam o DRE'],
    },
  ];

  it.each(MOVIDOS.map((m) => [m.onde, m]))('%s: com o ponto, sai do corpo e o card diz o mesmo; sem o ponto, o texto volta', async (_onde, m) => {
    for (const area of AREAS) {
      const h = await noShell(m.tela(area.raiz), `${area.raiz}${m.caminho}`, area.alcance, area.preferencia);
      expect(h, `${area.nome}: botão`).toContain(`data-ponto="${m.ponto[1]}"`);
      expect(h, `${area.nome}: fora do corpo`).not.toContain(m.frase);
      const texto = card(area.alcance, m.ponto[0], m.ponto[1]);
      for (const t of m.noCard) expect(texto, `${area.nome}: "${t}" no card`).toContain(t);
    }
    // Fora do shell (sem o ponto para a pessoa): o texto de antes, sem botão. Nenhum painel fica sem explicação.
    const sem = n(renderToStaticMarkup(m.tela('/erp')));
    expect(sem).toContain(m.frase);
    expect(sem).not.toContain(`data-ponto="${m.ponto[1]}"`);
  });

  it('o que fica no corpo é o essencial: Opcional, a consequência da loja, a conta ao vivo, o rótulo da que repete, o aviso de período fechado', async () => {
    const f = await noShell(telaDoFormulario('/erp'), `/erp${NOVA}`, DONO, PREF);
    expect(f).toMatch(/>Conta a pagar<\/h2><p[^>]*>Opcional\.<\/p>/);
    expect(f).toContain('Entra no DRE desta loja e no da rede.');
    expect(f).toContain('R$ 3.100,00 em 31 dias: o DRE apropria cerca de R$ 100,00 por dia.');
    expect(f).toContain('Repete todo mês (aluguel, salário, luz)');
    // A rede: a consequência continua escrita junto do campo (não há rateio entre as lojas).
    const rede = await noShell(telaDoFormulario('/erp', { inicial: { lojaId: '' } }), `/erp${NOVA}`, DONO, PREF);
    expect(rede).toContain('Despesa da rede entra só no DRE da rede, sem rateio nas lojas.');
    // Competência digitada num período fechado: o aviso continua no corpo, com a saída e a alternativa.
    const fechada = await noShell(telaDoFormulario('/erp', { inicial: { mes: '2026-09' } }), `/erp${NOVA}`, DONO, PREF);
    expect(fechada).toContain('O período Setembro já foi fechado no DRE.');
    expect(fechada).toContain('Uma despesa com competência nele não entra.');
    expect(fechada).toContain('Ou lance com competência em Outubro.');
    // A despesa: os dados, como o DRE conta e o aviso de período fechado ficam; a consequência do Remover também.
    const d = await noShell(telaDaDespesa('/erp', { fechado: 'Outubro' }), `/erp${DETALHE}`, DONO, PREF);
    expect(d).toContain('Como o DRE conta');
    expect(d).toContain('Dia a dia: R$ 3.100,00 em 31 dias');
    expect(d).toContain('O período Outubro já foi fechado no DRE.');
    expect(d).toContain('dá para pagar e mudar o vencimento, mas valor, competência, linha e loja não mudam mais.');
    expect(d).toContain('Despesa de período fechado não sai.');
    expect(d).toContain('Vencida');
  });

  it('o card não se repete no corpo: nenhum bloco de ponto aparece escrito na tela', async () => {
    const telas = [
      { chave: 'dre-despesa-nova', h: await noShell(telaDoFormulario('/erp'), `/erp${NOVA}`, DONO, PREF) },
      { chave: 'dre-despesa-nova', h: await noShell(telaDoFormulario('/erp', { inicial: { lojaId: '', mes: '2026-09' } }), `/erp${NOVA}`, DONO, PREF) },
      { chave: 'dre-despesa-nova', h: await noShell(telaDoFormulario('/erp', { inicial: { mes: '2026-09' }, periodoFechado: true }), `/erp${EDITAR}`, DONO, PREF) },
      { chave: 'dre-despesa', h: await noShell(telaDaDespesa('/erp'), `/erp${DETALHE}`, DONO, PREF) },
      { chave: 'dre-despesa', h: await noShell(telaDaDespesa('/erp', { fechado: 'Outubro' }), `/erp${DETALHE}`, DONO, PREF) },
    ];
    for (const { chave, h } of telas) {
      for (const p of entradaPorChave(chave)?.pontos ?? []) for (const b of p.blocos) expect(h, `${chave}.${p.id}`).not.toContain(b.texto);
    }
  });
});

// ================================================================== a âncora de cada ponto, nas duas áreas

describe.each(AREAS.map((a) => [a.nome, a]))('decisão 520 · âncoras na tela renderizada (%s)', (_nome, area) => {
  const { raiz, alcance, preferencia } = area;

  it('lançar: linha junto do rótulo, competência e vencimento no cabeçalho do painel, repete ao lado da caixa; na ordem da página', async () => {
    const h = await noShell(telaDoFormulario(raiz), `${raiz}${NOVA}`, alcance, preferencia);
    expect(h).toContain('data-ajuda-tela="dre-despesa-nova"');
    const rotulo = h.indexOf('<label for="desp-linha"');
    expect(rotulo).toBeGreaterThan(-1);
    // Depois do rótulo, fora dele (botão dentro de label passaria o clique ao campo), e antes do campo.
    expect(ancora(h, 'linha')).toBeGreaterThan(h.indexOf('</label>', rotulo));
    expect(ancora(h, 'linha')).toBeLessThan(h.indexOf('<select id="desp-linha"'));
    noCabecalho(h, 'A que período pertence', 'competencia');
    // A caixa "Repete todo mês" e o botão dela: fora do rótulo (botão dentro de label marcaria a caixa), antes de "Conta a pagar".
    const caixa = h.indexOf('name="recorrente"');
    const inicioDoRotulo = h.lastIndexOf('<label', caixa);
    const fimDoRotulo = h.indexOf('</label>', caixa);
    expect(h.slice(inicioDoRotulo, fimDoRotulo)).toContain('Repete todo mês (aluguel, salário, luz)');
    expect(h.slice(inicioDoRotulo, fimDoRotulo)).not.toContain('<button');
    expect(ancora(h, 'repete')).toBeGreaterThan(fimDoRotulo);
    expect(ancora(h, 'repete')).toBeLessThan(h.indexOf('>Conta a pagar</h2>'));
    noCabecalho(h, 'Conta a pagar', 'vencimento');
    for (const p of ['linha', 'competencia', 'repete', 'vencimento']) expect(quantas(h, p), p).toBe(1);
    expect(botoes(h).filter((b) => b.porUltimo)).toEqual([]);
    expect(sequencia(h)).toEqual(['tela', 'linha', 'competencia', 'repete', 'vencimento']);
  });

  it('despesa de um dia ou de um período: sem a caixa "Repete todo mês", sem o ponto dela', async () => {
    for (const tipo of ['dia', 'intervalo'] as const) {
      const h = await noShell(telaDoFormulario(raiz, { inicial: { tipo, de: '01/10/2026', ate: '15/10/2026' } }), `${raiz}${NOVA}`, alcance, preferencia);
      expect(h, tipo).not.toContain('name="recorrente"');
      expect(quantas(h, 'repete'), tipo).toBe(0);
      expect(sequencia(h), tipo).toEqual(['tela', 'linha', 'competencia', 'vencimento']);
    }
  });

  it('editar uma despesa de período fechado: campos que mudam o DRE travados, os botões de ajuda não (nenhum bloco desligado)', async () => {
    const h = await noShell(telaDoFormulario(raiz, { inicial: { mes: '2026-09' }, periodoFechado: true }), `${raiz}${EDITAR}`, alcance, preferencia);
    expect(h).toContain('data-ajuda-tela="dre-despesa-nova"');
    expect(h).toMatch(/<select id="desp-linha" name="linha"[^>]*disabled=""/);
    expect(h).toMatch(/<input id="desp-valor" name="valor"[^>]*disabled=""/);
    expect(h).not.toContain('<fieldset disabled=""');
    for (const p of ['linha', 'competencia', 'repete', 'vencimento']) expect(quantas(h, p), p).toBe(1);
  });

  it('despesa: como conta no cabeçalho de "Despesa", pagamento no de "Conta a pagar" (com o selo); com período fechado, igual', async () => {
    for (const fechado of [null, 'Setembro']) {
      const h = await noShell(telaDaDespesa(raiz, { fechado }), `${raiz}${DETALHE}`, alcance, preferencia);
      expect(h).toContain('data-ajuda-tela="dre-despesa"');
      noCabecalho(h, 'Despesa', 'como-conta');
      noCabecalho(h, 'Conta a pagar', 'pagamento');
      // O selo continua no cabeçalho, junto do botão.
      const cab = h.slice(h.indexOf('>Conta a pagar</h2>'), h.indexOf('</header>', h.indexOf('>Conta a pagar</h2>')));
      expect(cab).toContain('Vencida');
      for (const p of ['como-conta', 'pagamento']) expect(quantas(h, p), p).toBe(1);
      expect(sequencia(h)).toEqual(['tela', 'como-conta', 'pagamento']);
      if (fechado) expect(ancora(h, 'como-conta')).toBeGreaterThan(h.indexOf('data-aviso-periodo-fechado'));
    }
  });
});

// ================================================================== quem lê o quê

describe('decisão 520 · cada bloco chega só a quem ele serve', () => {
  it('o card de Despesas do início é de quem vê o DRE: quem só lança recebe a linha e a regra, sem ele', () => {
    expect(blocos(SO_LANCA, 'dre-despesa-nova', 'linha')).toHaveLength(2);
    expect(card(SO_LANCA, 'dre-despesa-nova', 'linha')).not.toContain('card de Despesas');
    expect(card(SO_LANCA, 'dre-despesa-nova', 'linha')).toContain('Deduções da venda');
    expect(blocos(SO_LANCA, 'dre-despesa', 'como-conta')).toHaveLength(2);
    expect(card(SO_LANCA, 'dre-despesa', 'como-conta')).not.toContain('card de Despesas');
    for (const a of [DONO, ALCANCE_FLOWFOODS, SO_VE]) expect(card(a, 'dre-despesa', 'como-conta')).toContain('card de Despesas de uma loja');
    expect(card(DONO, 'dre-despesa-nova', 'linha')).toContain('card de Despesas de uma loja');
  });

  it('marcar como paga é de quem lança: quem só vê recebe o pagamento sem esse bloco; o resto dos pontos chega a todos', () => {
    expect(blocos(SO_VE, 'dre-despesa', 'pagamento')).toHaveLength(2);
    expect(card(SO_VE, 'dre-despesa', 'pagamento')).not.toContain('Marque como paga');
    for (const a of [DONO, SO_LANCA, ALCANCE_FLOWFOODS]) expect(card(a, 'dre-despesa', 'pagamento')).toContain('Marque como paga');
    for (const a of [DONO, SO_LANCA, SO_VE]) {
      for (const p of ['competencia', 'repete', 'vencimento']) expect(blocos(a, 'dre-despesa-nova', p).length, p).toBe(entradaPorChave('dre-despesa-nova')!.pontos!.find((x) => x.id === p)!.blocos.length);
    }
  });

  it('quem só vê abre a despesa com os dois pontos e sem os botões de pagar, editar e remover', async () => {
    const h = await noShell(telaDaDespesa('/erp', { podeLancar: false }), `/erp${DETALHE}`, SO_VE, PREF);
    expect([quantas(h, 'como-conta'), quantas(h, 'pagamento')]).toEqual([1, 1]);
    expect(h).not.toContain('Marcar como paga');
    expect(h).not.toContain('Mudar ou tirar');
    expect(h).not.toContain('Marque como paga');
  });
});
