/**
 * Worker do Barney — o processo que drena a fila.
 *
 * App separado no Dokploy, mesmo repositório. Roda continuamente e, a cada
 * volta, pede UM envio ao `dispararProximo`. Um por volta, nunca um laço que
 * despeja o lote: entre duas mensagens tem que passar o intervalo aleatório, e
 * rajada é exatamente o padrão que o WhatsApp classifica como bot.
 *
 * DESVIO REGISTRADO (docs/DECISOES.md #11): o Master Prompt pede BullMQ/Redis.
 * Aqui é um laço em processo único, sem Redis. Motivo: o teto é 30 mensagens
 * por dia com no mínimo 120 s entre elas — 1 job a cada 5 minutos, no pico.
 * Uma fila distribuída para esse volume adiciona Redis, serialização e modos de
 * falha novos sem resolver problema nenhum, e o contrato do próprio prompt já
 * condiciona o Redis dedicado a sobrar RAM na VPS (parada de segurança #6).
 * A interface para o Dokploy é a mesma: um app `worker` que fica de pé.
 *
 * Toda a decisão de PODE ou NÃO PODE enviar continua em `podeEnviar` — este
 * arquivo não tem nenhuma regra própria, de propósito.
 */

import { DateTime } from 'luxon';
import { prisma } from '../src/lib/db';
import { TIMEZONE } from '../src/lib/barney/regras';
import { sortearIntervaloSegundos } from '../src/lib/barney/tetos';
import { dispararProximo } from '../src/lib/rodolfo/lote';
import { lerConfig } from '../src/lib/rodolfo/config';
import { montarEstadoEnvio } from '../src/lib/rodolfo/estado';
import { TransporteEvolutionHttp } from '../src/lib/whatsapp/evolution';

/** Quanto esperar quando não há nada a fazer (fora da janela, teto batido). */
const ESPERA_OCIOSA_S = 300;

/** De quanto em quanto tempo reconferir o estado da instância na Evolution. */
const CHECAGEM_INSTANCIA_S = 600;

const dormir = (s: number) => new Promise((r) => setTimeout(r, Math.max(1, s) * 1000));

const agora = () => DateTime.now().setZone(TIMEZONE);

function log(nivel: 'info' | 'aviso' | 'erro', msg: string, extra?: Record<string, unknown>) {
  const linha = {
    ts: agora().toISO(),
    nivel,
    msg,
    ...extra,
  };
  // Log estruturado: no Dokploy isso vira uma linha grepável por campo.
  console.log(JSON.stringify(linha));
}

/**
 * Sincroniza `InstanceState` com a Evolution.
 *
 * O `CONNECTION_UPDATE` do webhook já mantém isso em dia, mas webhook se perde:
 * se a instância cair enquanto o portal estiver fora do ar, ninguém avisa. Esta
 * checagem periódica é a rede de segurança do stop-loss.
 */
async function sincronizarInstancia(transporte: TransporteEvolutionHttp): Promise<void> {
  if (!transporte.configurado) return;

  const nome = process.env.EVOLUTION_INSTANCE ?? 'flowfoods-prospeccao';
  const estado = await transporte.estadoInstancia();

  await prisma.instanceState.upsert({
    where: { nome },
    create: { nome, estado, ultimoCheck: new Date() },
    update: { estado, ultimoCheck: new Date() },
  });

  if (estado !== 'open') log('aviso', 'instancia fora do ar', { nome, estado });
}

async function volta(transporte: TransporteEvolutionHttp): Promise<number> {
  const config = await lerConfig();

  // A chave geral desliga o worker sem precisar derrubar o container.
  if (!config.disparoAtivo) return ESPERA_OCIOSA_S;

  const r = await dispararProximo({});

  if (r.enviou) {
    const intervalo = sortearIntervaloSegundos(
      Math.random,
      config.intervaloMinS,
      config.intervaloMaxS,
    );
    log('info', 'enviado', {
      leadId: r.leadId,
      toque: r.toque,
      simulado: r.simulado === true,
      proximoEmS: intervalo,
    });
    return intervalo;
  }

  // Nada enviado. O motivo diz se é espera curta (intervalo) ou longa (janela,
  // teto, stop-loss) — não faz sentido acordar de minuto em minuto num sábado.
  log('info', 'nada a enviar', { motivo: r.motivo });
  return ESPERA_OCIOSA_S;
}

async function principal(): Promise<void> {
  const transporte = new TransporteEvolutionHttp();

  log('info', 'worker iniciado', {
    evolutionConfigurada: transporte.configurado,
    tz: TIMEZONE,
  });

  if (!transporte.configurado) {
    log('aviso', 'EVOLUTION_API_URL/KEY ausentes — os envios sairão como dry-run.');
  }

  let ultimaChecagem = 0;
  let parar = false;

  // Encerramento limpo: o Dokploy manda SIGTERM no redeploy. Terminar a volta
  // atual antes de sair evita deixar uma mensagem em PENDENTE sem dono.
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sinal, () => {
      log('info', 'sinal recebido, encerrando depois desta volta', { sinal });
      parar = true;
    });
  }

  while (!parar) {
    let espera = ESPERA_OCIOSA_S;

    try {
      const agoraMs = Date.now();
      if (agoraMs - ultimaChecagem > CHECAGEM_INSTANCIA_S * 1000) {
        await sincronizarInstancia(transporte);
        ultimaChecagem = agoraMs;
      }

      espera = await volta(transporte);
    } catch (e) {
      // Uma volta que estoura não pode derrubar o worker: o Dokploy reiniciaria
      // o container em laço e o Postgres levaria a rajada de reconexões.
      const erro = e instanceof Error ? e.message : String(e);
      log('erro', 'volta falhou', { erro });
      try {
        await prisma.auditLog.create({ data: { evento: 'worker_erro', dados: { erro } } });
      } catch {
        // Se nem o audit grava, o banco está fora. Espera e tenta de novo.
      }
      espera = ESPERA_OCIOSA_S;
    }

    if (parar) break;
    await dormir(espera);
  }

  await prisma.$disconnect();
  log('info', 'worker encerrado');
}

/** Diagnóstico rápido: `npm run worker:estado` mostra por que a fila está parada. */
async function mostrarEstado(): Promise<void> {
  const [config, estado] = await Promise.all([lerConfig(), montarEstadoEnvio()]);
  console.log(JSON.stringify({ config, estado }, null, 2));
  await prisma.$disconnect();
}

if (process.argv.includes('--estado')) {
  void mostrarEstado();
} else {
  void principal();
}
