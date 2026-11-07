import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  mensagemDoAcessoAnalytics, mensagemDaTentativaAnalytics, mensagemDaPendenciaAnalytics,
  type FonteDaSituacaoAnalytics, type ResultadoSituacaoAnalytics, type SituacaoAnalyticsDaLoja,
} from '@/lib/integracoes/core/situacao-analytics-campos';
import { PainelSituacaoAnalytics } from '@/components/erp/telas/integracoes/painel-situacao-analytics';
import { TelaIntegracoes } from '@/components/erp/telas/integracoes/tela-integracoes';
import { InstanteDaIntegracao } from '@/components/erp/telas/integracoes/data-da-situacao';

vi.mock('@/lib/db', () => { throw new Error('UI não consulta banco.'); });
vi.mock('@/lib/integracoes/core/situacao-analytics', () => { throw new Error('UI não importa reader.'); });

const LOJA = { id: 'loja-autorizada', nome: 'Loja Centro', ativa: true };
const fonte = (alteracoes: Partial<FonteDaSituacaoAnalytics> = {}): FonteDaSituacaoAnalytics => ({
  chave: 'CHAVE_TECNICA_NAO_EXIBIR', nome: 'Fonte Centro', marca: 'Marca da casa', vinculada: true, aplicada: true,
  acesso: mensagemDoAcessoAnalytics('ATIVO', true),
  tentativa: { estado: 'FALHA', mensagem: mensagemDaTentativaAnalytics('FALHA', 'servidor'), iniciadaEm: '2026-11-07T13:00:00Z', concluidaEm: '2026-11-07T13:01:00Z', naoAntesDe: null },
  versaoDisponivel: { publicadaEm: '2026-11-06T12:00:00Z' }, revisaoPendente: false, ...alteracoes,
});
const situacao = (alteracoes: Partial<SituacaoAnalyticsDaLoja> = {}): SituacaoAnalyticsDaLoja => ({
  loja: LOJA, dia: '2026-11-05', fuso: 'America/Sao_Paulo', ambiente: 'PRODUCAO', fontes: [fonte()], cobertura: 'disponivel',
  aplicacao: { estado: 'pendente', mensagem: mensagemDaPendenciaAnalytics('PERIODO_FECHADO'), aplicadoEm: '2026-11-06T13:00:00Z', conferidaEm: '2026-11-07T14:00:00Z', mantemAplicacaoAnterior: true },
  podeVerFaturamento: false, ...alteracoes,
});
const resultado = (s = situacao()): ResultadoSituacaoAnalytics => ({ ok: true, lojas: [LOJA], dia: s.dia, ambiente: s.ambiente, situacao: s });
const props = { base: '/erp/integracoes', baseFaturamento: '/erp/faturamento', ontem: '2026-11-06' };
const html = (r = resultado()) => renderToStaticMarkup(createElement(PainelSituacaoAnalytics, { ...props, resultado: r }));

describe('INT-1.8A · situação operacional apresentada sem dinheiro ou ação de coleta', () => {
  it('separa falha recente, publicação anterior, aplicação e conferência com horários de São Paulo', () => {
    const h = html();
    for (const t of ['Última tentativa do dia', 'Não foi possível atualizar', 'Versão disponível', 'Publicada em', 'Aplicado ao faturamento em', 'Última conferência da aplicação em', 'Atualização pendente; aplicação anterior preservada.', '10:01', '09:00', '10:00', '11:00']) expect(h).toContain(t);
    expect(h).toContain('05/11/2026'); expect(h).toContain('Horários de São Paulo');
    expect(h).not.toContain('CHAVE_TECNICA'); expect(h).not.toContain('R$');
    expect(h).not.toContain('Ver o faturamento deste dia');
  });
  it('consulta é GET com labels, dia limitado a ontem e botão nativo, sem action de coleta', () => {
    const h = html();
    expect(h).toContain('method="get"'); expect(h).toContain('action="/erp/integracoes"');
    expect(h).toContain('for="situacao-loja"'); expect(h).toContain('name="loja"'); expect(h).toMatch(/<option(?=[^>]*value="loja-autorizada")(?=[^>]*selected="")[^>]*>/);
    expect(h).toContain('for="situacao-dia"'); expect(h).toContain('type="date"'); expect(h).toContain('max="2026-11-06"'); expect(h).toContain('value="2026-11-05"');
    expect(h.match(/<button/g)).toHaveLength(1); expect(h).toContain('>Consultar</button>');
    expect(h).not.toMatch(/Coletar agora|Ativar|Pausar|\$ACTION/);
  });
  it('acesso ativo não afirma coleta nem aplicação quando não existe leitura', () => {
    const s = situacao({ fontes: [fonte({ tentativa: null, versaoDisponivel: null, aplicada: false })], cobertura: 'sem-leitura',
      aplicacao: { estado: 'sem-aplicacao', mensagem: { rotulo: 'Sem aplicação', explicacao: 'Ainda não há aplicação deste dia.', tom: 'neutro' }, aplicadoEm: null, conferidaEm: null, mantemAplicacaoAnterior: false } });
    const h = html(resultado(s));
    expect(h).toContain('Acesso ativo'); expect(h).toContain('Isso não confirma que o dia já foi lido ou aplicado.');
    expect(h).toContain('Nenhuma tentativa registrada'); expect(h).toContain('Ausência de leitura não confirma ausência de movimento.');
    expect(h).not.toContain('Aplicado ao faturamento em'); expect(h).not.toMatch(/zero vendas|0 pedidos|R\$/);
  });
  it('espera usa o prazo mínimo apenas no estado durável AGUARDANDO', () => {
    const t = { estado: 'AGUARDANDO' as const, mensagem: mensagemDaTentativaAnalytics('AGUARDANDO', 'limite'), iniciadaEm: null, concluidaEm: null, naoAntesDe: '2026-11-08T15:00:00Z' };
    const h = html(resultado(situacao({ fontes: [fonte({ tentativa: t })] })));
    expect(h).toContain('Nova tentativa não antes de'); expect(h).toContain('12:00'); expect(h).toContain('limite mínimo');
    expect(h).toContain('não garante execução naquele horário');
    const falha = html(resultado(situacao({ fontes: [fonte({ tentativa: { ...t, estado: 'FALHA' } })] })));
    expect(falha).not.toContain('Nova tentativa não antes de');
  });
  it('não usa o instante da tentativa concluída como data da versão disponível', () => {
    const h = html(resultado(situacao({ fontes: [fonte({ tentativa: { estado: 'SUCESSO', mensagem: mensagemDaTentativaAnalytics('SUCESSO', null), iniciadaEm: null, concluidaEm: '2026-11-07T18:00:00Z', naoAntesDe: null } })] })));
    expect(h).toContain('15:00'); expect(h).toContain('06/11/2026'); expect(h).toContain('09:00');
    expect(h).toContain('pode ser anterior se o conteúdo não mudou');
  });
  it('fontes múltiplas conservam seus horários, desligamento e revisão pendente', () => {
    const s = situacao({ cobertura: 'parcial', fontes: [fonte(), fonte({ chave: 'segunda', nome: 'Fonte anterior', vinculada: false, acesso: mensagemDoAcessoAnalytics(null, false), versaoDisponivel: { publicadaEm: '2026-11-04T16:00:00Z' }, revisaoPendente: true })] });
    const h = html(resultado(s));
    expect(h).toContain('Ainda faltam leituras deste dia'); expect(h).toContain('Fonte anterior'); expect(h).toContain('Vínculo desligado');
    expect(h).toContain('04/11/2026'); expect(h).toContain('06/11/2026'); expect(h).toContain('não representa toda a loja');
    expect(h).toContain('ela ainda não substitui a versão disponível');
  });
  it.each(['sem-fontes', 'vinculo-ambiguo'] as const)('cobertura %s permanece explícita sem inventar número', cobertura => {
    const h = html(resultado(situacao({ cobertura, fontes: [] })));
    expect(h).toContain(cobertura === 'sem-fontes' ? 'Sem fonte de leitura' : 'identificação das fontes precisa');
    expect(h).not.toContain('Fontes deste dia'); expect(h).not.toMatch(/R\$|0 pedidos|0 vendas/);
  });
  it('TEST fica permanente e nunca oferece link ou afirmação de aplicação produtiva', () => {
    const h = html(resultado(situacao({ ambiente: 'TEST', podeVerFaturamento: true })));
    expect(h).toContain('Ambiente TEST'); expect(h).toContain('somente homologação'); expect(h).toContain('Leituras TEST não são aplicadas ao faturamento.');
    expect(h).not.toContain('href="/erp/faturamento'); expect(h).not.toContain('Aplicado ao faturamento em');
    expect(h).not.toContain('Última conferência da aplicação em');
  });
  it('link financeiro depende do DTO e usa a base ERP/N1 do caller', () => {
    const r = resultado(situacao({ podeVerFaturamento: true }));
    expect(html(r)).toContain('/erp/faturamento/loja-autorizada/2026-11-05');
    const n1 = renderToStaticMarkup(createElement(PainelSituacaoAnalytics, { ...props, base: '/rodolfo/integracoes/casa', baseFaturamento: '/rodolfo/erp/casa/faturamento', resultado: r }));
    expect(n1).toContain('action="/rodolfo/integracoes/casa"'); expect(n1).toContain('/rodolfo/erp/casa/faturamento/loja-autorizada/2026-11-05');
    expect(renderToStaticMarkup(createElement(PainelSituacaoAnalytics, { base: props.base, resultado: r }))).not.toContain('Ver o faturamento deste dia');
  });
  it('sem lojas mantém TEST visível e não cria seletor vazio', () => {
    const h = html({ ok: true, lojas: [], dia: '2026-11-05', ambiente: 'TEST', situacao: null });
    expect(h).toContain('Ambiente TEST'); expect(h).toContain('Nenhuma loja disponível'); expect(h).not.toContain('<form');
  });
  it('falha factual dá caminho de recuperação, sem erro cru nem dados residuais', () => {
    const r = Object.assign({ ok: false as const, motivo: 'leitura-indisponivel' as const, mensagem: 'Tente consultar novamente.' }, { raw: 'SQL_PRIVADO', valorCentavos: 987654321, situacao: situacao() });
    const h = html(r);
    expect(h).toContain('Não foi possível conferir a situação'); expect(h).toContain('Voltar à consulta de situação');
    expect(h).not.toMatch(/SQL_PRIVADO|987654321|Fonte Centro|coleta parada/);
  });
  it('contexto TEST conserva o aviso mesmo quando o leitor não devolve ambiente por erro', () => {
    const h = renderToStaticMarkup(createElement(PainelSituacaoAnalytics, { ...props, teste: true, resultado: { ok: false, motivo: 'leitura-indisponivel', mensagem: 'Tente novamente.' } }));
    expect(h).toContain('Ambiente TEST'); expect(h).toContain('Não foi possível conferir a situação');
    expect(h).not.toContain('href="/erp/faturamento');
  });
  it('não renderiza propriedades financeiras/técnicas extras e escapa nomes', () => {
    const s = situacao({ fontes: [fonte({ nome: '<script>nome</script>' })] });
    Object.assign(s, { valorCentavos: 987654321, pedidos: 998877, raw: 'SQL_PRIVADO', hash: 'HASH_PRIVADO' });
    const h = html(resultado(s));
    expect(h).toContain('&lt;script&gt;nome&lt;/script&gt;'); expect(h).not.toMatch(/<script>|987654321|998877|SQL_PRIVADO|HASH_PRIVADO/);
  });
  it('fallback legado desaparece quando a página fornece painel, inclusive em erro', () => {
    const sem = renderToStaticMarkup(createElement(TelaIntegracoes, { integracoes: [] }));
    expect(sem).toContain('A busca automática dos números ainda não começou.');
    const painel = createElement(PainelSituacaoAnalytics, { ...props, resultado: { ok: false, motivo: 'leitura-indisponivel', mensagem: 'Tente novamente.' } });
    const com = renderToStaticMarkup(createElement(TelaIntegracoes, { integracoes: [], painel }));
    expect(com).not.toContain('A busca automática dos números ainda não começou.'); expect(com).toContain('Não foi possível conferir a situação');
    expect(com).toContain('Lojas do iFood ligadas');
  });
  it('instante inválido ou ausente não derruba o restante nem vira data de hoje', () => {
    expect(renderToStaticMarkup(createElement(InstanteDaIntegracao, { valor: null }))).toContain('Sem registro');
    const h = renderToStaticMarkup(createElement(InstanteDaIntegracao, { valor: 'SQL_PRIVADO' }));
    expect(h).toContain('Data não disponível'); expect(h).not.toContain('SQL_PRIVADO'); expect(h).not.toContain('<time');
  });
});
