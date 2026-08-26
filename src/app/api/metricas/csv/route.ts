/**
 * GET /api/metricas/csv — exporta a base de leads.
 *
 * Exige sessão: o arquivo carrega telefone e nome de centenas de restaurantes,
 * que é dado pessoal sob LGPD. Uma rota de download sem sessão seria um
 * vazamento de base inteira por uma URL adivinhável.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { DateTime } from 'luxon';
import { authOptions } from '@/lib/rodolfo/auth';
import { leadsParaCsv } from '@/lib/rodolfo/metricas';
import { prisma } from '@/lib/db';
import { TIMEZONE } from '@/lib/barney/regras';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const sessao = await getServerSession(authOptions);
  const userId = (sessao?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ erro: 'Sem sessão.' }, { status: 401 });
  }

  const csv = await leadsParaCsv();
  const carimbo = DateTime.now().setZone(TIMEZONE).toFormat('yyyy-LL-dd');

  // Exportar a base é evento auditável: é o momento em que os dados saem do
  // sistema e passam a viver num arquivo que ninguém mais controla.
  await prisma.auditLog.create({
    data: { userId, evento: 'exportou_csv_leads', dados: { bytes: csv.length } },
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="flowfoods-leads-${carimbo}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
