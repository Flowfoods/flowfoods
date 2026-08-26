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
import { agoraSP } from '@/lib/rodolfo/estado';
import { renderizar, TEMPLATE_INSTAGRAM } from '@/lib/barney/render';
import { Cartao, Numero, Selo, Vazio } from '../ui';
import { CartaoVisita } from './cartao-visita';

export const dynamic = 'force-dynamic';

export default async function VisitasPage() {
  const agora = agoraSP();

  const [leads, totalFixos, semTelefone] = await Promise.all([
    prisma.lead.findMany({
      where: {
        canal: { in: ['VISITA', 'INSTAGRAM'] },
        status: { notIn: ['OPT_OUT', 'CONFLITO'] },
      },
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
    prisma.lead.count({ where: { tipoTelefone: 'FIXO' } }),
    prisma.lead.count({ where: { tipoTelefone: 'INVALIDO' } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Visita / Instagram</h1>
        <p className="mt-1 text-sm text-surface/60">
          Quem não tem celular. Fixo não é lead ruim — é canal errado.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Cartao>
          <Numero valor={leads.length} rotulo="Na lista" />
        </Cartao>
        <Cartao>
          <Numero valor={totalFixos} rotulo="Telefone fixo" />
        </Cartao>
        <Cartao>
          <Numero valor={semTelefone} rotulo="Sem telefone" />
        </Cartao>
      </div>

      <Cartao className="border-warning/25 bg-warning/[0.05]">
        <p className="text-sm text-surface/85">
          <strong className="text-warning">O Instagram bloqueia mensagem pré-preenchida</strong> —
          nenhum link consegue abrir o Direct já com o texto. Por isso o fluxo é: copiar aqui,
          abrir o perfil, colar.
        </p>
        <p className="mt-2 text-xs text-surface/55">
          Direct converte menos que WhatsApp: cai em solicitações e muitas vezes nem notifica.
          Trate como plano B — e como o caminho natural para quem não respondeu depois do D+10.
        </p>
      </Cartao>

      {leads.length === 0 ? (
        <Cartao>
          <Vazio>
            Ninguém aqui. Fixos e sem-telefone caem nesta lista automaticamente na importação.
          </Vazio>
        </Cartao>
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
              <Cartao key={l.id}>
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/rodolfo/leads/${l.id}`}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {nome}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-surface/50">
                      {[l.bairro, l.categoria].filter(Boolean).join(' · ') || '—'}
                      {l.nota != null && ` · ${l.nota.toFixed(1).replace('.', ',')}`}
                      {l.avaliacoes != null && ` (${l.avaliacoes})`}
                    </p>
                    {l.endereco && (
                      <p className="mt-1 truncate text-xs text-surface/40">{l.endereco}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {l.tier && <Selo>{l.tier}</Selo>}
                    <span className="font-mono text-[10px] text-surface/40">
                      {l.tipoTelefone === 'FIXO' ? l.telefoneOriginal : 'sem telefone'}
                    </span>
                  </div>
                </header>

                <CartaoVisita nome={nome} instagram={l.instagram} texto={texto} />
              </Cartao>
            );
          })}
        </div>
      )}
    </div>
  );
}
