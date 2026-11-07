/** Handlers e estado do formulário real. Hooks controlados; não é teste de navegador ou validação visual. */
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDoDocumento } from '@/lib/erp/documentos-fiscais';
import { montarEntradaDaNota } from '@/lib/erp/documento-fiscal-campos';

const ciclo = vi.hoisted(() => ({ estados: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (inicial: unknown) => {
    const n = ciclo.cursor++;
    if (!(n in ciclo.estados)) ciclo.estados[n] = inicial;
    return [ciclo.estados[n], (valor: unknown) => { ciclo.estados[n] = typeof valor === 'function' ? valor(ciclo.estados[n]) : valor; }];
  },
  useMemo: (calcular: () => unknown) => calcular(),
  useRef: (current: unknown) => ({ current }),
  useEffect: () => {},
  useActionState: () => [null, vi.fn()]
}));
vi.mock('react-dom', async original => ({ ...await original<typeof import('react-dom')>(), useFormStatus: () => ({ pending: false }) }));
vi.mock('@/components/erp/telas/cadastro/rascunho', () => ({
  useRascunhoDaTela: () => ({ valores: null, insumoCriado: null, chave: 'teste', versaoMudou: false, descartar: vi.fn() }),
  guardarRascunho: vi.fn(), AvisoDeRascunho: () => null, AvisoDeRascunhoVelho: () => null,
}));
vi.mock('@/components/erp/telas/cadastro/erros', () => ({
  useAvisoDeSaida: () => ({ aoMudar: vi.fn(), aoEnviar: vi.fn() }), ResumoDeErros: () => null,
}));
import { FormConferencia } from '@/components/erp/telas/compras/form-conferencia';

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: unknown): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!no || typeof no !== 'object' || !('props' in no)) return [];
  const el = no as Elemento;
  // Só abre o item desta tela; os componentes de infraestrutura não precisam de DOM neste teste.
  if (typeof el.type === 'function' && 'it' in el.props && 'aoMudar' in el.props) return elementos((el.type as (p: Record<string, unknown>) => Elemento)(el.props));
  return [el, ...elementos(el.props.children)];
}
function texto(no: unknown): string {
  if (typeof no === 'string' || typeof no === 'number') return String(no);
  if (Array.isArray(no)) return no.map(texto).join(' ');
  if (no && typeof no === 'object' && 'props' in no) return texto((no as Elemento).props.children);
  return '';
}

const item: ItemDoDocumento = {
  id: 'item1', nItem: 1, codigoProduto: 'PC2', gtin: '7890000000017', descricao: 'Peça sintética', ncm: null,
  unidadeComercial: 'PC', qComMilesimos: 3000, valorCentavos: 6000, descontoCentavos: 0, liquidoCentavos: 6000, outrosCentavos: 0,
  insumoId: null, insumoNome: null, insumoAtivo: null, unidadeDoInsumo: null, embalagem: '', embalagemTexto: null,
  fator: '', fatorMilesimos: null, conta: null, origem: 'sugestao',
  sugestao: { insumoId: 'queijo', insumoNome: 'Queijo sintético', varianteId: 'peca2', varianteNome: 'Peça 2 kg' },
};
const props: Parameters<typeof FormConferencia>[0] = {
  acao: async () => null, base: '/erp/compras/recebidas', hoje: '2026-11-06', dataInicial: '06/11/2026', bloqueio: null, podeEditarVinculos: true,
  doc: {
    id: 'doc1', versao: '2026-11-06T12:00:00Z', loja: { id: 'loja1', nome: 'Loja sintética' }, lojasCandidatas: [], fornecedoresCandidatos: [],
    itens: [item], notaParaLigar: [], emitidaEm: '2026-11-06',
    conferencia: { somaItensCentavos: 6000, freteCentavos: 0, calculadoCentavos: 6000, totalDaNotaCentavos: 6000, diferencaCentavos: 0, fecha: true, frase: null },
    totais: { vProdCentavos: 6000, vDescCentavos: 0, vFreteCentavos: 0, vSegCentavos: 0, vOutroCentavos: 0, vIpiCentavos: 0, vStCentavos: 0, vNfCentavos: 6000 },
  },
  opcoesDeInsumos: [
    { id: 'queijo', nome: 'Queijo sintético', unidade: 'KG', ativo: true, produzidoPor: null, conteudoMilesimos: 1000, embalagens: [{ id: 'peca2', nome: 'Peça 2 kg', conteudoMilesimos: 2000, ativo: true }] },
    { id: 'arroz', nome: 'Arroz sintético', unidade: 'KG', ativo: true, produzidoPor: null, conteudoMilesimos: 5000, embalagens: [] },
  ],
};

function montar() {
  const renderizar = () => {
    ciclo.cursor = 0;
    const base = FormConferencia(props) as Elemento;
    return elementos((base.type as (p: Record<string, unknown>) => Elemento)(base.props));
  };
  const campo = (nome: string) => renderizar().find(e => e.props.name === nome)!;
  return {
    campo,
    usarSugestao() { (renderizar().find(e => e.type === 'button' && texto(e) === 'Usar este')!.props.onClick as () => void)(); },
    mudar(nome: string, value: string) { (campo(nome).props.onChange as (e: unknown) => void)({ target: { value } }); },
    conta() { return texto(renderizar().find(e => e.props.id === 'documento-fator-1-ajuda')); },
  };
}

describe('conferência: sugestão do código de barras conserva embalagem e conversão', () => {
  beforeEach(() => { ciclo.estados = []; ciclo.cursor = 0; });

  it('Usar este conserva a peça de 2 kg: 3 PC são 6 kg, e o valor enviado mantém a variante', () => {
    const tela = montar();
    tela.usarSugestao();
    expect(tela.campo('item_insumo').props.value).toBe('queijo');
    expect(tela.campo('item_embalagem').props.value).toBe('v:peca2');
    expect(tela.campo('item_fator').props.value).toBe('1');
    expect(tela.conta().replace(/\s/g, ' ')).toContain('3 PC → 6 kg');
    const montada = montarEntradaDaNota({ lojaId: 'loja1', fornecedorId: 'fornecedor1', numero: '1', serie: '1', vFreteCentavos: 0, vNfCentavos: 6000 }, [item], [{
      nItem: 1, insumoId: String(tela.campo('item_insumo').props.value), embalagem: String(tela.campo('item_embalagem').props.value), fator: String(tela.campo('item_fator').props.value),
    }], '06/11/2026');
    expect(montada).toMatchObject({ ok: true, montada: { entrada: { itens: [{ insumoId: 'queijo', embalagem: 'v:peca2', quantidade: '3', valor: '60,00' }] } } });
  });

  it('troca manual de insumo continua limpando a variante anterior e recalcula com a embalagem padrão', () => {
    const tela = montar(); tela.usarSugestao();
    tela.mudar('item_insumo', 'arroz');
    expect(tela.campo('item_embalagem').props.value).toBe('padrao');
    expect(tela.conta().replace(/\s/g, ' ')).toContain('3 PC → 15 kg');
  });

  it('alterar o fator conserva a embalagem escolhida e a conta passa a usar ambos', () => {
    const tela = montar(); tela.usarSugestao();
    tela.mudar('item_fator', '2');
    expect(tela.campo('item_embalagem').props.value).toBe('v:peca2');
    expect(tela.conta().replace(/\s/g, ' ')).toContain('3 PC → 12 kg');
  });
});
