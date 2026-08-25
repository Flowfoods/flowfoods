/**
 * Leads — lista, filtros e importação.
 *
 * O filtro vem da URL (searchParams), não de estado no cliente: assim o Rodolfo
 * consegue mandar um link já filtrado para si mesmo e o botão "voltar" funciona.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { Cartao, Numero, Selo, Vazio } from '../ui';
import { ImportarForm } from './importar-form';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;

const STATUS_TOM: Record<string, 'ok' | 'alerta' | 'erro' | 'neutro'> = {
  NOVO: 'neutro',
  EM_CADENCIA: 'alerta',
  RESPONDEU: 'ok',
  DIAGNOSTICO_AGENDADO: 'ok',
  CLIENTE: 'ok',
  OPT_OUT: 'erro',
  CONFLITO: 'erro',
  PERDIDO: 'neutro',
};

const FILTROS = [
  { chave: '', rotulo: 'Todos' },
  { chave: 'NOVO', rotulo: 'Novos' },
  { chave: 'EM_CADENCIA', rotulo: 'Em cadência' },
  { chave: 'RESPONDEU', rotulo: 'Responderam' },
  { chave: 'CONFLITO', rotulo: 'Conflito Bibi' },
  { chave: 'OPT_OUT', rotulo: 'Opt-out' },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; canal?: string }>;
}) {
  const params = await searchParams;

  const where: Prisma.LeadWhereInput = {};
  if (params.status) where.status = params.status as Prisma.LeadWhereInput['status'];
  if (params.canal) where.canal = params.canal as Prisma.LeadWhereInput['canal'];
  if (params.q) {
    where.OR = [
      { nome: { contains: params.q, mode: 'insensitive' } },
      { restaurante: { contains: params.q, mode: 'insensitive' } },
      { bairro: { contains: params.q, mode: 'insensitive' } },
      { telefoneNormalizado: { contains: params.q.replace(/\D/g, '') } },
    ];
  }

  const [leads, total, porStatus, visita] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ tier: 'asc' }, { scoreBase: 'desc' }],
      take: POR_PAGINA,
      select: {
        id: true,
        nome: true,
        restaurante: true,
        bairro: true,
        categoria: true,
        tier: true,
        scoreBase: true,
        status: true,
        canal: true,
        nota: true,
        avaliacoes: true,
      },
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ['status'], _count: true }),
    prisma.lead.count({ where: { canal: { in: ['VISITA', 'INSTAGRAM'] } } }),
  ]);

  const conta = (s: string) => porStatus.find((p) => p.status === s)?._count ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-surface/60">{total} resultado(s)</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao>
          <Numero valor={conta('NOVO')} rotulo="Novos" />
        </Cartao>
        <Cartao>
          <Numero valor={conta('EM_CADENCIA')} rotulo="Em cadência" />
        </Cartao>
        <Cartao>
          <Numero valor={conta('RESPONDEU')} rotulo="Responderam" />
        </Cartao>
        <Cartao>
          <Numero valor={visita} rotulo="Visita / Instagram" detalhe="fixo ou sem celular" />
        </Cartao>
      </div>

      <Cartao titulo="Filtrar">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const ativo = (params.status ?? '') === f.chave;
            return (
              <Link
                key={f.rotulo}
                href={f.chave ? `/rodolfo/leads?status=${f.chave}` : '/rodolfo/leads'}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  ativo
                    ? 'border-bright bg-bright/15 text-bright'
                    : 'border-white/15 text-surface/65 hover:border-white/30 hover:text-surface'
                }`}
              >
                {f.rotulo}
              </Link>
            );
          })}
        </div>

        <form className="mt-3 flex gap-2">
          {params.status && <input type="hidden" name="status" value={params.status} />}
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Nome, bairro ou telefone"
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-surface/25 focus:border-bright"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium transition hover:border-white/30"
          >
            Buscar
          </button>
        </form>
      </Cartao>

      <Cartao titulo={`Lista (${leads.length}${total > leads.length ? ` de ${total}` : ''})`}>
        {leads.length === 0 ? (
          <Vazio>Nada aqui. Importe um lote do ledsflowfoods abaixo.</Vazio>
        ) : (
          <ul className="divide-y divide-white/5">
            {leads.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.restaurante ?? l.nome}</p>
                  <p className="mt-0.5 truncate text-xs text-surface/50">
                    {[l.bairro, l.categoria].filter(Boolean).join(' · ') || '—'}
                    {l.nota != null && ` · ${l.nota.toFixed(1).replace('.', ',')}`}
                    {l.avaliacoes != null && ` (${l.avaliacoes})`}
                    {l.scoreBase != null && ` · score ${l.scoreBase}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Selo tom={STATUS_TOM[l.status] ?? 'neutro'}>{l.status}</Selo>
                  {l.tier && <span className="font-mono text-[10px] text-surface/40">{l.tier}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {total > POR_PAGINA && (
          <p className="mt-3 text-center text-xs text-surface/45">
            Mostrando os {POR_PAGINA} primeiros por tier e score. Refine a busca para ver o resto.
          </p>
        )}
      </Cartao>

      <Cartao titulo="Importar lote">
        <ImportarForm />
      </Cartao>
    </div>
  );
}
