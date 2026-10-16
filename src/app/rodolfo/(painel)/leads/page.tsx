/**
 * Leads — lista, filtros e importação.
 *
 * O filtro vem da URL (searchParams), não de estado no cliente: assim o Rodolfo
 * consegue mandar um link já filtrado para si mesmo e o botão "voltar" funciona.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { BuscaEmFormulario, FiltroEmLinks } from '@/components/erp/ui/filtros';
import { Contagem, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { ImportarForm } from './importar-form';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { exigirNivel1 } from '@/lib/erp/contexto';

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
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
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

  const hrefDo = (status: string) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (params.q) q.set('q', params.q);
    const t = q.toString();
    return t ? `/rodolfo/leads?${t}` : '/rodolfo/leads';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icone="leads"
        cor={COR.comercial}
        titulo="Leads"
        subtitulo={`${total} resultado${total === 1 ? '' : 's'}${params.q ? ` para “${params.q}”` : ''}`}
        acao={
          <a href="#importar" className={classeDeBotao('primario')}>
            Importar lote
          </a>
        }
      >
        <div className="flex flex-col gap-3">
          <BuscaEmFormulario
            valor={params.q}
            placeholder="Nome, bairro ou telefone"
            rotulo="Buscar leads"
            ocultos={{ status: params.status }}
          />
          <FiltroEmLinks
            rotulo="Filtrar por situação"
            opcoes={FILTROS.map((f) => ({
              href: hrefDo(f.chave),
              rotulo: f.rotulo,
              ativo: (params.status ?? '') === f.chave,
            }))}
          />
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica rotulo="Novos" valor={conta('NOVO')} />
        <Metrica rotulo="Em cadência" valor={conta('EM_CADENCIA')} />
        <Metrica rotulo="Responderam" valor={conta('RESPONDEU')} />
        <Metrica rotulo="Visita / Instagram" valor={visita} detalhe="fixo ou sem celular" />
      </div>

      <Painel
        titulo="Lista"
        acessorio={<Contagem>{total > leads.length ? `${leads.length} de ${total}` : leads.length}</Contagem>}
        semRespiro
      >
        {leads.length === 0 ? (
          <Vazio>Nada aqui. Importe um lote do ledsflowfoods abaixo.</Vazio>
        ) : (
          <ul>
            {leads.map((l) => (
              <li key={l.id} className="relative border-t border-linha first:border-t-0">
                <Link
                  href={`/rodolfo/leads/${l.id}`}
                  className="ff-transicao flex min-h-11 items-start justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03] sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.restaurante ?? l.nome}</p>
                    <p className="mt-0.5 truncate text-[12px] text-suave">
                      {[l.bairro, l.categoria].filter(Boolean).join(', ') || '—'}
                      {l.nota != null && `, nota ${l.nota.toFixed(1).replace('.', ',')}`}
                      {l.avaliacoes != null && ` (${l.avaliacoes})`}
                      {l.scoreBase != null && `, score ${l.scoreBase}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Selo tom={STATUS_TOM[l.status] ?? 'neutro'}>{l.status}</Selo>
                    {l.tier && <span className="text-[12px] tabular-nums text-suave">{l.tier}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > POR_PAGINA && (
          <p className="border-t border-linha px-4 py-3 text-center text-[12px] text-suave sm:px-5">
            Mostrando os {POR_PAGINA} primeiros por tier e score. Refine a busca para ver o resto.
          </p>
        )}
      </Painel>

      <Painel id="importar" titulo="Importar lote" className="scroll-mt-24">
        <ImportarForm />
      </Painel>
    </div>
  );
}
