'use client';

/**
 * Formulário inicial — a tela que o dono do restaurante usa no celular.
 *
 * Três decisões guiam tudo aqui:
 *
 * 1. Nada se perde. Cada item salva sozinho ~1 s depois da última tecla, ao
 *    sair do campo e ao fechar a aba (fetch com keepalive). Falhou? Tenta de
 *    novo e diz na tela. Não existe botão "salvar".
 * 2. Polegar. Todo alvo de toque tem 44 px ou mais, e o "Enviar" mora numa
 *    barra fixa no pé da tela, onde o polegar alcança.
 * 3. O texto é do consultor. Itens, perguntas, abertura e fechamento vêm do
 *    JSON sem edição; esta tela só acrescenta rótulos de interface.
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
import { LIMITE_BYTES, formatarTamanho } from '@/lib/portal/limites';

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

type StatusSalvar = 'ocioso' | 'salvando' | 'salvo' | 'erro';

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
  const [status, setStatus] = useState<StatusSalvar>('ocioso');
  const [finalizadoEm, setFinalizadoEm] = useState<string | null>(inicial.finalizadoEm);

  // Textos ainda não confirmados pelo servidor, por item.
  const sujos = useRef<Map<string, string>>(new Map());
  const temporizadores = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const emVoo = useRef(0);

  const api = useCallback((rota: string) => `/api/portal/${token}/${rota}`, [token]);

  const enviarItem = useCallback(
    async (itemId: string, dados: { texto?: string; marcacao?: Marcacao | null }): Promise<boolean> => {
      emVoo.current += 1;
      setStatus('salvando');
      try {
        const r = await fetch(api('salvar'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, ...dados }),
        });
        if (!r.ok) throw new Error(String(r.status));
        return true;
      } catch {
        return false;
      } finally {
        emVoo.current -= 1;
      }
    },
    [api],
  );

  const atualizarStatus = useCallback((ok: boolean) => {
    if (!ok) setStatus('erro');
    else if (emVoo.current === 0 && sujos.current.size === 0) setStatus('salvo');
  }, []);

  const salvarTexto = useCallback(
    async (itemId: string) => {
      const t = temporizadores.current.get(itemId);
      if (t) clearTimeout(t);
      temporizadores.current.delete(itemId);

      const texto = sujos.current.get(itemId);
      if (texto === undefined) return;
      const ok = await enviarItem(itemId, { texto });
      // Só limpa se ninguém digitou de novo enquanto o pedido voava.
      if (ok && sujos.current.get(itemId) === texto) sujos.current.delete(itemId);
      if (!ok) {
        temporizadores.current.set(
          itemId,
          setTimeout(() => void salvarTexto(itemId), NOVA_TENTATIVA_MS),
        );
      }
      atualizarStatus(ok);
    },
    [enviarItem, atualizarStatus],
  );

  const aoDigitar = (itemId: string, valor: string) => {
    setTextos((s) => ({ ...s, [itemId]: valor }));
    sujos.current.set(itemId, valor);
    setStatus('salvando');
    const t = temporizadores.current.get(itemId);
    if (t) clearTimeout(t);
    temporizadores.current.set(itemId, setTimeout(() => void salvarTexto(itemId), ESPERA_MS));
  };

  const aoMarcar = async (itemId: string, m: Marcacao) => {
    const nova = marcacoes[itemId] === m ? null : m;
    const anterior = marcacoes[itemId] ?? null;
    setMarcacoes((s) => ({ ...s, [itemId]: nova }));
    const ok = await enviarItem(itemId, { marcacao: nova });
    if (!ok) setMarcacoes((s) => ({ ...s, [itemId]: anterior }));
    atualizarStatus(ok);
  };

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

  const blocosArquivo = q.blocos.filter((b) => b.tipo === 'ARQUIVO');
  const blocosPergunta = q.blocos.filter((b) => b.tipo === 'PERGUNTA');
  const nArquivos = blocosArquivo.reduce((n, b) => n + b.itens.length, 0);
  const nPerguntas = blocosPergunta.reduce((n, b) => n + b.itens.length, 0);

  const props = {
    textos,
    marcacoes,
    arquivos,
    estadoDe,
    aoDigitar,
    aoSairDoCampo: (id: string) => void salvarTexto(id),
    aoMarcar,
    token,
    aoSubir: (a: ArquivoTela) => {
      setArquivos((s) => [...s, a]);
      setStatus('salvo');
    },
    aoRemover: (id: string) => setArquivos((s) => s.filter((a) => a.id !== id)),
  };

  return (
    <div className="pb-40">
      <header className="mx-auto max-w-2xl px-4 pb-6 pt-8 sm:pt-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-marca">
          FlowFoods · Formulário inicial
        </p>
        <h1 className="mt-3 font-serifa text-3xl font-bold leading-tight sm:text-4xl">{cliente}</h1>
        <p className="mt-2 font-serifa text-lg italic text-footer/70">{q.abertura.tagline}</p>
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
          <p className="leading-relaxed">{q.abertura.fechamento}</p>
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
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-footer/55">{children}</p>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-footer/10 bg-white/70 p-4 sm:p-5">{children}</div>;
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-marca">Parte {numero}</p>
        <h2 className="mt-1 font-serifa text-2xl font-bold">
          {titulo} <span className="font-franklin text-base font-normal text-footer/50">· {total}</span>
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

const SELO: Record<EstadoItem, { rotulo: string; classe: string }> = {
  RECEBIDO: { rotulo: 'Respondido', classe: 'border-footer bg-footer text-creme' },
  MARCADO: { rotulo: 'Marcado', classe: 'border-footer/40 text-footer' },
  PENDENTE: { rotulo: 'Pendente', classe: 'border-footer/15 text-footer/45' },
};

function CartaoItem({
  item,
  textos,
  marcacoes,
  arquivos,
  estadoDe,
  aoDigitar,
  aoSairDoCampo,
  aoMarcar,
  token,
  aoSubir,
  aoRemover,
}: {
  item: Item;
  textos: Record<string, string>;
  marcacoes: Record<string, Marcacao | null>;
  arquivos: ArquivoTela[];
  estadoDe: Map<string, EstadoItem>;
  aoDigitar: (id: string, v: string) => void;
  aoSairDoCampo: (id: string) => void;
  aoMarcar: (id: string, m: Marcacao) => void;
  token: string;
  aoSubir: (a: ArquivoTela) => void;
  aoRemover: (id: string) => void;
}) {
  const estado = estadoDe.get(item.id) ?? 'PENDENTE';
  const selo = SELO[estado];
  const meus = arquivos.filter((a) => a.itemId === item.id);
  const ehPergunta = item.tipo === 'PERGUNTA';
  const idCampo = `campo-${item.id}`;

  return (
    <article id={`item-${item.id}`} className="rounded-lg border border-footer/10 bg-white/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={idCampo} className="block">
          <span className="font-medium leading-snug">{item.rotulo}</span>
          {item.detalhe && <span className="mt-1 block text-sm text-footer/60">{item.detalhe}</span>}
        </label>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${selo.classe}`}
        >
          {selo.rotulo}
        </span>
      </div>

      <textarea
        id={idCampo}
        value={textos[item.id] ?? ''}
        onChange={(e) => aoDigitar(item.id, e.target.value)}
        onBlur={() => aoSairDoCampo(item.id)}
        rows={ehPergunta ? 4 : 2}
        placeholder={ehPergunta ? 'Sua resposta' : 'Escreva, cole um link ou anexe arquivos'}
        className="mt-3 w-full resize-y rounded-md border border-footer/15 bg-white px-3 py-2.5 text-base leading-relaxed outline-none transition placeholder:text-footer/35 focus:border-footer/60"
      />

      <ListaArquivos token={token} arquivos={meus} aoRemover={aoRemover} />

      <div className="mt-3 flex flex-wrap gap-2">
        <BotaoAnexar token={token} item={item} aoSubir={aoSubir} />
        {MARCACOES.map((m) => {
          const ativa = marcacoes[item.id] === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={ativa}
              onClick={() => aoMarcar(item.id, m)}
              className={`min-h-[44px] rounded-md border px-3 text-xs font-semibold uppercase tracking-wider transition ${
                ativa
                  ? 'border-marca bg-marca text-white'
                  : 'border-footer/20 text-footer/70 hover:border-footer/50'
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
    <ul className="mt-3 divide-y divide-footer/10 rounded-md border border-footer/10">
      {arquivos.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {a.nomeOriginal} <span className="text-footer/50">· {formatarTamanho(a.tamanho)}</span>
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
            className="min-h-[44px] shrink-0 px-2 text-xs font-semibold uppercase tracking-wider text-footer/50 hover:text-marca"
          >
            {removendo === a.id ? 'Removendo…' : 'Remover'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Upload com barra de progresso: planilha de 12 meses no 4G leva tempo. */
function BotaoAnexar({
  token,
  item,
  aoSubir,
}: {
  token: string;
  item: Item;
  aoSubir: (a: ArquivoTela) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const subirUm = (arquivo: File) =>
    new Promise<void>((resolve) => {
      if (arquivo.size > LIMITE_BYTES) {
        setErro(`"${arquivo.name}" passa de 50 MB. Mande por link no campo de texto.`);
        resolve();
        return;
      }
      const form = new FormData();
      form.append('itemId', item.id);
      form.append('arquivo', arquivo);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/portal/${token}/arquivo`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const r = JSON.parse(xhr.responseText) as { ok: boolean; arquivo?: ArquivoTela; erro?: string };
          if (xhr.status < 300 && r.ok && r.arquivo) aoSubir(r.arquivo);
          else setErro(r.erro ?? 'Não enviou. Tente de novo.');
        } catch {
          setErro(xhr.status === 413 ? 'Arquivo acima de 50 MB.' : 'Não enviou. Tente de novo.');
        }
        resolve();
      };
      xhr.onerror = () => {
        setErro('Sem conexão. Tente de novo.');
        resolve();
      };
      xhr.send(form);
    });

  return (
    <>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={item.tipo === 'PERGUNTA' ? 'audio/*' : undefined}
        className="hidden"
        onChange={async (e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = '';
          setErro(null);
          for (const a of lista) {
            setPct(0);
            await subirUm(a);
          }
          setPct(null);
        }}
      />
      <button
        type="button"
        disabled={pct !== null}
        onClick={() => entrada.current?.click()}
        className="min-h-[44px] rounded-md border border-footer bg-footer px-4 text-xs font-semibold uppercase tracking-wider text-creme transition hover:bg-footer/85 disabled:opacity-60"
      >
        {pct !== null ? `Enviando ${pct}%` : item.tipo === 'PERGUNTA' ? 'Anexar áudio' : 'Anexar arquivo'}
      </button>
      {erro && (
        <p role="alert" className="basis-full text-sm text-marca">
          {erro}
        </p>
      )}
    </>
  );
}

const ROTULO_STATUS: Record<StatusSalvar, string> = {
  ocioso: 'Salva sozinho enquanto você escreve',
  salvando: 'Salvando…',
  salvo: 'Tudo salvo',
  erro: 'Sem conexão. Tentando de novo…',
};

function BarraEnviar({
  token,
  status,
  pendentes,
  respondidos,
  total,
  finalizadoEm,
  antesDeEnviar,
  aoEnviar,
}: {
  token: string;
  status: StatusSalvar;
  pendentes: number;
  respondidos: number;
  total: number;
  finalizadoEm: string | null;
  antesDeEnviar: () => Promise<boolean>;
  aoEnviar: (quando: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pct = total > 0 ? Math.round((respondidos / total) * 100) : 0;

  const enviar = async () => {
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
      setErro('Há texto que ainda não salvou. Confira a conexão e tente de novo.');
      return;
    }
    const r = await fetch(`/api/portal/${token}/finalizar`, { method: 'POST' }).catch(() => null);
    setEnviando(false);
    if (r?.ok) aoEnviar(new Date().toISOString());
    else setErro('Não enviou. Tente de novo em instantes.');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-footer/15 bg-creme/95 backdrop-blur">
      <div className="h-0.5 bg-footer/10">
        <div className="h-full bg-marca transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums">
            {respondidos} de {total}
            {pendentes > 0 && <span className="font-normal text-footer/60"> · {pendentes} em branco</span>}
          </p>
          <p aria-live="polite" className={`truncate text-xs ${status === 'erro' ? 'text-marca' : 'text-footer/55'}`}>
            {erro ??
              (finalizadoEm && status !== 'erro'
                ? `Enviado ao Rodolfo. Pode continuar completando.`
                : ROTULO_STATUS[status])}
          </p>
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="min-h-[48px] shrink-0 rounded-md bg-marca px-5 text-sm font-semibold uppercase tracking-wider text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {enviando ? 'Enviando…' : finalizadoEm ? 'Enviar de novo' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
