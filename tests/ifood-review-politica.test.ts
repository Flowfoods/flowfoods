import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alvoReviewPolitica, congelarReviewPolitica, conteudoReviewPoliticaSchema, novaReviewPoliticaSchema,
  type SnapshotReviewPolitica,
} from '@/lib/integracoes/ifood/review-politica-campos';

const mocks = vi.hoisted(() => ({
  exigirParceiro: vi.fn(), exigirParceiroDaSessao: vi.fn(), exigirPermissao: vi.fn(),
  versionar: vi.fn(), resolver: vi.fn(),
}));
vi.mock('@/lib/erp/contexto', () => ({
  exigirParceiro: mocks.exigirParceiro,
  exigirParceiroDaSessao: mocks.exigirParceiroDaSessao,
  exigirPermissao: mocks.exigirPermissao,
}));
vi.mock('@/lib/integracoes/ifood/review-politica', () => ({
  versionarReviewPolitica: mocks.versionar, resolverReviewPolitica: mocks.resolver,
}));

import { consultarPoliticaReviewDoNivel1, gravarPoliticaReviewDoNivel1 } from '@/lib/integracoes/ifood/review-politica-servidor';

function conteudo() {
  return { tom: '  Respeitoso.\nDireto.  ', assinatura: '', exemplos: ['  Obrigado pelo relato.\nVamos conferir.  '], restricoes: ['Não prometer compensação.'], limiteEditorial: 700 };
}
function entrada() {
  return { lojaId: null, versaoEsperada: 0, conteudo: conteudo(), motivo: '  Primeira política editorial.  ' };
}
function snapshot(): SnapshotReviewPolitica {
  return { capacidade: 'INATIVA', parceiroId: 'parceiro-sintetico', lojaConsultadaId: 'loja-sintetica', origem: 'PARCEIRO', lojaDaPoliticaId: null,
    politicaId: 'politica-sintetica', versaoId: 'versao-sintetica-1', numero: 1, conteudo: conteudo() };
}

describe('Review política: contrato editorial local sem identidade fornecida pelo cliente', () => {
  it('preserva texto, espaços e quebras; não confunde limite editorial com limite de resposta do canal', () => {
    const original = entrada();
    original.conteudo.assinatura = '  Equipe fictícia\n  ';
    const lido = novaReviewPoliticaSchema.parse(original);
    expect(lido).toEqual(original);
    expect(lido.conteudo.limiteEditorial).toBe(700);
    expect(original).toEqual(lido);
  });

  it('aceita ausência explícita de assinatura, exemplos e restrições, sem criar defaults', () => {
    const c = { ...conteudo(), assinatura: '', exemplos: [], restricoes: [] };
    expect(conteudoReviewPoliticaSchema.parse(c)).toEqual(c);
    expect(novaReviewPoliticaSchema.parse(entrada()).lojaId).toBeNull();
    expect(alvoReviewPolitica(null)).toBe('PARCEIRO');
    expect(alvoReviewPolitica('loja-sintetica')).toBe('LOJA:loja-sintetica');
  });

  it.each(['tom', 'assinatura', 'exemplos', 'restricoes', 'limiteEditorial'])('recusa ausência de %s em vez de completar a política', campo => {
    const c: Record<string, unknown> = conteudo();
    delete c[campo];
    expect(conteudoReviewPoliticaSchema.safeParse(c).success).toBe(false);
  });

  it.each(['lojaId', 'versaoEsperada', 'conteudo', 'motivo'])('exige campo %s explicitamente', campo => {
    const e: Record<string, unknown> = entrada();
    delete e[campo];
    expect(novaReviewPoliticaSchema.safeParse(e).success).toBe(false);
  });

  it.each(['', '   ', '\n\r\t', '\u00a0\u2003'])('recusa branco em conteúdo obrigatório, origem e motivo: %j', branco => {
    for (const c of [{ ...conteudo(), tom: branco }, { ...conteudo(), exemplos: [branco] }, { ...conteudo(), restricoes: [branco] }]) {
      expect(conteudoReviewPoliticaSchema.safeParse(c).success).toBe(false);
    }
    expect(novaReviewPoliticaSchema.safeParse({ ...entrada(), lojaId: branco }).success).toBe(false);
    expect(novaReviewPoliticaSchema.safeParse({ ...entrada(), motivo: branco }).success).toBe(false);
  });

  it.each(['autorNome', 'autorUserId', 'userId', 'parceiroId', 'capacidade', 'versaoAtual'])('recusa injeção do campo %s no comando', campo => {
    expect(novaReviewPoliticaSchema.safeParse({ ...entrada(), [campo]: 'forjado' }).success).toBe(false);
  });

  it('recusa campos desconhecidos também no conteúdo, sem removê-los silenciosamente', () => {
    const e = { ...entrada(), conteudo: { ...conteudo(), autorNome: 'forjado' } };
    expect(novaReviewPoliticaSchema.safeParse(e).success).toBe(false);
    expect(conteudoReviewPoliticaSchema.safeParse({ ...conteudo(), futuroCampo: true }).success).toBe(false);
  });

  it.each([0, -1, 1.5, 10_001, NaN, Infinity, '300', null])('recusa limite editorial inválido %j', limiteEditorial => {
    expect(conteudoReviewPoliticaSchema.safeParse({ ...conteudo(), limiteEditorial }).success).toBe(false);
  });

  it.each([-1, 0.5, 2_147_483_647, NaN, Infinity, '0', null])('recusa versão esperada inválida %j', versaoEsperada => {
    expect(novaReviewPoliticaSchema.safeParse({ ...entrada(), versaoEsperada }).success).toBe(false);
  });

  it('aceita as bordas editoriais e a última versão esperada representável pelo contrato', () => {
    for (const limiteEditorial of [1, 10_000]) {
      expect(conteudoReviewPoliticaSchema.parse({ ...conteudo(), limiteEditorial }).limiteEditorial).toBe(limiteEditorial);
    }
    expect(novaReviewPoliticaSchema.parse({ ...entrada(), versaoEsperada: 2_147_483_646 }).versaoEsperada).toBe(2_147_483_646);
  });

  it('recusa textos e listas acima dos tetos locais sem truncar', () => {
    for (const c of [
      { ...conteudo(), tom: 'a'.repeat(2_001) }, { ...conteudo(), assinatura: 'a'.repeat(2_001) },
      { ...conteudo(), exemplos: ['a'.repeat(5_001)] }, { ...conteudo(), restricoes: ['a'.repeat(5_001)] },
      { ...conteudo(), exemplos: Array.from({ length: 21 }, () => 'Exemplo') },
      { ...conteudo(), restricoes: Array.from({ length: 21 }, () => 'Restrição') },
    ]) expect(conteudoReviewPoliticaSchema.safeParse(c).success).toBe(false);
    expect(novaReviewPoliticaSchema.safeParse({ ...entrada(), lojaId: 'a'.repeat(201) }).success).toBe(false);
    expect(novaReviewPoliticaSchema.safeParse({ ...entrada(), motivo: 'a'.repeat(2_001) }).success).toBe(false);
  });

  it.each([null, 'texto', [null], [1], [{}]].map(lista => ({ lista })))('não converte lista inválida $lista em ausência conhecida', ({ lista }) => {
    expect(conteudoReviewPoliticaSchema.safeParse({ ...conteudo(), exemplos: lista }).success).toBe(false);
    expect(conteudoReviewPoliticaSchema.safeParse({ ...conteudo(), restricoes: lista }).success).toBe(false);
  });
});

describe('Review política: snapshot independente e imutável', () => {
  it('congela todas as camadas e preserva exatamente o conteúdo e a origem resolvidos', () => {
    const original = snapshot();
    const salvo = congelarReviewPolitica(original);
    expect(salvo).toEqual(original);
    expect(salvo).not.toBe(original);
    expect(salvo.conteudo).not.toBe(original.conteudo);
    for (const camada of [salvo, salvo.conteudo, salvo.conteudo.exemplos, salvo.conteudo.restricoes]) expect(Object.isFrozen(camada)).toBe(true);
    expect(Reflect.set(salvo, 'numero', 2)).toBe(false);
    expect(Reflect.set(salvo.conteudo, 'tom', 'Alterado')).toBe(false);
    expect(Reflect.set(salvo.conteudo.exemplos, '0', 'Alterado')).toBe(false);
    expect(Reflect.set(salvo.conteudo.restricoes, 'length', 0)).toBe(false);
    expect(salvo).toEqual(original);
  });

  it('alterações posteriores na entrada não modificam o snapshot já resolvido', () => {
    const c = conteudo();
    const original = { ...snapshot(), conteudo: c };
    const esperado = structuredClone(original);
    const salvo = congelarReviewPolitica(original);
    original.numero = 2;
    c.tom = 'Tom posterior';
    c.exemplos[0] = 'Exemplo posterior';
    c.restricoes.push('Restrição posterior');
    expect(salvo).toEqual(esperado);
    expect(salvo.conteudo.exemplos).not.toBe(c.exemplos);
    expect(salvo.conteudo.restricoes).not.toBe(c.restricoes);
  });
});

describe('Review política: fachada interna exige o contexto de Nível 1', () => {
  const cliente = { parceiroId: 'parceiro-servidor', somenteLeitura: false };
  const sessao = { userId: 'usuario-servidor', autorNome: 'Responsável sintético' };
  const contexto = () => ({ cliente, sessao, podeEscrever: true, bloqueio: null, alcance: { nivel: 'FLOWFOODS', permissoes: new Set(['integracao.ver']) } });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.exigirParceiro.mockResolvedValue(contexto());
    mocks.exigirParceiroDaSessao.mockRejectedValue(new Error('Não usar sessão do parceiro.'));
    mocks.exigirPermissao.mockImplementation(() => { throw new Error('integracao.ver não autoriza esta escrita.'); });
  });

  it('obtém contexto pelo slug e entrega ao repositório somente cliente e autoria do servidor', async () => {
    const e = entrada();
    const resultado = { politicaId: 'politica-1', versaoId: 'versao-1', numero: 1, capacidade: 'INATIVA' };
    mocks.versionar.mockResolvedValue(resultado);
    expect(await gravarPoliticaReviewDoNivel1('parceiro-escolhido', e)).toBe(resultado);
    expect(mocks.exigirParceiro).toHaveBeenCalledExactlyOnceWith('parceiro-escolhido');
    expect(mocks.versionar).toHaveBeenCalledExactlyOnceWith(cliente, sessao, e);
    expect(mocks.exigirParceiroDaSessao).not.toHaveBeenCalled();
    expect(mocks.exigirPermissao).not.toHaveBeenCalled();
  });

  it('autoria forjada nunca substitui a sessão; o comando segue para validação estrita do repositório', async () => {
    const e = { ...entrada(), autorNome: 'forjado', autorUserId: 'forjado', parceiroId: 'outro-parceiro' };
    expect(novaReviewPoliticaSchema.safeParse(e).success).toBe(false);
    const erroDeValidacao = new Error('Comando recusado pelo repositório.');
    mocks.versionar.mockRejectedValue(erroDeValidacao);
    await expect(gravarPoliticaReviewDoNivel1('parceiro-escolhido', e)).rejects.toBe(erroDeValidacao);
    expect(mocks.versionar).toHaveBeenCalledExactlyOnceWith(cliente, sessao, e);
  });

  it.each(['gravar', 'consultar'] as const)('nega %s quando o guard Nível 1 recusa; não tenta autorização alternativa', async acao => {
    const recusa = new Error('Sessão Nível 1 ausente.');
    mocks.exigirParceiro.mockRejectedValue(recusa);
    const pedido = acao === 'gravar' ? gravarPoliticaReviewDoNivel1('parceiro', entrada()) : consultarPoliticaReviewDoNivel1('parceiro', 'loja');
    await expect(pedido).rejects.toBe(recusa);
    expect(mocks.versionar).not.toHaveBeenCalled();
    expect(mocks.resolver).not.toHaveBeenCalled();
    expect(mocks.exigirParceiroDaSessao).not.toHaveBeenCalled();
    expect(mocks.exigirPermissao).not.toHaveBeenCalled();
  });

  it.each(['Parceiro suspenso.', null])('bloqueia escrita em contexto somente leitura, preservando motivo %j', async bloqueio => {
    mocks.exigirParceiro.mockResolvedValue({ ...contexto(), cliente: { ...cliente, somenteLeitura: true }, podeEscrever: false, bloqueio });
    await expect(gravarPoliticaReviewDoNivel1('parceiro', entrada())).rejects.toThrow(bloqueio ?? 'Escrita indisponível.');
    expect(mocks.versionar).not.toHaveBeenCalled();
  });

  it('consulta com cliente do contexto, inclusive somente leitura, e preserva ausência como null', async () => {
    const leitura = { ...cliente, somenteLeitura: true };
    mocks.exigirParceiro.mockResolvedValue({ ...contexto(), cliente: leitura, podeEscrever: false, bloqueio: 'Parceiro suspenso.' });
    mocks.resolver.mockResolvedValue(null);
    expect(await consultarPoliticaReviewDoNivel1('parceiro-escolhido', 'loja-escolhida')).toBeNull();
    expect(mocks.exigirParceiro).toHaveBeenCalledExactlyOnceWith('parceiro-escolhido');
    expect(mocks.resolver).toHaveBeenCalledExactlyOnceWith(leitura, 'loja-escolhida');
    expect(mocks.versionar).not.toHaveBeenCalled();
  });

  it('devolve o snapshot sem trocar versão, origem ou capacidade', async () => {
    const resolvido = congelarReviewPolitica(snapshot());
    mocks.resolver.mockResolvedValue(resolvido);
    expect(await consultarPoliticaReviewDoNivel1('parceiro', 'loja')).toBe(resolvido);
  });

  it.each(['gravar', 'consultar'] as const)('propaga falha do repositório em %s sem fallback ou repetição', async acao => {
    const falha = new Error('Conflito ou falha de persistência.');
    mocks.versionar.mockRejectedValue(falha);
    mocks.resolver.mockRejectedValue(falha);
    const pedido = acao === 'gravar' ? gravarPoliticaReviewDoNivel1('parceiro', entrada()) : consultarPoliticaReviewDoNivel1('parceiro', 'loja');
    await expect(pedido).rejects.toBe(falha);
    expect(acao === 'gravar' ? mocks.versionar : mocks.resolver).toHaveBeenCalledTimes(1);
    expect(acao === 'gravar' ? mocks.resolver : mocks.versionar).not.toHaveBeenCalled();
  });
});
