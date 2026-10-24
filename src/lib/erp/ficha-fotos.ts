/**
 * F4 — fotos da ficha: a PRINCIPAL (a capa, `fotoArquivo`, a mesma de sempre) e até 8 de APOIO (detalhe do prato, corte,
 * montagem, etapas), na ordem, com legenda opcional, numa lista na própria ficha (`fotosApoio`).
 *
 * Regras do plano: a pessoa escolhe a principal (nada vira capa pela ordem do envio); trocar a principal passa a antiga
 * para apoio; tirar a principal exige dizer a substituta ou confirmar ficar sem principal, e nunca apaga as de apoio.
 * Toda mudança confere a versão da ficha (`atualizadoEm`): tela velha ou envio atrasado dá conflito, nunca troca a capa
 * por trás. O arquivo só é apagado do disco depois que a gravação fechou.
 */

import type { ClienteDoParceiro } from './tenant';
import { NOME_DA_FOTO } from './foto';
import { LEGENDA_MAX, MAXIMO_DE_APOIOS, lerFotosDeApoio, type FotoDeApoio } from './ficha-fotos-campos';
import { apagarFoto, assumirFotoPendente, devolverFotoPendente } from './arquivos';
import { MENSAGEM_CONFLITO_FICHA, MENSAGEM_FICHA_DESATIVADA } from './fichas';

export { LEGENDA_MAX, MAXIMO_DE_APOIOS, lerFotosDeApoio, type FotoDeApoio } from './ficha-fotos-campos';

const legendaDe = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, LEGENDA_MAX) : null);

export interface FotosDaFicha {
  id: string;
  nome: string;
  ativa: boolean;
  versao: string;
  principal: { arquivo: string } | null;
  apoios: FotoDeApoio[];
}

export async function obterFotosDaFicha(cliente: ClienteDoParceiro, id: string): Promise<FotosDaFicha | null> {
  if (typeof id !== 'string' || !/^[a-z0-9]{1,64}$/i.test(id)) return null;
  const f = await cliente.fichaTecnica.findUnique({ where: { id }, select: { id: true, nome: true, ativa: true, atualizadoEm: true, fotoArquivo: true, fotosApoio: true } });
  if (!f) return null;
  return {
    id: f.id,
    nome: f.nome,
    ativa: f.ativa,
    versao: f.atualizadoEm.toISOString(),
    principal: f.fotoArquivo ? { arquivo: f.fotoArquivo } : null,
    apoios: lerFotosDeApoio(f.fotosApoio),
  };
}

/** A foto de apoio desta ficha (para a rota que serve a imagem), ou null. */
export async function fotoDeApoioDaFicha(cliente: ClienteDoParceiro, id: string, arquivo: string) {
  if (!NOME_DA_FOTO.test(arquivo)) return null;
  const f = await cliente.fichaTecnica.findUnique({ where: { id }, select: { fotosApoio: true } });
  const a = f ? lerFotosDeApoio(f.fotosApoio).find((x) => x.arquivo === arquivo) : undefined;
  return a ? { arquivo: a.arquivo, mime: a.mime } : null;
}

export type PedidoDeFoto =
  | { tipo: 'adicionar'; enviada: unknown; legenda?: unknown }
  | { tipo: 'legenda'; arquivo: unknown; legenda: unknown }
  | { tipo: 'mover'; arquivo: unknown; para: unknown }
  | { tipo: 'principal'; arquivo: unknown }
  | { tipo: 'remover'; arquivo: unknown }
  | { tipo: 'removerPrincipal'; substituta: unknown };

export type ResultadoDaFoto = { ok: true; feito: string } | { ok: false; erro: string; conflito?: boolean };

class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoDaFoto, { ok: false }>) {
    super('recusa');
  }
}
const recusa = (erro: string, conflito = false) => new Recusa({ ok: false, erro, conflito });

const nomeValido = (v: unknown): string | null => (typeof v === 'string' && NOME_DA_FOTO.test(v) ? v : null);

/**
 * Aplica um pedido nas fotos da ficha, numa transação que confere a versão lida. O que sai do disco (a foto removida)
 * é apagado só depois que a gravação fechou; a foto enviada que não entrou volta a ser pendente.
 */
export async function mudarFotosDaFicha(cliente: ClienteDoParceiro, id: string, versao: unknown, pedido: PedidoDeFoto, autorNome: string): Promise<ResultadoDaFoto> {
  const lida = new Date(typeof versao === 'string' ? versao : '');
  if (Number.isNaN(lida.getTime())) return { ok: false, erro: MENSAGEM_CONFLITO_FICHA, conflito: true };
  if (typeof id !== 'string' || !/^[a-z0-9]{1,64}$/i.test(id)) return { ok: false, erro: 'Ficha não encontrada.' };

  // A foto nova sai de pendentes ANTES da transação (o disco não entra no rollback): se a gravação falhar, volta.
  let assumida: { arquivo: string; mime: string; bytes: number } | null = null;
  if (pedido.tipo === 'adicionar') {
    const nome = nomeValido(pedido.enviada);
    if (!nome) return { ok: false, erro: 'Escolha a foto.' };
    assumida = await assumirFotoPendente(cliente.parceiroId, nome);
    if (!assumida) return { ok: false, erro: 'A foto enviada não está mais aqui (passou muito tempo). Escolha de novo.' };
  }

  let apagar: string | null = null;
  try {
    const feito = await cliente.transacao(async (tx) => {
      const f = await tx.fichaTecnica.findUnique({ where: { id }, select: { nome: true, ativa: true, atualizadoEm: true, fotoArquivo: true, fotoMime: true, fotoBytes: true, fotosApoio: true } });
      if (!f) throw recusa('Ficha não encontrada.');
      if (!f.ativa) throw recusa(MENSAGEM_FICHA_DESATIVADA);
      if (f.atualizadoEm.getTime() !== lida.getTime()) throw recusa(MENSAGEM_CONFLITO_FICHA, true);
      const apoios = lerFotosDeApoio(f.fotosApoio);
      let principal = f.fotoArquivo ? { arquivo: f.fotoArquivo, mime: f.fotoMime ?? 'image/jpeg', bytes: f.fotoBytes ?? 0 } : null;
      const achar = (v: unknown) => {
        const nome = nomeValido(v);
        const i = nome ? apoios.findIndex((a) => a.arquivo === nome) : -1;
        if (i < 0) throw recusa('Essa foto não está mais na ficha. Recarregue a página.', true);
        return i;
      };
      let frase: string;
      switch (pedido.tipo) {
        case 'adicionar': {
          if (apoios.length >= MAXIMO_DE_APOIOS) throw recusa(`Até ${MAXIMO_DE_APOIOS} fotos de apoio. Tire uma antes de pôr outra.`);
          apoios.push({ ...assumida!, legenda: legendaDe(pedido.legenda) });
          frase = 'foto de apoio adicionada';
          break;
        }
        case 'legenda': {
          const i = achar(pedido.arquivo);
          apoios[i] = { ...apoios[i], legenda: legendaDe(pedido.legenda) };
          frase = 'legenda salva';
          break;
        }
        case 'mover': {
          const i = achar(pedido.arquivo);
          const j = pedido.para === 'cima' ? i - 1 : pedido.para === 'baixo' ? i + 1 : -1;
          if (j < 0 || j >= apoios.length) throw recusa('Essa foto já está na ponta.');
          [apoios[i], apoios[j]] = [apoios[j], apoios[i]];
          frase = 'ordem salva';
          break;
        }
        case 'principal': {
          // Escolha explícita: a de apoio vira a principal; a principal de antes (se havia) fica no lugar dela, como apoio.
          const i = achar(pedido.arquivo);
          const nova = apoios[i];
          if (principal) apoios[i] = { ...principal, legenda: null };
          else apoios.splice(i, 1);
          principal = { arquivo: nova.arquivo, mime: nova.mime, bytes: nova.bytes };
          frase = 'foto principal trocada';
          break;
        }
        case 'remover': {
          const i = achar(pedido.arquivo);
          apagar = apoios[i].arquivo;
          apoios.splice(i, 1);
          frase = 'foto de apoio removida';
          break;
        }
        case 'removerPrincipal': {
          if (!principal) throw recusa('A ficha já está sem foto principal.', true);
          apagar = principal.arquivo;
          if (pedido.substituta === 'nenhuma') {
            principal = null;
            frase = 'foto principal removida';
          } else {
            const i = achar(pedido.substituta);
            const nova = apoios.splice(i, 1)[0];
            principal = { arquivo: nova.arquivo, mime: nova.mime, bytes: nova.bytes };
            frase = 'foto principal removida e substituída';
          }
          break;
        }
        default:
          throw recusa('Pedido inválido.');
      }
      const r = await tx.fichaTecnica.updateMany({
        where: { id, atualizadoEm: f.atualizadoEm, ativa: true },
        data: {
          fotoArquivo: principal?.arquivo ?? null,
          fotoMime: principal?.mime ?? null,
          fotoBytes: principal?.bytes ?? null,
          fotosApoio: apoios.map((a) => ({ arquivo: a.arquivo, mime: a.mime, bytes: a.bytes, legenda: a.legenda })),
        },
      });
      if (r.count !== 1) throw recusa(MENSAGEM_CONFLITO_FICHA, true);
      const resumo = (p: string | null, lista: FotoDeApoio[]) => ({
        nome: f.nome,
        foto: p,
        fotosApoio: lista.length === 0 ? null : lista.map((a, n) => `${n + 1}. ${a.legenda ?? 'sem legenda'}`).join(' · '),
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'FichaTecnica',
          entidadeId: id,
          acao: 'ALTEROU',
          antes: resumo(f.fotoArquivo, lerFotosDeApoio(f.fotosApoio)),
          depois: resumo(principal?.arquivo ?? null, apoios),
          motivo: null,
          autorNome,
        },
      });
      return frase;
    });
    if (apagar) await apagarFoto(cliente.parceiroId, apagar);
    return { ok: true, feito };
  } catch (e) {
    if (assumida) await devolverFotoPendente(cliente.parceiroId, assumida.arquivo);
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}
