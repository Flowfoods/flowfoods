/**
 * Visita / Instagram — quem não entra na cadência de WhatsApp.
 *
 * Fixo não é lead ruim, é canal errado. Aqui ficam os que têm telefone fixo,
 * os sem telefone e os que foram movidos à mão.
 *
 * O Instagram **não aceita mensagem pré-preenchida por link** — é bloqueio da
 * plataforma, não limitação nossa. Por isso o fluxo é copiar → abrir → colar, e
 * a tela diz isso em voz alta para não parecer defeito.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { agoraSP } from '@/lib/rodolfo/estado';
import { renderizar, TEMPLATE_INSTAGRAM } from '@/lib/barney/render';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Metrica, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { CartaoVisita } from './cartao-visita';
import { exigirNivel1 } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

export default async function VisitasPage() {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const agora = agoraSP();

  // A mesma regra da lista para os três números (antes "Na lista" parava em 60 e os outros contavam quem pediu para sair).
  const daLista = { canal: { in: ['VISITA', 'INSTAGRAM'] }, status: { notIn: ['OPT_OUT', 'CONFLITO'] } } satisfies Prisma.LeadWhereInput;
  const [leads, naLista, totalFixos, semTelefone] = await Promise.all([
    prisma.lead.findMany({
      where: daLista,
      orderBy: [{ tier: 'asc' }, { scoreBase: 'desc' }],
      take: 60,
      select: {
        id: true,
        nome: true,
        restaurante: true,
        bairro: true,
        categoria: true,
        endereco: true,
        tier: true,
        scoreBase: true,
        nota: true,
        avaliacoes: true,
        instagram: true,
        tipoTelefone: true,
        telefoneOriginal: true,
      },
    }),
    prisma.lead.count({ where: daLista }),
    prisma.lead.count({ where: { ...daLista, tipoTelefone: 'FIXO' } }),
    prisma.lead.count({ where: { ...daLista, tipoTelefone: 'INVALIDO' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        icone="visitas"
        cor={COR.comercial}
        titulo="Visita e Instagram"
        subtitulo="Quem não tem celular. Fixo não é lead ruim — é canal errado."
      />

      <div className="grid grid-cols-3 gap-3">
        <Metrica rotulo="Na lista" valor={naLista} detalhe={naLista > leads.length ? `mostrando ${leads.length}` : undefined} />
        <Metrica rotulo="Telefone fixo" valor={totalFixos} />
        <Metrica rotulo="Sem telefone" valor={semTelefone} />
      </div>

      <Aviso tom="alerta" titulo="O Instagram bloqueia mensagem pré-preenchida.">
        Nenhum link consegue abrir o Direct já com o texto. Por isso o fluxo é: copiar aqui, abrir o perfil, colar.
        Direct converte menos que WhatsApp (cai em solicitações e muitas vezes nem notifica): trate como plano B, e como
        o caminho natural para quem não respondeu depois do D+10.
      </Aviso>

      {leads.length === 0 ? (
        <Painel>
          <Vazio>Ninguém aqui. Fixos e sem-telefone caem nesta lista automaticamente na importação.</Vazio>
        </Painel>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => {
            const nome = l.restaurante ?? l.nome;
            // O texto de Direct é renderizado por lead: o gancho cita a nota e o
            // número de avaliações DAQUELA casa, que é o que separa abordagem de
            // disparo em massa.
            const texto =
              l.nota != null && l.avaliacoes != null
                ? renderizar(
                    TEMPLATE_INSTAGRAM,
                    {
                      nome,
                      bairro: l.bairro ?? '',
                      categoria: l.categoria ?? '',
                      nota: l.nota,
                      avaliacoes: l.avaliacoes,
                    },
                    agora,
                  )
                : null;

            return (
              <Painel key={l.id}>
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/rodolfo/leads/${l.id}`}
                      className="block truncate rounded-[5px] text-sm font-semibold underline decoration-linha-forte underline-offset-4 hover:decoration-texto"
                    >
                      {nome}
                    </Link>
                    <p className="mt-0.5 truncate text-[12px] text-suave">
                      {[l.bairro, l.categoria].filter(Boolean).join(', ') || '—'}
                      {l.nota != null && `, nota ${l.nota.toFixed(1).replace('.', ',')}`}
                      {l.avaliacoes != null && ` (${l.avaliacoes})`}
                    </p>
                    {l.endereco && <p className="mt-1 truncate text-[12px] text-suave">{l.endereco}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {l.tier && <Selo>{l.tier}</Selo>}
                    <span className="text-[12px] tabular-nums text-suave">
                      {/* Celular movido à mão para visita também mostra o número; "sem telefone" só para quem não tem um válido. */}
                      {l.tipoTelefone !== 'INVALIDO' && l.telefoneOriginal ? l.telefoneOriginal : 'sem telefone'}
                    </span>
                  </div>
                </header>

                <CartaoVisita nome={nome} instagram={l.instagram} texto={texto} />
              </Painel>
            );
          })}
        </div>
      )}
    </div>
  );
}
