'use client';

/**
 * Cadastrar pedido manual (0.5): quem chegou por outro caminho (indicação,
 * WhatsApp, visita). Mesmos campos e mesmas regras do formulário do site, sem a
 * autorização (quem digita é o Rodolfo). Tela própria, como os outros cadastros.
 */

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { useState } from 'react';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { CAMPO, Campo } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Painel } from '@/components/erp/ui/superficies';
import { Segmentos } from '@/components/erp/ui/segmentos';
import { acaoCadastrarPedidoManual, type EstadoDoPedido } from '../actions';

export function FormManual() {
  const [estado, enviar] = useFormState<EstadoDoPedido, FormData>(acaoCadastrarPedidoManual, null);
  const [etapa, setEtapa] = useState<'NOVO' | 'EM_CONVERSA'>('NOVO');
  const e = estado && !estado.ok ? (estado.erros ?? {}) : {};
  const campo = (id: string, nome: string, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Campo id={id} rotulo={rotulo} erro={e[nome]}>
      <input
        id={id}
        name={nome}
        required
        autoComplete="off"
        aria-invalid={!!e[nome]}
        aria-describedby={`${id}-erro`}
        className={CAMPO}
        {...extra}
      />
    </Campo>
  );
  return (
    <form action={enviar} className="space-y-4">
      <Painel titulo="Quem é" subtitulo="O mesmo que o site pergunta. Fica em “Aguardando liberação” até você ativar ou recusar.">
        <div className="space-y-4">
          {campo('m-grupo', 'nomeGrupo', 'Nome do grupo ou do restaurante', { maxLength: 80 })}
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('m-resp', 'responsavel', 'Responsável', { maxLength: 80 })}
            {campo('m-whats', 'whatsapp', 'WhatsApp', { type: 'tel', inputMode: 'tel', maxLength: 40, placeholder: '(21) 99999-9999' })}
          </div>
          {campo('m-email', 'email', 'E-mail', { type: 'email', maxLength: 160, placeholder: 'maria@restaurante.com.br' })}
          <div className="grid gap-4 sm:grid-cols-3">
            {campo('m-lojas', 'lojas', 'Lojas', { type: 'number', inputMode: 'numeric', min: 1, max: 200 })}
            {campo('m-marcas', 'marcas', 'Marcas', { type: 'number', inputMode: 'numeric', min: 1, max: 50 })}
            {campo('m-cidade', 'cidade', 'Cidade e estado', { maxLength: 80, placeholder: 'Rio de Janeiro/RJ' })}
          </div>
          <Segmentos
            nome="etapa"
            legenda="Já está em conversa?"
            opcoes={[
              ['NOVO', 'Ainda não falei'],
              ['EM_CONVERSA', 'Já estamos conversando'],
            ]}
            valor={etapa}
            aoMudar={setEtapa}
          />
          <p className="text-[12px] text-suave">
            Este cadastro não tem o aceite de dados que o site pede. Use só depois de falar com a pessoa.
          </p>
        </div>
      </Painel>
      {e.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {e.geral}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Link href="/rodolfo/onboarding" className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar pendente="Cadastrando…">Cadastrar pedido</BotaoEnviar>
      </div>
    </form>
  );
}
