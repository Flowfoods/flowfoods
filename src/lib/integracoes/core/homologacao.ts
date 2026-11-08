import { prisma } from '@/lib/db';
import { lerParecer } from './homologacao-campos';

export const EVENTO_PARECER = 'integracao.app-parecer-registrado';
export const CONFLITO_PARECER = 'Este app mudou desde que a página foi aberta. Recarregue e confira o parecer; nada foi gravado.';
export const ESCOPO_PARECER = 'O registro de parecer nesta etapa atende somente apps de produção BI com Analytics.';

export const appAceitaParecer = (a: { ambiente: string; categoria: string; modulos: readonly string[] }) =>
  a.ambiente === 'PRODUCAO' && a.categoria === 'BI' && a.modulos.length === 1 && a.modulos[0] === 'ANALYTICS';

export async function registrarParecerApp(appId: string, versao: string, entrada: Record<string, unknown>, autor: { userId: string; autorNome: string }, agora = new Date()) {
  if (!appId || appId.length > 60 || !autor.userId || !autor.autorNome.trim()) return { ok: false as const, erros: { geral: 'Não foi possível identificar o app ou o responsável.' } };
  const dataVersao = new Date(versao);
  if (!Number.isFinite(dataVersao.getTime()) || dataVersao.toISOString() !== versao) return { ok: false as const, erros: { geral: CONFLITO_PARECER } };
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  const lido = lerParecer(entrada, hoje);
  if (!lido.ok) return lido;
  return prisma.$transaction(async tx => {
    const app = await tx.integracaoApp.findUnique({ where: { id: appId }, select: { ambiente: true, categoria: true, modulos: true, clientId: true, estadoHomologacao: true, atualizadoEm: true } });
    if (!app || !appAceitaParecer(app)) return { ok: false as const, erros: { geral: ESCOPO_PARECER } };
    if (app.atualizadoEm.getTime() !== dataVersao.getTime()) return { ok: false as const, erros: { geral: CONFLITO_PARECER } };
    // A versão sempre avança, inclusive quando dois pareceres chegam no mesmo milissegundo.
    const atualizadoEm = new Date(Math.max(agora.getTime(), dataVersao.getTime() + 1));
    const mudou = await tx.integracaoApp.updateMany({
      where: { id: appId, atualizadoEm: dataVersao, ambiente: 'PRODUCAO', categoria: 'BI', modulos: { equals: ['ANALYTICS'] } },
      data: { estadoHomologacao: lido.dados.estado, atualizadoEm },
    });
    if (mudou.count !== 1) return { ok: false as const, erros: { geral: CONFLITO_PARECER } };
    // Estado e recibo são atômicos. Não concede grant, não altera conexões nem chama o provedor.
    await tx.auditLog.create({ data: { userId: autor.userId, evento: EVENTO_PARECER, dados: {
      appId, clientId: app.clientId, antes: app.estadoHomologacao, ...lido.dados,
      autorNome: autor.autorNome.trim().slice(0, 120), versao: atualizadoEm.toISOString(),
    } } });
    return { ok: true as const };
  });
}

export async function historicoDoParecer(appId: string) {
  const registros = await prisma.auditLog.findMany({ where: { evento: EVENTO_PARECER, dados: { path: ['appId'], equals: appId } }, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take: 20, select: { id: true, criadoEm: true, dados: true } });
  return registros.map(r => {
    const d = r.dados && typeof r.dados === 'object' && !Array.isArray(r.dados) ? r.dados : {};
    const texto = (k: string) => typeof d[k] === 'string' ? d[k] as string : '';
    // A referência vem do mesmo validador do registro; recibos legados/inválidos não viram links.
    const referencia = texto('referencia');
    const segura = lerParecer({ estado: 'PENDENTE', referencia, conferido: 'sim' }, '9999-12-31').ok;
    return { id: r.id, criadoEm: r.criadoEm, estado: texto('estado'), validacaoEm: texto('validacaoEm'), liberacaoEm: texto('liberacaoEm'), autorNome: texto('autorNome'), referencia: segura ? referencia : null };
  });
}
