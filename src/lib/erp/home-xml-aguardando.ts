/** Fila XML atual de uma loja: leitura própria; documento aguardando não é compra. */
import { documentosAguardando } from './compras-relatorio';
import { queryDosFiltrosDeDocumento } from './documento-fiscal-campos';
import { contextoHomePermitido, type ContextoHomeLoja, type LeituraHome } from './home-analitico';
import { alcancaLoja, pode, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { ErroDeRelatorio } from './vagas-de-relatorio';

export interface XmlAguardandoHome {
  estado: 'ok' | 'erro' | 'indisponivel';
  aguardando: number | null;
  loja: { id: string; nome: string; ativa: boolean | null };
  referencia: 'fila_atual';
  consultadoEm: string;
  aviso: string | null;
  detalhe: { href: string; rotulo: string };
}
export type DadosXmlAguardandoHome =
  | { tipo: 'lido'; loja: { id: string; nome: string; ativa: boolean }; aguardando: number }
  | { tipo: 'incompativel' }
  | { tipo: 'limite'; motivo: 'tempo' | 'ocupado' };

export async function lerXmlAguardandoDaHome(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string): Promise<DadosXmlAguardandoHome | null> {
  if (!/^[a-z0-9]{1,64}$/i.test(lojaId) || !alcancaLoja(alcance, lojaId) || !pode(alcance, 'compras.ver', { lojaId })) return null;
  try {
    return await cliente.transacao(async tx => {
      if (tx.parceiroId !== cliente.parceiroId) return { tipo: 'incompativel' as const };
      // O portão resolve o parceiro. Ativa é informação; não apaga documentos antigos.
      const loja = await tx.loja.findFirst({ where: { id: lojaId }, select: { id: true, nome: true, ativa: true } });
      if (!loja) return null;
      if (loja.id !== lojaId || typeof loja.nome !== 'string' || !loja.nome.length || typeof loja.ativa !== 'boolean') return { tipo: 'incompativel' as const };
      const aguardando = await documentosAguardando(tx, [loja.id]);
      return { tipo: 'lido' as const, loja: { id: loja.id, nome: loja.nome, ativa: loja.ativa }, aguardando };
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    if (erro instanceof ErroDeRelatorio) return { tipo: 'limite', motivo: erro.motivo };
    // A fonte é independente no allSettled; não há fallback de contagem nem retry.
    throw erro;
  }
}

export function xmlAguardandoDaHome(leitura: LeituraHome<DadosXmlAguardandoHome>, c: ContextoHomeLoja): XmlAguardandoHome | null {
  if (!contextoHomePermitido(c, 'compras.ver')) return null;
  const vazio = (estado: XmlAguardandoHome['estado'], aviso: string): XmlAguardandoHome => ({
    estado, aguardando: null, loja: { id: c.loja.id, nome: c.loja.nome, ativa: null }, referencia: 'fila_atual', consultadoEm: c.consultadoEm,
    aviso, detalhe: { href: c.raiz + '/compras/recebidas?' + queryDosFiltrosDeDocumento({ lojaId: c.loja.id, fornecedorId: '', situacao: 'fila', pagina: 1 }), rotulo: 'Ver fila de notas recebidas' },
  });
  try {
    if (leitura.estado === 'erro') return vazio('erro', 'Não foi possível conferir os XML aguardando conferência desta loja.');
    if (leitura.estado !== 'lido') return vazio('indisponivel', 'A contagem de XML aguardando conferência não está disponível nesta leitura.');
    const d = leitura.dados;
    if (!d) return null; // Não há loja deste parceiro no contexto pedido.
    if (d.tipo === 'limite') return vazio('indisponivel', d.motivo === 'ocupado'
      ? 'A consulta da fila está ocupada. Atualize o resumo em instantes.'
      : 'A consulta da fila atingiu o limite de tempo. Confira as notas recebidas da loja.');
    if (d.tipo !== 'lido') return vazio('indisponivel', 'A contagem de XML não pôde ser conferida para esta loja.');
    const { id, nome, ativa } = d.loja;
    const aguardando = d.aguardando;
    if (id !== c.loja.id || typeof nome !== 'string' || !nome.length || typeof ativa !== 'boolean'
      || !Number.isSafeInteger(aguardando) || aguardando < 0) return vazio('indisponivel', 'A contagem de XML não pôde ser conferida para esta loja.');
    const dto = vazio('ok', (ativa ? '' : 'Loja desativada · documentos existentes. ') + 'Fila atual, sem recorte mensal: somente XML atribuídos a esta loja aguardando conferência. O destino também pode incluir notas recebidas ou com erro.');
    dto.aguardando = aguardando;
    dto.loja = { id, nome, ativa };
    return dto;
  } catch {
    return vazio('erro', 'Não foi possível conferir os XML aguardando conferência desta loja.');
  }
}
