/**
 * Decisão 480 — a explicação educativa de unidade, embalagem e custo sai do corpo do cadastro de insumo e mora nos cards da
 * sequência guiada (decisão vigente de Rodolfo em 25/10/2026 e "Complemento educacional — unidade, embalagem e custo").
 *
 *  - com os pontos para a pessoa: "quanto vem", o custo inicial com o exemplo e o frete NÃO ficam no corpo; ficam o rótulo,
 *    a medida, "(R$ por embalagem de compra)", "(se pagar)", a conta ao vivo e a origem do custo;
 *  - sem o ponto (outra tela, outra entrada): o texto antigo continua — nenhum campo fica sem explicação;
 *  - "Outra embalagem" (modo variante) não muda;
 *  - os exemplos em R$ só chegam a quem vê custo (`compras.ver`, a régua do R$ das decisões 459 e 460);
 *  - os pontos seguem a ordem dos campos: unidade → quanto vem → custo.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ajudaParaATela, entradaPorChave, problemasDoRegistro } from '@/lib/erp/ajuda';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { resolverAlcance, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import { CamposDaEmbalagem, EMBALAGEM_VAZIA, TEXTO_DO_CUSTO_INICIAL } from '@/components/erp/telas/insumos/campos-embalagem';

let caminhoAtual = '/erp/insumos/novo';
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
// Perfil próprio que cadastra insumo mas não vê R$ das compras.
const CADASTRA_SEM_RS = resolverAlcance(vinculo({ perfilBase: null, perfilProprio: ['insumos.ver', 'insumos.editar'] }));

const QUANTO_VEM = 'Quanto vem em UMA embalagem que você compra';
const FRETE = 'A parte da entrega que cai em cada embalagem';
const n = (s: string) => s.replace(/&nbsp;| /g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

function campos(modo: 'insumo' | 'variante') {
  return createElement(CamposDaEmbalagem, { unidade: 'KG', inicial: { ...EMBALAGEM_VAZIA, conteudo: '5', preco: '25,00' }, erros: {}, idBase: 'i', modo });
}

/** O formulário dentro do shell de verdade, que resolve a entrada pela rota e entrega os pontos ao provedor. */
async function noShell(filho: ReturnType<typeof campos>, alcance: Alcance = DONO, caminho = '/erp/insumos/novo') {
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
          preferencia: { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] },
          acoes: { fechar: acao, dicas: acao, pontosVistos: acao, pontoNunca: acao },
          hoje: 20_000,
          contato: { url: 'https://wa.me/5521', display: '(21) 90000-0000' },
        },
        children: filho,
      } as never),
    ),
  );
}

describe('decisão 480 · o corpo do cadastro de insumo sem a aula', () => {
  it('com os pontos: "quanto vem", o custo inicial com exemplo e o frete saem do corpo; o essencial fica', async () => {
    const h = await noShell(campos('insumo'));
    expect(h).toContain('data-ponto="conteudo"');
    expect(h).toContain('data-ponto="custo"');
    expect(h).not.toContain(QUANTO_VEM);
    expect(h).not.toContain(TEXTO_DO_CUSTO_INICIAL);
    expect(h).not.toContain('Exemplo:');
    expect(h).not.toContain(FRETE);
    // O que a pessoa precisa para operar continua visível.
    for (const t of ['Quanto vem na embalagem', 'Custo inicial de referência', '(R$ por embalagem de compra)', 'Frete por embalagem', '(se pagar)', 'Ainda não sei o custo', 'Custo de referência por kg', 'Origem: referência inicial, sem compra registrada']) {
      expect(h, t).toContain(t);
    }
    // A conta ao vivo, com as mesmas funções do servidor.
    expect(h).toMatch(/Você paga R\$ 25,00 por 5 kg/);
    // Nenhuma descrição aponta para um texto que não está na página.
    for (const m of Array.from(h.matchAll(/aria-describedby="([^"]+)"/g))) for (const idRef of m[1].split(' ')) expect(h, idRef).toContain(`id="${idRef}"`);
  });

  it('sem o ponto (fora do provedor): o texto antigo continua junto do campo', () => {
    const h = n(renderToStaticMarkup(campos('insumo')));
    expect(h).toContain(QUANTO_VEM);
    expect(h).toContain(TEXTO_DO_CUSTO_INICIAL);
    expect(h).toContain('Exemplo:');
    expect(h).toContain(FRETE);
    expect(h).not.toContain('data-ponto=');
  });

  it('"Outra embalagem" (variante) não muda: sem ponto, com a explicação do frete', async () => {
    const h = await noShell(campos('variante'), DONO, '/erp/insumos/x/embalagens/y');
    expect(h).not.toContain('data-ponto="conteudo"');
    expect(h).not.toContain('data-ponto="custo"');
    expect(h).toContain(FRETE);
    expect(h).toContain('Preço da embalagem');
  });
});

describe('decisão 480 · os cards', () => {
  const entrada = entradaPorChave('insumo-novo');
  const doNovo = (a: Alcance) => ajudaParaATela(a).find((e) => e.chave === 'insumo-novo');

  it('o registro continua válido e a entrada subiu de versão', () => {
    expect(problemasDoRegistro()).toEqual([]);
    expect(entrada?.versao).toBeGreaterThanOrEqual(6);
  });

  it('pontos na ordem dos campos; o card da unidade abre com a frase do plano e leva aos exemplos', () => {
    const ids = (entrada?.pontos ?? []).map((p) => p.id);
    expect(ids.indexOf('unidade')).toBeLessThan(ids.indexOf('conteudo'));
    expect(ids.indexOf('conteudo')).toBeLessThan(ids.indexOf('custo'));
    const unidade = entrada?.pontos?.find((p) => p.id === 'unidade');
    expect(unidade?.blocos[0].texto).toBe('Escolha a unidade pelo jeito que você usa o insumo, não pela embalagem em que ele vem.');
    expect(unidade?.secao).toBe('exemplos');
    const exemplos = entrada?.secoes?.find((s) => s.id === 'exemplos');
    expect(exemplos?.titulo).toBe('Entenda com exemplos');
    const tudo = (exemplos?.blocos ?? []).map((b) => b.texto).join(' ');
    for (const t of ['Aipim', 'Margarina', 'Refrigerante', 'rótulo', 'fornecedor', '1 kg são 1.000 g', '1 L são 1.000 ml']) expect(tudo, t).toContain(t);
  });

  it('os exemplos do plano batem com a conta: 68,34 ÷ 6 = 11,39 e 56,28 ÷ 12 = 4,69', () => {
    expect(Math.round(6834 / 6)).toBe(1139);
    expect(Math.round(5628 / 12)).toBe(469);
  });

  it('R$ nos cards e nos exemplos só para quem vê custo; quem cadastra sem ver R$ recebe a orientação sem valores', () => {
    const comRs = doNovo(DONO);
    const semRs = doNovo(CADASTRA_SEM_RS);
    const textos = (e: ReturnType<typeof doNovo>) => [...(e?.pontos ?? []).flatMap((p) => p.blocos), ...(e?.secoes ?? []).flatMap((s) => s.blocos), ...(e?.aula ?? [])];
    expect(textos(comRs).some((t) => t.includes('R$'))).toBe(true);
    expect(textos(semRs).filter((t) => t.includes('R$'))).toEqual([]);
    // A orientação de unidade continua chegando.
    expect(semRs?.pontos.map((p) => p.id)).toEqual(expect.arrayContaining(['insumo-novo.unidade', 'insumo-novo.conteudo', 'insumo-novo.custo']));
    expect(semRs?.secoes.find((s) => s.id === 'exemplos')?.blocos.length).toBeGreaterThanOrEqual(4);
  });
});
