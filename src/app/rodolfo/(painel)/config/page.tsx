import { situacaoDaInstancia } from '@/lib/whatsapp/situacao-da-instancia';
import { prisma } from '@/lib/db';
import { lerConfig } from '@/lib/rodolfo/config';
import { normalizarTelefone } from '@/lib/barney/telefone';
import { montarEstadoEnvio, INSTANCIA } from '@/lib/rodolfo/estado';

/** 120 → "2 min"; 150 → "2 min e 30 s". */
const minutos = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)} min e ${s % 60} s`);
import { ENVIOS_MANUAIS_INICIAIS, INTERVALO_MIN_S, MAX_POR_DIA, MAX_POR_HORA, RAMPA_POR_SEMANA, RAMPA_TETO_FINAL, STOP_LOSS, TOQUES } from '@/lib/barney/regras';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Painel, Selo } from '@/components/erp/ui/superficies';
import { ConfigForm } from './config-form';
import { ChaveDoDisparo } from './chave-do-disparo';
import { exigirNivel1 } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

export default async function ConfigPage() {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const [config, estado, instancia] = await Promise.all([
    lerConfig(),
    montarEstadoEnvio(),
    prisma.instanceState.findUnique({
      where: { nome: INSTANCIA },
      select: { numeroProprio: true },
    }),
  ]);

  // Prospectar do próprio telefone é decisão do Rodolfo, e é defensável: número
  // antigo com histórico real resiste melhor a ban que chip novo. O que muda é o
  // CUSTO de um bloqueio — por isso a tela diz em voz alta quando é o caso.
  const proprioNumero =
    instancia?.numeroProprio && process.env.RODOLFO_WHATSAPP
      ? normalizarTelefone(instancia.numeroProprio).e164 === normalizarTelefone(process.env.RODOLFO_WHATSAPP).e164
      : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icone="config"
        cor={COR.comercial}
        titulo="Regras de envio"
        subtitulo="Você pode apertar os limites; nunca passar dos tetos fixos."
      />

      <Painel titulo="Disparo" acessorio={<Selo tom={config.disparoAtivo ? 'ok' : 'neutro'}>{config.disparoAtivo ? 'Ligado' : 'Desligado'}</Selo>}>
        <p className="mb-3 text-[13px] text-suave">
          {config.disparoAtivo
            ? 'As mensagens saem do lote aprovado, um a um, dentro dos limites abaixo e da janela de envio.'
            : 'Chave geral desligada: nada sai, nem à mão. Ligue quando for começar a prospectar.'}
        </p>
        <ChaveDoDisparo ligado={config.disparoAtivo} />
      </Painel>

      <Painel
        titulo="WhatsApp da prospecção"
        acessorio={
          <Selo tom={situacaoDaInstancia(estado.estadoInstancia).tom}>{situacaoDaInstancia(estado.estadoInstancia).texto}</Selo>
        }
      >
        <p className="text-[13px] text-suave">
          {estado.primeiroEnvioEm
            ? `O aumento gradual do número começou em ${estado.primeiroEnvioEm.setLocale('pt-BR').toFormat('dd/LL/yyyy')}.`
            : 'O aumento gradual ainda não começou: ele conta a partir do primeiro envio.'}
        </p>
        {estado.estadoInstancia !== 'open' && (
          <div className="mt-3">
            <Aviso tom="alerta" titulo="WhatsApp desconectado.">
              Leia o QR code para conectar. Enquanto não estiver conectado, nada é enviado.
            </Aviso>
          </div>
        )}

        {proprioNumero && (
          <div className="mt-3">
            <Aviso tom="alerta" titulo="Modo telefone pessoal.">
              O número que prospecta é o mesmo que recebe as notificações, então elas ficam desligadas: a resposta do lead já
              chega neste aparelho. Um número antigo resiste melhor a bloqueio que um chip novo, mas, se cair, leva junto o
              WhatsApp que está no site. O aumento gradual continua valendo.
            </Aviso>
          </div>
        )}
      </Painel>

      <Painel titulo="Limites que você pode apertar">
        <ConfigForm config={config} />
      </Painel>

      <Painel titulo="Tetos fixos">
        <ul className="space-y-2 text-sm text-suave">
          <li className="flex justify-between gap-4">
            <span>Teto absoluto por dia</span>
            <strong className="tabular-nums text-texto">{MAX_POR_DIA}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Teto absoluto por hora</span>
            <strong className="tabular-nums text-texto">{MAX_POR_HORA}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Intervalo mínimo entre envios</span>
            <strong className="tabular-nums text-texto">{minutos(INTERVALO_MIN_S)}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Aumento gradual do número novo</span>
            <strong className="text-right text-texto">{`${RAMPA_POR_SEMANA[0]} por dia na 1ª semana, ${RAMPA_POR_SEMANA[1]} na 2ª, depois ${RAMPA_TETO_FINAL}`}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Envios manuais iniciais</span>
            <strong className="tabular-nums text-texto">{ENVIOS_MANUAIS_INICIAIS}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Pausa automática: falhas seguidas</span>
            <strong className="tabular-nums text-texto">{STOP_LOSS.falhasConsecutivas}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Pausa automática: entrega abaixo de</span>
            <strong className="tabular-nums text-texto">{STOP_LOSS.taxaEntregaMinima * 100}%</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Mensagens por lead</span>
            <strong className="text-texto">{`${TOQUES.length}, nos dias ${TOQUES.map((t) => t.offsetDias).join(', ').replace(/, (\d+)$/, ' e $1')}`}</strong>
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-suave">
          Estes valores protegem o número contra bloqueio. Não mudam por aqui: mudar qualquer um deles é uma decisão do
          negócio.
        </p>
      </Painel>
    </div>
  );
}
