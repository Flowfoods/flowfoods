/**
 * Lojas e marcas do parceiro (N2 → N3), a MESMA tela para o nível 1
 * (/rodolfo/erp/<slug>/lojas) e para a pessoa do parceiro (/erp/lojas).
 * Recebe as lojas já filtradas pelo alcance de quem vê e os formulários só se
 * a pessoa pode cadastrar (`lojas.gerir`); sem formulário, a linha some.
 */

import type { ReactNode } from 'react';
import { CANAIS } from '@/lib/erp/canal-campos';
import { CANAIS_EM_ORDEM, type CanalVenda } from '@/lib/erp/faturamento-campos';
import { Contagem, Painel, Vazio } from '../../ui/superficies';

const DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** "3 lojas ativas · 2 marcas" — para o subtítulo do cabeçalho. */
export function resumoDaEstrutura(lojas: { ativa: boolean }[], marcas: { ativa: boolean }[]): string {
  const l = lojas.filter((x) => x.ativa).length;
  const m = marcas.filter((x) => x.ativa).length;
  return `${l} loja${l === 1 ? '' : 's'} ativa${l === 1 ? '' : 's'} · ${m} marca${m === 1 ? '' : 's'} ativa${m === 1 ? '' : 's'}`;
}

function Situacao({ ativa }: { ativa: boolean }) {
  return <span className={ativa ? 'text-texto' : 'text-suave'}>{ativa ? 'Ativa' : 'Inativa'}</span>;
}

/** No celular a coluna Situação some; inativa vira uma marca discreta ao lado do nome. */
function InativaNoCelular({ ativa }: { ativa: boolean }) {
  if (ativa) return null;
  return <span className="ml-2 text-[12px] font-normal text-suave sm:hidden">inativa</span>;
}

type LinhaDaEstrutura = { id: string; nome: string; slug?: string; ativa: boolean; criadoEm: Date; canaisDeVenda?: CanalVenda[] | null };

function Tabela({
  rotulo,
  linhas,
  mostrarLink,
  canais,
}: {
  rotulo: string;
  linhas: LinhaDaEstrutura[];
  mostrarLink: boolean;
  /** 2.1: onde cada loja vende, com o controle para quem cadastra lojas (some nas marcas). */
  canais?: (l: LinhaDaEstrutura) => ReactNode;
}) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="bg-forte text-left text-[12px] text-suave">
          <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
            {rotulo}
          </th>
          <th scope="col" className="hidden h-10 w-24 px-3 font-semibold sm:table-cell">
            Situação
          </th>
          <th scope="col" className="h-10 w-28 px-4 text-right font-semibold sm:px-5">
            Desde
          </th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {linhas.map((l) => (
          <tr key={l.id} className="ff-transicao border-t border-linha hover:bg-texto/[0.03]">
            <td className="h-11 max-w-0 px-4 py-2.5 sm:px-5">
              <div className="truncate font-medium text-texto">
                {l.nome}
                <InativaNoCelular ativa={l.ativa} />
              </div>
              {mostrarLink && l.slug && <div className="truncate text-[12px] text-suave">{l.slug}</div>}
              {canais && (
                <>
                  <div className="text-[12px] font-normal text-suave">Vende em {CANAIS_EM_ORDEM.filter((c) => (l.canaisDeVenda ?? []).includes(c)).map((c) => CANAIS[c].curto).join(' · ') || '—'}</div>
                  {canais(l)}
                </>
              )}
            </td>
            <td className="hidden px-3 py-2.5 sm:table-cell">
              <Situacao ativa={l.ativa} />
            </td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right text-suave sm:px-5">{DATA.format(l.criadoEm)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TelaEstrutura({
  lojas,
  marcas,
  bloqueio,
  formLoja,
  formMarca,
  mostrarLink = false,
  formCanais,
}: {
  lojas: { id: string; nome: string; slug: string; ativa: boolean; criadoEm: Date; canaisDeVenda?: CanalVenda[] | null }[];
  marcas: { id: string; nome: string; ativa: boolean; criadoEm: Date }[];
  bloqueio: string | null;
  /** Sem formulário: a pessoa não cadastra lojas/marcas (a linha do campo some). */
  formLoja?: ReactNode;
  formMarca?: ReactNode;
  /** Identificador técnico da loja: só o nível 1 vê. */
  mostrarLink?: boolean;
  /** 2.1: o controle dos canais de venda de uma loja (só para quem cadastra lojas). */
  formCanais?: (l: { id: string; nome: string; canais: readonly CanalVenda[] }) => ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Painel titulo="Lojas" acessorio={<Contagem>{lojas.length}</Contagem>} semRespiro>
        {/* Bloqueado: no celular o aviso do topo já explica; no desktop, a frase fica no lugar do campo. */}
        {formLoja && (
          <div className={`border-b border-linha px-4 pb-1 pt-4 sm:px-5 ${bloqueio ? 'hidden lg:block' : ''}`}>
            {bloqueio ? <p className="pb-3 text-sm text-suave">{bloqueio}</p> : formLoja}
          </div>
        )}
        {lojas.length === 0 ? (
          <Vazio titulo="Nenhuma loja ainda.">
            Cada endereço que opera vira uma loja: estoque e faturamento são por loja.
          </Vazio>
        ) : (
          <Tabela
            rotulo="Loja"
            linhas={lojas}
            mostrarLink={mostrarLink}
            canais={(l) => formCanais?.({ id: l.id, nome: l.nome, canais: CANAIS_EM_ORDEM.filter((c) => (l.canaisDeVenda ?? []).includes(c)) })}
          />
        )}
      </Painel>

      <Painel titulo="Marcas" acessorio={<Contagem>{marcas.length}</Contagem>} semRespiro>
        {formMarca && (
          <div className={`border-b border-linha px-4 pb-1 pt-4 sm:px-5 ${bloqueio ? 'hidden lg:block' : ''}`}>
            {bloqueio ? <p className="pb-3 text-sm text-suave">{bloqueio}</p> : formMarca}
          </div>
        )}
        {marcas.length === 0 ? (
          <Vazio titulo="Nenhuma marca ainda.">Marca do grupo aparece no faturamento por loja × marca × canal.</Vazio>
        ) : (
          <Tabela rotulo="Marca" linhas={marcas} mostrarLink={false} />
        )}
      </Painel>
    </div>
  );
}
