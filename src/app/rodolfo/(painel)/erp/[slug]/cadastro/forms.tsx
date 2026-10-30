'use client';

import { useFormState } from 'react-dom';
import { useAvisoDeSaida } from '@/components/erp/telas/cadastro/erros';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { CAMPO, Erro, ROTULO, Resultado, type EstadoForm } from '@/components/erp/ui/campos';
import { acaoMudarStatusParceiro, acaoRenomearParceiro } from '../../actions';

export function FormRenomear({ slug, nome }: { slug: string; nome: string }) {
  const saida = useAvisoDeSaida();
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoRenomearParceiro.bind(null, slug), null);
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-1.5">
      <label htmlFor="nome-parceiro" className={ROTULO}>
        Nome do parceiro
      </label>
      <div className="flex gap-2">
        <input
          id="nome-parceiro"
          name="nome"
          defaultValue={nome}
          required
          maxLength={80}
          autoComplete="off"
          className={`${CAMPO} min-w-0 flex-1`}
          aria-invalid={!!estado?.erros?.nome}
          aria-describedby="nome-parceiro-erro"
        />
        <BotaoEnviar variante="secundario">Salvar nome</BotaoEnviar>
      </div>
      <Erro id="nome-parceiro-erro" texto={estado?.erros?.nome} />
      <Resultado estado={estado} />
    </form>
  );
}

/** Uma ação por vez, a que o status atual permite. Suspender pede motivo. */
export function FormStatus({ slug, novo }: { slug: string; novo: 'ATIVO' | 'SUSPENSO' }) {
  const saida = useAvisoDeSaida();
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoMudarStatusParceiro.bind(null, slug), null);
  const suspender = novo === 'SUSPENSO';
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-3">
      <input type="hidden" name="status" value={novo} />
      {suspender && (
        <div>
          <label htmlFor="motivo" className={ROTULO}>
            Motivo da suspensão
          </label>
          <input
            id="motivo"
            name="motivo"
            maxLength={200}
            autoComplete="off"
            placeholder="Ex.: contrato pausado em outubro"
            className={CAMPO}
            aria-invalid={!!estado?.erros?.motivo}
            aria-describedby="motivo-erro"
          />
          <Erro id="motivo-erro" texto={estado?.erros?.motivo} />
        </div>
      )}
      <BotaoEnviar variante={suspender ? 'secundario' : 'primario'} pendente="Aplicando…" className="w-full">
        {suspender ? 'Suspender parceiro' : 'Ativar parceiro'}
      </BotaoEnviar>
      <Resultado estado={estado} />
    </form>
  );
}
