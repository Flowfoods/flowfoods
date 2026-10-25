/**
 * Leads — lista, filtros e importação.
 *
 * O filtro vem da URL (searchParams), não de estado no cliente: assim o Rodolfo
 * consegue mandar um link já filtrado para si mesmo e o botão "voltar" funciona.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Canal, LeadStatus, type Prisma } from '@prisma/client';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { BuscaEmFormulario, FiltroEmLinks } from '@/components/erp/ui/filtros';
import { Contagem, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { ROTULO_DO_LEAD, rotulo } from '@/lib/rodolfo/rotulos';

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
  { chave: 'CONFLITO', rotulo: 'Conflito (Bibi)' },
  { chave: 'OPT_OUT', rotulo: 'Pediram para sair' },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; canal?: string }>;
}) {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const params = await searchParams;

  // Só valores conhecidos chegam ao banco: um status inventado na URL derrubava a página (o Prisma recusa o enum).
  const status = params.status && (Object.values(LeadStatus) as string[]).includes(params.status) ? (params.status as LeadStatus) : undefined;
  const canal = params.canal && (Object.values(Canal) as string[]).includes(params.canal) ? (params.canal as Canal) : undefined;
  const where: Prisma.LeadWhereInput = {};
  if (status) where.status = status;
  if (canal) where.canal = canal;
  if (params.q) {
    // O telefone só entra quando a busca tem dígitos: sem eles, o "contém vazio" casava com todo lead que tem telefone.
    const digitos = params.q.replace(/\D/g, '');
    where.OR = [
      { nome: { contains: params.q, mode: 'insensitive' } },
      { restaurante: { contains: params.q, mode: 'insensitive' } },
      { bairro: { contains: params.q, mode: 'insensitive' } },
      ...(digitos ? [{ telefoneNormalizado: { contains: digitos } }] : []),
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
          <Link href="/rodolfo/leads/importar" className={classeDeBotao('primario')}>
            Importar leads
          </Link>
        }
      >
        <div className="flex flex-col gap-3">
          <BuscaEmFormulario
            valor={params.q}
            placeholder="Nome, bairro ou telefone"
            rotulo="Buscar leads"
            ocultos={{ status }}
          />
          <FiltroEmLinks
            rotulo="Filtrar por situação"
            opcoes={FILTROS.map((f) => ({
              href: hrefDo(f.chave),
              rotulo: f.rotulo,
              ativo: (status ?? '') === f.chave,
            }))}
          />
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Todos com a linha de apoio: os números ficam na mesma altura. */}
        <Metrica rotulo="Novos" valor={conta('NOVO')} detalhe="ainda não contatados" />
        <Metrica rotulo="Em cadência" valor={conta('EM_CADENCIA')} detalhe="em andamento" />
        <Metrica rotulo="Responderam" valor={conta('RESPONDEU')} detalhe="pelo WhatsApp" />
        <Metrica rotulo="Visita e Instagram" valor={visita} detalhe="fixo ou sem celular" />
      </div>

      <Painel
        titulo="Lista"
        acessorio={<Contagem>{total > leads.length ? `${leads.length} de ${total}` : leads.length}</Contagem>}
        semRespiro
      >
        {leads.length === 0 ? (
          params.q || status || canal ? (
            <Vazio
              titulo={params.q ? `Nada para “${params.q}”.` : 'Nenhum lead nesta situação.'}
              acao={
                <Link href="/rodolfo/leads" className={`${LINK_DE_TEXTO} ff-toque`}>
                  {params.q ? 'Limpar a busca' : 'Ver todos os leads'}
                </Link>
              }
            />
          ) : (
            <Vazio
              titulo="Nenhum lead ainda."
              acao={
                <Link href="/rodolfo/leads/importar" className={classeDeBotao('secundario')}>
                  Importar leads
                </Link>
              }
            >
              Importe a planilha do ledsflowfoods para começar.
            </Vazio>
          )
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
                    <Selo tom={STATUS_TOM[l.status] ?? 'neutro'}>{rotulo(ROTULO_DO_LEAD, l.status)}</Selo>
                    {l.tier && <span className="text-[12px] tabular-nums text-suave">{l.tier}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > POR_PAGINA && (
          <p className="border-t border-linha px-4 py-3 text-center text-[12px] text-suave sm:px-5">
            Mostrando os {POR_PAGINA} primeiros por faixa (T1 a T3) e score. Refine a busca para ver o resto.
          </p>
        )}
      </Painel>

    </div>
  );
}
