'use client';

/**
 * A fila de revisão com edição em lote (I.1a): os insumos sem categoria definitiva (sem nenhuma, ou em "Outros / a classificar"),
 * com o que o nome sugere hoje e quanto valem em estoque. Marca vários, escolhe a categoria, classifica de uma vez; cada
 * insumo ganha o seu registro antes/depois no histórico. Uma lista só (a mesma marcação serve ao celular e ao desktop), com
 * linha de 44 px no toque. Erro volta no alto, sem perder a marcação.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import type { LinhaDaFila } from '@/lib/erp/classificar';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, MARCAR } from '../../ui/campos';
import { SalvandoAnunciado, useAcaoSegura } from '../cadastro/anuncio';
import { ErroGeral } from '../cadastro/erros';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';

function BarraDeAcao({
  posicao,
  categorias,
  categoriaId,
  aoEscolher,
  marcados,
  bloqueio,
}: {
  posicao: 'topo' | 'rodape';
  categorias: readonly OpcaoDeCategoria[];
  categoriaId: string;
  aoEscolher: (id: string) => void;
  marcados: number;
  bloqueio: string | null;
}) {
  const id = `fila-categoria-${posicao}`;
  return (
    <div className="flex flex-col gap-2 border-linha px-4 py-3 sm:flex-row sm:items-end sm:px-5 lg:gap-3">
      <div className="min-w-0 sm:w-72">
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-texto">
          Classificar os marcados como
        </label>
        <select id={id} value={categoriaId} onChange={(e) => aoEscolher(e.target.value)} className={`${CAMPO} pr-8`}>
          <option value="" disabled>
            Selecione a categoria
          </option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <BotaoEnviar disabled={!!bloqueio || marcados === 0 || !categoriaId} pendente="Classificando…" className="sm:min-w-52">
        {marcados === 0 ? 'Classificar os marcados' : `Classificar ${marcados} ${marcados === 1 ? 'marcado' : 'marcados'}`}
      </BotaoEnviar>
      <BotaoEnviar nome="aceitar" valor="1" variante="secundario" disabled={!!bloqueio || marcados === 0} pendente="Classificando…" className="sm:min-w-64">
        Aceitar a sugestão dos marcados
      </BotaoEnviar>
    </div>
  );
}

export function FormDaFila({
  acao,
  linhas,
  categorias,
  base,
  bloqueio,
}: {
  acao: AcaoDeCadastro;
  linhas: LinhaDaFila[];
  categorias: readonly OpcaoDeCategoria[];
  base: string;
  bloqueio: string | null;
}) {
  const segura = useAcaoSegura(acao);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(segura, null);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [categoriaId, setCategoriaId] = useState('');
  // Depois de um envio que deu certo a página é refeita no servidor e a lista chega nova: a marcação recomeça vazia (não sobra
  // marcado o que já saiu da fila, nem o que continua nela e a pessoa não escolheu de novo). Erro não refaz a lista: a marcação fica.
  useEffect(() => setMarcados(new Set()), [linhas]);
  const todos = marcados.size === linhas.length && linhas.length > 0;
  const mostraValor = useMemo(() => linhas.some((l) => l.valorCentavos !== null), [linhas]);
  // "Aceitar a sugestão" classifica só o que o nome decide: os marcados que estão "sem certeza" ficam na fila.
  const semCerteza = useMemo(() => linhas.filter((l) => marcados.has(l.id) && l.sugestao.ambigua).length, [linhas, marcados]);
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form action={enviar} noValidate>
      <SalvandoAnunciado texto="Classificando…" />
      <input type="hidden" name="categoriaId" value={categoriaId} />
      {Array.from(marcados).map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
      {estado?.erros.geral && (
        <div className="px-4 pt-3 sm:px-5">
          <ErroGeral estado={estado} recarregar="" />
        </div>
      )}
      <BarraDeAcao posicao="topo" categorias={categorias} categoriaId={categoriaId} aoEscolher={setCategoriaId} marcados={marcados.size} bloqueio={bloqueio} />
      <p aria-live="polite" className="px-4 pb-2 text-[12px] tabular-nums text-suave sm:px-5">
        {marcados.size === 0 ? 'Nenhum insumo marcado.' : `${marcados.size} de ${linhas.length} marcados.`}
        {semCerteza > 0 &&
          ` Pela sugestão do nome, ${semCerteza} ${semCerteza === 1 ? 'está' : 'estão'} “sem certeza” e ${semCerteza === 1 ? 'fica' : 'ficam'} na fila: escolha a categoria para ${semCerteza === 1 ? 'ele' : 'eles'}.`}
      </p>

      <div className="border-t border-linha">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 bg-forte px-4 text-[12px] font-semibold text-suave sm:px-5">
          <input
            type="checkbox"
            className={MARCAR}
            checked={todos}
            onChange={(e) => setMarcados(e.target.checked ? new Set(linhas.map((l) => l.id)) : new Set())}
          />
          <span>Marcar todos desta página ({linhas.length})</span>
        </label>
        <ul role="list" className="divide-y divide-linha">
          {linhas.map((l) => {
            const idCaixa = `fila-${l.id}`;
            return (
              <li key={l.id} className="ff-transicao hover:bg-texto/[0.03]">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 px-4 py-2 sm:px-5 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] lg:items-center">
                  <label htmlFor={idCaixa} className="flex min-h-11 cursor-pointer items-center">
                    <input id={idCaixa} type="checkbox" className={MARCAR} checked={marcados.has(l.id)} onChange={() => alternar(l.id)} />
                    <span className="sr-only">Marcar {l.nome}</span>
                  </label>
                  <div className="min-w-0 py-1.5 lg:contents">
                    <div className="min-w-0">
                      <Link href={`${base}/${l.id}`} className="ff-transicao block truncate rounded-[5px] text-[15px] font-semibold text-texto underline-offset-4 hover:underline">
                        {l.nome}
                      </Link>
                      {l.motivo && <p className="text-[12px] text-suave lg:hidden">{l.motivo}</p>}
                    </div>
                    <p className="text-[13px] text-suave lg:text-texto">
                      <span className="lg:hidden">Agora: </span>
                      <span className="text-atencao">{l.categoria ?? 'Sem categoria'}</span>
                      {l.motivo && <span className="hidden text-[12px] text-suave lg:block">{l.motivo}</span>}
                    </p>
                    <p className="text-[13px] text-suave">
                      Sugestão do nome: <span className={l.sugestao.ambigua ? 'text-suave' : 'text-texto'}>{l.sugestao.ambigua ? 'sem certeza' : l.sugestao.nome}</span>
                    </p>
                    {mostraValor && (
                      <p className="text-[13px] tabular-nums text-suave lg:text-right">
                        {l.valorCentavos ? `${formatarDinheiro(l.valorCentavos)} em estoque` : 'sem saldo'}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-linha">
        <BarraDeAcao posicao="rodape" categorias={categorias} categoriaId={categoriaId} aoEscolher={setCategoriaId} marcados={marcados.size} bloqueio={bloqueio} />
      </div>
    </form>
  );
}
