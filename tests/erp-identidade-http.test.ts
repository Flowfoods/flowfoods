import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import type { SessaoValida } from '@/lib/erp/credenciais';
import type { RecursoDeIdentidade } from '@/lib/erp/identidade';
import { ALCANCE_FLOWFOODS, resolverAlcance } from '@/lib/erp/permissoes';
import { caminhoDaIdentidade, lerImagemIdentidade } from '@/lib/erp/identidade-arquivos';
import { prepararImagemIdentidade } from '@/lib/erp/identidade-imagem';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';
import { JPG_LIMPO, PNG_LIMPO, WEBP_LIMPO, jpgComGps, temGps } from './erp-fotos-teste';

const atual = vi.hoisted(() => ({ recurso: null as RecursoDeIdentidade | null }));
vi.mock('@/lib/erp/identidade', () => ({
  recursoDaLogo: vi.fn(async () => atual.recurso),
  recursoDaFotoPessoal: vi.fn(() => atual.recurso),
  recursoDaFotoNivel1: vi.fn(async () => atual.recurso),
}));
import { recursoDaLogo } from '@/lib/erp/identidade';
import { responderFotoDaPessoa, responderFotoNivel1, responderLogoDaMarca } from '@/lib/erp/identidade-http';

const ORIGEM = 'https://flow.test';
const contexto = (extra: Partial<ContextoDoParceiro> = {}): ContextoDoParceiro => ({
  parceiro: { id: 'parceiro-a' }, alcance: ALCANCE_FLOWFOODS, bloqueio: null, sessao: { userId: 'admin', autorNome: 'Teste' },
  ...extra,
} as ContextoDoParceiro);
function pedido(bytes: Uint8Array = PNG_LIMPO, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request(`${ORIGEM}/erp/perfil/foto`, { method,
    headers: { origin: ORIGEM, 'content-type': 'image/png', 'content-length': String(bytes.length), ...headers },
    ...(method === 'POST' ? { body: new Uint8Array(bytes) } : {}),
  });
}
const sessao = { usuario: { id: 'pessoa-a' } } as SessaoValida;

describe('Identidade · imagem real e limites', () => {
  it.each([JPG_LIMPO, PNG_LIMPO, WEBP_LIMPO])('aceita imagem estática real em cada formato', (bytes) => expect(prepararImagemIdentidade(bytes).ok).toBe(true));
  it('remove GPS antes de armazenar', () => {
    const r = prepararImagemIdentidade(jpgComGps());
    expect(r.ok).toBe(true);
    if (r.ok) expect(temGps(r.bytes)).toBe(false);
  });
  it('recusa assinatura sem imagem, arquivo cortado e formato executável', () => {
    for (const bytes of [new Uint8Array([255, 216, 255, 217]), PNG_LIMPO.slice(0, 25), new TextEncoder().encode('<svg onload="alert(1)"/>')]) expect(prepararImagemIdentidade(bytes).ok).toBe(false);
  });
  it('lê dimensões do arquivo, não de metadados declarados pelo cliente', () => {
    const enorme = JPG_LIMPO.slice();
    const quadro = enorme.findIndex((b, i) => b === 0xff && enorme[i + 1] === 0xc0);
    new DataView(enorme.buffer).setUint16(quadro + 7, 5000);
    const r = prepararImagemIdentidade(enorme);
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining('4096') });
    const zero = PNG_LIMPO.slice();
    new DataView(zero.buffer).setUint32(20, 0);
    expect(prepararImagemIdentidade(zero).ok).toBe(false);
  });
  it('recusa chunk PNG corrompido, RIFF divergente e animação preservada pela limpeza', () => {
    const corrompido = PNG_LIMPO.slice();
    corrompido[30] ^= 1;
    expect(prepararImagemIdentidade(corrompido).ok).toBe(false);
    const riff = WEBP_LIMPO.slice();
    riff[4]++;
    expect(prepararImagemIdentidade(riff).ok).toBe(false);
    // acTL antes do IEND: a limpeza existente mantém esse marcador, e a identidade recusa animação.
    const animacaoPng = new Uint8Array([...PNG_LIMPO.slice(0, -12), 0, 0, 0, 8, 97, 99, 84, 76, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, ...PNG_LIMPO.slice(-12)]);
    expect(prepararImagemIdentidade(animacaoPng).ok).toBe(false);
  });
  it('namespace da marca, pessoa ERP e N1 não se cruzam, nem com o mesmo ID', () => {
    const arq = 'a'.repeat(32) + '.png';
    const caminhos = [
      caminhoDaIdentidade({ tipo: 'marca', parceiroId: 'parceiro-a', id: 'igual' }, arq),
      caminhoDaIdentidade({ tipo: 'marca', parceiroId: 'parceiro-b', id: 'igual' }, arq),
      caminhoDaIdentidade({ tipo: 'pessoa-erp', id: 'igual' }, arq),
      caminhoDaIdentidade({ tipo: 'pessoa-flowfoods', id: 'igual' }, arq),
    ];
    expect(new Set(caminhos).size).toBe(4);
    expect(() => caminhoDaIdentidade({ tipo: 'pessoa-erp', id: '../outro' }, arq)).toThrow();
    expect(() => caminhoDaIdentidade({ tipo: 'pessoa-erp', id: 'pessoa' }, 'https://fora.test/foto.png')).toThrow();
  });
});

describe('Identidade · HTTP privado e upload com teto', () => {
  let pasta: string;
  beforeAll(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'ff-identidade-'));
    vi.stubEnv('ERP_ARQUIVOS_DIR', pasta);
    vi.stubEnv('NEXTAUTH_URL', ORIGEM);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    atual.recurso = { dono: { tipo: 'pessoa-erp', id: crypto.randomUUID() }, arquivo: null,
      trocar: vi.fn(async (novo: string | null) => { atual.recurso = { ...atual.recurso!, arquivo: novo }; return 'ok' as const; }),
    };
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    const absoluto = resolve(pasta);
    if (!absoluto.startsWith(resolve(tmpdir()) + sep) || !basename(absoluto).startsWith('ff-identidade-')) throw new Error('Limpeza fora do diretório temporário.');
    await rm(absoluto, { recursive: true, force: true });
  });

  it('sessão ausente é recusada nas três entradas, antes de ler o corpo', async () => {
    for (const atender of [(r: Request) => responderLogoDaMarca(r, null, 'marca'), (r: Request) => responderFotoDaPessoa(r, null), (r: Request) => responderFotoNivel1(r, null)]) {
      const req = pedido();
      const ler = vi.spyOn(req.body!, 'getReader');
      expect((await atender(req)).status).toBe(401);
      expect(ler).not.toHaveBeenCalled();
    }
  });
  it('não permite editar marca sem lojas.gerir, com alcance de loja ou parceiro bloqueado', async () => {
    const somenteVer = resolverAlcance({ perfilBase: null, perfilProprio: ['lojas.ver'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
    const umaLoja = resolverAlcance({ perfilBase: null, perfilProprio: ['lojas.gerir'], permissoesExtras: [], permissoesRemovidas: [], redeInteira: false, lojaIds: ['loja-a'] });
    for (const ctx of [contexto({ alcance: somenteVer }), contexto({ alcance: umaLoja }), contexto({ bloqueio: 'Parceiro suspenso.' })]) {
      const req = pedido(), ler = vi.spyOn(req.body!, 'getReader');
      expect((await responderLogoDaMarca(req, ctx, 'marca')).status).toBe(403);
      expect(ler).not.toHaveBeenCalled();
    }
    expect(recursoDaLogo).not.toHaveBeenCalled();
  });
  it.each(['https://intruso.test', 'http://flow.test', 'https://flow.test:444', 'null', ''])('recusa origem %s antes de leitura ou exclusão', async (origin) => {
    for (const method of ['POST', 'DELETE']) {
      const req = pedido(PNG_LIMPO, { origin }, method);
      const r = await responderFotoDaPessoa(req, sessao);
      expect(r.status).toBe(403);
      expect(atual.recurso!.trocar).not.toHaveBeenCalled();
    }
  });
  it('recusa Sec-Fetch-Site cross-site e Host forjado', async () => {
    expect((await responderFotoDaPessoa(pedido(PNG_LIMPO, { 'sec-fetch-site': 'cross-site' }), sessao)).status).toBe(403);
    expect((await responderFotoDaPessoa(pedido(PNG_LIMPO, { origin: 'https://intruso.test', 'x-forwarded-host': 'intruso.test' }), sessao)).status).toBe(403);
  });
  it.each([
    [{ 'content-length': '' }, 411], [{ 'content-length': '-1' }, 411],
    [{ 'content-length': String(LIMITE_DA_FOTO + 1) }, 413], [{ 'content-length': '1' }, 400],
    [{ 'content-type': 'text/plain' }, 415], [{ 'content-type': 'image/jpeg' }, 422],
  ])('valida tamanho e tipo do envio %j', async (headers, status) => {
    const r = await responderFotoDaPessoa(pedido(PNG_LIMPO, headers as Record<string, string>), sessao);
    expect(r.status).toBe(status);
    expect(atual.recurso!.trocar).not.toHaveBeenCalled();
  });
  it('corta corpo acima do teto mesmo com tamanho declarado pequeno', async () => {
    const r = await responderFotoDaPessoa(pedido(new Uint8Array(LIMITE_DA_FOTO + 1), { 'content-length': '1' }), sessao);
    expect(r.status).toBe(413);
    expect(atual.recurso!.trocar).not.toHaveBeenCalled();
  });
  it('preserva os bytes limpos, GET privado e remoção sem resíduo', async () => {
    const r = await responderFotoDaPessoa(pedido(jpgComGps(), { 'content-type': 'image/jpeg' }), sessao);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const arquivo = atual.recurso!.arquivo!;
    expect(arquivo).toMatch(/^[0-9a-f]{32}\.jpg$/);
    const get = await responderFotoDaPessoa(new Request(`${ORIGEM}/erp/perfil/foto?usuarioId=outra-pessoa`), sessao);
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toBe('private, no-store');
    expect(get.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(get.headers.get('x-content-type-options')).toBe('nosniff');
    expect(temGps(new Uint8Array(await get.arrayBuffer()))).toBe(false);
    const destino = caminhoDaIdentidade(atual.recurso!.dono, arquivo);
    expect((await responderFotoDaPessoa(pedido(PNG_LIMPO, {}, 'DELETE'), sessao)).status).toBe(200);
    await expect(stat(destino)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await responderFotoDaPessoa(new Request(`${ORIGEM}/erp/perfil/foto`), sessao)).status).toBe(404);
    expect((await responderFotoDaPessoa(pedido(PNG_LIMPO, {}, 'DELETE'), sessao)).status).toBe(200);
  });
  it('falha no banco ou concorrência preserva imagem anterior e limpa a nova', async () => {
    await responderFotoDaPessoa(pedido(), sessao);
    const antiga = atual.recurso!.arquivo!;
    const dono = atual.recurso!.dono;
    // O mock troca o estado como o banco; mantenha o valor anterior para capturar o caminho da pasta.
    for (const falha of ['conflito', 'sessao', 'erro'] as const) {
      atual.recurso = { dono, arquivo: antiga, trocar: vi.fn(async () => { if (falha === 'erro') throw new Error('banco'); return falha; }) };
      const r = await responderFotoDaPessoa(pedido(), sessao);
      expect(r.status).toBe(falha === 'conflito' ? 409 : falha === 'sessao' ? 401 : 500);
      expect(await lerImagemIdentidade(dono, antiga)).toEqual(PNG_LIMPO);
      expect(await readdir(join(caminhoDaIdentidade(dono, antiga), '..'))).toEqual([antiga]);
    }
  });
});
