'use client';

// avoid-ai-design-ignore-file: SD4, SD5, K3 — Portal do cliente, fora do shell do ERP: estilo editorial FlowFoods (CLAUDE.md); visual liberado pelo Rodolfo em 25/10 (decisão 471), com claro e escuro.

/**
 * Formulário inicial — a tela que o dono do restaurante usa no celular.
 *
 * Três decisões guiam tudo aqui:
 *
 * 1. Nada se perde. Cada item salva sozinho ~1 s depois da última tecla, ao
 *    sair do campo e ao fechar a aba (fetch com keepalive). Falhou? Tenta de
 *    novo e diz na tela. Não existe botão "salvar". E cada cartão mostra o
 *    próprio estado ("Salvando…", "Salvo"), porque a barra no pé da tela fica
 *    longe de onde o dono está digitando.
 * 2. Polegar. Todo alvo de toque tem 44 px ou mais, e o "Enviar" mora numa
 *    barra fixa no pé da tela, onde o polegar alcança.
 * 3. O texto é do consultor. Itens, perguntas, abertura e fechamento vêm do
 *    JSON sem edição; esta tela só acrescenta rótulos de interface.
 * 4. Falar é mais fácil que escrever. Cada pergunta grava áudio na hora, pelo
 *    microfone, com prévia antes de enviar. Anexar um arquivo é o caminho
 *    reserva, não o principal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MARCACOES,
  ROTULO_MARCACAO,
  type Item,
  type Marcacao,
  type Questionario,
} from '@/lib/portal/questionario';
import { calcularProgresso, type EstadoItem } from '@/lib/portal/progresso';
import { LIMITE_BYTES, LIMITE_TEXTO, formatarTamanho } from '@/lib/portal/limites';
import {
  ROTULO_DA_BARRA,
  ROTULO_DO_CARTAO,
  bloqueioDoEnvio,
  chaveDoRascunho,
  rascunhosParaRecuperar,
  seloDoCartao,
  statusGeral,
  textoDoEnviado,
  type StatusSalvar,
} from '@/lib/portal/tela';
import { LIMITE_GRAVACAO_S, MIMES_GRAVACAO, formatarDuracao, nomeDaGravacao } from '@/lib/portal/audio';

export interface ArquivoTela {
  id: string;
  itemId: string;
  nomeOriginal: string;
  tamanho: number;
}

export interface EstadoInicial {
  respostas: Record<string, { texto: string; marcacao: Marcacao | null }>;
  arquivos: ArquivoTela[];
  finalizadoEm: string | null;
}


const ESPERA_MS = 900;
const NOVA_TENTATIVA_MS = 4000;

export default function Portal({
  token,
  cliente,
  q,
  inicial,
}: {
  token: string;
  cliente: string;
  q: Questionario;
  inicial: EstadoInicial;
}) {
  const [textos, setTextos] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(inicial.respostas).map(([k, v]) => [k, v.texto])),
  );
  const [marcacoes, setMarcacoes] = useState<Record<string, Marcacao | null>>(() =>
    Object.fromEntries(Object.entries(inicial.respostas).map(([k, v]) => [k, v.marcacao])),
  );
  const [arquivos, setArquivos] = useState<ArquivoTela[]>(inicial.arquivos);
  // Anexos subindo e áudios gravados ainda não salvos: contam para a barra, para o "Enviar" e para o aviso ao sair.
  const [uploads, setUploads] = useState(0);
  const [audiosPendentes, setAudiosPendentes] = useState<Set<string>>(() => new Set());
  const [recuperados, setRecuperados] = useState(0);
  // Estado de cada cartão, para o retorno visual ficar ao lado do que foi feito.
  const [statusItens, setStatusItens] = useState<Record<string, StatusSalvar>>({});
  const marcarItem = useCallback((itemId: string, s: StatusSalvar) => {
    setStatusItens((m) => ({ ...m, [itemId]: s }));
  }, []);
  const [finalizadoEm, setFinalizadoEm] = useState<string | null>(inicial.finalizadoEm);

  // Textos ainda não confirmados pelo servidor, por item.
  const sujos = useRef<Map<string, string>>(new Map());
  const temporizadores = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const emVoo = useRef(0);

  const api = useCallback((rota: string) => `/api/portal/${token}/${rota}`, [token]);

  // Rascunho no aparelho: o que ainda não foi confirmado pelo servidor fica guardado até salvar (sem internet, fechar a
  // aba não perde o texto). O aparelho pode não deixar guardar (aba anônima, cheio): aí segue sem rascunho.
  const guardarRascunho = useCallback(
    (itemId: string, texto: string | null) => {
      try {
        const chave = chaveDoRascunho(token);
        const atual = JSON.parse(localStorage.getItem(chave) ?? '{}') as Record<string, string>;
        if (texto === null) delete atual[itemId];
        else atual[itemId] = texto;
        if (Object.keys(atual).length) localStorage.setItem(chave, JSON.stringify(atual));
        else localStorage.removeItem(chave);
      } catch {
        /* sem armazenamento no aparelho */
      }
    },
    [token],
  );

  /** 'ok', 'rede' (sem conexão ou erro do servidor: tenta de novo) ou 'recusado' (o servidor não aceita: não adianta repetir). */
  const enviarItem = useCallback(
    async (itemId: string, dados: { texto?: string; marcacao?: Marcacao | null }): Promise<'ok' | 'rede' | 'recusado'> => {
      emVoo.current += 1;
      try {
        const r = await fetch(api('salvar'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, ...dados }),
        });
        if (r.ok) return 'ok';
        return r.status >= 400 && r.status < 500 ? 'recusado' : 'rede';
      } catch {
        return 'rede';
      } finally {
        emVoo.current -= 1;
      }
    },
    [api],
  );

  const salvarTexto = useCallback(
    async (itemId: string) => {
      const t = temporizadores.current.get(itemId);
      if (t) clearTimeout(t);
      temporizadores.current.delete(itemId);

      const texto = sujos.current.get(itemId);
      if (texto === undefined) return;
      marcarItem(itemId, 'salvando');
      const r = await enviarItem(itemId, { texto });
      const ok = r === 'ok';
      // Digitou de novo enquanto salvava? Continua "salvando" até o próximo ciclo.
      marcarItem(itemId, ok ? (sujos.current.get(itemId) === texto ? 'salvo' : 'salvando') : r === 'recusado' ? 'recusado' : 'erro');
      // Só limpa se ninguém digitou de novo enquanto o pedido voava.
      if (ok && sujos.current.get(itemId) === texto) {
        sujos.current.delete(itemId);
        guardarRascunho(itemId, null);
      }
      // Sem conexão: tenta de novo sozinho. Recusado (texto longo demais): repetir não adianta; o cartão diz o que fazer.
      if (r === 'rede') {
        temporizadores.current.set(
          itemId,
          setTimeout(() => void salvarTexto(itemId), NOVA_TENTATIVA_MS),
        );
      }
    },
    [enviarItem, marcarItem, guardarRascunho],
  );

  const aoDigitar = (itemId: string, valor: string) => {
    setTextos((s) => ({ ...s, [itemId]: valor }));
    sujos.current.set(itemId, valor);
    guardarRascunho(itemId, valor);
    marcarItem(itemId, 'salvando');
    const t = temporizadores.current.get(itemId);
    if (t) clearTimeout(t);
    temporizadores.current.set(itemId, setTimeout(() => void salvarTexto(itemId), ESPERA_MS));
  };

  const aoMarcar = async (itemId: string, m: Marcacao) => {
    const nova = marcacoes[itemId] === m ? null : m;
    const anterior = marcacoes[itemId] ?? null;
    setMarcacoes((s) => ({ ...s, [itemId]: nova }));
    marcarItem(itemId, 'salvando');
    const ok = (await enviarItem(itemId, { marcacao: nova })) === 'ok';
    if (!ok) setMarcacoes((s) => ({ ...s, [itemId]: anterior }));
    // A marcação não tenta de novo sozinha: o cartão pede para tocar de novo.
    marcarItem(itemId, ok ? 'salvo' : 'erro-marcar');
  };

  // Ao abrir: o que ficou guardado no aparelho e não chegou ao servidor volta para o campo e é salvo (depois de montar,
  // para o servidor e o aparelho desenharem igual).
  useEffect(() => {
    let rascunhos: Record<string, unknown> = {};
    try {
      rascunhos = JSON.parse(localStorage.getItem(chaveDoRascunho(token)) ?? '{}') as Record<string, unknown>;
    } catch {
      return;
    }
    const doServidor = Object.fromEntries(Object.entries(inicial.respostas).map(([k, v]) => [k, v.texto]));
    const voltar = rascunhosParaRecuperar(rascunhos, doServidor, new Set(q.itens.map((i) => i.id)));
    const ids = Object.keys(voltar);
    if (ids.length === 0) {
      try {
        localStorage.removeItem(chaveDoRascunho(token));
      } catch {
        /* nada */
      }
      return;
    }
    setTextos((s) => ({ ...s, ...voltar }));
    setRecuperados(ids.length);
    for (const id of ids) {
      sujos.current.set(id, voltar[id]);
      marcarItem(id, 'salvando');
      void salvarTexto(id);
    }
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fechar ou recarregar com algo que ainda não salvou (sem conexão, áudio gravado, anexo subindo): o navegador pergunta.
  const precisaAvisar = useRef(false);
  precisaAvisar.current =
    uploads > 0 || audiosPendentes.size > 0 || Object.values(statusItens).some((st) => st === 'erro' || st === 'recusado');
  useEffect(() => {
    const aoSairDaPagina = (e: BeforeUnloadEvent) => {
      if (!precisaAvisar.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aoSairDaPagina);
    return () => window.removeEventListener('beforeunload', aoSairDaPagina);
  }, []);

  // Fechou a aba com texto pendente: manda assim mesmo.
  useEffect(() => {
    const aoSair = () => {
      for (const [itemId, texto] of sujos.current) {
        void fetch(api('salvar'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, texto }),
          keepalive: true,
        });
      }
    };
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') aoSair();
    };
    window.addEventListener('pagehide', aoSair);
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      window.removeEventListener('pagehide', aoSair);
      document.removeEventListener('visibilitychange', aoEsconder);
    };
  }, [api]);

  const progresso = useMemo(
    () =>
      calcularProgresso(
        q.itens,
        q.itens.map((i) => ({
          itemId: i.id,
          texto: textos[i.id] ?? null,
          marcacao: marcacoes[i.id] ?? null,
        })),
        arquivos,
      ),
    [q.itens, textos, marcacoes, arquivos],
  );
  const estadoDe = useMemo(
    () => new Map(progresso.situacoes.map((s) => [s.item.id, s.estado])),
    [progresso],
  );
  const status = statusGeral(statusItens, uploads);
  // Estáveis (useCallback): os cartões avisam por efeito, e uma função nova a cada desenho faria o efeito rodar sem parar.
  const aoUpload = useCallback((delta: number) => setUploads((n) => Math.max(0, n + delta)), []);
  const aoMudarAudio = useCallback(
    (itemId: string, pendente: boolean) =>
      setAudiosPendentes((atual) => {
        if (atual.has(itemId) === pendente) return atual;
        const novo = new Set(atual);
        if (pendente) novo.add(itemId);
        else novo.delete(itemId);
        return novo;
      }),
    [],
  );
  const emBranco = useMemo(() => progresso.situacoes.filter((s) => s.estado === 'PENDENTE').map((s) => s.item.id), [progresso]);
  const irParaEmBranco = () => {
    const id = emBranco[0];
    if (!id) return;
    document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (document.getElementById(`campo-${id}`) as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
  };

  const blocosArquivo = q.blocos.filter((b) => b.tipo === 'ARQUIVO');
  const blocosPergunta = q.blocos.filter((b) => b.tipo === 'PERGUNTA');
  const nArquivos = blocosArquivo.reduce((n, b) => n + b.itens.length, 0);
  const nPerguntas = blocosPergunta.reduce((n, b) => n + b.itens.length, 0);

  const props = {
    textos,
    marcacoes,
    arquivos,
    estadoDe,
    statusItens,
    aoDigitar,
    aoSairDoCampo: (id: string) => void salvarTexto(id),
    aoMarcar,
    token,
    aoSubir: (a: ArquivoTela) => {
      setArquivos((s) => [...s, a]);
      marcarItem(a.itemId, 'salvo');
    },
    aoRemover: (id: string) => setArquivos((s) => s.filter((a) => a.id !== id)),
    aoUpload,
    aoMudarAudio,
  };

  return (
    <div className="pb-40">
      <header className="mx-auto max-w-2xl px-4 pb-6 pt-8 sm:pt-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-realce">
          FlowFoods · Formulário inicial
        </p>
        <h1 className="mt-3 font-serifa text-3xl font-bold leading-tight sm:text-4xl">{cliente}</h1>
        <p className="mt-2 font-serifa text-lg italic text-footer/70">{q.abertura.tagline}</p>
        {recuperados > 0 && (
          <p role="status" className="mt-4 border border-footer/20 bg-papel px-4 py-3 text-sm">
            {recuperados === 1
              ? 'Recuperamos uma resposta que você escreveu sem conexão. Ela está sendo salva.'
              : `Recuperamos ${recuperados} respostas que você escreveu sem conexão. Elas estão sendo salvas.`}
          </p>
        )}
      </header>

      <section className="mx-auto max-w-2xl space-y-4 px-4">
        <Cartao>
          <p className="leading-relaxed">{q.abertura.instrucao}</p>
        </Cartao>
        <Cartao>
          <Etiqueta>Marcações</Etiqueta>
          <p className="mt-2 leading-relaxed">{q.abertura.marcacoes}</p>
        </Cartao>
      </section>

      <Parte numero={1} titulo="Arquivos e acessos" total={nArquivos}>
        {blocosArquivo.map((b) => (
          <Bloco key={b.bloco} titulo={b.titulo}>
            {b.itens.map((item) => (
              <CartaoItem key={item.id} item={item} {...props} />
            ))}
          </Bloco>
        ))}
      </Parte>

      <Parte numero={2} titulo="Perguntas" total={nPerguntas}>
        {blocosPergunta.map((b) => (
          <Bloco key={b.bloco} titulo={b.titulo}>
            {b.itens.map((item) => (
              <CartaoItem key={item.id} item={item} {...props} />
            ))}
          </Bloco>
        ))}
      </Parte>

      <section className="mx-auto mt-10 max-w-2xl px-4">
        <div className="border-t border-footer/15 pt-8">
          {q.abertura.fechamento && <p className="leading-relaxed">{q.abertura.fechamento}</p>}
          <p className="mt-6 text-sm text-footer/70">{q.abertura.assinatura}</p>
          <p className="mt-2 font-serifa text-lg italic">{q.abertura.tagline}</p>
        </div>
      </section>

      <BarraEnviar
        token={token}
        status={status}
        pendentes={progresso.pendentes}
        respondidos={progresso.recebidos + progresso.marcados}
        total={progresso.total}
        finalizadoEm={finalizadoEm}
        bloqueio={bloqueioDoEnvio(audiosPendentes.size, uploads)}
        irParaEmBranco={irParaEmBranco}
        antesDeEnviar={async () => {
          await Promise.all([...sujos.current.keys()].map((id) => salvarTexto(id)));
          return sujos.current.size === 0;
        }}
        aoEnviar={(quando) => setFinalizadoEm(quando)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ peças

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-footer/70">{children}</p>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <div className="border border-footer/10 bg-papel/70 p-4 sm:p-5">{children}</div>;
}

function Parte({
  numero,
  titulo,
  total,
  children,
}: {
  numero: number;
  titulo: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-12 max-w-2xl px-4">
      <div className="border-t border-footer/15 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-realce">Parte {numero}</p>
        <h2 className="mt-1 font-serifa text-2xl font-bold">
          {titulo} <span className="font-franklin text-base font-normal text-footer/70">· {total}</span>
        </h2>
      </div>
      <div className="mt-6 space-y-10">{children}</div>
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-serifa text-xl font-semibold">{titulo}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

const TOM_DO_SELO = { erro: 'text-realce', forte: 'text-footer', suave: 'text-footer/70' } as const;

function CartaoItem({
  item,
  textos,
  marcacoes,
  arquivos,
  estadoDe,
  statusItens,
  aoDigitar,
  aoSairDoCampo,
  aoMarcar,
  token,
  aoSubir,
  aoRemover,
  aoUpload,
  aoMudarAudio,
}: {
  item: Item;
  textos: Record<string, string>;
  marcacoes: Record<string, Marcacao | null>;
  arquivos: ArquivoTela[];
  estadoDe: Map<string, EstadoItem>;
  statusItens: Record<string, StatusSalvar>;
  aoDigitar: (id: string, v: string) => void;
  aoSairDoCampo: (id: string) => void;
  aoMarcar: (id: string, m: Marcacao) => void;
  token: string;
  aoSubir: (a: ArquivoTela) => void;
  aoRemover: (id: string) => void;
  aoUpload: (delta: number) => void;
  aoMudarAudio: (itemId: string, pendente: boolean) => void;
}) {
  const estado: EstadoItem = estadoDe.get(item.id) ?? 'PENDENTE';
  const marcacao = marcacoes[item.id];
  const meus = arquivos.filter((a) => a.itemId === item.id);
  const ehPergunta = item.tipo === 'PERGUNTA';
  const idCampo = `campo-${item.id}`;
  const statusItem = statusItens[item.id] ?? 'ocioso';
  const salvando = statusItem === 'salvando';
  const selo = seloDoCartao(estado, statusItem, marcacao ? ROTULO_MARCACAO[marcacao] : null);

  return (
    <article id={`item-${item.id}`} className="scroll-mt-6 border border-footer/10 bg-papel/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={idCampo} className="block">
          <span className="font-medium leading-snug">{item.rotulo}</span>
          {item.detalhe && <span className="mt-1 block text-sm text-footer/70">{item.detalhe}</span>}
        </label>
        <span className={`shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-wider ${TOM_DO_SELO[selo.tom]}`}>{selo.rotulo}</span>
      </div>

      <textarea
        id={idCampo}
        value={textos[item.id] ?? ''}
        onChange={(e) => aoDigitar(item.id, e.target.value)}
        onBlur={() => aoSairDoCampo(item.id)}
        rows={ehPergunta ? 4 : 2}
        maxLength={LIMITE_TEXTO}
        placeholder={ehPergunta ? 'Sua resposta' : 'Escreva, cole um link ou anexe arquivos'}
        className="mt-3 w-full resize-y border border-footer/45 bg-papel px-3 py-2.5 text-base leading-relaxed outline-none transition placeholder:text-footer/60 focus:border-footer"
      />

      <EstadoDoCartao status={statusItem} />

      <ListaArquivos token={token} arquivos={meus} aoRemover={aoRemover} />

      {ehPergunta && <Gravador token={token} item={item} aoSubir={aoSubir} aoUpload={aoUpload} aoMudarAudio={aoMudarAudio} />}

      <div className="mt-3 flex flex-wrap gap-2">
        <BotaoAnexar token={token} item={item} aoSubir={aoSubir} aoUpload={aoUpload} secundario={ehPergunta} />
        {MARCACOES.map((m) => {
          const ativa = marcacoes[item.id] === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={ativa}
              disabled={salvando}
              onClick={() => aoMarcar(item.id, m)}
              className={`min-h-[44px] border px-3 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-60 ${
                ativa
                  ? 'border-footer bg-footer text-creme'
                  : 'border-footer/30 text-footer/70 hover:border-footer/60'
              }`}
            >
              {ROTULO_MARCACAO[m]}
            </button>
          );
        })}
      </div>
    </article>
  );
}

/**
 * O retorno visual de cada cartão. "Salvando…" fica enquanto durar; "Salvo"
 * aparece e some sozinho; o erro fica até resolver.
 */
function EstadoDoCartao({ status }: { status: StatusSalvar }) {
  const [mostrarSalvo, setMostrarSalvo] = useState(false);

  useEffect(() => {
    if (status !== 'salvo') {
      setMostrarSalvo(false);
      return;
    }
    setMostrarSalvo(true);
    const t = setTimeout(() => setMostrarSalvo(false), 2500);
    return () => clearTimeout(t);
  }, [status]);

  if (status === 'ocioso' || (status === 'salvo' && !mostrarSalvo)) {
    return <p className="mt-2 min-h-[1.25rem] text-xs" aria-live="polite" />;
  }

  return (
    <p
      aria-live="polite"
      className={`mt-2 flex min-h-[1.25rem] items-center gap-2 text-xs ${
        status === 'salvando' ? 'text-footer/70' : status === 'salvo' ? 'text-footer' : 'text-realce'
      }`}
    >
      {status === 'salvando' && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-footer/50" aria-hidden />
      )}
      {status === 'salvo' && <span aria-hidden>✓</span>}
      {ROTULO_DO_CARTAO[status]}
    </p>
  );
}

type ResultadoUpload = { ok: true; arquivo: ArquivoTela } | { ok: false; erro: string };

/** Upload com progresso. Planilha de 12 meses ou áudio de 8 min no 4G leva tempo. */
function subirArquivo(
  token: string,
  itemId: string,
  arquivo: File,
  aoProgredir: (pct: number) => void,
): Promise<ResultadoUpload> {
  return new Promise((resolve) => {
    if (arquivo.size > LIMITE_BYTES) {
      resolve({ ok: false, erro: `"${arquivo.name}" passa de 50 MB. Mande por link no campo de texto.` });
      return;
    }
    const form = new FormData();
    form.append('itemId', itemId);
    form.append('arquivo', arquivo);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/portal/${token}/arquivo`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText) as { ok: boolean; arquivo?: ArquivoTela; erro?: string };
        if (xhr.status < 300 && r.ok && r.arquivo) resolve({ ok: true, arquivo: r.arquivo });
        else resolve({ ok: false, erro: r.erro ?? 'Não enviou. Tente de novo.' });
      } catch {
        resolve({ ok: false, erro: xhr.status === 413 ? 'Arquivo acima de 50 MB.' : 'Não enviou. Tente de novo.' });
      }
    };
    xhr.onerror = () => resolve({ ok: false, erro: 'Sem conexão. Tente de novo.' });
    xhr.send(form);
  });
}

type FaseGravacao = 'ocioso' | 'gravando' | 'pronto' | 'enviando';

function escolherMime(): string | undefined {
  return MIMES_GRAVACAO.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Grava pelo microfone, mostra a prévia e envia. Sem MediaRecorder (navegador
 * muito antigo) ou sem permissão, avisa e deixa o "Anexar arquivo" como saída.
 */
export function Gravador({
  token,
  item,
  aoSubir,
  aoUpload,
  aoMudarAudio,
}: {
  token: string;
  item: Item;
  aoSubir: (a: ArquivoTela) => void;
  aoUpload?: (delta: number) => void;
  aoMudarAudio?: (itemId: string, pendente: boolean) => void;
}) {
  const [fase, setFase] = useState<FaseGravacao>('ocioso');
  const [segundos, setSegundos] = useState(0);
  const [pct, setPct] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravacao, setGravacao] = useState<{ blob: Blob; url: string } | null>(null);

  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  // Só no navegador e depois de montar: calculado na renderização, dava falso no servidor e verdadeiro no navegador, e
  // o React acusava a diferença (erro #418) em todo carregamento do Portal (E5.1, decisão 470). null = ainda não sabe.
  const [suportado, setSuportado] = useState<boolean | null>(null);
  useEffect(() => {
    setSuportado('MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Gravação pronta e ainda não salva: o "Enviar" da barra e o aviso ao sair sabem. Ao sair da tela, deixa de contar.
  const pendente = fase === 'pronto' || fase === 'gravando';
  useEffect(() => {
    aoMudarAudio?.(item.id, pendente);
  }, [pendente, item.id, aoMudarAudio]);
  const avisarAudio = useRef(aoMudarAudio);
  avisarAudio.current = aoMudarAudio;
  useEffect(() => () => avisarAudio.current?.(item.id, false), [item.id]);

  const pararRelogio = () => {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
  };

  const parar = useCallback(() => {
    pararRelogio();
    const g = gravador.current;
    if (g && g.state !== 'inactive') g.stop();
  }, []);

  const descartar = useCallback(() => {
    setGravacao((g) => {
      if (g) URL.revokeObjectURL(g.url);
      return null;
    });
    setSegundos(0);
    setFase('ocioso');
  }, []);

  // Saiu da tela no meio: solta o microfone e a prévia.
  useEffect(
    () => () => {
      pararRelogio();
      const g = gravador.current;
      if (g && g.state !== 'inactive') g.stop();
      g?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const iniciar = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = escolherMime();
      const g = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      pedacos.current = [];
      g.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.current.push(e.data);
      };
      g.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const tipo = g.mimeType || mime || 'audio/webm';
        const blob = new Blob(pedacos.current, { type: tipo });
        if (blob.size === 0) {
          setErro('Não gravou nada. Tente de novo.');
          setFase('ocioso');
          return;
        }
        setGravacao({ blob, url: URL.createObjectURL(blob) });
        setFase('pronto');
      };
      gravador.current = g;
      g.start(1000);
      setSegundos(0);
      setFase('gravando');
      relogio.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= LIMITE_GRAVACAO_S) parar();
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      const nome = e instanceof DOMException ? e.name : '';
      setErro(
        nome === 'NotAllowedError' || nome === 'SecurityError'
          ? 'O navegador não liberou o microfone. Permita o acesso ou anexe um áudio gravado no celular.'
          : 'Não consegui usar o microfone. Anexe um áudio gravado no celular.',
      );
      setFase('ocioso');
    }
  };

  const enviar = async () => {
    if (!gravacao) return;
    setFase('enviando');
    setPct(0);
    setErro(null);
    const nome = nomeDaGravacao(item.id, new Date(), gravacao.blob.type);
    const arquivo = new File([gravacao.blob], nome, { type: gravacao.blob.type });
    aoUpload?.(1);
    const r = await subirArquivo(token, item.id, arquivo, setPct);
    aoUpload?.(-1);
    setPct(null);
    if (r.ok) {
      aoSubir(r.arquivo);
      descartar();
    } else {
      setErro(r.erro);
      setFase('pronto');
    }
  };

  const botao =
    'inline-flex min-h-[44px] items-center gap-2 px-4 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-60';

  if (suportado === null) return null;
  if (!suportado) {
    return (
      <p className="mt-3 text-sm text-footer/70">
        Este navegador não grava áudio. Grave no celular e use “Anexar arquivo”.
      </p>
    );
  }

  return (
    <div className="mt-3">
      {fase === 'ocioso' && (
        <button type="button" onClick={iniciar} className={`${botao} border border-footer bg-footer text-creme hover:bg-footer/85`}>
          <span className="h-2.5 w-2.5 rounded-full bg-marca" aria-hidden />
          Gravar áudio
        </button>
      )}

      {fase === 'gravando' && (
        <div className="flex flex-wrap items-center gap-3 border border-footer/20 bg-papel px-3 py-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-marca" aria-hidden />
          <span className="text-sm font-medium tabular-nums" aria-live="polite">
            Gravando {formatarDuracao(segundos)}
          </span>
          <span className="text-xs text-footer/70">máx. {formatarDuracao(LIMITE_GRAVACAO_S)}</span>
          <button type="button" onClick={parar} className={`${botao} ml-auto bg-primary text-white hover:bg-primary-dark`}>
            Parar
          </button>
        </div>
      )}

      {(fase === 'pronto' || fase === 'enviando') && gravacao && (
        <div className="border border-footer/20 bg-papel p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-footer/70">
            Ouça antes de salvar · {formatarDuracao(segundos)}
          </p>
          <audio controls src={gravacao.url} className="mt-2 h-10 w-full" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={fase === 'enviando'}
              className={`${botao} bg-primary text-white hover:bg-primary-dark`}
            >
              {fase === 'enviando' ? `Salvando ${pct ?? 0}%` : 'Salvar áudio'}
            </button>
            <button
              type="button"
              onClick={descartar}
              disabled={fase === 'enviando'}
              className={`${botao} border border-footer/30 text-footer/70 hover:border-footer/60`}
            >
              Gravar de novo
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-sm text-realce">
          {erro}
        </p>
      )}
    </div>
  );
}

function ListaArquivos({
  token,
  arquivos,
  aoRemover,
}: {
  token: string;
  arquivos: ArquivoTela[];
  aoRemover: (id: string) => void;
}) {
  const [removendo, setRemovendo] = useState<string | null>(null);
  if (arquivos.length === 0) return null;

  return (
    <ul className="mt-3 divide-y divide-footer/10 border border-footer/15">
      {arquivos.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {a.nomeOriginal} <span className="text-footer/70">· {formatarTamanho(a.tamanho)}</span>
          </span>
          <button
            type="button"
            disabled={removendo === a.id}
            onClick={async () => {
              if (!window.confirm(`Remover "${a.nomeOriginal}"?`)) return;
              setRemovendo(a.id);
              const r = await fetch(`/api/portal/${token}/arquivo?id=${encodeURIComponent(a.id)}`, {
                method: 'DELETE',
              }).catch(() => null);
              setRemovendo(null);
              if (r?.ok) aoRemover(a.id);
              else window.alert('Não removeu. Tente de novo.');
            }}
            className="min-h-[44px] shrink-0 px-2 text-xs font-semibold uppercase tracking-wider text-footer/70 hover:text-realce"
          >
            {removendo === a.id ? 'Removendo…' : 'Remover'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Anexar do celular ou do computador. Nas perguntas é o caminho reserva do gravador. */
function BotaoAnexar({
  token,
  item,
  aoSubir,
  aoUpload,
  secundario = false,
}: {
  token: string;
  item: Item;
  aoSubir: (a: ArquivoTela) => void;
  aoUpload: (delta: number) => void;
  secundario?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <input
        ref={entrada}
        type="file"
        multiple
        className="hidden"
        onChange={async (e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = '';
          setErro(null);
          aoUpload(1);
          for (const a of lista) {
            setPct(0);
            const r = await subirArquivo(token, item.id, a, setPct);
            if (r.ok) aoSubir(r.arquivo);
            else setErro(r.erro);
          }
          aoUpload(-1);
          setPct(null);
        }}
      />
      <button
        type="button"
        disabled={pct !== null}
        onClick={() => entrada.current?.click()}
        className={`min-h-[44px] border px-4 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-60 ${
          secundario
            ? 'border-footer/30 text-footer/70 hover:border-footer/60'
            : 'border-footer bg-footer text-creme hover:bg-footer/85'
        }`}
      >
        {pct !== null ? `Enviando ${pct}%` : 'Anexar arquivo'}
      </button>
      {erro && (
        <p role="alert" className="basis-full text-sm text-realce">
          {erro}
        </p>
      )}
    </>
  );
}

function BarraEnviar({
  token,
  status,
  pendentes,
  respondidos,
  total,
  finalizadoEm,
  bloqueio,
  irParaEmBranco,
  antesDeEnviar,
  aoEnviar,
}: {
  token: string;
  status: StatusSalvar;
  pendentes: number;
  respondidos: number;
  total: number;
  finalizadoEm: string | null;
  bloqueio: string | null;
  irParaEmBranco: () => void;
  antesDeEnviar: () => Promise<boolean>;
  aoEnviar: (quando: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pct = total > 0 ? Math.round((respondidos / total) * 100) : 0;

  // O erro de envio sai quando tudo salvou (antes ficava na tela depois que a rede voltava).
  useEffect(() => {
    if (status === 'salvo') setErro(null);
  }, [status]);

  const enviar = async () => {
    // Áudio gravado e não salvo, ou anexo subindo: o "Enviar" não passa por cima (antes salvava só o texto).
    if (bloqueio) {
      setErro(bloqueio);
      return;
    }
    const aviso =
      pendentes > 0
        ? `Ainda há ${pendentes} ${pendentes === 1 ? 'item' : 'itens'} em branco. Enviar assim mesmo? Você pode continuar preenchendo depois.`
        : 'Enviar o formulário para o Rodolfo?';
    if (!window.confirm(aviso)) return;

    setEnviando(true);
    setErro(null);
    const salvou = await antesDeEnviar();
    if (!salvou) {
      setEnviando(false);
      setErro('Não enviou: falta salvar uma resposta. Tente de novo.');
      return;
    }
    const r = await fetch(`/api/portal/${token}/finalizar`, { method: 'POST' }).catch(() => null);
    setEnviando(false);
    if (r?.ok) aoEnviar(new Date().toISOString());
    else setErro('Não enviou. Tente de novo em instantes.');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-footer/15 bg-creme">
      <div className="h-0.5 bg-footer/10">
        <div className="h-full bg-marca transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums">
            {respondidos} de {total}
            {pendentes > 0 && (
              // Leva ao próximo item em branco: com 50 itens, achar o que falta rolando é o que cansa.
              <button type="button" onClick={irParaEmBranco} className="ml-1 inline-flex min-h-[44px] items-center font-normal text-footer/70 underline decoration-footer/40 underline-offset-4 hover:decoration-footer">
                · {pendentes} em branco
              </button>
            )}
          </p>
          {/* Sem cortar: a confirmação do envio é a única que existe, e a 390 px saía pela metade. */}
          <p aria-live="polite" className={`text-xs leading-snug ${erro || ['erro', 'recusado', 'erro-marcar'].includes(status) ? 'text-realce' : 'text-footer/70'}`}>
            {erro ??
              (finalizadoEm && ['salvo', 'ocioso'].includes(status) ? textoDoEnviado(finalizadoEm) : ROTULO_DA_BARRA[status])}
          </p>
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="min-h-[48px] shrink-0 bg-primary px-5 text-sm font-semibold uppercase tracking-wider text-white transition hover:bg-primary-dark disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : finalizadoEm ? 'Avisar de novo' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
