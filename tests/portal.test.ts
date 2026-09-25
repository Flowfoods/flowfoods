import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { acharItem, ehMarcacao, questionario } from '@/lib/portal/questionario';
import { calcularProgresso } from '@/lib/portal/progresso';
import { caminhoDoArquivo, nomeSeguro } from '@/lib/portal/arquivos';
import { montarAviso } from '@/lib/portal/aviso';

const q = questionario('valentins')!;

describe('questionário do Valentin’s', () => {
  it('é o arquivo fechado com o consultor, byte a byte', () => {
    // Mudou o hash? Alguém editou texto do cliente. O conteúdo só muda com um
    // JSON novo vindo do Rodolfo — e aí este hash muda junto, de propósito.
    // 25/09: tirou "ou em áudio" da instrução e o texto de fechamento, e pôs
    // e-mail e telefone de cobrança no bloco A (a6, a7), a pedido dele.
    const bruto = readFileSync(
      path.join(__dirname, '../src/lib/portal/questionarios/valentins.json'),
    );
    expect(createHash('sha256').update(bruto).digest('hex')).toBe(
      '5c0eee0335c18c1f3f5173687a227eb9384eb71b13d88c64fbddec2600f03932',
    );
  });

  it('tem 25 itens de arquivos em 5 blocos e 26 perguntas em 6 blocos', () => {
    const arquivos = q.blocos.filter((b) => b.tipo === 'ARQUIVO');
    const perguntas = q.blocos.filter((b) => b.tipo === 'PERGUNTA');
    expect(arquivos.map((b) => b.bloco)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(arquivos.flatMap((b) => b.itens)).toHaveLength(25);
    expect(perguntas.map((b) => b.bloco)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(perguntas.flatMap((b) => b.itens)).toHaveLength(26);
  });

  it('não tem id repetido — o autosave usa o id como chave', () => {
    const ids = q.itens.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('entrega o texto sem edição', () => {
    expect(acharItem(q, 'p1.2')?.rotulo).toBe('Qual é a maior dor hoje?');
    expect(acharItem(q, 'a3')?.detalhe).toBe('quem acompanha o plano do lado de vocês');
    expect(q.abertura.tagline).toBe('Gastronomia que flui. Negócio que cresce.');
  });

  it('aceita só as três marcações', () => {
    expect(ehMarcacao('NAO_TENHO')).toBe(true);
    expect(ehMarcacao('NAO_SEI')).toBe(true);
    expect(ehMarcacao('AGORA_NAO')).toBe(true);
    expect(ehMarcacao('TALVEZ')).toBe(false);
    expect(ehMarcacao(null)).toBe(false);
  });

  it('questionário inexistente devolve null, não quebra', () => {
    expect(questionario('nao-existe')).toBeNull();
  });
});

describe('calcularProgresso', () => {
  it('conta tudo como pendente quando nada foi respondido', () => {
    const p = calcularProgresso(q.itens, [], []);
    expect(p).toMatchObject({ total: 51, recebidos: 0, marcados: 0, pendentes: 51 });
  });

  it('conteúdo vence marcação: marcou NÃO SEI e depois mandou o arquivo', () => {
    const p = calcularProgresso(
      q.itens,
      [{ itemId: 'c1', texto: null, marcacao: 'NAO_SEI' }],
      [{ itemId: 'c1' }],
    );
    const c1 = p.situacoes.find((s) => s.item.id === 'c1')!;
    expect(c1.estado).toBe('RECEBIDO');
    expect(p.porMarcacao.NAO_SEI).toBe(0);
  });

  it('texto só com espaço não conta como resposta', () => {
    const p = calcularProgresso(q.itens, [{ itemId: 'p1.1', texto: '   \n', marcacao: null }], []);
    expect(p.pendentes).toBe(51);
  });

  it('separa recebido, marcado e pendente e conta cada marcação', () => {
    const p = calcularProgresso(
      q.itens,
      [
        { itemId: 'p1.1', texto: 'Voltar a vender o que vendia', marcacao: null },
        { itemId: 'a1', texto: null, marcacao: 'NAO_TENHO' },
        { itemId: 'b4', texto: '', marcacao: 'AGORA_NAO' },
      ],
      [{ itemId: 'e3' }, { itemId: 'e3' }],
    );
    expect(p).toMatchObject({ recebidos: 2, marcados: 2, pendentes: 47 });
    expect(p.porMarcacao).toEqual({ NAO_TENHO: 1, NAO_SEI: 0, AGORA_NAO: 1 });
    expect(p.situacoes.find((s) => s.item.id === 'e3')!.arquivos).toBe(2);
  });
});

describe('arquivos no disco', () => {
  const token = 'a'.repeat(32);
  const agora = DateTime.fromISO('2026-09-25T15:04:05', { zone: 'America/Sao_Paulo' });

  it('grava em <base>/<token>/<bloco>/<carimbo>-<nome>', () => {
    expect(
      caminhoDoArquivo({ base: '/data/portal', token, bloco: 'C', agora, nomeOriginal: 'Faturamento 2025.xlsx' }),
    ).toBe(`/data/portal/${token}/C/20260925-150405-Faturamento-2025.xlsx`);
  });

  it('o carimbo é hora de São Paulo, mesmo com o servidor em UTC', () => {
    const utc = agora.setZone('UTC');
    expect(caminhoDoArquivo({ base: '/b', token, bloco: 'A', agora: utc, nomeOriginal: 'x.pdf' })).toContain(
      '20260925-150405',
    );
  });

  it('nome com caminho não escapa da pasta do cliente', () => {
    for (const nome of ['../../etc/passwd', '..\\..\\win.ini', '/etc/shadow', '..', '.env']) {
      const c = caminhoDoArquivo({ base: '/data/portal', token, bloco: 'A', agora, nomeOriginal: nome });
      expect(c.startsWith(`/data/portal/${token}/A/`), `falhou para "${nome}"`).toBe(true);
      expect(c).not.toContain('..');
    }
  });

  it('tira acento e caractere estranho, mas mantém a extensão', () => {
    expect(nomeSeguro('Cardápio Valentin’s (versão final).pdf')).toBe('Cardapio-Valentin-s-versao-final-.pdf');
    expect(nomeSeguro('')).toBe('arquivo');
  });

  it('recusa token e bloco fora do formato — eles também vão para o caminho', () => {
    expect(() =>
      caminhoDoArquivo({ base: '/b', token: '../x', bloco: 'A', agora, nomeOriginal: 'a' }),
    ).toThrow();
    expect(() =>
      caminhoDoArquivo({ base: '/b', token, bloco: '../A', agora, nomeOriginal: 'a' }),
    ).toThrow();
  });
});

describe('aviso no WhatsApp', () => {
  it('resume recebidos, marcados por tipo e pendentes, com o link do painel', () => {
    const p = calcularProgresso(
      q.itens,
      [
        { itemId: 'p1.1', texto: 'x', marcacao: null },
        { itemId: 'a1', texto: null, marcacao: 'NAO_TENHO' },
      ],
      [],
    );
    const texto = montarAviso({
      cliente: "Grupo Valentin's",
      progresso: p,
      linkPainel: 'https://consultoriaflowfoods.com.br/rodolfo/portal/abc',
    });
    expect(texto).toContain("Grupo Valentin's enviou o formulário.");
    expect(texto).toContain('Recebidos: 1 de 51');
    expect(texto).toContain('Marcados: 1 (NÃO TENHO: 1)');
    expect(texto).toContain('Pendentes: 49');
    expect(texto).toContain('https://consultoriaflowfoods.com.br/rodolfo/portal/abc');
  });
});
