/** Identidade visual usa Marca pelo portão; fotos pessoais ficam nos respectivos cadastros de pessoa. */
import { prisma } from '@/lib/db';
import type { ContextoDoParceiro, SessaoErp } from './contexto-base';
import { trocarFotoPessoalDaSessao, type SessaoValida } from './credenciais';
import type { DonoDaImagem } from './identidade-arquivos';
import type { ClienteDoParceiro } from './tenant';

export interface RecursoDeIdentidade {
  dono: DonoDaImagem;
  arquivo: string | null;
  trocar(novo: string | null): Promise<'ok' | 'sessao' | 'conflito'>;
}

/** Marca é da rede, conforme listarEstrutura; não concede acesso a lojas ou módulos. */
export async function listarMarcasComIdentidade(cliente: ClienteDoParceiro) {
  return cliente.marca.findMany({ where: { ativa: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, logoArquivo: true } });
}

export async function obterFotoPessoalNivel1(sessao: SessaoErp): Promise<string | null> {
  const pessoa = await prisma.user.findUnique({ where: { id: sessao.userId }, select: { fotoArquivo: true } });
  return pessoa?.fotoArquivo ?? null;
}

export async function recursoDaLogo(ctx: ContextoDoParceiro, marcaId: string): Promise<RecursoDeIdentidade | null> {
  const marca = await ctx.cliente.marca.findFirst({ where: { id: marcaId }, select: { id: true, logoArquivo: true } });
  if (!marca) return null;
  return {
    dono: { tipo: 'marca', parceiroId: ctx.parceiro.id, id: marca.id }, arquivo: marca.logoArquivo,
    trocar: (novo) => ctx.cliente.transacao(async (tx) => {
      const r = await tx.marca.updateMany({ where: { id: marca.id, logoArquivo: marca.logoArquivo }, data: { logoArquivo: novo } });
      if (r.count !== 1) return 'conflito';
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'Marca', entidadeId: marca.id, acao: 'ALTEROU', autorNome: ctx.sessao.autorNome,
          antes: { temLogo: marca.logoArquivo !== null }, depois: { temLogo: novo !== null } },
      });
      return 'ok';
    }),
  };
}

export function recursoDaFotoPessoal(sessao: SessaoValida): RecursoDeIdentidade {
  const arquivo = sessao.usuario.fotoArquivo ?? null;
  return {
    dono: { tipo: 'pessoa-erp', id: sessao.usuario.id }, arquivo,
    trocar: (novo) => trocarFotoPessoalDaSessao(sessao, arquivo, novo),
  };
}

export async function recursoDaFotoNivel1(sessao: SessaoErp): Promise<RecursoDeIdentidade | null> {
  const pessoa = await prisma.user.findUnique({ where: { id: sessao.userId }, select: { id: true, fotoArquivo: true } });
  if (!pessoa) return null;
  return {
    dono: { tipo: 'pessoa-flowfoods', id: pessoa.id }, arquivo: pessoa.fotoArquivo,
    trocar: async (novo) => {
      const r = await prisma.user.updateMany({ where: { id: pessoa.id, fotoArquivo: pessoa.fotoArquivo }, data: { fotoArquivo: novo } });
      return r.count === 1 ? 'ok' : 'conflito';
    },
  };
}
