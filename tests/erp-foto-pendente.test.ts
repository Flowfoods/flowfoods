/** GET real + disco temporário: a prévia do rascunho não amplia o acesso às fotos. */
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { responderFotoPendente } from '@/lib/erp/foto-pendente';
import { caminhoDaFoto, salvarFoto } from '@/lib/erp/arquivos';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';
import { resolverAlcance, type Permissao } from '@/lib/erp/permissoes';
import { JPG_LIMPO, PNG_LIMPO, WEBP_LIMPO, jpgComGps, temGps } from './erp-fotos-teste';

type Contexto = NonNullable<Parameters<typeof responderFotoPendente>[1]>;
const atual = vi.hoisted(() => ({ erp: null as Contexto | null, n1: {} as Record<string, Contexto> }));
vi.mock('@/lib/erp/contexto', () => ({
  parceiroDaSessaoOuNada: vi.fn(async () => atual.erp),
  parceiroDoNivel1OuNada: vi.fn(async (slug: string) => atual.n1[slug] ?? null),
}));
import { parceiroDaSessaoOuNada, parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { GET as fotoErp, POST as enviarErp } from '@/app/erp/fichas/fotos/route';
import { GET as fotoN1 } from '@/app/rodolfo/(painel)/erp/[slug]/fichas/fotos/route';

const ctx = (id: string, permissoes: Permissao[] = ['fichas.editar'], bloqueio: string | null = null): Contexto => ({
  parceiro: { id }, bloqueio,
  alcance: resolverAlcance({ perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] }),
});
const pedido = (arquivo: string, extra = '') => new Request(`http://localhost:3106/erp/fichas/fotos?arquivo=${encodeURIComponent(arquivo)}${extra}`);
const privada = (r: Response) => {
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  expect(r.headers.has('location')).toBe(false);
};

describe('3C · prévia protegida de foto pendente', () => {
  let pasta: string;
  let token: string;
  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'ff-foto-pendente-'));
    vi.stubEnv('ERP_ARQUIVOS_DIR', pasta);
    token = await salvarFoto('parceiro-a', PNG_LIMPO, 'png', true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    atual.erp = ctx('parceiro-a');
    atual.n1 = { 'casa-a': ctx('parceiro-a'), 'casa-b': ctx('parceiro-b') };
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    // Só remove o diretório temporário exclusivo que esta suíte criou.
    const absoluto = resolve(pasta);
    if (!absoluto.startsWith(resolve(tmpdir()) + sep) || !basename(absoluto).startsWith('ff-foto-pendente-')) throw new Error('Diretório de teste fora do limite.');
    await rm(absoluto, { recursive: true, force: true });
  });

  it('lê bytes privados sem mover, renovar ou remover a pendente', async () => {
    const caminho = caminhoDaFoto('parceiro-a', token, pasta, true);
    const antes = await stat(caminho);
    const r = await fotoErp(pedido(token));
    expect(r.status).toBe(200);
    privada(r);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('content-length')).toBe(String(PNG_LIMPO.length));
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(PNG_LIMPO);
    expect(new Uint8Array(await readFile(caminho))).toEqual(PNG_LIMPO);
    expect((await stat(caminho)).mtimeMs).toBe(antes.mtimeMs);
    await expect(stat(caminhoDaFoto('parceiro-a', token, pasta))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(parceiroDaSessaoOuNada).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    ['sem sessão', null, 401],
    ['só leitura', ctx('parceiro-a', ['fichas.ver']), 403],
    ['só preços', ctx('parceiro-a', ['precos.ver', 'precos.editar']), 403],
    ['bloqueado', ctx('parceiro-a', ['fichas.editar'], 'Parceiro suspenso.'), 403],
  ] as const)('recusa %s e não devolve dados ou localização', async (_nome, contexto, status) => {
    atual.erp = contexto;
    const r = await fotoErp(pedido(token));
    expect(r.status).toBe(status);
    privada(r);
    const texto = await r.text();
    expect(texto).not.toContain(token);
    expect(texto).not.toContain(pasta);
    expect(texto).not.toContain('image/');
  });

  it('reavalia a permissão após uma leitura aprovada', async () => {
    expect((await fotoErp(pedido(token))).status).toBe(200);
    atual.erp = ctx('parceiro-a', ['fichas.ver']);
    expect((await fotoErp(pedido(token))).status).toBe(403);
    atual.erp = null;
    expect((await fotoErp(pedido(token))).status).toBe(401);
    expect(parceiroDaSessaoOuNada).toHaveBeenCalledTimes(3);
  });

  it('outro parceiro não lê o arquivo, mesmo forjando parceiro na query', async () => {
    atual.erp = ctx('parceiro-b');
    const r = await fotoErp(pedido(token, '&parceiroId=parceiro-a'));
    expect(r.status).toBe(404);
    privada(r);
    expect(await r.text()).not.toMatch(/parceiro-a|pendentes|[A-Z]:\\/);
    expect(new Uint8Array(await readFile(caminhoDaFoto('parceiro-a', token, pasta, true)))).toEqual(PNG_LIMPO);
  });

  it.each(['../foto.png', '..\\foto.png', '/etc/passwd', 'A'.repeat(32) + '.png', '0'.repeat(32) + '.svg', ''])('recusa token fora do formato: %s', async (nome) => {
    const r = await fotoErp(pedido(nome));
    expect(r.status).toBe(404);
    privada(r);
  });

  it('recusa ausência, duplicação do parâmetro e arquivo inexistente', async () => {
    for (const r of [
      await fotoErp(new Request('http://localhost:3106/erp/fichas/fotos')),
      await fotoErp(pedido(token, `&arquivo=${token}`)),
      await fotoErp(pedido('0'.repeat(32) + '.png')),
    ]) {
      expect(r.status).toBe(404);
      privada(r);
    }
  });

  it('não usa o arquivo definitivo como fallback de uma pendente já assumida', async () => {
    const definitivo = await salvarFoto('parceiro-a', JPG_LIMPO, 'jpg');
    const r = await fotoErp(pedido(definitivo));
    expect(r.status).toBe(404);
    expect(new Uint8Array(await readFile(caminhoDaFoto('parceiro-a', definitivo, pasta)))).toEqual(JPG_LIMPO);
  });

  it('pendente com mais de 24 horas não é exibida nem apagada pelo GET', async () => {
    const velha = await salvarFoto('parceiro-a', PNG_LIMPO, 'png', true);
    const caminho = caminhoDaFoto('parceiro-a', velha, pasta, true);
    const tempo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(caminho, tempo, tempo);
    const r = await fotoErp(pedido(velha));
    expect(r.status).toBe(404);
    expect((await stat(caminho)).mtimeMs).toBe(tempo.getTime());
  });

  it('recusa conteúdo vazio, tipo incompatível, diretório e tamanho acima do teto', async () => {
    for (const caso of ['vazio', 'tipo', 'diretorio', 'grande'] as const) {
      const arquivo = `${({ vazio: '1', tipo: '2', diretorio: '3', grande: '4' }[caso]).repeat(32)}.png`;
      const caminho = caminhoDaFoto('parceiro-a', arquivo, pasta, true);
      if (caso === 'diretorio') await mkdir(caminho);
      else await writeFile(caminho, caso === 'vazio' ? new Uint8Array() : caso === 'tipo' ? JPG_LIMPO : new Uint8Array(LIMITE_DA_FOTO + 1));
      const r = await fotoErp(pedido(arquivo));
      expect(r.status).toBe(404);
      privada(r);
    }
  });

  it.each([
    ['jpg', JPG_LIMPO, 'image/jpeg'],
    ['webp', WEBP_LIMPO, 'image/webp'],
  ] as const)('serve %s com o MIME real e os mesmos bytes', async (extensao, bytes, mime) => {
    const arquivo = await salvarFoto('parceiro-a', bytes, extensao, true);
    const r = await fotoErp(pedido(arquivo));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe(mime);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
  });

  it('POST existente continua limpando metadados e o GET recupera somente os bytes limpos', async () => {
    const bytes = jpgComGps();
    const enviada = await enviarErp(new Request('http://localhost:3106/erp/fichas/fotos', {
      method: 'POST', body: new Uint8Array(bytes), headers: { 'content-length': String(bytes.length) },
    }));
    expect(enviada.status).toBe(201);
    const { arquivo } = await enviada.json() as { arquivo: string };
    const r = await fotoErp(pedido(arquivo));
    expect(r.status).toBe(200);
    const lida = new Uint8Array(await r.arrayBuffer());
    expect(temGps(lida)).toBe(false);
    // A orientação útil da imagem é preservada pelo limpador existente.
    expect(lida.length).toBeLessThan(bytes.length);
    expect(lida).toEqual(new Uint8Array(await readFile(caminhoDaFoto('parceiro-a', arquivo, pasta, true))));
  });

  it('N1 resolve o slug novamente e usa apenas o parceiro autorizado', async () => {
    const primeiro = await fotoN1(pedido(token), { params: { slug: 'casa-a' } });
    expect(primeiro.status).toBe(200);
    expect(new Uint8Array(await primeiro.arrayBuffer())).toEqual(PNG_LIMPO);
    expect(parceiroDoNivel1OuNada).toHaveBeenLastCalledWith('casa-a');
    expect((await fotoN1(pedido(token, '&parceiroId=parceiro-a'), { params: { slug: 'casa-b' } })).status).toBe(404);
    expect(parceiroDoNivel1OuNada).toHaveBeenLastCalledWith('casa-b');
    delete atual.n1['casa-a'];
    expect((await fotoN1(pedido(token), { params: { slug: 'casa-a' } })).status).toBe(401);
    expect(parceiroDoNivel1OuNada).toHaveBeenCalledTimes(3);
  });
});
