/** Componentes reais com ciclo React controlado; prova que props revalidadas não emprestam versões. */
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AcaoConfiguracao, EstadoConfiguracao } from '@/lib/erp/canal-config-campos';

type Ciclo = { estados: unknown[]; indice: number; estado: EstadoConfiguracao; acao?: AcaoConfiguracao };
const render = vi.hoisted(() => ({ atual: null as Ciclo | null }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (inicial: unknown) => {
    const i = render.atual!, n = i.indice++;
    if (!(n in i.estados)) i.estados[n] = typeof inicial === 'function' ? inicial() : inicial;
    return [i.estados[n], (valor: unknown) => { i.estados[n] = typeof valor === 'function' ? valor(i.estados[n]) : valor; }];
  },
}));
vi.mock('react-dom', async original => ({
  ...await original<typeof import('react-dom')>(),
  useFormState: (acao: AcaoConfiguracao) => {
    const i = render.atual!; i.acao = acao;
    return [i.estado, async (form: FormData) => { i.estado = await i.acao!(i.estado, form); }];
  },
}));
vi.mock('@/components/erp/telas/cadastro/erros', async original => ({
  ...await original<typeof import('@/components/erp/telas/cadastro/erros')>(), useAvisoDeSaida: () => ({ aoMudar: vi.fn(), aoEnviar: vi.fn() }),
}));
import { FormFaixasDeCmv } from '@/components/erp/telas/fichas/form-faixas-cmv';
import { FormMetasDeCmv } from '@/components/erp/telas/fichas/form-metas-cmv';
import { FormMargensAlvo } from '@/components/erp/telas/fichas/form-margens';
import { FormTaxaDoIfood } from '@/components/erp/telas/fichas/form-taxa';

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: unknown): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!no || typeof no !== 'object' || !('props' in no)) return [];
  const e = no as Elemento; return [e, ...elementos(e.props.children)];
}
const casos = [
  { nome: 'faixas', campo: 'farol_LOJA_a', inicial: '25', componente: (acao: AcaoConfiguracao, versao: string, novo: boolean) => FormFaixasDeCmv({ acao, versao, aqui: '/erp/fichas/canais', bloqueio: null, inicial: { LOJA: { aBp: novo ? 1000 : 2500, bBp: 3000, cBp: 3500, dBp: 4000 }, DELIVERY_PROPRIO: null, IFOOD: null } }) },
  { nome: 'metas', campo: 'metaCmv_LOJA', inicial: '25', componente: (acao: AcaoConfiguracao, versao: string, novo: boolean) => FormMetasDeCmv({ acao, versao, aqui: '/erp/fichas/canais', bloqueio: null, inicial: { LOJA: novo ? 1000 : 2500, DELIVERY_PROPRIO: null, IFOOD: null } }) },
  { nome: 'margens', campo: 'margem_LOJA', inicial: '25', componente: (acao: AcaoConfiguracao, versao: string, novo: boolean) => FormMargensAlvo({ acao, versao, aqui: '/erp/fichas/canais', bloqueio: null, taxa: null, inicial: { LOJA: novo ? 1000 : 2500, DELIVERY_PROPRIO: null, IFOOD: null } }) },
  { nome: 'taxa', campo: 'comissao', inicial: '25', componente: (acao: AcaoConfiguracao, versao: string, novo: boolean) => FormTaxaDoIfood({ acao, versao, aqui: '/erp/fichas/canais', bloqueio: null, inicial: { comissao: novo ? '10' : '25', pagamento: '3,2' } }) },
];

function montar(caso: typeof casos[number], acao: AcaoConfiguracao) {
  const ciclo: Ciclo = { estados: [], indice: 0, estado: null };
  let versao = 'origem-v1', novo = false;
  function arvore() {
    ciclo.indice = 0; render.atual = ciclo;
    try { return caso.componente(acao, versao, novo); } finally { render.atual = null; }
  }
  const campo = (nome: string) => elementos(arvore()).find(e => e.type === 'input' && e.props.name === nome)!;
  return {
    arvore, ciclo, valor: (nome: string) => campo(nome).props.value,
    mudar(valor: string) { (campo(caso.campo).props.onChange as (e: { target: { value: string } }) => void)({ target: { value: valor } }); },
    revalidar() { versao = 'outro-v99'; novo = true; arvore(); },
    enviar() {
      const a = arvore(), form = new FormData();
      for (const e of elementos(a).filter(e => e.type === 'input' && typeof e.props.name === 'string')) form.set(String(e.props.name), String(e.props.value ?? ''));
      return (a.props.action as (f: FormData) => Promise<void>)(form);
    },
    temSucesso() { return elementos(arvore()).some(e => e.type === 'p' && e.props.role === 'status' && e.props.children === 'Salvo pelo próprio envio.'); },
  };
}

describe.each(casos)('3B: origem e confirmação do formulário $nome', caso => {
  it('revalidação externa conserva texto e versão, mesmo antes da primeira edição', () => {
    const h = montar(caso, vi.fn<AcaoConfiguracao>());
    expect(h.valor(caso.campo)).toBe(caso.inicial);
    h.revalidar(); expect(h.valor('versao')).toBe('origem-v1'); expect(h.valor(caso.campo)).toBe(caso.inicial);
    h.mudar('27,75'); h.revalidar();
    expect(h.valor(caso.campo)).toBe('27,75'); expect(h.valor('versao')).toBe('origem-v1');
  });
  it('erro/confito conserva o texto digitado e envia a versão de origem até recarga', async () => {
    const acao = vi.fn<AcaoConfiguracao>().mockResolvedValue({ ok: false, vez: 1, conflito: true, erros: { geral: 'A configuração mudou.' } });
    const h = montar(caso, acao); h.mudar('27,75'); h.revalidar(); await h.enviar();
    expect(acao.mock.calls[0][1].get('versao')).toBe('origem-v1');
    expect(acao.mock.calls[0][1].get(caso.campo)).toBe('27,75');
    expect(h.valor(caso.campo)).toBe('27,75'); expect(h.valor('versao')).toBe('origem-v1');
  });
  it('adota somente confirmação própria, permite segunda edição e não apaga rascunho irmão', async () => {
    let confirmar!: (r: EstadoConfiguracao) => void;
    const espera = new Promise<EstadoConfiguracao>(r => { confirmar = r; });
    const acao = vi.fn<AcaoConfiguracao>().mockReturnValueOnce(espera).mockImplementation(async (_a, f) => ({ ok: true, vez: 2, mensagem: 'Salvo pelo próprio envio.', confirmacao: { versao: 'propria-v3', campos: Object.fromEntries([...f].filter(([nome]) => nome !== 'versao').map(([nome, valor]) => [nome, String(valor)])) } }));
    const h = montar(caso, acao), irmao = montar(caso, vi.fn<AcaoConfiguracao>());
    irmao.mudar('26,5'); h.mudar('27,75');
    const envio = h.enviar();
    expect(elementos(h.arvore()).filter(e => e.type === 'fieldset').every(e => e.props.disabled === true)).toBe(true);
    const enviados = Object.fromEntries([...acao.mock.calls[0][1]].filter(([nome]) => nome !== 'versao').map(([nome, valor]) => [nome, String(valor)]));
    confirmar({ ok: true, vez: 1, mensagem: 'Salvo pelo próprio envio.', confirmacao: { versao: 'propria-v2', campos: { ...enviados, [caso.campo]: '27,7' } } });
    await envio; h.revalidar(); irmao.revalidar();
    expect(h.valor(caso.campo)).toBe('27,7'); expect(h.valor('versao')).toBe('propria-v2'); expect(h.temSucesso()).toBe(true);
    expect(irmao.valor(caso.campo)).toBe('26,5'); expect(irmao.valor('versao')).toBe('origem-v1');
    h.mudar('28,1'); expect(h.temSucesso()).toBe(false);
    await h.enviar(); expect(acao.mock.calls[1][1].get('versao')).toBe('propria-v2'); expect(acao.mock.calls[1][1].get(caso.campo)).toBe('28,1');
    expect(h.valor('versao')).toBe('propria-v3'); expect(h.temSucesso()).toBe(true);
  });
  it('resposta de rede perdida não adota a versão viva nem apaga texto', async () => {
    const h = montar(caso, vi.fn<AcaoConfiguracao>().mockRejectedValue(new Error('rede')));
    h.mudar('27,75'); h.revalidar(); await h.enviar();
    expect(h.valor(caso.campo)).toBe('27,75'); expect(h.valor('versao')).toBe('origem-v1');
    expect(h.ciclo.estado).toMatchObject({ ok: false, erros: { geral: expect.stringContaining('confirmar') } });
  });
});
