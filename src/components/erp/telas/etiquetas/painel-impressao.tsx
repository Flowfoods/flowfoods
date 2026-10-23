'use client';

/**
 * Mandar a etiqueta para o papel (3.4, decisão 409; rodada 1, decisão 418). Três caminhos, todos com o pedido GRAVADO antes (o
 * histórico nunca perde uma impressão):
 * - Zebra pelo Browser Print: grava o pedido, manda o ZPL que o servidor montou e grava o resultado ("enviada à impressora" ou
 *   "falhou", com o porquê em palavras). Sem resposta em 15 s NÃO é falha: fica "sem resultado" (pode ter saído);
 * - arquivo .zpl: para mandar à Zebra por outro programa; papel A4: a etiqueta em tamanho real, para a impressora comum.
 * A etiqueta só sai da fila "Esperando a impressora" quando a Zebra aceita o envio ou quando a pessoa toca em "Já imprimi"
 * (grava quem e quando). Baixar o arquivo ou abrir o papel não tira. Sem a Zebra neste aparelho, a tela diz que a etiqueta
 * fica na fila (imprima pelo computador da Zebra) e o arquivo e o papel ficam como opção.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MAX_COPIAS } from '@/lib/erp/etiqueta-campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { CAMPO, ROTULO } from '../../ui/campos';
import { baixarArquivo, baseDoBrowserPrint, detectar, enviarZpl, lerPreferencia, type Deteccao, type PreferenciaDaImpressora } from './browser-print';
import { chaveNova } from './conteudo';
import type { AcaoDeConfirmar, AcaoDePedir, AcaoDeResultado } from './executar';

type Fase =
  | { tipo: 'ocioso' }
  | { tipo: 'gravando' }
  | { tipo: 'enviando' }
  | { tipo: 'enviada'; copias: number }
  | { tipo: 'falhou'; erro: string }
  | { tipo: 'sem-resposta' }
  | { tipo: 'arquivo'; nome: string }
  | { tipo: 'confirmando' }
  | { tipo: 'confirmada' }
  | { tipo: 'erro'; erro: string };

const BOTAO_PASSO = 'ff-transicao inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] border border-linha-forte text-lg font-semibold text-texto hover:border-texto/35 hover:bg-texto/5 disabled:cursor-not-allowed disabled:opacity-55';

export function PainelDeImpressao({
  copiasIniciais,
  pedir,
  resultado,
  confirmar,
  naFila,
  aConfirmar,
  hrefPapel,
  hrefImpressora,
}: {
  copiasIniciais: number;
  pedir: AcaoDePedir;
  resultado: AcaoDeResultado;
  confirmar: AcaoDeConfirmar;
  /** Ainda em "Esperando a impressora" (nenhum envio aceito, ninguém disse "Já imprimi"). */
  naFila: boolean;
  /** Há um pedido de arquivo, de papel ou da Zebra sem resposta que o "Já imprimi" confirma. */
  aConfirmar: boolean;
  hrefPapel: string;
  hrefImpressora: string;
}) {
  const router = useRouter();
  const [deteccao, setDeteccao] = useState<Deteccao | null>(null);
  const [pref, setPref] = useState<PreferenciaDaImpressora>({ uid: null, nome: null, resolucao: 203 });
  const [base, setBase] = useState('http://localhost:9100');
  const [copias, setCopias] = useState(String(Math.min(MAX_COPIAS, Math.max(1, copiasIniciais))));
  const [fase, setFase] = useState<Fase>({ tipo: 'ocioso' });

  const procurar = async (b: string, p: PreferenciaDaImpressora) => {
    setDeteccao(null);
    setDeteccao(await detectar(b, p.uid));
  };
  useEffect(() => {
    const p = lerPreferencia();
    const b = baseDoBrowserPrint(window.location.protocol);
    setPref(p);
    setBase(b);
    void procurar(b, p);
  }, []);

  const n = /^\d{1,3}$/.test(copias) ? Number(copias) : null;
  const nValido = n !== null && n >= 1 && n <= MAX_COPIAS;
  const ocupado = fase.tipo === 'gravando' || fase.tipo === 'enviando' || fase.tipo === 'confirmando';
  const passo = (d: number) => setCopias(String(Math.min(MAX_COPIAS, Math.max(1, (n ?? 1) + d))));

  async function naZebra() {
    if (deteccao?.estado !== 'pronta' || !nValido || ocupado) return;
    setFase({ tipo: 'gravando' });
    const r = await pedir({ copias: String(n), transporte: 'BROWSER_PRINT', resolucao: String(pref.resolucao), envio: chaveNova() }).catch(() => null);
    if (!r || !r.ok) {
      setFase({ tipo: 'erro', erro: r && !r.ok ? (r.erros.copias ?? r.erros.geral ?? 'Não deu para preparar a impressão.') : 'Sem conexão com o site: nada foi enviado. Tente de novo.' });
      return;
    }
    setFase({ tipo: 'enviando' });
    const e = await enviarZpl(base, deteccao.impressora, r.zpl);
    // Sem resposta: o pedido fica "sem resultado" (pode ter saído); a pessoa confere e diz.
    if (e.ok || !e.semResposta) await resultado(r.id, e.ok ? 'ENVIADA' : 'FALHOU', e.ok ? '' : e.erro).catch(() => null);
    setFase(e.ok ? { tipo: 'enviada', copias: n! } : e.semResposta ? { tipo: 'sem-resposta' } : { tipo: 'falhou', erro: e.erro });
    router.refresh();
  }

  async function jaImprimi() {
    if (ocupado) return;
    setFase({ tipo: 'confirmando' });
    const r = await confirmar().catch(() => null);
    if (!r || !r.ok) {
      setFase({ tipo: 'erro', erro: r && !r.ok ? (r.erros.geral ?? 'Não deu para registrar.') : 'Sem conexão com o site: tente de novo.' });
      return;
    }
    setFase({ tipo: 'confirmada' });
    router.refresh();
  }

  async function arquivo() {
    if (!nValido || ocupado) return;
    setFase({ tipo: 'gravando' });
    const r = await pedir({ copias: String(n), transporte: 'ARQUIVO_ZPL', resolucao: String(pref.resolucao), envio: chaveNova() }).catch(() => null);
    if (!r || !r.ok) {
      setFase({ tipo: 'erro', erro: r && !r.ok ? (r.erros.copias ?? r.erros.geral ?? 'Não deu para gerar o arquivo.') : 'Sem conexão com o site: tente de novo.' });
      return;
    }
    const ok = baixarArquivo(r.nomeArquivo, r.zpl);
    setFase(ok ? { tipo: 'arquivo', nome: r.nomeArquivo } : { tipo: 'erro', erro: 'O navegador não deixou baixar o arquivo.' });
    router.refresh();
  }

  async function papel() {
    if (!nValido || ocupado) return;
    setFase({ tipo: 'gravando' });
    const r = await pedir({ copias: String(n), transporte: 'PAPEL', resolucao: '203', envio: chaveNova() }).catch(() => null);
    if (!r || !r.ok) {
      setFase({ tipo: 'erro', erro: r && !r.ok ? (r.erros.copias ?? r.erros.geral ?? 'Não deu para preparar o papel.') : 'Sem conexão com o site: tente de novo.' });
      return;
    }
    router.push(`${hrefPapel}?pedido=${encodeURIComponent(r.id)}`);
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="rounded-[10px] border border-linha px-3.5 py-3 text-sm">
        {deteccao === null ? (
          <p className="text-suave">Procurando a Zebra neste computador…</p>
        ) : deteccao.estado === 'pronta' ? (
          <p className="text-texto">
            <span className="font-semibold">Zebra pronta:</span> {deteccao.impressora.name}
            <span className="flex flex-wrap items-center gap-x-1 text-[12px] text-suave">
              {deteccao.fonte === 'escolhida' ? 'escolhida neste computador' : 'a padrão do Browser Print'} · {pref.resolucao} dpi ·
              <Link href={hrefImpressora} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>
                trocar
              </Link>
            </span>
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="font-semibold text-texto">{deteccao.estado === 'sem-aplicativo' ? 'Sem Zebra neste aparelho.' : 'O Browser Print está aberto, mas sem impressora.'}</p>
            <p className="text-[13px] text-suave">
              {deteccao.estado === 'sem-aplicativo'
                ? 'A etiqueta fica em “Esperando a impressora”: imprima pelo computador da Zebra (com o Zebra Browser Print aberto).'
                : 'Ligue a Zebra e escolha uma impressora padrão no Browser Print. A etiqueta fica em “Esperando a impressora” até sair.'}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <button type="button" onClick={() => void procurar(base, pref)} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>
                Procurar de novo
              </button>
              <Link href={hrefImpressora} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`}>
                Como ligar a Zebra
              </Link>
            </p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="imprimir-copias" className={ROTULO}>
          Cópias <span className="font-normal text-suave">(até {MAX_COPIAS})</span>
        </label>
        <div className="flex items-stretch gap-2">
          <button type="button" className={BOTAO_PASSO} onClick={() => passo(-1)} disabled={!nValido || n! <= 1 || ocupado} aria-label="Uma cópia a menos">
            −
          </button>
          <input
            id="imprimir-copias"
            inputMode="numeric"
            autoComplete="off"
            value={copias}
            disabled={ocupado}
            onChange={(e) => setCopias(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className={`${CAMPO} w-24 text-center text-[18px] font-semibold tabular-nums`}
            aria-invalid={!nValido}
            aria-describedby={!nValido ? 'imprimir-copias-erro' : undefined}
          />
          <button type="button" className={BOTAO_PASSO} onClick={() => passo(1)} disabled={(nValido && n! >= MAX_COPIAS) || ocupado} aria-label="Uma cópia a mais">
            +
          </button>
        </div>
        {!nValido && (
          <p id="imprimir-copias-erro" className="mt-1.5 text-[13px] text-erro">
            De 1 a {MAX_COPIAS}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => void naZebra()} disabled={deteccao?.estado !== 'pronta' || !nValido || ocupado} aria-busy={ocupado} className={classeDeBotao('primario', 'w-full')}>
          {fase.tipo === 'gravando' ? 'Preparando…' : fase.tipo === 'enviando' ? 'Enviando à Zebra…' : fase.tipo === 'falhou' || fase.tipo === 'sem-resposta' ? 'Mandar de novo (pode sair repetida)' : 'Imprimir na Zebra'}
        </button>
        {deteccao !== null && deteccao.estado !== 'pronta' && <p className="pt-1 text-[13px] text-suave">Ou, sem a Zebra (depois que sair, toque em “Já imprimi”):</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void arquivo()} disabled={!nValido || ocupado} className={classeDeBotao('secundario', 'w-full')}>
            Baixar o arquivo .zpl
          </button>
          <button type="button" onClick={() => void papel()} disabled={!nValido || ocupado} className={classeDeBotao('secundario', 'w-full')}>
            Imprimir no papel (A4)
          </button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] space-y-1 text-[13px]">
        {fase.tipo === 'enviada' && (
          <p className="text-ok">
            <span className="font-semibold">Enviada à impressora ({fase.copias === 1 ? '1 cópia' : `${fase.copias} cópias`}).</span> Confira o papel: se não saiu, veja a tampa, o rolo e a fita da Zebra antes de mandar de novo.
          </p>
        )}
        {fase.tipo === 'falhou' && (
          <p role="alert" className="text-erro">
            <span className="font-semibold">Não foi.</span> {fase.erro}
          </p>
        )}
        {fase.tipo === 'sem-resposta' && (
          <div role="alert" className="text-texto">
            <p className="font-semibold">Sem resposta</p>
            <p className="text-suave">A Zebra não respondeu em 15 segundos. Pode ter saído: confira o papel. Se saiu, toque em “Já imprimi”; se não, mande de novo.</p>
          </div>
        )}
        {fase.tipo === 'arquivo' && (
          <p className="text-texto">
            <span className="font-semibold">Arquivo baixado: {fase.nome}.</span> <span className="text-suave">Ele não imprime sozinho: mande para a Zebra pelo programa dela. A etiqueta continua esperando a impressora até você tocar em “Já imprimi”.</span>
          </p>
        )}
        {fase.tipo === 'confirmada' && (
          <p className="text-ok">
            <span className="font-semibold">Pronto: registrado que saiu.</span> A etiqueta saiu de “Esperando a impressora”.
          </p>
        )}
        {fase.tipo === 'erro' && (
          <p role="alert" className="text-erro">
            {fase.erro}
          </p>
        )}
      </div>

      {naFila && (aConfirmar || fase.tipo === 'arquivo' || fase.tipo === 'sem-resposta') && fase.tipo !== 'confirmada' && (
        <div className="space-y-2 border-t border-linha pt-3">
          <p className="text-[13px] text-suave">Saiu no papel (pelo arquivo, pelo papel A4 ou pela Zebra que não respondeu)? Diga aqui para tirar da fila.</p>
          <BotaoJaImprimi onClick={() => void jaImprimi()} ocupado={ocupado} confirmando={fase.tipo === 'confirmando'} />
        </div>
      )}
    </div>
  );
}

/** O "Já imprimi": grava quem e quando; a etiqueta sai da fila (decisão 418). */
export function BotaoJaImprimi({ onClick, ocupado, confirmando }: { onClick: () => void; ocupado: boolean; confirmando: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={ocupado} aria-busy={confirmando} className={classeDeBotao('secundario', 'w-full')}>
      {confirmando ? 'Registrando…' : 'Já imprimi'}
    </button>
  );
}

/** O "Já imprimi" da tela do papel: depois de imprimir a folha, volta para a etiqueta com a fila em dia. */
export function JaImprimiDoPapel({ confirmar, voltar }: { confirmar: AcaoDeConfirmar; voltar: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ tipo: 'ocioso' } | { tipo: 'confirmando' } | { tipo: 'erro'; erro: string }>({ tipo: 'ocioso' });
  async function clicar() {
    if (estado.tipo === 'confirmando') return;
    setEstado({ tipo: 'confirmando' });
    const r = await confirmar().catch(() => null);
    if (!r || !r.ok) {
      setEstado({ tipo: 'erro', erro: r && !r.ok ? (r.erros.geral ?? 'Não deu para registrar.') : 'Sem conexão com o site: tente de novo.' });
      return;
    }
    router.push(`${voltar}?feito=impressa`);
  }
  return (
    <div className="space-y-2 rounded-[14px] border border-linha bg-painel px-4 py-3 text-sm sm:px-5">
      <p className="text-suave">
        <span className="font-semibold text-texto">Depois que a folha sair, toque em “Já imprimi”.</span> Até lá, a etiqueta continua em “Esperando a impressora”.
      </p>
      <div className="sm:max-w-xs">
        <BotaoJaImprimi onClick={() => void clicar()} ocupado={estado.tipo === 'confirmando'} confirmando={estado.tipo === 'confirmando'} />
      </div>
      {estado.tipo === 'erro' && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erro}
        </p>
      )}
    </div>
  );
}
