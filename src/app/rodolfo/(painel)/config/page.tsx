import { situacaoDaInstancia } from '@/lib/whatsapp/situacao-da-instancia';
import { prisma } from '@/lib/db';
import { lerConfig } from '@/lib/rodolfo/config';
import { normalizarTelefone } from '@/lib/barney/telefone';
import { montarEstadoEnvio, INSTANCIA } from '@/lib/rodolfo/estado';
import { ENVIOS_MANUAIS_INICIAIS, INTERVALO_MIN_S, MAX_POR_DIA, MAX_POR_HORA, STOP_LOSS, TOQUES } from '@/lib/barney/regras';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Aviso, Painel, Selo } from '@/components/erp/ui/superficies';
import { ConfigForm } from './config-form';
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
    <div className="space-y-6">
      <PageHeader
        icone="config"
        cor={COR.sistema}
        titulo="Config"
        subtitulo="Só aperta. Nenhum valor aqui sobe um teto rígido."
      />

      <Painel
        titulo="Instância"
        acessorio={
          <Selo tom={situacaoDaInstancia(estado.estadoInstancia).tom}>{situacaoDaInstancia(estado.estadoInstancia).texto}</Selo>
        }
      >
        <p className="text-sm text-texto">{INSTANCIA}</p>
        <p className="mt-2 text-[13px] text-suave">
          {estado.primeiroEnvioEm
            ? `Rampa começou em ${estado.primeiroEnvioEm.setLocale('pt-BR').toFormat('dd/LL/yyyy')}.`
            : 'Rampa ainda não começou — ela conta a partir do primeiro envio.'}
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

      <Painel titulo="Ajustes">
        <ConfigForm config={config} />
      </Painel>

      <Painel titulo="Regras que a configuração não alcança">
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
            <strong className="tabular-nums text-texto">{INTERVALO_MIN_S}s</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Rampa de número novo</span>
            <strong className="text-texto">10 → 20 → 30/dia</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Envios manuais iniciais</span>
            <strong className="tabular-nums text-texto">{ENVIOS_MANUAIS_INICIAIS}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Stop-loss: falhas seguidas</span>
            <strong className="tabular-nums text-texto">{STOP_LOSS.falhasConsecutivas}</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Stop-loss: piso de entrega</span>
            <strong className="tabular-nums text-texto">{STOP_LOSS.taxaEntregaMinima * 100}%</strong>
          </li>
          <li className="flex justify-between gap-4">
            <span>Mensagens por lead</span>
            <strong className="text-texto">{`${TOQUES.length}, nos dias ${TOQUES.map((t) => t.offsetDias).join(', ').replace(/, (\d+)$/, ' e $1')}`}</strong>
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-suave">
          Valores no código (<code>regras.ts</code>), com teste para cada um. Mudar aqui é mudar a regra do negócio, não
          um parâmetro.
        </p>
      </Painel>
    </div>
  );
}
