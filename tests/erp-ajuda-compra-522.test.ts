/**
 * Decisão 522 — pontos de ajuda em "Lançar nota" (nova e editar) e em "Detalhe da nota" de Compras, nas duas áreas.
 *
 *  - cada ponto do registro tem âncora na tela renderizada pelo servidor, no campo ou na seção que explica, dentro do shell de
 *    verdade em `/erp/...` (dona, com preferência) e em `/rodolfo/erp/<slug>/...` (nível 1, sem preferência);
 *  - o texto educativo que saiu do corpo (o "o custo dos insumos passa a ser o desta compra" do cabeçalho, o "É ela que diz qual
 *    compra é a mais nova." da data, a conta do preço por unidade dos itens, o apoio do frete, o frete no Total do detalhe e o
 *    subtítulo de No estoque) está num card e não some: sem o ponto (fora do shell), o texto de antes volta; o card não se repete;
 *  - o que fica no corpo é o essencial: rótulos, "(se tiver)", o formato e o limite da data, "Valor do item = o total da linha", a
 *    conta ao vivo, o aviso de período fechado, o que a nota fez no estoque, "vale no custo", os avisos do XML e da cancelada;
 *  - quem não tem a permissão do bloco não recebe o bloco: o exemplo em R$ é de quem vê custo; o que editar e cancelar fazem no
 *    custo é de quem lança. Nenhum bloco sem `para` diz valor.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let caminhoAtual = '/erp/compras/nova';
vi.mock('next/navigation', () => ({
  usePathname: () => caminhoAtual,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: (_acao: unknown, inicial: unknown) => [inicial, () => {}], useFormStatus: () => ({ pending: false }) }));

import { ajudaParaATela, entradaPorChave, problemasDoRegistro } from '@/lib/erp/ajuda';
import { ATRIBUTO_POR_ULTIMO, ordemDaSequencia, passosDaSequencia } from '@/lib/erp/ajuda-sequencia';
import type { PreferenciaDeAjuda } from '@/lib/erp/ajuda-rota';
import type { FormularioDeNota, NotaDetalhada } from '@/lib/erp/compras';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import type { AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { FormNota } from '@/components/erp/telas/compras/form-nota';
import { TelaDetalheNota } from '@/components/erp/telas/compras/detalhe-nota';
import { custoDaCompra, quantidadeDoItem, ratearFrete, ultimaCompraDaLista } from '@/lib/erp/compra-campos';
import { efeitoDaNota, entradasDaNota, mesmoEfeito } from '@/lib/erp/estoque-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { relogioDoCenario } from './relogio-do-cenario';

relogioDoCenario('2026-10-17T12:00:00-03:00');

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
/** Lança nota e não vê compras nem custo (perfil próprio): abre "Lançar nota", sem o exemplo em R$. */
const SO_LANCA = resolverAlcance(vinculo({ perfilProprio: ['compras.lancar', 'lojas.ver'] }));
/** Vê as notas e não lança: abre o detalhe só para ler. */
const SO_VE = resolverAlcance(vinculo({ perfilProprio: ['compras.ver', 'lojas.ver'] }));
/** Operador: sem compras. O registro chega inteiro ao shell, então nenhum bloco com valor pode chegar a ele. */
const OPERADOR = resolverAlcance(vinculo({ perfilBase: 'OPERADOR' }));
const PREF: PreferenciaDeAjuda = { dicasLigadas: true, escolhida: true, fechadas: [], pontos: [] };

/** As duas áreas: a mesma tela, com o shell de cada uma (o nível 1 lê o registro inteiro e não tem preferência). */
const AREAS = [
  { nome: 'parceiro', raiz: '/erp', alcance: DONO, preferencia: PREF as PreferenciaDeAjuda | null },
  { nome: 'nível 1', raiz: '/rodolfo/erp/casa-alfa', alcance: ALCANCE_FLOWFOODS, preferencia: null },
] as const;

const n = (s: string) => s.replace(/&nbsp;| | /g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

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

// ------------------------------------------------------------------ o formulário e a nota, montados à mão (sem banco)

const SETEMBRO = { nome: 'Setembro', inicio: '2026-09-01', fim: '2026-09-30' };
const periodosDe = (raiz: string): AvisoDePeriodos => ({ fechados: [SETEMBRO], emCurso: 'Outubro', href: `${raiz}/dre/periodos` });

const OPCOES = {
  lojas: [
    { id: 'loja-vp', nome: 'Vila da Penha', ativa: true },
    { id: 'loja-meier', nome: 'Méier', ativa: true },
  ],
  fornecedores: [{ id: 'f-lat', nome: 'Laticínios Rio', ativo: true, raizCnpj: null }],
  insumos: [
    {
      id: 'i-ched',
      nome: 'Cheddar',
      unidade: 'KG',
      ativo: true,
      produzidoPor: null,
      conteudoMilesimos: 1000,
      embalagens: [{ id: 'v-cx', nome: 'Caixa', conteudoMilesimos: 5000, ativo: true }],
      custo: { centavos: 4000, milesimos: 1000 },
    },
  ],
} as unknown as FormularioDeNota;

/** Uma nota como `obterNota` devolve: 3 caixas de 5 kg de cheddar por R$ 269,70 e R$ 6,00 de frete. */
function nota(p: { data?: string; frete?: number; movimentos?: boolean; cancelada?: boolean; xml?: boolean; vale?: boolean } = {}): NotaDetalhada {
  const frete = p.frete ?? 600;
  return {
    id: 'n1',
    rotulo: 'Nota 000123',
    numero: '000123',
    serie: '1',
    entradaEm: p.data ?? '2026-10-14',
    lojaId: 'loja-vp',
    loja: 'Vila da Penha',
    fornecedor: { id: 'f-lat', nome: 'Laticínios Rio', documento: null },
    fornecedorNome: 'Laticínios Rio',
    freteCentavos: frete,
    totalCentavos: 26_970 + frete,
    somaItensCentavos: 26_970,
    cancelada: p.cancelada ?? false,
    canceladaEm: p.cancelada ? new Date('2026-10-16T12:00:00Z') : null,
    motivoCancelamento: p.cancelada ? 'Lançada em dobro' : null,
    lancadaEm: new Date('2026-10-14T12:00:00Z'),
    versao: '2026-10-14T12:00:00.000Z',
    chaveAcesso: p.xml ? '3'.repeat(44) : null,
    documentoId: null,
    itens: [
      {
        id: 'it1',
        insumoId: 'i-ched',
        varianteId: 'v-cx',
        insumoAtivo: true,
        nome: 'Cheddar',
        nomeHoje: null,
        unidade: 'KG',
        embalagem: 'Caixa · 5 kg',
        embalagensMilesimos: 3000,
        quantidadeMilesimos: 15_000,
        valorCentavos: 26_970,
        freteRateadoCentavos: frete,
        custo: { centavos: 26_970 + frete, milesimos: 15_000 },
        valeNoCusto: p.vale ?? true,
        valeOutra: p.vale === false ? '16/10/2026' : null,
      },
    ],
    historico: [],
    estoque: {
      frase: p.movimentos === false ? 'Não mexe no estoque: o estoque da Vila da Penha ainda não foi aberto. A contagem de abertura inclui o que já está na loja.' : 'Entrou no estoque da Vila da Penha.',
      movimenta: p.movimentos !== false,
      movimentos:
        p.movimentos === false
          ? []
          : [{ id: 'm1', loja: 'Vila da Penha', nome: 'Cheddar', unidade: 'KG', quantidadeMilesimos: 15_000, antes: 2_000, depois: 17_000, estorno: false, ocorridoEm: new Date('2026-10-14T12:00:00Z') }],
    },
  } as unknown as NotaDetalhada;
}

/** Lançar (sem `nota`) ou editar (com ela), como a página monta: cabeçalho, avisos e o formulário. */
function telaDoFormulario(raiz: string, opcoes: { editar?: NotaDetalhada } = {}) {
  return createElement(TelaFormNota, {
    nota: opcoes.editar,
    base: `${raiz}/compras`,
    contexto: 'Vila da Penha',
    opcoes: OPCOES,
    lojaSugerida: 'loja-vp',
    acao: async () => null,
    bloqueio: null,
    periodos: periodosDe(raiz),
    novoFornecedor: `${raiz}/compras/fornecedores/novo`,
    novoInsumo: `${raiz}/insumos/novo`,
  });
}

/** Lançar uma nota com a data já digitada num período fechado (o aviso junto da data). */
function formularioComData(raiz: string, data: string) {
  return createElement(FormNota, {
    acao: async () => null,
    modo: 'lancar',
    base: `${raiz}/compras`,
    aqui: `${raiz}/compras/nova`,
    cancelar: `${raiz}/compras`,
    opcoes: OPCOES,
    inicial: { lojaId: 'loja-vp', fornecedorId: 'f-lat', numero: '9', serie: '', data, frete: '6,00', total: '275,70', itens: [{ insumoId: 'i-ched', embalagem: 'v:v-cx', quantidade: '3', valor: '269,70' }] },
    hoje: '2026-10-17',
    periodos: periodosDe(raiz),
  });
}

function telaDaNota(raiz: string, opcoes: Parameters<typeof nota>[0] & { podeLancar?: boolean } = {}) {
  const { podeLancar = true, ...p } = opcoes;
  return createElement(TelaDetalheNota, {
    nota: nota(p),
    base: `${raiz}/compras`,
    voltar: `${raiz}/compras`,
    podeLancar,
    bloqueio: null,
    insumosBase: `${raiz}/insumos`,
    fornecedoresBase: `${raiz}/compras/fornecedores`,
    estoqueBase: `${raiz}/estoque`,
    acaoCancelar: async () => null,
    periodos: periodosDe(raiz),
    orcamento: null,
    lotesHref: `${raiz}/compras/n1/lotes`,
    lotesQuantos: 0,
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

/** O botão do ponto fica depois do rótulo (fora dele: dentro, o toque passaria ao campo) e antes do campo. */
function juntoDoRotulo(h: string, campo: string, ponto: string, tagDoCampo: 'select' | 'input') {
  const rotulo = h.indexOf(`<label for="${campo}"`);
  expect(rotulo, `rótulo de ${campo}`).toBeGreaterThan(-1);
  const fimDoRotulo = h.indexOf('</label>', rotulo);
  expect(h.slice(rotulo, fimDoRotulo), `${ponto}: nada de botão dentro do rótulo`).not.toContain('<button');
  const doCampo = h.search(new RegExp(`<${tagDoCampo}\\b[^>]*\\bid="${campo}"`));
  expect(doCampo, `campo ${campo}`).toBeGreaterThan(-1);
  expect(ancora(h, ponto), `${ponto} depois do rótulo`).toBeGreaterThan(fimDoRotulo);
  expect(ancora(h, ponto), `${ponto} antes do campo`).toBeLessThan(doCampo);
}

/** O texto de todos os blocos de um ponto, como chega à tela de quem tem este alcance. */
function card(alcance: Alcance, chave: string, ponto: string): string {
  const e = ajudaParaATela(alcance).find((x) => x.chave === chave);
  return (e?.pontos.find((p) => p.id === `${chave}.${ponto}`)?.blocos ?? []).join(' ');
}
const blocos = (alcance: Alcance, chave: string, ponto: string) => ajudaParaATela(alcance).find((x) => x.chave === chave)?.pontos.find((p) => p.id === `${chave}.${ponto}`)?.blocos ?? [];

const NOVA = '/compras/nova';
const EDITAR = '/compras/n1/editar';
const DETALHE = '/compras/n1';

// ================================================================== o registro

describe('decisão 522 · os pontos de Lançar nota e de Detalhe da nota no registro', () => {
  it('o registro continua válido; 7 pontos nas duas telas, ids estáveis, na ordem da página; aula e versão iguais', () => {
    expect(problemasDoRegistro()).toEqual([]);
    const ids = (chave: string) => (entradaPorChave(chave)?.pontos ?? []).map((p) => p.id);
    expect(ids('compra-nova')).toEqual(['loja', 'data', 'itens', 'frete']);
    expect(ids('compra')).toEqual(['total', 'custo', 'estoque']);
    // Os pontos não entram no hash do lock: a caixa "Como funciona" não volta com "Mudou" para quem fechou.
    // Decisão 523: a aula das duas entradas mudou (o custo na prévia e o que editar e cancelar fazem no custo): versões 5 e 6.
    expect(entradaPorChave('compra-nova')?.versao).toBe(5);
    expect(entradaPorChave('compra')?.versao).toBe(6);
    expect(entradaPorChave('compra-nova')?.rotas).toEqual(['compras/nova', 'compras/[id]/editar']);
  });

  it('a data decide a compra mais nova (e o desempate): a regra do último preço, e o card dizendo a mesma coisa', () => {
    const data = card(DONO, 'compra-nova', 'data');
    // A regra: data da nota mais recente vence; na mesma data, a lançada por último; cancelada não conta.
    const item = (notaId: string, entradaEm: string, lancadaEm: number, status = 'LANCADA') => ({ notaId, entradaEm, lancadaEm, status, valorCentavos: 100, freteRateadoCentavos: 0, quantidadeMilesimos: 1000 });
    expect(ultimaCompraDaLista([item('nova-data', '2026-10-14', 1), item('lancada-depois', '2026-10-10', 9)])!.compra.notaId).toBe('nova-data');
    expect(ultimaCompraDaLista([item('primeira', '2026-10-14', 1), item('segunda', '2026-10-14', 2)])!.compra.notaId).toBe('segunda');
    expect(ultimaCompraDaLista([item('anterior', '2026-10-10', 1), item('cancelada', '2026-10-14', 2, 'CANCELADA')])!.compra.notaId).toBe('anterior');
    for (const t of ['diz qual compra é a mais nova', 'o custo do insumo segue a de data mais recente', 'na mesma data, a lançada por último']) expect(data, t).toContain(t);
    // Período do DRE, CMV de compra e o fechado: nem nota nova, nem data mudada para dentro, nem mexer nas de dentro (`editarNota`).
    for (const t of ['período do DRE', 'CMV de compra', 'período já fechado não recebe nota nova nem nota com a data mudada para dentro dele', 'as que caem nele não mudam']) expect(data, t).toContain(t);
  });

  it('o estoque nos cards de lançar e da nota é a regra de `efeitoDaNota`: aberto quando a nota foi lançada e data a partir da abertura', () => {
    const abertura = { abertoEm: new Date('2026-10-01T13:00:00Z') };
    const depois = new Date('2026-10-14T12:00:00Z');
    const antes = new Date('2026-09-30T12:00:00Z');
    expect(efeitoDaNota({ status: 'LANCADA', lancadaEm: depois, entradaEm: '2026-10-14' }, abertura)).toEqual({ movimenta: true });
    // Editar não muda a hora do lançamento: a nota lançada antes da abertura, com data trocada para depois dela, continua fora.
    expect(efeitoDaNota({ status: 'LANCADA', lancadaEm: antes, entradaEm: '2026-10-14' }, abertura)).toEqual({ movimenta: false, motivo: 'lancada-antes' });
    expect(efeitoDaNota({ status: 'LANCADA', lancadaEm: depois, entradaEm: '2026-09-20' }, abertura)).toEqual({ movimenta: false, motivo: 'data-anterior' });
    expect(efeitoDaNota({ status: 'LANCADA', lancadaEm: depois, entradaEm: '2026-10-14' }, null)).toEqual({ movimenta: false, motivo: 'nao-aberto' });
    const regra = 'já estava aberto quando';
    expect(card(DONO, 'compra-nova', 'loja')).toContain(`entra no estoque dela se ele ${regra} a nota foi lançada e a data não é anterior à abertura`);
    expect(card(DONO, 'compra-nova', 'data')).toContain(`só entra se o estoque da loja ${regra} ela foi lançada e a data não é anterior à abertura; editar não muda a hora do lançamento`);
    expect(card(DONO, 'compra', 'estoque')).toContain(`se o estoque dela ${regra} a nota foi lançada e a data não é anterior à abertura`);
    for (const [chave, p] of [['compra-nova', 'loja'], ['compra-nova', 'data'], ['compra', 'estoque']]) expect(card(DONO, chave, p), `${chave}.${p}`).not.toMatch(/se ele já foi aberto|se a loja já abriu o estoque|lançada depois da abertura/);
  });

  it('editar: o que entrou é estornado e a entrada nova só vem se a nota ainda cumprir a regra; mesma entrada, nada muda', () => {
    const nota = { id: 'n1', lojaId: 'loja-vp', rotulo: 'Nota 1', versao: 1 };
    const linha = { insumoId: 'i-ched', insumoNome: 'Cheddar', unidade: 'KG' as const, quantidadeMilesimos: 15_000, valorCentavos: 26_970, freteRateadoCentavos: 600, embalagem: 'Caixa · 5 kg' };
    const entrou = entradasDaNota(nota, [linha]);
    expect(entrou.map((m) => [m.quantidadeMilesimos, m.valorCentavos])).toEqual([[15_000, 27_570]]);
    // Mesmo efeito (só mudou o número da nota, por exemplo): nada se mexe; quantidade diferente: estorna e lança de novo.
    expect(mesmoEfeito(entrou, entradasDaNota({ ...nota, versao: 2 }, [linha]))).toBe(true);
    expect(mesmoEfeito(entrou, entradasDaNota({ ...nota, versao: 2 }, [{ ...linha, quantidadeMilesimos: 10_000 }]))).toBe(false);
    // Data trocada para antes da abertura: o que a nota deve ter no estoque é nada, então só o estorno.
    const efeito = efeitoDaNota({ status: 'LANCADA', lancadaEm: new Date('2026-10-14T12:00:00Z'), entradaEm: '2026-09-20' }, { abertoEm: new Date('2026-10-01T13:00:00Z') });
    expect(efeito.movimenta ? entradasDaNota(nota, [linha]) : []).toEqual([]);
    const estoque = card(DONO, 'compra', 'estoque');
    for (const t of ['Nada é apagado', 'a entrada antiga é estornada e a nova só entra se a nota ainda cumprir essa regra', 'cancelar estorna', 'antes e depois']) expect(estoque, t).toContain(t);
    expect(estoque).not.toContain('estornada e entra a nova');
  });

  it('a loja: estoque, CMV de compra e orçamento são da loja; o custo do insumo é um só na rede, de qualquer loja', () => {
    const loja = card(DONO, 'compra-nova', 'loja');
    for (const t of ['loja desativada não recebe nota nova', 'conta no CMV de compra e no orçamento de compra desta loja', 'um só na rede', 'de qualquer loja']) expect(loja, t).toContain(t);
  });

  it('itens e frete: a conta do exemplo é a do sistema (quantidade, custo por unidade, frete pelo valor)', () => {
    const itens = card(DONO, 'compra-nova', 'itens');
    // 3 caixas de 5 kg: a quantidade e o custo saem das mesmas funções da tela e da gravação.
    const quantidade = quantidadeDoItem(3000, 5000);
    expect(formatarQuantidade(quantidade, 'KG')).toBe('15 kg');
    expect(itens).toContain(`3 caixas de 5 kg viram ${formatarQuantidade(quantidade, 'KG')} no estoque`);
    const porKg = formatarCusto(custoDaCompra([{ valorCentavos: 26_970, freteRateadoCentavos: 0, quantidadeMilesimos: quantidade }]), 'KG');
    expect(porKg).toMatch(/\/kg$/);
    expect(itens.replace(/ /g, ' ')).toContain(`por ${formatarDinheiro(26_970).replace(/ /g, ' ')}, sem frete, dão ${porKg.replace(/\/kg$/, '').replace(/ /g, ' ')} por kg`);
    for (const t of ['a granel, digite direto em kg, L ou un', 'O valor é o total da linha na nota', 'o preço por kg, L ou un sai da conta', 'o valor mais a parte do frete, dividido pela quantidade']) expect(itens, t).toContain(t);
    // O frete vai pelo valor de cada item (o maior leva mais) e fecha ao centavo.
    const partes = ratearFrete([26_970, 5_490], 600);
    expect(partes.reduce((x, y) => x + y, 0)).toBe(600);
    expect(partes[0]).toBeGreaterThan(partes[1]);
    const frete = card(DONO, 'compra-nova', 'frete');
    for (const t of ['dividido entre os itens pelo valor de cada um', 'entra no custo deles e no CMV de compra', 'itens mais o frete, ao centavo', 'a nota não entra']) expect(frete, t).toContain(t);
  });

  it('o detalhe: o frete e o período no Total, o que vale no custo (rede, data, fichas)', () => {
    const total = card(DONO, 'compra', 'total');
    for (const t of ['dividido entre os itens pelo valor de cada um', 'Pela data da nota', 'CMV de compra e no orçamento de compra da loja', 'Nota cancelada sai do custo']) expect(total, t).toContain(t);
    const custo = card(DONO, 'compra', 'custo');
    for (const t of ['o valor do item mais a parte do frete, dividido pela quantidade', 'compra mais recente do insumo pela data da nota', 'de qualquer loja da rede', 'as fichas usam', 'a linha diz a data dela', 'volta a valer a compra anterior']) expect(custo, t).toContain(t);
  });
});

// ================================================================== o texto que saiu do corpo foi para um card

describe('decisão 522 · o texto educativo sai do corpo e mora no card (não some)', () => {
  /** Cada frase que saiu do corpo, a tela onde estava e o que o card precisa dizer no lugar. */
  const MOVIDOS = [
    {
      onde: 'lançar · cabeçalho',
      frase: 'se esta for a compra mais recente do insumo, o custo dele passa a ser o dela',
      tela: (raiz: string) => telaDoFormulario(raiz),
      caminho: NOVA,
      ponto: ['compra-nova', 'data'],
      noCard: ['o custo do insumo segue a de data mais recente'],
    },
    {
      onde: 'lançar · Data da nota',
      frase: 'É ela que diz qual compra é a mais nova.',
      tela: (raiz: string) => telaDoFormulario(raiz),
      caminho: NOVA,
      ponto: ['compra-nova', 'data'],
      noCard: ['diz qual compra é a mais nova'],
    },
    {
      onde: 'editar · Data da nota (a mesma tela de lançar)',
      frase: 'É ela que diz qual compra é a mais nova.',
      tela: (raiz: string) => telaDoFormulario(raiz, { editar: nota() }),
      caminho: EDITAR,
      ponto: ['compra-nova', 'data'],
      noCard: ['diz qual compra é a mais nova'],
    },
    {
      onde: 'lançar · Itens',
      frase: 'O preço por kg, L ou un sai da conta, com o frete rateado.',
      tela: (raiz: string) => telaDoFormulario(raiz),
      caminho: NOVA,
      ponto: ['compra-nova', 'itens'],
      noCard: ['o preço por kg, L ou un sai da conta', 'a parte do frete'],
    },
    {
      onde: 'editar · Frete da nota',
      frase: 'Dividido entre os itens pelo valor de cada um; entra no custo.',
      tela: (raiz: string) => telaDoFormulario(raiz, { editar: nota() }),
      caminho: EDITAR,
      ponto: ['compra-nova', 'frete'],
      noCard: ['dividido entre os itens pelo valor de cada um', 'entra no custo'],
    },
    {
      onde: 'detalhe · Total da nota',
      frase: 'O frete foi dividido entre os itens pelo valor de cada um e entra no custo.',
      tela: (raiz: string) => telaDaNota(raiz),
      caminho: DETALHE,
      ponto: ['compra', 'total'],
      noCard: ['dividido entre os itens pelo valor de cada um e entra no custo deles'],
    },
    {
      onde: 'detalhe · No estoque',
      frase: 'Entrada e estorno, nunca apagados',
      tela: (raiz: string) => telaDaNota(raiz),
      caminho: DETALHE,
      ponto: ['compra', 'estoque'],
      noCard: ['Nada é apagado', 'estornada'],
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
    // Fora do shell (sem o ponto para a pessoa): o texto de antes, sem botão. Nenhum campo ou painel fica sem explicação.
    const sem = n(renderToStaticMarkup(m.tela('/erp')));
    expect(sem).toContain(m.frase);
    expect(sem).not.toContain(`data-ponto="${m.ponto[1]}"`);
  });

  it('o que fica no corpo do formulário é o essencial: o contexto, o formato e o limite da data, o total da linha, a conta ao vivo', async () => {
    const f = await noShell(telaDoFormulario('/erp', { editar: nota() }), `/erp${EDITAR}`, DONO, PREF);
    expect(f).toContain('Vila da Penha · Nota 000123 · Laticínios Rio');
    expect(f).toContain('A data impressa na nota (dd/mm/aaaa, até 17/10/2026).');
    expect(f).toContain('Valor do item = o <strong class="font-semibold text-texto">total da linha</strong> na nota.');
    expect(f).toContain('Frete da nota <span class="font-normal text-suave">(se tiver)</span>');
    // A linha do item: 3 caixas de 5 kg = 15 kg, o custo com o frete e o de hoje.
    expect(f).toContain('15 kg · ');
    expect(f).toContain(' com frete · hoje R$ 40,00/kg');
    expect(f).toContain('R$ 269,70 + R$ 6,00 de frete = R$ 275,70');
    expect(f).toContain('confere com a nota');
    // O frete sem o texto de apoio: o campo não aponta para um apoio que não existe.
    expect(f).not.toContain('id="nota-frete-ajuda"');
    expect(f).not.toMatch(/aria-describedby="[^"]*nota-frete-ajuda/);
    // O cabeçalho do lançar fica só com o contexto.
    const novo = await noShell(telaDoFormulario('/erp'), `/erp${NOVA}`, DONO, PREF);
    expect(novo).toMatch(/<h1[^>]*>Lançar nota<\/h1>(?:(?!<\/header>).)*<p[^>]*>Vila da Penha<\/p>/s);
    // Data num período fechado: o aviso continua junto do campo, com a saída e a alternativa.
    const fechada = await noShell(formularioComData('/erp', '20/09/2026'), `/erp${NOVA}`, DONO, PREF);
    expect(fechada).toContain('O período Setembro já foi fechado no DRE.');
    expect(fechada).toContain('Uma nota com essa data não entra.');
    expect(fechada).toContain('Ou lance com a data de hoje, se a compra entrou agora.');
    expect(quantas(fechada, 'data')).toBe(1);
  });

  it('editar uma nota de período fechado: o aviso fica no topo e os pontos continuam (nenhum bloco desligado)', async () => {
    const h = await noShell(telaDoFormulario('/erp', { editar: nota({ data: '2026-09-20' }) }), `/erp${EDITAR}`, DONO, PREF);
    expect(h).toContain('O período Setembro já foi fechado no DRE.');
    expect(h).toContain('Esta nota é desse período: não dá para corrigir nem cancelar.');
    expect(h.indexOf('data-aviso-periodo-fechado')).toBeLessThan(h.indexOf('>A nota</h2>'));
    expect(h).not.toContain('<fieldset disabled=""');
    expect(sequencia(h)).toEqual(['tela', 'loja', 'data', 'itens', 'frete']);
  });

  it('o que fica no corpo do detalhe: o que a nota fez no estoque, "vale no custo" ou a data da que vale, os avisos', async () => {
    const d = await noShell(telaDaNota('/erp'), `/erp${DETALHE}`, DONO, PREF);
    expect(d).toContain('Itens R$ 269,70 + frete R$ 6,00');
    expect(d).toMatch(/border-t border-linha pt-3 text-\[12px\] text-suave">Entrou no estoque da Vila da Penha\.<\/p>/);
    expect(d).toContain('vale no custo');
    expect(d).toContain('Como vieram na embalagem: a etiqueta da embalagem aberta usa');
    expect(d).toContain('Ver o estoque');
    const outra = await noShell(telaDaNota('/erp', { vale: false }), `/erp${DETALHE}`, DONO, PREF);
    expect(outra).toContain('vale a de 16/10/2026');
    // Sem movimento: o porquê continua escrito no Total, e o painel (e o ponto) do estoque não aparecem.
    const sem = await noShell(telaDaNota('/erp', { movimentos: false }), `/erp${DETALHE}`, DONO, PREF);
    expect(sem).toContain('Não mexe no estoque: o estoque da Vila da Penha ainda não foi aberto.');
    expect(sem).not.toContain('>No estoque</h2>');
    expect(quantas(sem, 'estoque')).toBe(0);
    // Período fechado, XML e cancelada: os avisos continuam.
    const fechada = await noShell(telaDaNota('/erp', { data: '2026-09-20' }), `/erp${DETALHE}`, DONO, PREF);
    expect(fechada).toContain('Esta nota é desse período: não dá para editar nem cancelar.');
    expect(fechada).not.toContain('Editar nota');
    const xml = await noShell(telaDaNota('/erp', { xml: true }), `/erp${DETALHE}`, DONO, PREF);
    expect(xml).toContain('Esta nota veio da nota fiscal (XML).');
    const cancelada = await noShell(telaDaNota('/erp', { cancelada: true }), `/erp${DETALHE}`, DONO, PREF);
    expect(cancelada).toContain('Nota cancelada.');
    expect(cancelada).toContain('não vale (cancelada)');
  });

  it('o card não se repete no corpo: nenhum bloco de ponto aparece escrito na tela', async () => {
    const telas = [
      { chave: 'compra-nova', h: await noShell(telaDoFormulario('/erp'), `/erp${NOVA}`, DONO, PREF) },
      { chave: 'compra-nova', h: await noShell(telaDoFormulario('/erp', { editar: nota() }), `/erp${EDITAR}`, DONO, PREF) },
      { chave: 'compra-nova', h: await noShell(formularioComData('/erp', '20/09/2026'), `/erp${NOVA}`, DONO, PREF) },
      { chave: 'compra', h: await noShell(telaDaNota('/erp'), `/erp${DETALHE}`, DONO, PREF) },
      { chave: 'compra', h: await noShell(telaDaNota('/erp', { data: '2026-09-20', cancelada: true }), `/erp${DETALHE}`, DONO, PREF) },
    ];
    for (const { chave, h } of telas) {
      for (const p of entradaPorChave(chave)?.pontos ?? []) for (const b of p.blocos) expect(h, `${chave}.${p.id}`).not.toContain(b.texto);
    }
  });
});

// ================================================================== a âncora de cada ponto, nas duas áreas

describe.each(AREAS.map((a) => [a.nome, a]))('decisão 522 · âncoras na tela renderizada (%s)', (_nome, area) => {
  const { raiz, alcance, preferencia } = area;

  it('lançar e editar: loja e data junto do rótulo, itens e frete no cabeçalho do painel; na ordem da página', async () => {
    for (const [caminho, tela] of [
      [NOVA, telaDoFormulario(raiz)],
      [EDITAR, telaDoFormulario(raiz, { editar: nota() })],
    ] as const) {
      const h = await noShell(tela, `${raiz}${caminho}`, alcance, preferencia);
      expect(h).toContain('data-ajuda-tela="compra-nova"');
      juntoDoRotulo(h, 'nota-lojaId', 'loja', 'select');
      juntoDoRotulo(h, 'nota-data', 'data', 'input');
      noCabecalho(h, 'Itens', 'itens');
      noCabecalho(h, 'Frete e total', 'frete');
      for (const p of ['loja', 'data', 'itens', 'frete']) expect(quantas(h, p), p).toBe(1);
      expect(botoes(h).filter((b) => b.porUltimo)).toEqual([]);
      expect(sequencia(h)).toEqual(['tela', 'loja', 'data', 'itens', 'frete']);
    }
  });

  it('detalhe: total no cabeçalho do Total, custo no de Itens, estoque no de No estoque (junto de "Ver o estoque"); sem movimento, sem o ponto do estoque', async () => {
    const h = await noShell(telaDaNota(raiz), `${raiz}${DETALHE}`, alcance, preferencia);
    expect(h).toContain('data-ajuda-tela="compra"');
    noCabecalho(h, 'Total da nota', 'total');
    noCabecalho(h, 'Itens', 'custo');
    noCabecalho(h, 'No estoque', 'estoque');
    const cab = h.slice(h.indexOf('>No estoque</h2>'), h.indexOf('</header>', h.indexOf('>No estoque</h2>')));
    expect(cab).toContain('Ver o estoque');
    for (const p of ['total', 'custo', 'estoque']) expect(quantas(h, p), p).toBe(1);
    expect(sequencia(h)).toEqual(['tela', 'total', 'custo', 'estoque']);
    const sem = await noShell(telaDaNota(raiz, { movimentos: false }), `${raiz}${DETALHE}`, alcance, preferencia);
    expect(sequencia(sem)).toEqual(['tela', 'total', 'custo']);
    // Nota de período fechado: o aviso antes, os pontos iguais.
    const fechada = await noShell(telaDaNota(raiz, { data: '2026-09-20' }), `${raiz}${DETALHE}`, alcance, preferencia);
    expect(ancora(fechada, 'total')).toBeGreaterThan(fechada.indexOf('data-aviso-periodo-fechado'));
    expect(sequencia(fechada)).toEqual(['tela', 'total', 'custo', 'estoque']);
  });
});

// ================================================================== quem lê o quê

describe('decisão 522 · cada bloco chega só a quem ele serve; nenhum valor sem permissão de custo', () => {
  it('o exemplo em R$ é de quem vê custo: quem só lança recebe a embalagem e a conta, sem o exemplo', () => {
    expect(blocos(DONO, 'compra-nova', 'itens')).toHaveLength(3);
    expect(blocos(SO_LANCA, 'compra-nova', 'itens')).toHaveLength(2);
    expect(card(SO_LANCA, 'compra-nova', 'itens')).toContain('3 caixas de 5 kg viram 15 kg');
    expect(card(SO_LANCA, 'compra-nova', 'itens')).not.toContain('R$');
    for (const p of ['loja', 'data', 'frete']) expect(blocos(SO_LANCA, 'compra-nova', p).length, p).toBe(entradaPorChave('compra-nova')!.pontos!.find((x) => x.id === p)!.blocos.length);
  });

  it('nenhum bloco destes pontos sem a permissão de custo diz valor: o operador e quem só lança não recebem R$ nenhum', () => {
    for (const chave of ['compra-nova', 'compra']) {
      for (const p of entradaPorChave(chave)!.pontos!) {
        for (const b of p.blocos) if (/R\$|\d+,\d{2}/.test(b.texto)) expect(b.para, `${chave}.${p.id}: "${b.texto}"`).toEqual(['compras.ver']);
      }
    }
    for (const a of [OPERADOR, SO_LANCA]) {
      const doShell = JSON.stringify(ajudaParaATela(a).filter((e) => e.chave === 'compra-nova' || e.chave === 'compra').map((e) => e.pontos));
      expect(doShell).not.toMatch(/R\$|\d+,\d{2}/);
    }
  });

  it('o que editar e cancelar fazem no custo é de quem lança: quem só vê recebe o custo sem esse bloco', () => {
    expect(blocos(SO_VE, 'compra', 'custo')).toHaveLength(2);
    expect(card(SO_VE, 'compra', 'custo')).not.toContain('Editar ou cancelar');
    for (const a of [DONO, ALCANCE_FLOWFOODS]) expect(card(a, 'compra', 'custo')).toContain('Editar ou cancelar a nota que vale');
    for (const p of ['total', 'estoque']) expect(blocos(SO_VE, 'compra', p).length, p).toBe(3);
  });

  it('quem só vê abre a nota com os três pontos e sem Editar nem Cancelar; o shell não recebe o bloco de quem lança', async () => {
    const h = await noShell(telaDaNota('/erp', { podeLancar: false }), `/erp${DETALHE}`, SO_VE, PREF);
    expect(sequencia(h)).toEqual(['tela', 'total', 'custo', 'estoque']);
    expect(h).not.toContain('Editar nota');
    expect(h).not.toContain('>Situação</h2>');
    const doShell = ajudaParaATela(SO_VE).find((e) => e.chave === 'compra')!;
    expect(doShell.pontos.map((p) => p.id)).toEqual(['compra.total', 'compra.custo', 'compra.estoque']);
    expect(JSON.stringify(doShell)).not.toContain('Editar ou cancelar');
  });
});
