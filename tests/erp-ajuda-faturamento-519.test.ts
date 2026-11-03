/**
 * Decisão 519 — pontos de ajuda no Faturamento (mês, dia da loja e "Lançar o dia"), nas duas áreas.
 *
 *  - cada ponto do registro tem âncora na tela renderizada pelo servidor, no campo ou na seção que explica, dentro do shell de
 *    verdade em `/erp/...` (dona, com preferência) e em `/rodolfo/erp/<slug>/...` (nível 1, sem preferência);
 *  - o texto educativo que saiu do corpo (subtítulos do mês, rodapé da integração, subtítulo do "Remover") está num card e não
 *    some: sem o ponto (fora do shell), o texto de antes volta; o que o card diz não se repete no corpo;
 *  - os botões do dia ficam fora do bloco que trava no dia só de consulta (fieldset desligado desligaria o botão);
 *  - quem não tem a permissão do bloco não recebe o bloco (nem o ponto inteiro, no "Remover").
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let caminhoAtual = '/erp/faturamento';
vi.mock('next/navigation', () => ({
  usePathname: () => caminhoAtual,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, () => {}], useFormStatus: () => ({ pending: false }) }));

import { ajudaParaATela, entradaPorChave, problemasDoRegistro } from '@/lib/erp/ajuda';
import { estadoDoPonto, itemDoPonto, type PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import { ATRIBUTO_POR_ULTIMO, marcadosAoComecarSozinha, ordemDaSequencia, passosDaSequencia, progressoDoPasso, proximoPasso } from '@/lib/erp/ajuda-sequencia';
import type { DiaDaLojaLido, LojaDoFaturamento, LojaNoMes, MesDoFaturamento, DiaDaLojaNoMes } from '@/lib/erp/faturamento';
import { CANAIS_EM_ORDEM, totalizar, type CanalVenda, type GraoLido } from '@/lib/erp/faturamento-campos';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import { voltaParaAHome } from '@/lib/erp/volta';
import { TelaDoMes } from '@/components/erp/telas/faturamento/mes';
import { TelaDoDia } from '@/components/erp/telas/faturamento/dia';
import { TelaEscolherODia } from '@/components/erp/telas/faturamento/escolher';

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
/** Vê o faturamento e não lança (o perfil do 518 que recebe "Ver o faturamento"). */
const SO_VE = resolverAlcance(vinculo({ perfilBase: 'OPERADOR', permissoesExtras: ['faturamento.ver'] }));
const PREF: PreferenciaDeAjuda = { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] };

/** As duas áreas: a mesma tela, com o shell de cada uma (o nível 1 lê o registro inteiro e não tem preferência). */
const AREAS = [
  { nome: 'parceiro', raiz: '/erp', alcance: DONO, preferencia: PREF as PreferenciaDeAjuda | null },
  { nome: 'nível 1', raiz: '/rodolfo/erp/casa-alfa', alcance: ALCANCE_FLOWFOODS, preferencia: null },
] as const;

const n = (s: string) => s.replace(/&nbsp;| /g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

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

// ------------------------------------------------------------------ o mês e o dia, montados à mão (sem banco)

const MES = '2026-10';
const HOJE_DO_MES = '2026-10-17';
const VP: LojaDoFaturamento = { id: 'loja-vp', nome: 'Vila da Penha', ativa: true, canais: ['LOJA', 'IFOOD'] };
const MEIER: LojaDoFaturamento = { id: 'loja-meier', nome: 'Méier', ativa: true, canais: ['DELIVERY_PROPRIO'] };
const grao = (valorCentavos: number, pedidos: number, fonte: GraoLido['fonte'] = 'HUMANO'): GraoLido => ({ valorCentavos, pedidos, clientes: pedidos, fonte, conferencia: null });

/** Do dia 1 ao 14 completo; 15 sem iFood (falta); 16 com iFood "Não vendeu" (zero); 17 é hoje (em aberto); depois, futuro. */
function lojaNoMes(loja: LojaDoFaturamento, fonte: GraoLido['fonte'] = 'HUMANO'): LojaNoMes {
  const dias: DiaDaLojaNoMes[] = Array.from({ length: 31 }, (_, i) => {
    const data = `${MES}-${String(i + 1).padStart(2, '0')}`;
    const canais: Partial<Record<CanalVenda, GraoLido>> = {};
    if (data < HOJE_DO_MES) for (const c of loja.canais) canais[c] = grao(100_000, 20, fonte);
    if (data === `${MES}-15`) delete canais.IFOOD;
    if (data === `${MES}-16` && canais.IFOOD) canais.IFOOD = grao(0, 0);
    const lancados = Object.values(canais);
    return {
      data,
      canais,
      total: lancados.length ? totalizar(lancados) : null,
      faltam: data === `${MES}-15` && loja.canais.includes('IFOOD') ? ['IFOOD'] : [],
      emAberto: data === HOJE_DO_MES,
      futuro: data > HOJE_DO_MES,
    };
  });
  const porCanal = Object.fromEntries(CANAIS_EM_ORDEM.map((c) => [c, totalizar(dias.flatMap((d) => (d.canais[c] ? [d.canais[c]!] : [])))])) as LojaNoMes['porCanal'];
  const faltas = dias.reduce((s, d) => s + d.faltam.length, 0);
  return { loja, primeiraData: `${MES}-01`, dias, porCanal, total: totalizar(CANAIS_EM_ORDEM.map((c) => porCanal[c])), faltasPorCanal: { LOJA: 0, DELIVERY_PROPRIO: 0, IFOOD: faltas }, faltas };
}

function mes(lojas: LojaNoMes[], temIntegracao = false): MesDoFaturamento {
  const porCanal = Object.fromEntries(CANAIS_EM_ORDEM.map((c) => [c, totalizar(lojas.map((l) => l.porCanal[c]))])) as MesDoFaturamento['porCanal'];
  return {
    mes: MES,
    hoje: HOJE_DO_MES,
    dias: lojas[0].dias.map((d) => d.data),
    lojas,
    porCanal,
    total: totalizar(CANAIS_EM_ORDEM.map((c) => porCanal[c])),
    faltas: lojas.reduce((s, l) => s + l.faltas, 0),
    temIntegracao,
  };
}

function telaDoMes(raiz: string, opcoes: { rede?: boolean; integracao?: boolean; comVolta?: boolean } = {}) {
  const vp = lojaNoMes(VP, opcoes.integracao ? 'INTEGRACAO' : 'HUMANO');
  const m = opcoes.rede ? mes([vp, lojaNoMes(MEIER)], opcoes.integracao) : mes([vp], opcoes.integracao);
  return createElement(TelaDoMes, {
    m,
    base: `${raiz}/faturamento`,
    lojaAberta: opcoes.rede ? undefined : vp,
    podeLancar: true,
    bloqueio: null,
    veRede: true,
    volta: opcoes.comVolta ? voltaParaAHome(raiz, raiz) : null,
  });
}

const ONTEM = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
})();

/** `primeiroDesligado`: a loja deixou de vender na Loja, que só aparece por ter lançamento antigo (o canal fica travado). */
function diaLido(opcoes: { fechado?: string | null; primeiroDesligado?: boolean } = {}): DiaDaLojaLido {
  const humano = { id: 'f1', origem: 'MANUAL' as const, versao: '2026-10-16T12:00:00.000Z', atualizadoEm: new Date('2026-10-16T12:00:00Z'), atualizadoPorNome: 'Gil', valorCentavos: 100_000, pedidos: 20, clientes: 20 };
  return {
    loja: VP,
    data: ONTEM,
    canais: [
      { canal: 'LOJA', ativo: !opcoes.primeiroDesligado, humano, valendo: grao(100_000, 20) },
      { canal: 'IFOOD', ativo: true, humano: null, valendo: null },
    ],
    fechado: opcoes.fechado ?? null,
    historico: [],
  };
}

function telaDoDia(raiz: string, opcoes: { podeLancar?: boolean; fechado?: string | null; primeiroDesligado?: boolean } = {}) {
  const acao = async () => null;
  return createElement(TelaDoDia, {
    dia: diaLido({ fechado: opcoes.fechado, primeiroDesligado: opcoes.primeiroDesligado }),
    base: `${raiz}/faturamento`,
    acao,
    remover: () => acao,
    podeLancar: opcoes.podeLancar ?? true,
    verPeriodos: true,
    bloqueio: null,
  } as never);
}

function telaDeLancar(raiz: string) {
  return createElement(TelaEscolherODia, {
    base: `${raiz}/faturamento`,
    lojas: [
      { id: VP.id, nome: VP.nome },
      { id: MEIER.id, nome: MEIER.nome },
    ],
    hoje: HOJE_DO_MES,
    ontem: '2026-10-16',
    contexto: 'Rede Completa',
  });
}

// ------------------------------------------------------------------ como ler o HTML

const ancora = (h: string, ponto: string) => h.indexOf(`data-ponto="${ponto}"`);
const quantas = (h: string, ponto: string) => h.split(`data-ponto="${ponto}"`).length - 1;

/** Os botões de ponto na ordem da página, com a marca "por último" de cada um (lida da própria tag). */
function botoes(h: string): { id: string; porUltimo: boolean }[] {
  return Array.from(h.matchAll(/<(?:button|summary)\b[^>]*\bdata-ponto="([a-z0-9-]+)"[^>]*>/g)).map((m) => ({ id: m[1], porUltimo: m[0].includes(`${ATRIBUTO_POR_ULTIMO}=""`) }));
}

/** A sequência como o provedor monta: a ordem da página, com os "por último" no fim (a mesma regra pura). */
const sequencia = (h: string) => passosDaSequencia(ordemDaSequencia(botoes(h).map((b) => ({ ...b, optouFora: false })), (b) => b.porUltimo), null);

/** O botão do ponto está no cabeçalho do painel com este título (entre o título e o fim do cabeçalho). */
function noCabecalho(h: string, titulo: string, ponto: string) {
  const i = h.indexOf(`>${titulo}</h2>`);
  expect(i, `painel "${titulo}"`).toBeGreaterThan(-1);
  const fim = h.indexOf('</header>', i);
  const p = h.indexOf(`data-ponto="${ponto}"`, i);
  expect(p > i && p < fim, `"${ponto}" no cabeçalho de "${titulo}"`).toBe(true);
}

/** O botão não está dentro de nenhum <fieldset> (o dia só de consulta desliga o fieldset inteiro). */
function foraDeFieldset(h: string, ponto: string) {
  const p = ancora(h, ponto);
  expect(p, ponto).toBeGreaterThan(-1);
  const antes = h.slice(0, p);
  expect((antes.match(/<fieldset\b/g) ?? []).length - (antes.match(/<\/fieldset>/g) ?? []).length, `"${ponto}" fora de fieldset`).toBe(0);
}

/** O texto de todos os blocos de um ponto, como chega à tela de quem tem este alcance. */
function card(alcance: Alcance, chave: string, ponto: string): string {
  const e = ajudaParaATela(alcance).find((x) => x.chave === chave);
  return (e?.pontos.find((p) => p.id === `${chave}.${ponto}`)?.blocos ?? []).join(' ');
}

// ================================================================== o registro

describe('decisão 519 · os pontos do Faturamento no registro', () => {
  it('o registro continua válido; 2 a 4 pontos por tela, ids estáveis, na ordem da página', () => {
    expect(problemasDoRegistro()).toEqual([]);
    const ids = (chave: string) => (entradaPorChave(chave)?.pontos ?? []).map((p) => p.id);
    expect(ids('faturamento')).toEqual(['volta', 'numeros', 'falta', 'integracao']);
    expect(ids('faturamento-dia')).toEqual(['periodo-fechado', 'numeros', 'nao-vendeu', 'remover']);
    expect(ids('faturamento-lancar')).toEqual(['loja', 'data', 'atalhos']);
  });

  it('"Ver passo a passo" leva à seção que já existia (o número, a falta, o período fechado)', () => {
    const secao = (chave: string, ponto: string) => entradaPorChave(chave)?.pontos?.find((p) => p.id === ponto)?.secao;
    expect(secao('faturamento', 'numeros')).toBe('o-numero');
    expect(secao('faturamento', 'falta')).toBe('falta');
    expect(secao('faturamento-dia', 'periodo-fechado')).toBe('periodo-fechado');
  });

  it('os temas do circuito da 518 estão nos cards: falta até ontem, hoje em aberto, um por canal em cada dia, Não vendeu, integração, período fechado, a volta', () => {
    const falta = card(DONO, 'faturamento', 'falta');
    for (const t of ['até ontem', 'de quando ela começou a lançar', 'Hoje ainda está em aberto', 'dois canais no mesmo dia são duas faltas', 'Não vendeu é lançamento']) expect(falta, t).toContain(t);
    expect(card(DONO, 'faturamento-dia', 'nao-vendeu')).toContain('Não vendeu conta como lançado');
    expect(card(DONO, 'faturamento-dia', 'nao-vendeu')).toContain('depois que a loja começou a lançar, aparece como falta no mês; hoje ainda está em aberto');
    expect(card(DONO, 'faturamento-lancar', 'atalhos')).toContain('Depois que a loja começou a lançar, ontem já conta como falta');
    expect(card(DONO, 'faturamento', 'integracao')).toContain('Dia com integração vale o número dela');
    // O card de onde se digita (o dia) diz tudo o que fica fora do número, como o do mês (P2-2 da revisão).
    for (const t of ['taxa de entrega', 'gorjeta', '10 % de serviço', 'pedido cancelado']) {
      expect(card(DONO, 'faturamento-dia', 'numeros'), `dia: ${t}`).toContain(t);
      expect(card(DONO, 'faturamento', 'numeros'), `mês: ${t}`).toContain(t);
    }
    expect(card(DONO, 'faturamento-dia', 'periodo-fechado')).toContain('fotografia do DRE');
    expect(card(DONO, 'faturamento', 'volta')).toContain('abrir, voltar ou só olhar não resolve');
  });
});

// ================================================================== o texto que saiu do corpo foi para um card

describe('decisão 519 · o texto educativo sai do corpo e mora no card (não some)', () => {
  /** Cada frase que saiu do corpo, a tela onde estava e o que o card precisa dizer no lugar. */
  const MOVIDOS = [
    {
      onde: 'mês · Por canal',
      frase: 'O ticket médio é a conta, não um número lançado.',
      tela: (raiz: string) => telaDoMes(raiz),
      caminho: '/faturamento',
      ponto: ['faturamento', 'numeros'],
      noCard: ['O ticket médio é o faturamento dividido pelos pedidos', 'é a conta, não um número lançado'],
    },
    {
      onde: 'mês · Dia a dia',
      frase: 'Falta é canal sem lançamento até ontem; hoje ainda está em aberto.',
      tela: (raiz: string) => telaDoMes(raiz),
      caminho: '/faturamento',
      ponto: ['faturamento', 'falta'],
      noCard: ['sem lançamento', 'até ontem', 'Hoje ainda está em aberto'],
    },
    {
      onde: 'mês · Por loja (rede)',
      frase: 'Falta é canal que a loja vende, sem lançamento, até ontem (cada canal em cada dia conta uma).',
      tela: (raiz: string) => telaDoMes(raiz, { rede: true }),
      caminho: '/faturamento',
      ponto: ['faturamento', 'falta'],
      noCard: ['canal que a loja vende', 'sem lançamento', 'até ontem', 'dois canais no mesmo dia são duas faltas'],
    },
    {
      onde: 'mês · rodapé da integração',
      frase: 'Dias com integração valem o número dela; o que a casa digitou fica como conferência na tela do dia.',
      tela: (raiz: string) => telaDoMes(raiz, { integracao: true }),
      caminho: '/faturamento',
      ponto: ['faturamento', 'integracao'],
      noCard: ['integração vale o número dela', 'O que a casa digitou fica como conferência na tela do dia'],
    },
    {
      onde: 'dia · Lançou no dia ou na loja errada?',
      frase: 'Para corrigir um número, é só salvar o dia de novo. Remover serve para o que não deveria existir.',
      tela: (raiz: string) => telaDoDia(raiz),
      caminho: `/faturamento/${VP.id}/${ONTEM}`,
      ponto: ['faturamento-dia', 'remover'],
      noCard: ['Para corrigir um número, é só salvar o dia de novo', 'Remover serve para o que não deveria existir'],
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

  it('o que fica no corpo é o essencial: data de início, a soma, as faltas do mês, o aviso de período fechado e o de quem só vê', async () => {
    const mesLoja = await noShell(telaDoMes('/erp'), '/erp/faturamento', DONO, PREF);
    expect(mesLoja).toContain('Lançando desde 01/10/2026.');
    expect(mesLoja).toContain('Faturamento, pedidos e clientes atendidos no mês.');
    expect(mesLoja).toContain('1 lançamento faltando neste mês.');
    expect(mesLoja).toContain('Cada canal conta um por dia.');
    expect(mesLoja).toContain('falta iFood');
    const rede = await noShell(telaDoMes('/erp', { rede: true }), '/erp/faturamento', DONO, PREF);
    expect(rede).toContain('Soma do que cada loja do seu acesso lançou no mês.');
    const fechado = await noShell(telaDoDia('/erp', { fechado: 'Outubro' }), `/erp/faturamento/${VP.id}/${ONTEM}`, DONO, PREF);
    expect(fechado).toContain('O período Outubro já foi fechado no DRE.');
    expect(fechado).toContain('Este dia só pode ser consultado: não aceita lançar, corrigir nem remover.');
    const soVe = await noShell(telaDoDia('/erp', { podeLancar: false }), `/erp/faturamento/${VP.id}/${ONTEM}`, SO_VE, PREF);
    expect(soVe).toContain('Lançar é com quem tem “lançar faturamento” nesta loja.');
    // A consequência do Remover continua junto do botão (aviso antes de apagar).
    const dia = await noShell(telaDoDia('/erp'), `/erp/faturamento/${VP.id}/${ONTEM}`, DONO, PREF);
    expect(dia).toContain('O dia volta a ficar sem lançamento neste canal e, se o dia já passou, conta como falta.');
    expect(dia).toContain('Não vendeu');
  });

  it('o card não se repete no corpo: nenhum bloco de ponto aparece escrito na tela', async () => {
    const telas = [
      { chave: 'faturamento', h: await noShell(telaDoMes('/erp', { integracao: true, comVolta: true }), '/erp/faturamento', DONO, PREF) },
      { chave: 'faturamento', h: await noShell(telaDoMes('/erp', { rede: true }), '/erp/faturamento', DONO, PREF) },
      { chave: 'faturamento-dia', h: await noShell(telaDoDia('/erp'), `/erp/faturamento/${VP.id}/${ONTEM}`, DONO, PREF) },
      { chave: 'faturamento-dia', h: await noShell(telaDoDia('/erp', { fechado: 'Outubro' }), `/erp/faturamento/${VP.id}/${ONTEM}`, DONO, PREF) },
      { chave: 'faturamento-lancar', h: await noShell(telaDeLancar('/erp'), '/erp/faturamento/lancar', DONO, PREF) },
    ];
    for (const { chave, h } of telas) {
      for (const p of entradaPorChave(chave)?.pontos ?? []) for (const b of p.blocos) expect(h, `${chave}.${p.id}`).not.toContain(b.texto);
    }
  });
});

// ================================================================== a âncora de cada ponto, nas duas áreas

describe.each(AREAS.map((a) => [a.nome, a]))('decisão 519 · âncoras na tela renderizada (%s)', (_nome, area) => {
  const { raiz, alcance, preferencia } = area;

  it('mês de uma loja, aberto pela Home: volta junto do "Voltar para o início", números em "Por canal", falta em "Dia a dia", integração no rodapé', async () => {
    const h = await noShell(telaDoMes(raiz, { comVolta: true, integracao: true }), `${raiz}/faturamento`, alcance, preferencia);
    expect(h).toContain('data-ajuda-tela="faturamento"');
    // A volta: logo depois do link de voltar, antes do título.
    const voltar = h.indexOf('>Voltar para o início</a>');
    expect(voltar).toBeGreaterThan(-1);
    expect(ancora(h, 'volta')).toBeGreaterThan(voltar);
    expect(ancora(h, 'volta')).toBeLessThan(h.indexOf('<h1'));
    noCabecalho(h, 'Por canal', 'numeros');
    noCabecalho(h, 'Dia a dia · Vila da Penha', 'falta');
    // Integração: o botão com título, depois do calendário.
    expect(ancora(h, 'integracao')).toBeGreaterThan(h.indexOf('>Dia a dia · Vila da Penha</h2>'));
    expect(h).toContain('Integração e o que a casa digitou');
    // Um botão por ponto. Na página, a volta vem antes do título; na sequência (P2-1 da revisão), ela é o último passo.
    for (const p of ['volta', 'numeros', 'falta', 'integracao']) expect(quantas(h, p), p).toBe(1);
    const naPagina = botoes(h).map((b) => b.id);
    expect(naPagina).toEqual(['volta', 'tela', 'numeros', 'falta', 'integracao']);
    expect(botoes(h).filter((b) => b.porUltimo).map((b) => b.id)).toEqual(['volta']);
    expect(sequencia(h)).toEqual(['tela', 'numeros', 'falta', 'integracao', 'volta']);
  });

  it('quem já viu a tela, os números e a falta e chega pela Home: a sequência sozinha abre na volta, o último passo, e fechar conclui', async () => {
    const h = await noShell(telaDoMes(raiz, { comVolta: true }), `${raiz}/faturamento`, alcance, preferencia);
    const ordem = sequencia(h).map((id) => `faturamento.${id}`);
    const HOJE = 20_000;
    const primeiroElegivel = (p: PreferenciaDeAjuda) => ordem.find((id) => estadoDoPonto(id, p, HOJE) === 'elegivel');
    // 1ª visita: começa pela tela, não pela saída.
    expect(primeiroElegivel(PREF)).toBe('faturamento.tela');
    // Já viu os outros (entrando direto, ontem): só a volta é nova; ela não repete os outros passos.
    const viu = { ...PREF, pontos: ['tela', 'numeros', 'falta'].map((id) => itemDoPonto(`faturamento.${id}`, HOJE - 1)) };
    expect(primeiroElegivel(viu)).toBe('faturamento.volta');
    expect(progressoDoPasso(ordem, 'faturamento.volta')).toEqual({ n: 4, de: 4 });
    expect(proximoPasso(ordem, ordem, 'faturamento.volta')).toBeNull();
    expect(marcadosAoComecarSozinha(ordem, 'faturamento.volta')).toEqual(['faturamento.volta']);
  });

  it('mês da rede, sem volta e sem integração: a falta no cabeçalho de "Por loja"; volta e integração nem aparecem', async () => {
    const h = await noShell(telaDoMes(raiz, { rede: true }), `${raiz}/faturamento`, alcance, preferencia);
    noCabecalho(h, 'Por canal', 'numeros');
    noCabecalho(h, 'Por loja', 'falta');
    expect(quantas(h, 'volta')).toBe(0);
    expect(quantas(h, 'integracao')).toBe(0);
  });

  it('dia da loja: números no cabeçalho do primeiro canal, Não vendeu junto da caixa do primeiro canal, Remover no painel dele', async () => {
    const h = await noShell(telaDoDia(raiz), `${raiz}/faturamento/${VP.id}/${ONTEM}`, alcance, preferencia);
    expect(h).toContain('data-ajuda-tela="faturamento-dia"');
    noCabecalho(h, 'Loja', 'numeros');
    // Só no primeiro canal: um botão por ponto, não um por canal.
    expect(quantas(h, 'numeros')).toBe(1);
    expect(quantas(h, 'nao-vendeu')).toBe(1);
    const caixa = h.indexOf('name="naoVendeu_LOJA"');
    expect(ancora(h, 'nao-vendeu')).toBeGreaterThan(caixa);
    expect(ancora(h, 'nao-vendeu')).toBeLessThan(h.indexOf('>iFood</h2>'));
    noCabecalho(h, 'Lançou no dia ou na loja errada?', 'remover');
    expect(quantas(h, 'periodo-fechado')).toBe(0);
    for (const p of ['numeros', 'nao-vendeu']) foraDeFieldset(h, p);
    // A caixa diz o canal a quem usa leitor de tela (fora do grupo do canal agora).
    expect(h).toMatch(/Não vendeu<span class="sr-only">: Loja<\/span>/);
  });

  it('dia com o primeiro canal desligado: os botões vão para o primeiro canal ativo; a caixa do desligado trava sozinha; caixas dentro do formulário', async () => {
    const h = await noShell(telaDoDia(raiz, { primeiroDesligado: true }), `${raiz}/faturamento/${VP.id}/${ONTEM}`, alcance, preferencia);
    expect(h).toContain('Canal desligado na loja');
    noCabecalho(h, 'iFood', 'numeros');
    expect(quantas(h, 'numeros')).toBe(1);
    expect(quantas(h, 'nao-vendeu')).toBe(1);
    expect(ancora(h, 'nao-vendeu')).toBeGreaterThan(h.indexOf('name="naoVendeu_IFOOD"'));
    // Quem lança: a caixa do canal desligado trava (o canal não se edita), a do ativo não.
    expect(h).toMatch(/<input type="checkbox" name="naoVendeu_LOJA" disabled=""/);
    expect(h).not.toMatch(/<input type="checkbox" name="naoVendeu_IFOOD" disabled=""/);
    // As duas caixas continuam no formulário de salvar o dia (fora do fieldset, dentro do <form> que tem "Salvar o dia").
    for (const c of ['LOJA', 'IFOOD']) {
      const i = h.indexOf(`name="naoVendeu_${c}"`);
      const form = h.lastIndexOf('<form', i);
      const fim = h.indexOf('</form>', form);
      expect(form > -1 && i < fim, `caixa de ${c} dentro de um formulário`).toBe(true);
      expect(h.slice(form, fim), `o formulário da caixa de ${c} é o de salvar o dia`).toContain('Salvar o dia');
    }
    // Remover o canal que a loja não vende mais não cria falta: a consequência não promete o que não acontece.
    expect(h).toContain('O dia volta a ficar sem lançamento neste canal. O que estava');
    expect(h).not.toContain('se o dia já passou, conta como falta');
  });

  it('dia de período fechado (só consulta): o porquê logo abaixo do aviso; os botões abrem, fora do bloco travado; sem Remover', async () => {
    const h = await noShell(telaDoDia(raiz, { fechado: 'Outubro' }), `${raiz}/faturamento/${VP.id}/${ONTEM}`, alcance, preferencia);
    const aviso = h.indexOf('data-aviso-periodo-fechado');
    expect(aviso).toBeGreaterThan(-1);
    expect(ancora(h, 'periodo-fechado')).toBeGreaterThan(aviso);
    expect(ancora(h, 'periodo-fechado')).toBeLessThan(h.indexOf('>Loja</h2>'));
    expect(h).toContain('Por que este dia não aceita lançamento');
    expect(h).toContain('<fieldset disabled=""');
    for (const p of ['periodo-fechado', 'numeros', 'nao-vendeu']) foraDeFieldset(h, p);
    // A caixa continua travada, agora por ela mesma.
    expect(h).toMatch(/<input type="checkbox" name="naoVendeu_LOJA" disabled=""/);
    expect(quantas(h, 'remover')).toBe(0);
  });

  it('"Lançar o dia": loja e data junto do rótulo, atalhos no cabeçalho', async () => {
    const h = await noShell(telaDeLancar(raiz), `${raiz}/faturamento/lancar`, alcance, preferencia);
    expect(h).toContain('data-ajuda-tela="faturamento-lancar"');
    const loja = h.indexOf('<label for="loja"');
    expect(ancora(h, 'loja')).toBeGreaterThan(loja);
    expect(ancora(h, 'loja')).toBeLessThan(h.indexOf('<select'));
    const data = h.indexOf('<label for="data"');
    expect(ancora(h, 'data')).toBeGreaterThan(data);
    expect(ancora(h, 'data')).toBeLessThan(h.indexOf('id="data"', data + 20));
    noCabecalho(h, 'Atalhos', 'atalhos');
  });
});

// ================================================================== quem lê o quê

describe('decisão 519 · o bloco de quem lança não chega a quem só vê', () => {
  it('a falta: quem só vê recebe a definição, sem "Para tirar a falta"; quem lança e o nível 1 recebem os três blocos', () => {
    const soVe = ajudaParaATela(SO_VE).find((e) => e.chave === 'faturamento')!.pontos.find((p) => p.id === 'faturamento.falta')!;
    expect(soVe.blocos).toHaveLength(2);
    expect(soVe.blocos.join(' ')).not.toContain('Para tirar a falta');
    for (const a of [DONO, ALCANCE_FLOWFOODS]) expect(card(a, 'faturamento', 'falta')).toContain('Para tirar a falta');
  });

  it('o Remover é inteiro de quem lança: quem só vê nem recebe o ponto (e nada do texto chega à tela dele)', () => {
    const dia = ajudaParaATela(SO_VE).find((e) => e.chave === 'faturamento-dia')!;
    expect(dia.pontos.map((p) => p.id)).toEqual(['faturamento-dia.periodo-fechado', 'faturamento-dia.numeros', 'faturamento-dia.nao-vendeu']);
    const tudo = JSON.stringify(ajudaParaATela(SO_VE).filter((e) => e.chave.startsWith('faturamento')));
    expect(tudo).not.toContain('Remover serve');
    expect(tudo).not.toContain('Para tirar a falta');
    expect(card(DONO, 'faturamento-dia', 'remover')).toContain('Remover serve');
  });

  it('quem só vê abre o dia com os botões que valem para ele (números e Não vendeu), sem o Remover', async () => {
    const h = await noShell(telaDoDia('/erp', { podeLancar: false }), `/erp/faturamento/${VP.id}/${ONTEM}`, SO_VE, PREF);
    expect(quantas(h, 'numeros')).toBe(1);
    expect(quantas(h, 'nao-vendeu')).toBe(1);
    expect(quantas(h, 'remover')).toBe(0);
    for (const p of ['numeros', 'nao-vendeu']) foraDeFieldset(h, p);
  });
});
