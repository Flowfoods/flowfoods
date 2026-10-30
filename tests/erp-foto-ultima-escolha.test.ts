/** Handlers do componente real; hooks, redução e transporte controlados, sem rede/DOM real. */
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type Instancia = {
  refs: { current: unknown }[]; ref: number;
  estados: unknown[]; estado: number;
  efeitos: { deps?: readonly unknown[]; limpar?: () => void }[]; efeito: number;
  pendentes: (() => void)[]; desmontada: boolean; atualizacoesDepois: number;
};
const ciclo = vi.hoisted(() => ({ atual: null as Instancia | null }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => {
    const i = ciclo.atual!;
    return i.refs[i.ref++] ??= { current };
  },
  useState: (inicial: unknown) => {
    const i = ciclo.atual!, n = i.estado++;
    if (!(n in i.estados)) i.estados[n] = typeof inicial === 'function' ? inicial() : inicial;
    return [i.estados[n], (valor: unknown) => {
      if (i.desmontada) i.atualizacoesDepois++;
      i.estados[n] = typeof valor === 'function' ? valor(i.estados[n]) : valor;
    }];
  },
  useEffect: (fn: () => void | (() => void), deps?: readonly unknown[]) => {
    const i = ciclo.atual!, n = i.efeito++, anterior = i.efeitos[n];
    if (anterior && deps && anterior.deps?.length === deps.length && deps.every((d, x) => Object.is(d, anterior.deps![x]))) return;
    i.pendentes.push(() => { anterior?.limpar?.(); i.efeitos[n] = { deps, limpar: fn() || undefined }; });
  },
}));
vi.mock('@/components/erp/ui/ponto-de-ajuda', () => ({ useTemPonto: () => false, PontoDeAjuda: () => null }));

import { CampoFoto } from '@/components/erp/telas/fichas/campo-foto';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: unknown): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!no || typeof no !== 'object' || !('props' in no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children)];
}
function texto(no: unknown): string {
  if (typeof no === 'string') return no;
  if (Array.isArray(no)) return no.map(texto).join(' ');
  if (no && typeof no === 'object' && 'props' in no) return texto((no as Elemento).props.children);
  return '';
}
function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>(r => { resolver = r; });
  return { promessa, resolver };
}
const foto = (nome: string) => new File(['foto'], nome, { type: 'image/jpeg' });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('foto da ficha: somente a escolha vigente pode mudar o formulário', () => {
  const instancias: { desmontar: () => void }[] = [];
  let pedidos: Map<string, { resolver: (r: Response) => void; signal: AbortSignal }>;
  let fetchTeste: Mock<(_url: string, opcoes: RequestInit) => Promise<Response>>;
  let criarUrl: Mock<(arquivo: Blob | MediaSource) => string>;
  let revogarUrl: Mock<(url: string) => void>;

  function montar(atual: string | null = '/foto-gravada') {
    const i: Instancia = { refs: [], ref: 0, estados: [], estado: 0, efeitos: [], efeito: 0, pendentes: [], desmontada: false, atualizacoesDepois: 0 };
    const aoOcupar = vi.fn(), aoMudar = vi.fn();
    const entrada = { files: [] as File[], value: '' };
    let arvore: Elemento;
    function renderizar() {
      i.ref = 0; i.estado = 0; i.efeito = 0; ciclo.atual = i;
      try { arvore = CampoFoto({ atual, nome: 'Prato', idBase: 'ficha', envio: '/erp/fichas/fotos', aoOcupar, aoMudar }); }
      finally { ciclo.atual = null; }
      const el = elementos(arvore).find(e => e.type === 'input' && e.props.type === 'file')!;
      const ref = (el as unknown as { ref: { current: unknown } }).ref;
      ref.current = entrada;
      i.pendentes.splice(0).forEach(f => f());
      return arvore;
    }
    renderizar();
    const h = {
      i, entrada, aoOcupar, aoMudar, renderizar,
      selecionar(arquivo: File | null) {
        entrada.files = arquivo ? [arquivo] : [];
        entrada.value = arquivo?.name ?? '';
        const el = elementos(renderizar()).find(e => e.type === 'input' && e.props.type === 'file')!;
        return (el.props.onChange as (e: unknown) => Promise<void>)({ target: entrada });
      },
      remover(checked = true) {
        const el = elementos(renderizar()).find(e => e.type === 'input' && e.props.name === 'removerFoto')!;
        (el.props.onChange as (e: unknown) => void)({ target: { checked } });
        renderizar();
      },
      nomeEnviado() { return elementos(renderizar()).find(e => e.type === 'input' && e.props.name === 'fotoNova')?.props.value; },
      imagem() { return elementos(renderizar()).find(e => e.type === 'img')?.props.src; },
      mensagem() { return texto(renderizar()); },
      desmontar() { if (i.desmontada) return; i.desmontada = true; i.efeitos.forEach(e => e.limpar?.()); },
    };
    instancias.push(h);
    return h;
  }

  beforeEach(() => {
    pedidos = new Map();
    // Ignora o abort de propósito: prova que identidade também protege resposta já em trânsito.
    fetchTeste = vi.fn((_url: string, opcoes: RequestInit) => {
      const d = adiado<Response>();
      pedidos.set((opcoes.body as File).name, { resolver: d.resolver, signal: opcoes.signal as AbortSignal });
      return d.promessa;
    });
    criarUrl = vi.fn((arquivo: Blob | MediaSource) => `blob:${(arquivo as File).name}`);
    revogarUrl = vi.fn();
    vi.stubGlobal('fetch', fetchTeste);
    vi.stubGlobal('createImageBitmap', undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(criarUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revogarUrl);
  });
  afterEach(() => {
    instancias.splice(0).forEach(i => i.desmontar());
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const responder = (nome: string, corpo: { arquivo: string } | { erro: string }) => {
    pedidos.get(nome)!.resolver(new Response(JSON.stringify(corpo), { status: 'erro' in corpo ? 400 : 200 }));
  };

  it('A escolhida antes de B nunca substitui B quando A responde por último', async () => {
    const h = montar();
    const a = h.selecionar(foto('A.jpg')); await tick();
    const b = h.selecionar(foto('B.jpg')); await tick();
    responder('B.jpg', { arquivo: 'salva-B.jpg' }); await b;
    expect(h.nomeEnviado()).toBe('salva-B.jpg');
    responder('A.jpg', { arquivo: 'salva-A.jpg' }); await a;
    expect(h.nomeEnviado()).toBe('salva-B.jpg');
    expect(h.imagem()).toBe('blob:B.jpg');
    expect(pedidos.get('A.jpg')!.signal.aborted).toBe(true);
    expect(h.aoMudar).toHaveBeenCalledTimes(1);
    expect(criarUrl).toHaveBeenCalledTimes(1);
  });

  it.each(['arquivo', 'erro'] as const)('resposta antiga (%s) não libera salvar nem mostra erro enquanto a última envia', async tipo => {
    const h = montar();
    const a = h.selecionar(foto('A.jpg')); await tick();
    const b = h.selecionar(foto('B.jpg')); await tick();
    responder('A.jpg', tipo === 'arquivo' ? { arquivo: 'salva-A.jpg' } : { erro: 'Erro antigo' }); await a;
    expect(h.aoOcupar.mock.calls).toEqual([[true], [true]]);
    expect(h.mensagem()).toContain('Enviando a foto');
    expect(h.mensagem()).not.toContain('Erro antigo');
    expect(h.entrada.value).toBe('B.jpg');
    responder('B.jpg', { arquivo: 'salva-B.jpg' }); await b;
    expect(h.aoOcupar).toHaveBeenLastCalledWith(false);
  });

  it('erro da última escolha não é apagado pelo sucesso atrasado de uma escolha anterior', async () => {
    const h = montar();
    const a = h.selecionar(foto('A.jpg')); await tick();
    const b = h.selecionar(foto('B.jpg')); await tick();
    responder('B.jpg', { erro: 'Escolha outra foto' }); await b;
    responder('A.jpg', { arquivo: 'salva-A.jpg' }); await a;
    expect(h.mensagem()).toContain('Escolha outra foto');
    expect(h.nomeEnviado()).toBeUndefined();
    expect(h.imagem()).toBe('/foto-gravada');
    expect(h.entrada.value).toBe('');
  });

  it('escolha antiga ainda em redução não inicia upload nem altera a escolha nova', async () => {
    const imagens = new Map<string, ReturnType<typeof adiado<ImageBitmap>>>();
    vi.stubGlobal('createImageBitmap', (arquivo: File) => { const d = adiado<ImageBitmap>(); imagens.set(arquivo.name, d); return d.promessa; });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (f: (b: Blob) => void) => f(new Blob(['reduzida'], { type: 'image/jpeg' })) }) });
    const h = montar();
    const a = h.selecionar(foto('A.png'));
    const b = h.selecionar(foto('B.png'));
    imagens.get('B.png')!.resolver({ width: 20, height: 20 } as ImageBitmap); await tick(); await tick();
    responder('B.jpg', { arquivo: 'salva-B.jpg' }); await b;
    imagens.get('A.png')!.resolver({ width: 20, height: 20 } as ImageBitmap); await a;
    expect([...pedidos.keys()]).toEqual(['B.jpg']);
    expect(h.nomeEnviado()).toBe('salva-B.jpg');
  });

  it('tirar a foto cancela a operação e uma resposta tardia não desfaz a remoção', async () => {
    const h = montar();
    const a = h.selecionar(foto('A.jpg')); await tick();
    h.remover();
    expect(pedidos.get('A.jpg')!.signal.aborted).toBe(true);
    expect(h.aoOcupar).toHaveBeenLastCalledWith(false);
    responder('A.jpg', { arquivo: 'salva-A.jpg' }); await a;
    expect(h.nomeEnviado()).toBeUndefined();
    expect(h.imagem()).toBeUndefined();
    expect(elementos(h.renderizar()).find(e => e.props.name === 'removerFoto')?.props.checked).toBe(true);
    expect(h.aoMudar).toHaveBeenCalledTimes(1);
  });

  it('desmontar durante o envio invalida a resposta sem novos setters ou callbacks', async () => {
    const h = montar();
    const a = h.selecionar(foto('A.jpg')); await tick();
    h.desmontar();
    expect(pedidos.get('A.jpg')!.signal.aborted).toBe(true);
    responder('A.jpg', { arquivo: 'salva-A.jpg' }); await a;
    expect(h.i.atualizacoesDepois).toBe(0);
    expect(h.aoOcupar.mock.calls).toEqual([[true]]);
    expect(h.aoMudar).not.toHaveBeenCalled();
    expect(criarUrl).not.toHaveBeenCalled();
  });

  it.each(['remover', 'desmontar'] as const)('%s ainda na redução impede iniciar upload', async acao => {
    const imagem = adiado<ImageBitmap>();
    vi.stubGlobal('createImageBitmap', () => imagem.promessa);
    const h = montar();
    const a = h.selecionar(foto('A.jpg'));
    h[acao]();
    // Sem canvas: reduzir usa o fallback original, que também precisa respeitar a desmontagem.
    imagem.resolver({ width: 10, height: 10 } as ImageBitmap); await a;
    expect(fetchTeste).not.toHaveBeenCalled();
    expect(h.i.atualizacoesDepois).toBe(0);
    expect(h.aoOcupar.mock.calls).toEqual(acao === 'remover' ? [[true], [false]] : [[true]]);
  });

  it('tamanho inválido e cancelar o seletor mantêm a foto existente sem enviar', async () => {
    const h = montar();
    await h.selecionar(new File([new Uint8Array(LIMITE_DA_FOTO + 1)], 'grande.jpg', { type: 'image/jpeg' }));
    expect(h.mensagem()).toContain('Foto acima de 8 MB');
    await h.selecionar(null);
    expect(h.mensagem()).toContain('Foto acima de 8 MB');
    expect(fetchTeste).not.toHaveBeenCalled();
    expect(h.imagem()).toBe('/foto-gravada');
    expect(h.aoOcupar.mock.calls).toEqual([[true], [false]]);
  });

  it('troca concluída revoga a prévia anterior, e desmontagem revoga somente a atual', async () => {
    const h = montar();
    const a = h.selecionar(foto('A.jpg')); await tick(); responder('A.jpg', { arquivo: 'salva-A.jpg' }); await a;
    h.renderizar();
    const b = h.selecionar(foto('B.jpg')); await tick(); responder('B.jpg', { arquivo: 'salva-B.jpg' }); await b;
    h.renderizar();
    expect(revogarUrl.mock.calls).toEqual([['blob:A.jpg']]);
    h.desmontar();
    expect(revogarUrl.mock.calls).toEqual([['blob:A.jpg'], ['blob:B.jpg']]);
  });
});
