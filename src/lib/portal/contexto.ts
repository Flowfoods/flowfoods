/**
 * O `.md` de contexto do cliente, gerado do que ele respondeu no Portal.
 *
 * É o entregável "md de contexto da marca" do CLAUDE.md, na versão crua: o
 * que o cliente disse, marcou e mandou, item a item, sem interpretação do
 * consultor. Vai para `clientes/<slug>/` no repositório e vira a base de
 * qualquer sessão futura sobre a casa: diagnóstico, plano de 90 dias,
 * relatório mensal.
 *
 * Função pura, sem banco e sem relógio: recebe tudo pronto e devolve texto.
 * Ausência de dado é achado, então as marcações abrem o arquivo, antes das
 * respostas.
 */

import type { Questionario, Marcacao } from './questionario';
import { ROTULO_MARCACAO } from './questionario';
import { calcularProgresso, type RespostaItem, temTexto } from './progresso';
import { ehAudio } from './audio';
import { formatarTamanho } from './limites';

export interface ArquivoContexto {
  itemId: string;
  nomeOriginal: string;
  tamanho: number;
  caminho: string;
  criadoEm: Date;
}

export interface EntradaContexto {
  nome: string;
  slug: string;
  q: Questionario;
  respostas: RespostaItem[];
  arquivos: ArquivoContexto[];
  finalizadoEm: Date | null;
  ultimaAtividadeEm: Date | null;
  agora: Date;
}

const FUSO = 'America/Sao_Paulo';

const dataHora = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSO,
  }).format(d);

const dataIso = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: FUSO }).format(d);

/** Nome do arquivo: contexto-valentins-2026-09-25.md */
export function nomeDoContexto(slug: string, agora: Date): string {
  return `contexto-${slug}-${dataIso(agora)}.md`;
}

const citar = (texto: string) =>
  texto
    .trim()
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join('\n');

const ORDEM_MARCACAO: Marcacao[] = ['NAO_TENHO', 'NAO_SEI', 'AGORA_NAO'];

const SIGNIFICADO: Record<Marcacao, string> = {
  NAO_TENHO: 'não existe hoje',
  NAO_SEI: 'existe, mas o cliente não tem na mão',
  AGORA_NAO: 'prefere não compartilhar ainda',
};

export function gerarContextoMd(e: EntradaContexto): string {
  const p = calcularProgresso(e.q.itens, e.respostas, e.arquivos);
  const situacao = new Map(p.situacoes.map((s) => [s.item.id, s]));
  const arquivosDe = (itemId: string) => e.arquivos.filter((a) => a.itemId === itemId);
  const L: string[] = [];

  L.push(`# Contexto — ${e.nome}`);
  L.push('');
  L.push(
    `Gerado em ${dataHora(e.agora)} a partir do Portal FlowFoods (questionário ${e.q.chave} · ${e.q.versao}).`,
  );
  L.push(
    'É o que o cliente respondeu, marcou e enviou, sem interpretação do consultor. Número vem dos relatórios; aqui é a visão da casa.',
  );
  L.push('');
  L.push('## Situação do formulário');
  L.push('');
  L.push(`- Enviado pelo cliente: ${e.finalizadoEm ? dataHora(e.finalizadoEm) : 'ainda não'}`);
  L.push(`- Última atividade: ${e.ultimaAtividadeEm ? dataHora(e.ultimaAtividadeEm) : 'nenhuma'}`);
  L.push(`- Recebidos ${p.recebidos} · Marcados ${p.marcados} · Pendentes ${p.pendentes} · Total ${p.total}`);
  L.push('');

  // Ausências primeiro: é o achado.
  L.push('## Ausências declaradas');
  L.push('');
  L.push('Cada uma vira item do plano de ação.');
  L.push('');
  for (const m of ORDEM_MARCACAO) {
    const itens = p.situacoes.filter((s) => s.marcacao === m);
    L.push(`### ${ROTULO_MARCACAO[m]} (${SIGNIFICADO[m]}) · ${itens.length}`);
    L.push('');
    if (itens.length === 0) L.push('- nenhum');
    for (const s of itens) {
      const extra = s.estado === 'RECEBIDO' ? ' — mas depois enviou conteúdo' : '';
      L.push(`- ${s.item.id} · ${s.item.rotulo}${extra}`);
    }
    L.push('');
  }

  const parte = (tipo: 'ARQUIVO' | 'PERGUNTA', titulo: string) => {
    L.push(`## ${titulo}`);
    L.push('');
    for (const b of e.q.blocos.filter((x) => x.tipo === tipo)) {
      L.push(`### ${b.titulo}`);
      L.push('');
      for (const item of b.itens) {
        const s = situacao.get(item.id)!;
        const rotuloEstado =
          s.estado === 'RECEBIDO' ? 'Recebido' : s.estado === 'MARCADO' ? `Marcado: ${ROTULO_MARCACAO[s.marcacao!]}` : 'Pendente';
        L.push(`**${item.id} · ${item.rotulo}** — ${rotuloEstado}`);
        if (item.detalhe) L.push(`_${item.detalhe}_`);
        L.push('');
        if (s.estado === 'RECEBIDO' && s.marcacao) {
          L.push(`Marcou ${ROTULO_MARCACAO[s.marcacao]} e depois enviou conteúdo.`);
          L.push('');
        }
        if (temTexto(s.texto)) {
          L.push(citar(s.texto!));
          L.push('');
        }
        const arqs = arquivosDe(item.id);
        if (arqs.length > 0) {
          L.push('Arquivos:');
          for (const a of arqs) {
            const tipoArq = ehAudio(a.nomeOriginal) ? 'áudio — transcrever e colar aqui' : 'arquivo';
            L.push(
              `- \`${a.nomeOriginal}\` (${tipoArq}, ${formatarTamanho(a.tamanho)}, enviado ${dataHora(a.criadoEm)}, no VPS em \`${a.caminho}\`)`,
            );
          }
          L.push('');
        }
      }
    }
  };

  parte('ARQUIVO', 'Parte 1 — Arquivos e acessos');
  parte('PERGUNTA', 'Parte 2 — Perguntas');

  const pendentes = p.situacoes.filter((s) => s.estado === 'PENDENTE');
  L.push('## Pendentes');
  L.push('');
  L.push('Sem resposta, sem arquivo e sem marcação. Perguntar na próxima visita.');
  L.push('');
  if (pendentes.length === 0) L.push('- nenhum');
  for (const s of pendentes) L.push(`- ${s.item.id} · ${s.item.rotulo}`);
  L.push('');

  L.push('## Como usar');
  L.push('');
  L.push('- Guardar em `clientes/<slug>/` no repositório; cada nova exportação é um arquivo novo, datado.');
  L.push('- Áudios: transcrever e colar como citação abaixo do item, com a data.');
  L.push('- Diagnóstico, plano de 90 dias e relatório mensal partem daqui e dos relatórios (iFood, PDV, financeiro).');
  L.push('');

  return L.join('\n');
}
