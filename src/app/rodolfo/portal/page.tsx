/**
 * Portal — os formulários iniciais dos clientes, um cartão por cliente.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { questionario } from '@/lib/portal/questionario';
import { progressoDoCliente } from '@/lib/portal/dados';
import { origemPublica } from '@/lib/portal/http';
import { Barra, Cartao, Numero, Selo, Vazio } from '../ui';
import { CopiarLink } from './copiar';
import { formatarQuando } from './formatar';

export const dynamic = 'force-dynamic';

export default async function PortalPage() {
  const clientes = await prisma.portalCliente.findMany({ orderBy: { criadoEm: 'asc' } });

  const linhas = await Promise.all(
    clientes.map(async (c) => {
      const q = questionario(c.questionario);
      return { c, p: q ? await progressoDoCliente(c.id, q) : null };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Portal do cliente</h1>

      {linhas.length === 0 && (
        <Cartao>
          <Vazio>Nenhum cliente cadastrado no portal.</Vazio>
        </Cartao>
      )}

      {linhas.map(({ c, p }) => (
        <Cartao
          key={c.id}
          titulo={c.nome}
          acessorio={
            c.finalizadoEm ? (
              <Selo tom="ok">Enviado {formatarQuando(c.finalizadoEm)}</Selo>
            ) : c.ultimaAtividadeEm ? (
              <Selo tom="alerta">Preenchendo</Selo>
            ) : (
              <Selo>Não abriu ainda</Selo>
            )
          }
        >
          <CopiarLink url={`${origemPublica()}/portal/${c.token}`} />

          {p ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Numero valor={p.recebidos} rotulo="Recebidos" />
                <Numero valor={p.marcados} rotulo="Marcados" />
                <Numero valor={p.pendentes} rotulo="Pendentes" />
              </div>
              <div className="mt-3">
                <Barra valor={p.recebidos + p.marcados} total={p.total} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-warning">Questionário {c.questionario} não existe no código.</p>
          )}

          <Link
            href={`/rodolfo/portal/${c.id}`}
            className="mt-4 inline-block text-sm font-semibold text-bright hover:underline"
          >
            Ver respostas →
          </Link>
        </Cartao>
      ))}
    </div>
  );
}
