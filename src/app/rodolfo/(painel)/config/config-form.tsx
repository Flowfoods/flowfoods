'use client';

import { useFormState } from 'react-dom';
import { acaoSalvarConfig, type Resposta } from '../actions';
import { BotaoEnviar, MensagemDeResposta } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, MARCAR, ROTULO } from '@/components/erp/ui/campos';
import type { ConfigBarney } from '@/lib/rodolfo/config';
import { INTERVALO_MAXIMO_MIN } from '@/lib/rodolfo/regras-de-envio';

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
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <input id={id} name={id} type="number" className={`${CAMPO} tabular-nums`} {...props} />
      {ajuda && <p className={AJUDA}>{ajuda}</p>}
    </div>
  );
}

export function ConfigForm({ config }: { config: ConfigBarney }) {
  const [estado, acao] = useFormState(acaoSalvarConfig, inicial);

  return (
    <form action={acao} className="space-y-5">
      <label className="flex items-start gap-3 rounded-[7px] border border-linha bg-texto/[0.03] p-3">
        <input
          type="checkbox"
          name="modoAprovacao"
          defaultChecked={config.modoAprovacao}
          className={`${MARCAR} mt-0.5`}
        />
        <span>
          <span className="block text-sm font-semibold">Exigir aprovação do lote</span>
          <span className="mt-0.5 block text-[13px] text-suave">
            Só sai mensagem de lote que você aprovou no dia. Manter ligado é o recomendado.
          </span>
        </span>
      </label>

      <div>
        <span className="mb-2 block text-[13px] font-medium text-texto">Dias da janela</span>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => (
            <label
              key={d.n}
              className="ff-transicao flex min-h-11 cursor-pointer items-center gap-2 rounded-[7px] border border-linha-forte px-3 text-[13px] hover:bg-texto/5 has-[:checked]:border-texto/60 has-[:checked]:bg-forte has-[:checked]:font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-acento sm:min-h-9"
            >
              <input
                type="checkbox"
                name="diaSemana"
                value={d.n}
                defaultChecked={config.janela.diasSemana.includes(d.n)}
                className="h-4 w-4 accent-[rgb(var(--ff-acao))]"
              />
              {d.r}
            </label>
          ))}
        </div>
        <p className={AJUDA}>Sábado e domingo não entram: a janela só pode ficar menor, nunca maior.</p>
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
          ajuda="No máximo 30. O aumento gradual do número novo pode deixar o teto do dia menor."
        />
        <Campo
          id="maxPorHora"
          rotulo="Máximo por hora"
          min={1}
          max={8}
          defaultValue={config.maxPorHora}
          ajuda="No máximo 8."
        />
        <Campo
          id="intervaloMinMinutos"
          rotulo="Intervalo mínimo (minutos)"
          min={2}
          max={INTERVALO_MAXIMO_MIN}
          step={0.5}
          defaultValue={Math.round(config.intervaloMinS / 30) / 2}
          ajuda="Nunca menos de 2 minutos."
        />
        <Campo
          id="intervaloMaxMinutos"
          rotulo="Intervalo máximo (minutos)"
          min={2}
          max={INTERVALO_MAXIMO_MIN}
          step={0.5}
          defaultValue={Math.round(config.intervaloMaxS / 30) / 2}
          ajuda={`Até ${INTERVALO_MAXIMO_MIN} minutos. Entre um envio e outro, o sistema sorteia um tempo entre o mínimo e o máximo.`}
        />
      </div>

      <BotaoEnviar pendente="Salvando…">Salvar ajustes</BotaoEnviar>

      <MensagemDeResposta resposta={estado} />
    </form>
  );
}
