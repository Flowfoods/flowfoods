import { Children, isValidElement, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeletorDeItem } from '@/components/erp/telas/fichas/seletor-de-item';

// Aciona os handlers do componente na ordem indicada, com um render entre eventos.
// O navegador e o aparelho da operação são verificações complementares.
const ciclo = vi.hoisted(() => ({ indice: 0, valores: [] as unknown[] }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useId: () => 'lista',
  useEffect: () => {},
  useMemo: (criar: () => unknown) => criar(),
  useRef: (inicial: unknown) => ciclo.valores[ciclo.indice++] ??= { current: inicial },
  useState: (inicial: unknown) => {
    const i = ciclo.indice++;
    if (!(i in ciclo.valores)) ciclo.valores[i] = inicial;
    return [ciclo.valores[i], (valor: unknown) => {
      ciclo.valores[i] = typeof valor === 'function' ? valor(ciclo.valores[i]) : valor;
    }];
  },
}));

type PropsDaPeca = HTMLAttributes<HTMLElement> & Pick<ComponentProps<'input'>, 'type' | 'value' | 'disabled' | 'ref'>;
function elementos(no: ReactNode): React.ReactElement<PropsDaPeca>[] {
  if (!isValidElement<PropsDaPeca>(no)) return [];
  return [no, ...Children.toArray(no.props.children).flatMap(elementos)];
}
function montar(extra: Partial<ComponentProps<typeof SeletorDeItem>> = {}) {
  let valor = '';
  const aoEscolher = vi.fn((id: string) => { valor = id; });
  function renderizar(mudancas: Partial<ComponentProps<typeof SeletorDeItem>> = {}) {
    ciclo.indice = 0;
    const raiz = SeletorDeItem({ id: 'embalagem', name: 'emb_insumo', valor, rotulo: 'Embalagem', aoEscolher, opcoes: [
      { valor: 'cx-27', nome: 'Caixa grande de papel', grupo: 'Materiais', ordemDoGrupo: 0 },
      { valor: 'sc-42', nome: 'Sacola grande', grupo: 'Materiais', ordemDoGrupo: 0 },
    ], ...extra, ...mudancas });
    const campos = elementos(raiz);
    return {
      raiz, campo: campos.find(e => e.props.role === 'combobox')!.props,
      opcoes: campos.filter(e => e.props.role === 'option'),
      mais: campos.find(e => e.props.children === 'Carregar mais')?.props,
      pressionar: (alvo: number, pointerType: string) => {
        const evento = { pointerType, isPrimary: true, button: 0, preventDefault: vi.fn() } as never;
        // Captura na lista, depois o evento chega à opção.
        campos.find(e => e.props.onPointerDownCapture)?.props.onPointerDownCapture?.(evento);
        campos.filter(e => e.props.role === 'option')[alvo]?.props.onPointerDown?.(evento);
      },
      id: campos.find(e => e.props.type === 'hidden')!.props.value,
    };
  }
  return { renderizar, aoEscolher };
}
beforeEach(() => { ciclo.valores.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('ativação da opção da ficha', () => {
  it.each(['', 'grand'])('um blur sem destino entre pressionar e clicar conserva a opção visível (busca "%s")', texto => {
    const { renderizar, aoEscolher } = montar();
    renderizar().campo.onFocus?.({} as never);
    if (texto) renderizar().campo.onChange?.({ target: { value: texto } } as never);
    const aberto = renderizar();
    aberto.pressionar(1, 'mouse');
    aberto.raiz.props.onBlur?.({ relatedTarget: null, currentTarget: { contains: () => false } } as never);
    const segunda = renderizar().opcoes[1];
    expect(segunda).toBeDefined();
    segunda.props.onClick?.({} as never);
    expect(aoEscolher).toHaveBeenCalledExactlyOnceWith('sc-42');
    expect(renderizar()).toMatchObject({ id: 'sc-42', campo: { value: 'Sacola grande', 'aria-expanded': false } });
  });

  it.each(['toque', 'arrasto', 'cancelado', 'outro alvo'] as const)('soltar sem click de compatibilidade: %s', gesto => {
    const { renderizar, aoEscolher } = montar();
    renderizar().campo.onFocus?.({} as never);
    const aberto = renderizar();
    aberto.pressionar(1, 'touch');
    const linha = { contains: (alvo: unknown) => alvo === linha };
    vi.stubGlobal('document', { elementFromPoint: () => gesto === 'outro alvo' ? {} : linha });
    const ponto = { identifier: 7, clientX: 40, clientY: 120 };
    const opcao = aberto.opcoes[1].props;
    opcao.onTouchStart?.({ currentTarget: linha, touches: [ponto] } as never);
    aberto.raiz.props.onBlur?.({ relatedTarget: null, currentTarget: { contains: () => false } } as never);
    if (gesto === 'arrasto') opcao.onTouchMove?.({ touches: [{ ...ponto, clientY: 80 }] } as never);
    if (gesto === 'cancelado') opcao.onPointerCancel?.({} as never);
    const preventDefault = vi.fn();
    renderizar().opcoes[1]?.props.onTouchEnd?.({ cancelable: true, preventDefault, currentTarget: linha, touches: [], changedTouches: [ponto] } as never);
    if (gesto === 'toque') {
      expect(aoEscolher).toHaveBeenCalledExactlyOnceWith('sc-42');
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(renderizar().id).toBe('sc-42');
    } else {
      expect(aoEscolher).not.toHaveBeenCalled();
      expect(renderizar().id).toBe('');
    }
  });

  it.each([null, {}])('sair sem pressionar a lista fecha o menu e preserva o ID', destino => {
    const { renderizar, aoEscolher } = montar();
    renderizar().campo.onFocus?.({} as never);
    renderizar().raiz.props.onBlur?.({ relatedTarget: destino, currentTarget: { contains: () => false } } as never);
    expect(renderizar().opcoes).toHaveLength(0);
    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it('busca sem resultado não altera a seleção nem submete ao pressionar Enter', () => {
    const { renderizar, aoEscolher } = montar();
    renderizar().campo.onChange?.({ target: { value: 'inexistente' } } as never);
    expect(renderizar().opcoes).toHaveLength(0);
    const preventDefault = vi.fn();
    renderizar().campo.onKeyDown?.({ key: 'Enter', preventDefault } as never);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it('bloquear o campo fecha a lista até uma nova interação depois de reabilitar', () => {
    const { renderizar } = montar();
    renderizar().campo.onFocus?.({} as never);
    const bloqueado = renderizar({ desabilitado: true });
    expect(bloqueado.campo.disabled).toBe(true);
    expect(bloqueado.opcoes).toHaveLength(0);
    bloqueado.campo.onFocus?.({} as never);
    expect(renderizar().opcoes).toHaveLength(0);
    renderizar().campo.onFocus?.({} as never);
    expect(renderizar().opcoes).toHaveLength(2);
  });

  it('Tab alcança Carregar mais e a paginação devolve foco sem escolher nem apagar a busca', () => {
    const aoCarregarMais = vi.fn();
    const { renderizar, aoEscolher } = montar({ buscaExterna: { aoBuscar: vi.fn(), temMais: true, carregando: false, aoCarregarMais } });
    renderizar().campo.onChange?.({ target: { value: 'gran' } } as never);
    const aberto = renderizar(), focus = vi.fn();
    Object.assign(aberto.campo.ref!, { current: { focus } });
    aberto.campo.onKeyDown?.({ key: 'Tab' } as never);
    aberto.raiz.props.onBlur?.({ relatedTarget: {}, currentTarget: { contains: () => true } } as never);
    renderizar().mais?.onClick?.({} as never);
    expect(aoCarregarMais).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(renderizar().campo.value).toBe('gran');
    expect(aoEscolher).not.toHaveBeenCalled();
  });
});
