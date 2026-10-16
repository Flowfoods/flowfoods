/**
 * Portal — os formulários iniciais dos clientes, um cartão por cliente.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { questionario } from '@/lib/portal/questionario';
import { progressoDoCliente } from '@/lib/portal/dados';
import { origemPublica } from '@/lib/portal/http';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Barra, Numero, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { CopiarLink } from './copiar';
import { formatarQuando } from './formatar';
import { exigirNivel1 } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

export default async function PortalPage() {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const clientes = await prisma.portalCliente.findMany({ orderBy: { criadoEm: 'asc' } });

  const linhas = await Promise.all(
    clientes.map(async (c) => {
      const q = questionario(c.questionario);
      return { c, p: q ? await progressoDoCliente(c.id, q) : null };
    }),
  );

  const enviados = clientes.filter((c) => c.finalizadoEm).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="portal"
        cor={COR.clientes}
        titulo="Portal do cliente"
        subtitulo={`${clientes.length} cliente${clientes.length === 1 ? '' : 's'} no portal · ${enviados} já enviaram o formulário`}
      />

      {linhas.length === 0 && (
        <Painel>
          <Vazio>Nenhum cliente cadastrado no portal.</Vazio>
        </Painel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {linhas.map(({ c, p }) => (
          <Painel
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
                  <Barra
                    valor={p.recebidos + p.marcados}
                    total={p.total}
                    rotulo={`${p.recebidos + p.marcados} de ${p.total} itens`}
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-atencao">Questionário {c.questionario} não existe no código.</p>
            )}

            <Link href={`/rodolfo/portal/${c.id}`} className={`${LINK_DE_TEXTO} mt-4 inline-block`}>
              Ver respostas de {c.nome}
            </Link>
          </Painel>
        ))}
      </div>
    </div>
  );
}
