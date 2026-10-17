'use client';

/**
 * Confirmar a lista (3.2): a barra fixa do celular com "Confirmar a lista (N)". O rascunho vai junto como campos escondidos
 * (a tela só mostra o que a URL tinha); o envio leva uma chave sorteada na tela, então confirmar duas vezes o mesmo formulário
 * (duplo clique, rede que volta) dá os mesmos lotes. Nada vale pela metade: o servidor lê tudo de novo e grava os lotes numa
 * transação só. Quem decide é o servidor.
 */

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import type { LinhaDoRascunho } from '@/lib/erp/lista-do-dia-campos';
import { BotaoEnviar } from '../../ui/botoes';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

export function FormConfirmarLista({
  acao,
  dia,
  linhas,
  lotes,
  motivoParado,
}: {
  acao: AcaoDeEstoque;
  dia: string;
  linhas: readonly LinhaDoRascunho[];
  /** Quantos lotes a lista vai criar (a mesma ficha duas vezes vira um). */
  lotes: number;
  /** Por que não dá para confirmar agora (linha com problema, estoque fechado…); null = dá. */
  motivoParado: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [envio, setEnvio] = useState('');
  // A chave nasce no navegador (sem ela o envio ainda funciona, só não é protegido contra o duplo clique).
  useEffect(() => setEnvio(`lista-${globalThis.crypto.randomUUID()}`), []);
  const erros = estado?.erros ?? {};
  const geral = erros.geral ?? erros.paraDia ?? (Object.keys(erros).some((k) => k.startsWith('linha:')) ? 'Há linha com problema na lista: corrija e confirme de novo.' : null);
  return (
    <form action={enviar} data-barra-fixa className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 sm:sticky sm:bottom-0 sm:rounded-[14px] sm:border sm:px-5">
      <input type="hidden" name="dia" value={dia} />
      <input type="hidden" name="envio" value={envio} />
      {linhas.map((l, n) => (
        <input key={n} type="hidden" name="l" value={`${l.fichaId}~${l.quantidade}`} />
      ))}
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-[13px] text-suave" role={geral ? 'alert' : undefined}>
          {geral ? <span className="text-erro">{geral}</span> : (motivoParado ?? `${lotes} ${lotes === 1 ? 'lote' : 'lotes'} e ${lotes === 1 ? 'a requisição' : 'as requisições'} dos insumos. Nada sai do estoque agora.`)}
        </p>
        <BotaoEnviar pendente="Confirmando…" disabled={!!motivoParado} className="min-w-[200px]">
          Confirmar a lista ({lotes})
        </BotaoEnviar>
      </div>
    </form>
  );
}
