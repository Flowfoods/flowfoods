import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { lerRegistrosCsvGzip } from '../src/lib/integracoes/ifood/financial-v3-csv';

async function ler(texto: string) {
  const registros: (readonly string[])[] = [];
  await lerRegistrosCsvGzip(gzipSync(texto), campos => registros.push(campos));
  return registros;
}

describe('CSV.gz mensal de conciliação', () => {
  it('interpreta BOM, CRLF e aspas escapadas, preservando quebras internas e campos vazios', async () => {
    const csv = '\uFEFFa;b;c\r\n1;"ação; ""teste""\r\ncomplemento";\r\n;fim;';
    expect(await ler(csv)).toEqual([['a', 'b', 'c'], ['1', 'ação; "teste"\r\ncomplemento', ''], ['', 'fim', '']]);
  });

  it('mantém registros internos vazios e ignora somente o terminador final', async () => {
    expect(await ler('a;b\n\n1;2\n')).toEqual([['a', 'b'], [''], ['1', '2']]);
  });

  it.each(['', 'a\0b', 'a;b\n"ab', 'a;b\na"b;c', 'a;b\n"ab"x;c'])('recusa sintaxe inválida %#', async texto => {
    await expect(ler(texto)).rejects.toThrow('CSV de conciliação inválido');
  });

  it('recusa gzip ausente, truncado ou com CRC incorreto antes de entregar registros', async () => {
    const valido = gzipSync('a;b\n1;2');
    const crcInvalido = Buffer.from(valido);
    crcInvalido[crcInvalido.length - 8] ^= 1;
    const receber = vi.fn();
    for (const bytes of [Buffer.from('a;b'), valido.subarray(0, -5), crcInvalido]) {
      await expect(lerRegistrosCsvGzip(bytes, receber)).rejects.toThrow('Gzip de conciliação inválido');
    }
    expect(receber).not.toHaveBeenCalled();
  });

  it('recusa sequências UTF-8 inválidas', async () => {
    const bytes = gzipSync(Buffer.from([0x61, 0x3b, 0xff]));
    await expect(lerRegistrosCsvGzip(bytes, vi.fn())).rejects.toThrow('UTF-8 inválida');
  });

  it('aceita membros gzip contíguos e rejeita um sufixo que o descompactador tiver ignorado', async () => {
    const inicio = gzipSync('a;b\n1;2');
    const fim = gzipSync('\n3;4');
    const registros: (readonly string[])[] = [];
    await lerRegistrosCsvGzip(Buffer.concat([inicio, fim]), campos => registros.push(campos));
    expect(registros).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
    const receber = vi.fn();
    await expect(lerRegistrosCsvGzip(Buffer.concat([inicio, Buffer.from([0]), fim]), receber)).rejects.toThrow('Gzip');
    expect(receber).not.toHaveBeenCalled();
  });

  it('um erro no fim do CSV impede a entrega inclusive dos primeiros registros válidos', async () => {
    for (const fim of ['3;"aspas abertas', ';'.repeat(128), 'x'.repeat(65_537)]) {
      const receber = vi.fn();
      await expect(lerRegistrosCsvGzip(gzipSync('a;b\n1;2\n' + fim), receber)).rejects.toThrow();
      expect(receber).not.toHaveBeenCalled();
    }
  });

  it('limita o volume antes e durante a descompactação', async () => {
    const grande = Buffer.alloc(2 * 1024 * 1024 + 1);
    grande.set([0x1f, 0x8b]);
    const receber = vi.fn();
    for (const bytes of [grande, gzipSync(Buffer.alloc(8 * 1024 * 1024 + 1, 65))]) {
      await expect(lerRegistrosCsvGzip(bytes, receber)).rejects.toThrow('Limite local');
    }
    expect(receber).not.toHaveBeenCalled();
  });

  it('limita campos, quantidade de colunas e registros', async () => {
    for (const texto of ['x'.repeat(65_537), ';'.repeat(128), 'x\n'.repeat(100_002)]) {
      await expect(lerRegistrosCsvGzip(gzipSync(texto), () => {})).rejects.toThrow('Limite local');
    }
  });
});
