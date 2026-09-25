import { exigirCliente, finalizar } from '@/lib/portal/dados';
import { falha, json, origemPublica } from '@/lib/portal/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Enviar para o Rodolfo". Grava a data de envio e dispara o aviso no WhatsApp.
 *
 * O envio não trava por item pendente: "não sei" e "não tenho" também são
 * resposta, e o que ficou em branco vira item do diagnóstico. A tela avisa
 * quantos faltam antes de confirmar.
 */
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  try {
    const c = await exigirCliente(params.token);
    const r = await finalizar(c, origemPublica());
    return json({
      ok: true,
      pendentes: r.progresso.pendentes,
      recebidos: r.progresso.recebidos,
      marcados: r.progresso.marcados,
    });
  } catch (e) {
    return falha(e);
  }
}
