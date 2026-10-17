/**
 * Os períodos que a tela precisa para AVISAR ANTES de a pessoa preencher (2.2b): quais estão
 * fechados (em datas) e qual é o de agora. Só nome e datas; nenhum número do DRE. Leitura
 * simples, sem trava: quem decide é a escrita, que confere de novo dentro da transação.
 */

import { formatarData, hojeNoRio } from './compra-campos';
import type { AvisoDePeriodos } from './periodo-fechado-campos';
import { periodoDe } from './periodos';
import { pode, type Alcance } from './permissoes';
import type { ClienteDoParceiro } from './tenant';

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Os últimos 36 períodos fechados e o de agora. `raiz` = `/erp` ou `/rodolfo/erp/<slug>`. */
export async function avisoDePeriodos(cliente: ClienteDoParceiro, alcance: Alcance, raiz: string, hoje = hojeNoRio()): Promise<AvisoDePeriodos> {
  const { fechados, emCurso } = await cliente.transacao(async (tx) => ({
    fechados: await tx.periodoApuracao.findMany({ where: { status: 'FECHADO' }, orderBy: { inicio: 'desc' }, take: 36, select: { nome: true, inicio: true, fim: true } }),
    emCurso: (await periodoDe(tx, hoje)).nome,
  }));
  return {
    fechados: fechados.map((p) => ({ nome: p.nome || `${formatarData(p.inicio)} a ${formatarData(p.fim)}`, inicio: dia(p.inicio), fim: dia(p.fim) })),
    emCurso,
    href: pode(alcance, 'dre.ver') ? `${raiz}/dre/periodos` : null,
  };
}
