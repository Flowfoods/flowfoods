'use client';

import { useActionState } from 'react';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { CAMPO, Resultado, ROTULO, type EstadoForm } from '@/components/erp/ui/campos';

export function FormularioDoRecorte({ acao, opcoes, atual, liberada }: {
  acao: (anterior: EstadoForm, form: FormData) => Promise<EstadoForm>;
  opcoes: { id: string; rotulo: string }[];
  atual: string | null;
  liberada: boolean;
}) {
  const [estado, enviar] = useActionState(acao, null);
  const atualDisponivel = atual && opcoes.some(opcao => opcao.id === atual);
  return <form action={enviar} className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 max-w-full">
        <label htmlFor="consultoria-origem" className={ROTULO}>Loja e origem Analytics</label>
        <select id="consultoria-origem" name="conexao" className={`${CAMPO} max-w-full`} defaultValue={atualDisponivel ? atual : ''} required>
          <option value="">Escolha a origem do recorte</option>
          {opcoes.map(opcao => <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>)}
        </select>
      </div>
      <BotaoEnviar>{liberada ? 'Atualizar recorte' : 'Liberar prévia'}</BotaoEnviar>
    </div>
    <Resultado estado={estado} />
  </form>;
}
