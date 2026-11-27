import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const caso = vi.hoisted(() => ({
  ctx: {
    parceiro: { id: 'parceiro-servidor', slug: 'casa-de-teste', nome: 'Casa de teste', homologacaoDeIntegracao: false },
    cliente: { parceiroId: 'parceiro-servidor' },
    sessao: { userId: 'nivel-1', autorNome: 'Operador de teste' },
    alcance: { nivel: 'LOJA', lojas: ['loja-1'], permissoes: new Set<string>() },
    podeEscrever: true,
    bloqueio: null as string | null,
  },
  ler: vi.fn(),
  sessaoBarney: vi.fn(),
  mudar: vi.fn(),
  recorte: vi.fn(),
  opcoes: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/erp/contexto', () => ({
  exigirParceiroDaSessao: async () => caso.ctx,
  exigirParceiro: async (slug: string) => { caso.sessaoBarney(slug); return caso.ctx; },
  exigirPermissaoNaPagina: (_ctx: unknown, permissao: string) => {
    if (!caso.ctx.alcance.permissoes.has(permissao)) throw new Error(`SEM_ACESSO ${permissao}`);
  },
}));
vi.mock('@/lib/erp/liberacao', () => ({
  mudarLiberacao: (...args: unknown[]) => caso.mudar(...args),
  recorteDaConsultoria: (...args: unknown[]) => caso.recorte(...args),
  opcoesDeRecorteDaConsultoria: (...args: unknown[]) => caso.opcoes(...args),
}));
vi.mock('@/lib/integracoes/core/consultoria-delivery', () => ({ lerConsultoriaDelivery: (...args: unknown[]) => caso.ler(...args) }));

import ConsultoriaNoERP from '@/app/erp/consultoria-delivery/page';
import ConsultoriaNoBarney from '@/app/rodolfo/(painel)/erp/[slug]/consultoria-delivery/page';
import { acaoLiberarConsultoria, acaoPausarConsultoria } from '@/app/rodolfo/(painel)/erp/[slug]/consultoria-delivery/actions';

beforeEach(() => {
  vi.clearAllMocks();
  caso.ctx.alcance.permissoes = new Set(['consultoria.ver']);
  caso.ctx.parceiro.homologacaoDeIntegracao = false;
  caso.ctx.podeEscrever = true;
  caso.ctx.bloqueio = null;
  caso.ler.mockResolvedValue({ ok: false, motivo: 'consulta', mensagem: 'Fonte em preparação.' });
  caso.recorte.mockResolvedValue(null);
  caso.opcoes.mockResolvedValue([{ id: 'conexao-autorizada', rotulo: 'Loja · Marca' }]);
  caso.mudar.mockResolvedValue({ ok: true, mudou: true, liberado: true });
});

it('o ERP bloqueia URL direta sem permissão e volta ao hub se o módulo estiver bloqueado', async () => {
  caso.ctx.alcance.permissoes.clear();
  await expect(ConsultoriaNoERP({})).rejects.toThrow('SEM_ACESSO consultoria.ver');
  expect(caso.ler).not.toHaveBeenCalled();
  caso.ctx.alcance.permissoes.add('consultoria.ver');
  caso.ler.mockResolvedValue({ ok: false, motivo: 'bloqueada', mensagem: 'Bloqueado.' });
  await expect(ConsultoriaNoERP({})).rejects.toThrow('REDIRECT /erp?sem-modulo=consultoria-de-delivery');
});

it('o ERP encaminha a seleção explícita e ignora parceiro, ambiente e dia vindos da URL', async () => {
  await ConsultoriaNoERP({ searchParams: Promise.resolve({
    parceiroId: 'outro', dia: '2026-01-01', homologacaoDeIntegracao: 'true', fonte: 'fonte-1',
  }) });
  expect(caso.ler).toHaveBeenCalledExactlyOnceWith(caso.ctx.cliente, caso.ctx.alcance,
    { parceiroId: 'parceiro-servidor', homologacaoDeIntegracao: false }, { lojaId: undefined, fonteId: 'fonte-1' });
});

it('o Barney mantém o contexto TEST explícito e a administração na rota de nível 1', async () => {
  caso.ctx.parceiro.homologacaoDeIntegracao = true;
  const html = renderToStaticMarkup(await ConsultoriaNoBarney({ params: Promise.resolve({ slug: 'apelido-da-rota' }) }));
  expect(caso.sessaoBarney).toHaveBeenCalledExactlyOnceWith('apelido-da-rota');
  expect(html).toContain('Prévia por loja · TEST');
  expect(html).toContain('Liberar prévia');
  expect(html).toContain('href="/rodolfo/erp/casa-de-teste"');
  const erp = renderToStaticMarkup(await ConsultoriaNoERP({}));
  expect(erp).not.toContain('Liberar prévia');
});

it('a ação de nível 1 exige uma origem, conserva o ambiente autenticado e recusa escrita em parceiro bloqueado', async () => {
  const form = new FormData();
  expect(await acaoLiberarConsultoria('apelido-da-rota', null, form)).toMatchObject({ ok: false });
  expect(caso.mudar).not.toHaveBeenCalled();
  caso.sessaoBarney.mockClear();
  form.set('conexao', 'conexao-autorizada');
  form.set('ambiente', 'TEST');
  expect(await acaoLiberarConsultoria('apelido-da-rota', null, form)).toMatchObject({ ok: true, vez: 1 });
  expect(caso.sessaoBarney).toHaveBeenCalledExactlyOnceWith('apelido-da-rota');
  expect(caso.mudar).toHaveBeenCalledExactlyOnceWith(caso.ctx.cliente, 'consultoria-de-delivery', true, 'Operador de teste', {
    conexaoId: 'conexao-autorizada', ambiente: 'PRODUCAO',
  });
  caso.mudar.mockClear();
  caso.ctx.podeEscrever = false;
  expect(await acaoLiberarConsultoria('apelido-da-rota', null, form)).toMatchObject({ ok: false });
  expect(await acaoPausarConsultoria('apelido-da-rota')).toMatchObject({ ok: false });
  expect(caso.mudar).not.toHaveBeenCalled();
});

it('identifica a última publicação do dia e mantém a revisão como parcial na tela', async () => {
  const dois = { estado: 'disponivel', valor: '2' };
  caso.ler.mockResolvedValue({
    ok: true, dia: '2026-11-26', ambiente: 'PRODUCAO', loja: { id: 'loja-1', nome: 'Loja de teste' },
    fonte: { chave: 'fonte-1', nome: 'Origem de teste', marca: 'Marca de teste' },
    visaoGeral: {
      estado: 'parcial', mensagem: 'A revisão deste dia está pendente.', publicadaEm: '2026-11-27T12:15:00Z',
      revisaoPendente: true, ultimaLeituraAnterior: null, cobertura: { fontesCobertas: 1, fontesEsperadas: 1 },
      indicadores: {
        gmvConcluido: { estado: 'disponivel', valor: '1500' }, pedidos: dois, concluidos: dois,
        cancelados: { estado: 'disponivel', valor: '0' },
        ticketConcluidos: { estado: 'disponivel', valor: { numerador: '1500', denominador: '2' } },
      },
    },
  });
  const html = renderToStaticMarkup(await ConsultoriaNoERP({}));
  expect(html).toContain('>Parcial<');
  expect(html).toContain('Última publicação do dia');
  expect(html).toContain('A revisão deste dia está pendente.');
  expect(html).toContain('R$ 15,00');
  expect(html).not.toContain('>Disponível<');
});
