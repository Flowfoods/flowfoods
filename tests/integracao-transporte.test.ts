/**
 * INT-1.3 (decisão 487) — o transporte HTTP de verdade (`transporteFetch`) contra um servidor LOCAL (nada sai para a internet):
 * redirecionamento é recusado (credencial e token não seguem para outro endereço), resposta grande demais é cortada sem ser
 * guardada inteira, tempo esgotado vira falha de rede com o motivo certo.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CORPO_MAXIMO_BYTES, FalhaDeRede, transporteFetch } from '@/lib/integracoes/ifood/transporte';

describe('INT-1.3 · o transporte HTTP (servidor local)', () => {
  let servidor: Server;
  let base = '';
  const vistos: string[] = [];

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      vistos.push(req.url ?? '');
      if (req.url === '/redireciona') {
        res.writeHead(302, { location: '/destino' });
        res.end();
      } else if (req.url === '/grande') {
        res.writeHead(200, { 'content-type': 'application/json' });
        const pedaco = Buffer.alloc(1024 * 1024, 'a');
        let n = 0;
        const escrever = () => {
          while (n < 12) {
            n++;
            if (!res.write(pedaco)) return void res.once('drain', escrever);
          }
          res.end();
        };
        escrever();
      } else if (req.url === '/grande-declarado') {
        res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(CORPO_MAXIMO_BYTES + 1) });
        res.end();
      } else if (req.url === '/lento') {
        setTimeout(() => res.end('{}'), 2000);
      } else {
        res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'req-1' });
        res.end(JSON.stringify({ ok: true }));
      }
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    servidor.closeAllConnections?.();
    await new Promise<void>((r) => servidor.close(() => r()));
  });

  it('resposta normal: status, cabeçalhos em minúsculas e corpo', async () => {
    const r = await transporteFetch({ url: `${base}/ok`, metodo: 'GET', cabecalhos: {}, tempoMaximoMs: 5000 });
    expect(r.status).toBe(200);
    expect(r.cabecalhos['x-request-id']).toBe('req-1');
    expect(JSON.parse(r.corpo)).toEqual({ ok: true });
  });

  it('redirecionamento é recusado: o destino nunca recebe o pedido', async () => {
    await expect(transporteFetch({ url: `${base}/redireciona`, metodo: 'GET', cabecalhos: { Authorization: 'Bearer x' }, tempoMaximoMs: 5000 })).rejects.toBeInstanceOf(FalhaDeRede);
    expect(vistos).not.toContain('/destino');
  });

  it('resposta grande demais (declarada ou não): recusada com motivo próprio, sem guardar tudo', async () => {
    for (const caminho of ['/grande', '/grande-declarado']) {
      const e = await transporteFetch({ url: `${base}${caminho}`, metodo: 'GET', cabecalhos: {}, tempoMaximoMs: 10_000 }).catch((x: unknown) => x);
      expect(e, caminho).toBeInstanceOf(FalhaDeRede);
      expect((e as FalhaDeRede).motivo, caminho).toBe('grande-demais');
    }
  });

  it('tempo esgotado: falha de rede com o motivo "tempo-esgotado"', async () => {
    const e = await transporteFetch({ url: `${base}/lento`, metodo: 'GET', cabecalhos: {}, tempoMaximoMs: 200 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FalhaDeRede);
    expect((e as FalhaDeRede).motivo).toBe('tempo-esgotado');
  });
});
