'use client';

import { useFormState } from 'react-dom';
import { acaoSalvarConfig, type Resposta } from '../actions';
import { BotaoSubmit, MensagemForm } from '../botoes';
import type { ConfigBarney } from '@/lib/rodolfo/config';

const DIAS = [
  { n: 1, r: 'Seg' },
  { n: 2, r: 'Ter' },
  { n: 3, r: 'Qua' },
  { n: 4, r: 'Qui' },
  { n: 5, r: 'Sex' },
];

const inicial: Resposta | null = null;

function Campo({
  id,
  rotulo,
  ajuda,
  ...props
}: { id: string; rotulo: string; ajuda?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-surface/60">
        {rotulo}
      </label>
      <input
        id={id}
        name={id}
        type="number"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm tabular-nums outline-none focus:border-bright"
        {...props}
      />
      {ajuda && <p className="mt-1 text-[11px] text-surface/40">{ajuda}</p>}
    </div>
  );
}

export function ConfigForm({ config }: { config: ConfigBarney }) {
  const [estado, acao] = useFormState(acaoSalvarConfig, inicial);

  return (
    <form action={acao} className="space-y-5">
      <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <input
          type="checkbox"
          name="disparoAtivo"
          defaultChecked={config.disparoAtivo}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
        <span>
          <span className="block text-sm font-semibold">Disparo ativo</span>
          <span className="mt-0.5 block text-xs text-surface/55">
            Chave geral. Desligada, nada sai — nem automático, nem manual.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <input
          type="checkbox"
          name="modoAprovacao"
          defaultChecked={config.modoAprovacao}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
        <span>
          <span className="block text-sm font-semibold">Exigir aprovação do lote</span>
          <span className="mt-0.5 block text-xs text-surface/55">
            O worker só drena lote aprovado no dia. Manter ligado é o recomendado.
          </span>
        </span>
      </label>

      <div>
        <span className="mb-2 block text-xs font-medium text-surface/60">Dias da janela</span>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => (
            <label
              key={d.n}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs has-[:checked]:border-bright has-[:checked]:bg-bright/10"
            >
              <input
                type="checkbox"
                name="diaSemana"
                value={d.n}
                defaultChecked={config.janela.diasSemana.includes(d.n)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {d.r}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-surface/40">
          Sábado e domingo não são oferecidos — a janela só aperta para dentro.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          id="horaInicio"
          rotulo="Abre às"
          min={10}
          max={17}
          defaultValue={config.janela.horaInicio}
          ajuda="Nunca antes das 10h."
        />
        <Campo
          id="horaFim"
          rotulo="Fecha às"
          min={11}
          max={18}
          defaultValue={config.janela.horaFim}
          ajuda="Nunca depois das 18h."
        />
        <Campo
          id="maxPorDia"
          rotulo="Máximo por dia"
          min={1}
          max={30}
          defaultValue={config.maxPorDia}
          ajuda="Teto absoluto 30. A rampa pode reduzir mais."
        />
        <Campo
          id="maxPorHora"
          rotulo="Máximo por hora"
          min={1}
          max={8}
          defaultValue={config.maxPorHora}
          ajuda="Teto absoluto 8."
        />
        <Campo
          id="intervaloMinS"
          rotulo="Intervalo mínimo (s)"
          min={120}
          defaultValue={config.intervaloMinS}
          ajuda="Piso rígido de 120s."
        />
        <Campo
          id="intervaloMaxS"
          rotulo="Intervalo máximo (s)"
          min={120}
          defaultValue={config.intervaloMaxS}
          ajuda="O sorteio fica entre mínimo e máximo."
        />
      </div>

      <BotaoSubmit pendenteRotulo="Salvando…">Salvar</BotaoSubmit>

      <MensagemForm resposta={estado} />
    </form>
  );
}
