/**
 * ERP L.4 · as vagas do relatório pesado (sem banco): o limite de simultâneos, a fila que passa a vaga adiante, a desistência com a
 * frase amigável sem deixar vaga vazada, e a liberação que só vale uma vez.
 */
import { describe, expect, it } from 'vitest';
import { criarVagas, ErroDeRelatorio } from '@/lib/erp/vagas-de-relatorio';

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ERP L.4 · vagas do relatório pesado', () => {
  it('só deixa rodar o número de vagas; a terceira espera e entra quando uma sai', async () => {
    const v = criarVagas(2, 2_000);
    const a = await v.pegar();
    await v.pegar();
    expect(v.emUso).toBe(2);
    let entrou = false;
    const terceira = v.pegar().then((l) => {
      entrou = true;
      return l;
    });
    await dorme(30);
    expect(entrou).toBe(false);
    a();
    const c = await terceira;
    expect(entrou).toBe(true);
    // A vaga passou direto para quem esperava: continuam duas em uso.
    expect(v.emUso).toBe(2);
    c();
    expect(v.emUso).toBe(1);
  });

  it('desiste com a frase amigável quando a espera passa do limite, sem vazar vaga', async () => {
    const v = criarVagas(1, 40);
    const a = await v.pegar();
    const erro = await v.pegar().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeRelatorio);
    expect(erro.motivo).toBe('ocupado');
    expect(erro.message).toBe('Há outro relatório grande rodando. Tente em instantes.');
    a();
    expect(v.emUso).toBe(0);
    const b = await v.pegar();
    expect(v.emUso).toBe(1);
    b();
  });

  it('liberar duas vezes não libera duas vagas', async () => {
    const v = criarVagas(2, 100);
    const a = await v.pegar();
    await v.pegar();
    a();
    a();
    expect(v.emUso).toBe(1);
  });

  it('dez pedidos juntos nunca passam de três ao mesmo tempo, e todos terminam', async () => {
    const v = criarVagas(3, 5_000);
    let agora = 0;
    let maximo = 0;
    await Promise.all(
      Array.from({ length: 10 }, async () => {
        const liberar = await v.pegar();
        agora += 1;
        maximo = Math.max(maximo, agora);
        await dorme(15);
        agora -= 1;
        liberar();
      }),
    );
    expect(maximo).toBe(3);
    expect(v.emUso).toBe(0);
  });

  it('a frase de "grande demais" diz o que fazer', () => {
    const e = new ErroDeRelatorio('tempo');
    expect(e.message).toBe('O relatório ficou grande demais. Diminua o período ou escolha menos lojas.');
    expect(e.titulo).toBe('O relatório ficou grande demais.');
  });
});
