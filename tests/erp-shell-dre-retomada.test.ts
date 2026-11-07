/** Retomada 06/11: render do shell e da mesma DRE em celular/desktop, sem banco. Não substitui QA no navegador. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/erp/dre',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock('@/components/erp/shell/acoes', () => ({ acaoGuardarMenu: async () => {}, acaoTrocarTema: async (tema: string) => tema }));
vi.mock('@/lib/db', () => { throw new Error('Teste de render não acessa banco.'); });

import { Shell } from '@/components/erp/shell/Shell';
import type { PropsDoShell } from '@/components/erp/shell/tipos';
import { TelaDoDre } from '@/components/erp/telas/dre/dre';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { montarDre } from '@/lib/erp/dre-campos';
import { CODIGO, planoEfetivo } from '@/lib/erp/dre-plano';
import type { DreDoPeriodo } from '@/lib/erp/dre';
import { farolDoDre } from '@/lib/erp/farol-dre-campos';
import { COR, navegacaoDoParceiro } from '@/lib/erp/modulos';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { formatarDinheiro } from '@/lib/erp/unidades';

const sp = (s: string) => s.replace(/&nbsp;| | /g, ' ');
const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });

describe('Shell · navegação lateral e ajuda sem menu superior duplicado', () => {
  it('preserva lateral, entrada do menu móvel, contexto, ajuda e ação da página', () => {
    const props: PropsDoShell = {
      navegacao: navegacaoDoParceiro(dono, NENHUM_MODULO_LIBERADO), contexto: 'Parceiro de teste', usuario: { nome: 'Pessoa de teste', papel: 'Dono' },
      tema: 'claro', menuRecolhido: false, versao: 'teste', notificacoes: [], links: [], sair: async () => {},
      visao: { modo: 'parceiro', opcoes: [], valor: null, escolher: async () => ({ ok: true }) },
      ajuda: {
        entradas: [{ chave: 'dre', titulo: 'DRE', versao: 1, area: 'dre', recolhida: false, rotas: ['dre'], aula: ['Leia o resultado do período.'], secoes: [], pontos: [] }],
        preferencia: null, acoes: null, hoje: 20000, contato: { url: '#contato', display: 'Contato de teste' },
      },
    };
    const children = createElement(PageHeader, {
      titulo: 'DRE de teste', icone: 'dre', cor: COR.dre, subtitulo: 'Período de teste', acao: createElement('a', { href: '/erp/dre/despesas/nova' }, 'Lançar despesa'),
    });
    const h = renderToStaticMarkup(createElement(Shell, { props, children }));
    expect(h).not.toContain('aria-label="Seções de Faturamento e DRE"');
    expect(h).toContain('href="/erp/faturamento"');
    expect(h).toContain('href="/erp/dre/despesas"');
    expect(h).toContain('aria-controls="ff-gaveta"');
    expect(h).toContain('aria-label="Ajuda desta tela"');
    expect(h).toContain('Como funciona esta tela');
    expect(h).toContain('Voltar para Áreas da Rede');
    expect(h).toContain('DRE de teste');
    expect(h).toContain('Período de teste');
    expect(h).toContain('href="/erp/dre/despesas/nova"');
  });
});

const loja = { id: 'lojateste', nome: 'Loja de teste', ativa: true, canais: ['LOJA' as const] };
const pode = { lancarDespesa: true, verFaturamento: true, verPrecos: true, veRede: true };

/** Fixture sintética usa a conta canônica; o teste não inventa outra fórmula para o resultado. */
function cenario(receita: number, compras: number | null): DreDoPeriodo {
  const escopo = { tipo: 'rede' } as const;
  const cmv = { lojas: [{ lojaId: loja.id, lojaNome: loja.nome, compraCentavos: compras, real: null, motivoSemReal: 'estoque não aberto' }], parcial: false };
  const resultado = montarDre({ escopo, plano: planoEfetivo([]), receitas: [{ lojaId: loja.id, canal: 'LOJA', valorCentavos: receita }], despesas: [], taxaIfood: null, cmv });
  const final = resultado.linhas.find((l) => l.codigo === CODIGO.resultado)!;
  const farol = farolDoDre({ linhas: resultado.linhas, metas: {}, faltasDeFaturamento: 0, recorrentes: [], receitaNaoApurada: false });
  return {
    periodo: { inicio: '2026-09-01', fim: '2026-09-30', nome: 'Setembro de 2026' }, hoje: '2026-11-06', ate: '2026-09-30',
    emCurso: false, encerrado: true, diasDoPeriodo: 30, diaDeHoje: null, diasApurados: 30, status: null, escopo, resultado,
    porLoja: [{ loja, receitaBrutaCentavos: receita, resultadoCentavos: final.valorCentavos!, resultadoBp: final.percentualBp, semContar: final.semContar, faltas: 0 }],
    faltas: { total: 0 }, faltaLancar: [], taxaConfigurada: false, anterior: null, proximo: null, lojasDoEscopo: [loja], metas: {}, anoPassado: null,
    fechamento: null, cmv: { antigo: false, painel: null }, cmvDasLojas: cmv, metaDoCmvDaLoja: null, lojasComMetaPropria: [], trocasDeCusto: [], farol, farolAntigo: false, canais: [],
  };
}

function porLoja(d: DreDoPeriodo) {
  const html = sp(renderToStaticMarkup(createElement(TelaDoDre, { d, base: '/erp/dre', raiz: '/erp', pode, bloqueio: null })));
  const painel = html.slice(html.indexOf('>Por loja</h2>'));
  const celular = painel.match(/<ul class="divide-y divide-linha sm:hidden">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  const desktop = painel.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return { html, painel, celular, desktop };
}

describe('DRE · resultado por loja no celular', () => {
  it('receita zero com prejuízo mostra o mesmo valor negativo do desktop e mantém percentual sem base', () => {
    const d = cenario(0, 150_000);
    expect(d.porLoja![0]).toMatchObject({ resultadoCentavos: -150_000, resultadoBp: null });
    const { celular, desktop } = porLoja(d);
    const valor = sp(formatarDinheiro(-150_000));
    expect(celular).toContain(valor);
    expect(desktop).toContain(valor);
    expect(celular).toContain('text-erro');
    expect(celular).toContain('Receita sem faturamento');
    expect(celular).not.toContain('%');
  });

  it('receita e resultado zerados continuam sem inventar valor ou percentual', () => {
    const { celular, desktop } = porLoja(cenario(0, 0));
    expect(celular).toContain('>—</span>');
    expect(desktop).toContain('>—</span>');
    expect(celular).toContain('Receita sem faturamento');
    expect(celular).not.toMatch(/R\$|%|text-erro/);
  });

  it('receita positiva mantém resultado e percentual iguais nas duas apresentações', () => {
    const d = cenario(200_000, 50_000);
    expect(d.porLoja![0]).toMatchObject({ resultadoCentavos: 150_000, resultadoBp: 7500 });
    const { celular, desktop } = porLoja(d);
    for (const h of [celular, desktop]) {
      expect(h).toContain(sp(formatarDinheiro(150_000)));
      expect(h).toContain('75');
      expect(h).toContain('%');
    }
    expect(celular).not.toContain('text-erro');
  });

  it('base de CMV ausente permanece identificada, sem transformar ausência em custo zero', () => {
    const d = cenario(0, null);
    expect(d.resultado.linhas.find((l) => l.tipo === 'cmv')!.valorCentavos).toBeNull();
    expect(d.porLoja![0].semContar.length).toBeGreaterThan(0);
    const { celular, painel } = porLoja(d);
    expect(celular).not.toMatch(/R\$|%/);
    expect(painel).toContain('sem contar');
    expect(painel).toContain('CMV');
  });

  it('sem loja apurada mostra o estado vazio, sem linha nem resultado fictício', () => {
    const d = cenario(0, null);
    d.porLoja = [];
    const { painel, celular, desktop } = porLoja(d);
    expect(painel).toContain('Nenhuma loja com movimento no período.');
    expect(celular).toBe('');
    expect(desktop).toBe('');
  });
});
