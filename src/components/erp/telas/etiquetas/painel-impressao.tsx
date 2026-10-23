'use client';

/**
 * Mandar a etiqueta para o papel (3.4, decisão 409). Três caminhos, todos com o pedido GRAVADO antes (o histórico nunca perde
 * uma impressão):
 * - Zebra pelo Browser Print: grava "preparada", manda o ZPL que o servidor montou e grava o resultado ("enviada à impressora"
 *   ou "falhou", com o porquê). Sem resposta = falha, e pode ter saído: mandar de novo é outro pedido, por clique, avisando;
 * - arquivo .zpl: para mandar à Zebra por outro programa (download não é impressão: fica "arquivo gerado");
 * - papel A4: a etiqueta no tamanho real, para a impressora comum.
 * Sem o Browser Print (ou sem impressora nele), a tela diz o que falta e o arquivo e o papel seguem funcionando.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MAX_COPIAS } from '@/lib/erp/etiqueta-campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { CAMPO, ROTULO } from '../../ui/campos';
import { baixarArquivo, baseDoBrowserPrint, detectar, enviarZpl, lerPreferencia, type Deteccao, type PreferenciaDaImpressora } from './browser-print';
import { chaveNova } from './conteudo';
import type { AcaoDePedir, AcaoDeResultado } from './executar';

type Fase =
  | { tipo: 'ocioso' }
  | { tipo: 'gravando' }
  | { tipo: 'enviando' }
  | { tipo: 'enviada'; copias: number }
  | { tipo: 'falhou'; erro: string }
  | { tipo: 'arquivo'; nome: string }
  | { tipo: 'erro'; erro: string };

const BOTAO_PASSO = 'ff-transicao inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] border border-linha-forte text-lg font-semibold text-texto hover:border-texto/35 hover:bg-texto/5 disabled:cursor-not-allowed disabled:opacity-55';

export function PainelDeImpressao({ copiasIniciais, pedir, resultado, hrefPapel, hrefImpressora }: { copiasIniciais: number; pedir: AcaoDePedir; resultado: AcaoDeResultado; hrefPapel: string; hrefImpressora: string }) {
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
  const ocupado = fase.tipo === 'gravando' || fase.tipo === 'enviando';
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
    await resultado(r.id, e.ok ? 'ENVIADA' : 'FALHOU', e.ok ? '' : e.erro).catch(() => null);
    setFase(e.ok ? { tipo: 'enviada', copias: n! } : { tipo: 'falhou', erro: e.erro });
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
            <span className="block text-[12px] text-suave">
              {deteccao.fonte === 'escolhida' ? 'escolhida neste computador' : 'a padrão do Browser Print'} · {pref.resolucao} dpi ·{' '}
              <Link href={hrefImpressora} className={LINK_DE_TEXTO}>
                trocar
              </Link>
            </span>
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="font-semibold text-texto">{deteccao.estado === 'sem-aplicativo' ? 'O Browser Print da Zebra não respondeu neste computador.' : 'O Browser Print está aberto, mas sem impressora.'}</p>
            <p className="text-[13px] text-suave">
              {deteccao.estado === 'sem-aplicativo'
                ? 'Para imprimir direto, este computador precisa estar ligado à Zebra e com o aplicativo Zebra Browser Print aberto. Enquanto isso, baixe o arquivo .zpl ou imprima no papel.'
                : 'Ligue a Zebra e escolha uma impressora padrão no Browser Print. Enquanto isso, baixe o arquivo .zpl ou imprima no papel.'}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <button type="button" onClick={() => void procurar(base, pref)} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
                Procurar de novo
              </button>
              <Link href={hrefImpressora} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
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
          {fase.tipo === 'gravando' ? 'Preparando…' : fase.tipo === 'enviando' ? 'Enviando à Zebra…' : fase.tipo === 'falhou' ? 'Mandar de novo (pode sair repetida)' : 'Imprimir na Zebra'}
        </button>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void arquivo()} disabled={!nValido || ocupado} className={classeDeBotao('secundario', 'w-full')}>
            Baixar o arquivo .zpl
          </button>
          <button type="button" onClick={() => void papel()} disabled={!nValido || ocupado} className={classeDeBotao('secundario', 'w-full')}>
            Imprimir no papel (A4)
          </button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-[13px]">
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
        {fase.tipo === 'arquivo' && (
          <p className="text-texto">
            <span className="font-semibold">Arquivo gerado: {fase.nome}.</span> <span className="text-suave">Ele não imprime sozinho: mande para a Zebra pelo programa dela.</span>
          </p>
        )}
        {fase.tipo === 'erro' && (
          <p role="alert" className="text-erro">
            {fase.erro}
          </p>
        )}
      </div>
    </div>
  );
}
