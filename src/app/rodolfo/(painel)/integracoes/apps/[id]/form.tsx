'use client';

import { useActionState, useEffect, useRef } from 'react';
import { FormularioComAcao } from '@/components/erp/ui/formulario-com-acao';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { CAMPO, ROTULO, MARCAR, Erro, Resultado, type EstadoForm } from '@/components/erp/ui/campos';
import { ESTADOS_DO_PARECER, type EstadoDoParecer } from '@/lib/integracoes/core/homologacao-campos';
import { ROTULO_DA_HOMOLOGACAO } from '../../rotulos';
import { acaoRegistrarParecer } from '../../actions';

export function FormParecer({ appId, versao, estadoAtual, referencia }: { appId: string; versao: string; estadoAtual: EstadoDoParecer; referencia: string }) {
  const [estado, enviar] = useActionState<EstadoForm, FormData>(acaoRegistrarParecer.bind(null, appId, versao), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.vez && !estado.ok) (form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form.current?.querySelector<HTMLElement>('[data-resposta]'))?.focus();
  }, [estado]);
  const erro = (nome: string) => estado?.erros?.[nome];
  return <FormularioComAcao ref={form} action={enviar} noValidate className="space-y-4">
    <div>
      <label className={ROTULO} htmlFor="parecer-estado">Situação no iFood</label>
      <select className={CAMPO} id="parecer-estado" name="estado" defaultValue={estadoAtual} aria-invalid={!!erro('estado')} aria-describedby="parecer-estado-erro">
        {ESTADOS_DO_PARECER.map(e => <option key={e} value={e}>{ROTULO_DA_HOMOLOGACAO[e]}</option>)}
      </select>
      <Erro id="parecer-estado-erro" texto={erro('estado')} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {([{ nome: 'validacaoEm', rotulo: 'Validação técnica aprovada em' }, { nome: 'liberacaoEm', rotulo: 'App liberado pelo iFood em' }] as const).map(c => <div key={c.nome}>
        <label className={ROTULO} htmlFor={`parecer-${c.nome}`}>{c.rotulo}</label>
        <input className={`${CAMPO} min-w-0`} type="date" id={`parecer-${c.nome}`} name={c.nome} aria-invalid={!!erro(c.nome)} aria-describedby={`parecer-${c.nome}-erro`} />
        <Erro id={`parecer-${c.nome}-erro`} texto={erro(c.nome)} />
      </div>)}
    </div>
    <p className="text-sm text-suave">Use as datas de Brasília. Aprovação técnica e liberação do aplicativo são etapas diferentes. Informe a liberação somente quando o iFood mostrar Homologado.</p>
    <div>
      <label className={ROTULO} htmlFor="parecer-referencia">Página consultada no iFood Developer</label>
      <input className={CAMPO} type="url" id="parecer-referencia" name="referencia" defaultValue={referencia} maxLength={300} aria-invalid={!!erro('referencia')} aria-describedby="parecer-referencia-ajuda parecer-referencia-erro" />
      <p id="parecer-referencia-ajuda" className="mt-1 text-sm text-suave">Guarde o relatório ou a captura no dossiê privado. Aqui, informe apenas o endereço da página, sem segredo, token ou link temporário do PDF.</p>
      <Erro id="parecer-referencia-erro" texto={erro('referencia')} />
    </div>
    <div>
      <label className="flex items-start gap-2 text-sm" htmlFor="parecer-conferido">
        <input className={MARCAR} type="checkbox" id="parecer-conferido" name="conferido" value="sim" aria-invalid={!!erro('conferido')} aria-describedby="parecer-conferido-erro" />
        Conferi a situação deste app no iFood. Entendo que registrar Homologado pode permitir a coleta nas conexões que já estiverem ativas e autorizadas.
      </label>
      <Erro id="parecer-conferido-erro" texto={erro('conferido')} />
    </div>
    <div data-resposta tabIndex={-1}><Resultado estado={estado} /></div>
    <BotaoEnviar>Registrar parecer</BotaoEnviar>
  </FormularioComAcao>;
}
