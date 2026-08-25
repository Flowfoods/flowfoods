/**
 * POST /api/leads/import — recebe um lote do `ledsflowfoods`.
 *
 * É o alvo do `--push` do `montar_pacote.py`. Autenticado por token no header,
 * não por sessão: quem chama é um script de terminal, não um navegador.
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { importarLote } from '@/lib/rodolfo/importar-lote';
import { COLUNAS } from '@/lib/leds/importar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Comparação em tempo constante — `===` em segredo vaza o prefixo pelo tempo. */
function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const linhaSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

const corpoSchema = z.object({
  lote: z.string().min(1).max(80),
  somenteCelular: z.boolean().optional().default(true),
  linhas: z.array(linhaSchema).min(1).max(2000),
});

export async function POST(req: Request) {
  const esperado = process.env.ADMIN_SETUP_TOKEN ?? '';
  if (!esperado) {
    return NextResponse.json(
      { erro: 'ADMIN_SETUP_TOKEN não configurado no servidor.' },
      { status: 503 },
    );
  }

  const recebido =
    req.headers.get('x-import-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!recebido || !tokenConfere(recebido, esperado)) {
    return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 });
  }

  const parsed = corpoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'Formato inesperado.', detalhe: parsed.error.issues.slice(0, 5), colunas: COLUNAS },
      { status: 400 },
    );
  }

  try {
    const rel = await importarLote(parsed.data.linhas, {
      lote: parsed.data.lote,
      somenteCelular: parsed.data.somenteCelular,
    });

    return NextResponse.json({
      ok: true,
      lote: rel.lote,
      total: rel.total,
      novos: rel.novos,
      atualizados: rel.atualizados,
      bloqueadosConflito: rel.bloqueadosConflito,
      bloqueadosOptOut: rel.bloqueadosOptOut,
      semTelefone: rel.semTelefone,
      invalidos: rel.invalidos,
      porTier: rel.porTier,
      porBloco: rel.porBloco,
      comCelular: rel.comCelular,
      flagados: rel.flagados,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: 'Falha ao importar.', detalhe: msg }, { status: 500 });
  }
}
