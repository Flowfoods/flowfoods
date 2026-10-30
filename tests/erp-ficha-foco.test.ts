/** Efeito do componente real com URL e foco controlados; a jornada no navegador valida a navegação. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ciclo = vi.hoisted(() => ({ efeitos: [] as (() => void)[], focus: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: () => ({ current: { focus: ciclo.focus } }),
  useEffect: (efeito: () => void) => { ciclo.efeitos.push(efeito); },
}));
import { EtapaPrecos } from '@/components/erp/telas/fichas/etapa-precos';

function chegar(caminho: string) {
  const location = new URL(caminho, 'http://localhost');
  const history = { state: { next: 'preservado' }, replaceState: vi.fn() };
  vi.stubGlobal('window', { location, history });
  EtapaPrecos({ children: null, referencia: 'ficha:embalagens' });
  for (const efeito of ciclo.efeitos) efeito();
  return history;
}

describe('chegada para conferir preços', () => {
  beforeEach(() => { ciclo.efeitos = []; ciclo.focus.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('restaura âncora e foca quando o redirect da action chega sem hash', () => {
    const history = chegar('/erp/fichas/1?feito=embalagens&etapa=precos');
    expect(history.replaceState).toHaveBeenCalledWith(history.state, '', '/erp/fichas/1?feito=embalagens&etapa=precos#preco-por-canal');
    expect(ciclo.focus).toHaveBeenCalledOnce();
  });

  it('aceita também âncora direta sem reescrever a navegação', () => {
    const history = chegar('/erp/fichas/1#preco-por-canal');
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(ciclo.focus).toHaveBeenCalledOnce();
  });

  it('salvar pelo botão padrão não muda foco nem endereço', () => {
    const history = chegar('/erp/fichas/1?feito=embalagens');
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(ciclo.focus).not.toHaveBeenCalled();
  });
});
