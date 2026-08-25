import { NextResponse } from 'next/server';
import { avaliar, montarRespostas } from '@/lib/diagnostico';

export const runtime = 'nodejs';

/**
 * Recebe as respostas, valida e devolve a Leitura Inicial.
 *
 * O motor roda AQUI, no servidor, e não no navegador. Não é detalhe: os pesos, a
 * regra de momento e o ranking de módulos são o produto. Rodando no cliente,
 * qualquer um abre o DevTools e lê a régua inteira — e, pior, pode alterá-la
 * antes de mandar. O que sai daqui para a tela é só o resultado.
 *
 * Nada é persistido nesta versão: não há banco. O lead chega ao Rodolfo pelo
 * WhatsApp que o próprio dono envia no fim. Está registrado no relatório da fase.
 */
export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 });
  }

  const entrada = montarRespostas(corpo);
  if (!entrada.ok) {
    return NextResponse.json({ erros: entrada.erros }, { status: 422 });
  }

  const a = avaliar(entrada.respostas);

  // Só o que a tela precisa. Scores, flags, ranking e razões são material do
  // Rodolfo para a call — o dono não vê nota do próprio negócio, e mandar isso
  // para o navegador seria entregar o diagnóstico fechado de graça.
  return NextResponse.json({
    leitura: a.leitura.textoCompleto,
    cta: a.leitura.cta,
    restaurante: entrada.respostas.restaurante,
    bairro: entrada.respostas.bairroCidade,
    momento: a.momento,
    moduloUm: a.modulosRanqueados[0]?.nome ?? '',
  });
}
