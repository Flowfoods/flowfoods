import { describe, expect, it } from 'vitest';
import { questionario } from '@/lib/portal/questionario';
import { gerarContextoMd, nomeDoContexto } from '@/lib/portal/contexto';

const q = questionario('valentins')!;
const agora = new Date('2026-09-25T18:30:00-03:00');

const base = {
  nome: "Grupo Valentin's",
  slug: 'valentins',
  q,
  finalizadoEm: null as Date | null,
  ultimaAtividadeEm: agora,
  agora,
};

describe('md de contexto do cliente', () => {
  it('nomeia o arquivo com slug e data de São Paulo', () => {
    expect(nomeDoContexto('valentins', agora)).toBe('contexto-valentins-2026-09-25.md');
  });

  it('abre com as ausências, traz texto como citação e lista arquivos e pendentes', () => {
    const md = gerarContextoMd({
      ...base,
      finalizadoEm: agora,
      respostas: [
        { itemId: 'p1.1', texto: 'Voltar ao faturamento de 2025.\nCozinha sem os sócios no pico.', marcacao: null },
        { itemId: 'a1', texto: null, marcacao: 'NAO_TENHO' },
        { itemId: 'c1', texto: null, marcacao: 'NAO_SEI' },
        { itemId: 'c2', texto: 'segue a planilha', marcacao: 'NAO_SEI' },
      ],
      arquivos: [
        { itemId: 'c2', nomeOriginal: 'Vendas por canal.xlsx', tamanho: 300 * 1024, caminho: '/data/portal/x/C/v.xlsx', criadoEm: agora },
        { itemId: 'p1.1', nomeOriginal: 'Audio p1.1 25-09 18h20.webm', tamanho: 90 * 1024, caminho: '/data/portal/x/P1/a.webm', criadoEm: agora },
      ],
    });

    expect(md).toMatch(/^# Contexto — Grupo Valentin's/);
    expect(md).toContain('Enviado pelo cliente: 25/09/2026');
    expect(md).toContain('Recebidos 2 · Marcados 2 · Pendentes 47 · Total 51');

    // ausências antes das respostas
    expect(md.indexOf('## Ausências declaradas')).toBeLessThan(md.indexOf('## Parte 1'));
    expect(md).toContain('### NÃO TENHO (não existe hoje) · 1');
    expect(md).toContain('- a1 · Razão social e CNPJ de cada loja');
    expect(md).toContain('- c2 · Venda por canal e por marca — mas depois enviou conteúdo');

    // texto vira citação, linha a linha
    expect(md).toContain('> Voltar ao faturamento de 2025.\n> Cozinha sem os sócios no pico.');

    // arquivos com tipo e caminho; áudio pede transcrição
    expect(md).toContain('`Vendas por canal.xlsx` (arquivo, 300 KB');
    expect(md).toContain('`Audio p1.1 25-09 18h20.webm` (áudio — transcrever e colar aqui');
    expect(md).toContain('no VPS em `/data/portal/x/C/v.xlsx`');

    // pendentes listados
    expect(md).toContain('## Pendentes');
    expect(md).toContain('- a2 · Endereço completo dos dois pontos');
    expect(md).not.toContain('- p1.1 · O que precisa acontecer');
  });

  it('sem nada respondido, diz que está tudo pendente e nenhuma ausência', () => {
    const md = gerarContextoMd({ ...base, respostas: [], arquivos: [], ultimaAtividadeEm: null });
    expect(md).toContain('Enviado pelo cliente: ainda não');
    expect(md).toContain('Última atividade: nenhuma');
    expect(md).toContain('Pendentes 51');
    expect(md.match(/^- nenhum$/gm)).toHaveLength(3);
  });
});
