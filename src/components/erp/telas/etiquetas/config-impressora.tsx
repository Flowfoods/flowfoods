'use client';

/**
 * A Zebra DESTE computador (3.4): o que o Browser Print enxerga, qual usar (a padrão dele ou uma escolhida), a resolução (203
 * dpi é o comum; 300 só se a etiqueta de teste sair pequena) e a etiqueta de teste (dados fictícios; nada é gravado). A escolha
 * fica neste navegador: outro computador escolhe de novo.
 */

import { useEffect, useState } from 'react';
import { FORMATOS, ORDEM_DOS_FORMATOS, type Formato } from '@/lib/erp/etiqueta-campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import { baixarArquivo, baseDoBrowserPrint, detectar, enviarZpl, gravarPreferencia, impressorasDisponiveis, lerPreferencia, type DispositivoZebra, type PreferenciaDaImpressora } from './browser-print';

export type AcaoDeTeste = (formato: string, resolucao: string) => Promise<{ ok: true; zpl: string; nomeArquivo: string } | { ok: false; erro: string }>;

type Situacao = { tipo: 'procurando' } | { tipo: 'sem-aplicativo' } | { tipo: 'lista'; impressoras: DispositivoZebra[]; padrao: string | null };

const OPCAO =
  'ff-transicao flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-linha px-3.5 py-2.5 hover:border-linha-forte peer-checked:border-linha-forte peer-checked:bg-forte peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento';

export function ConfigDaImpressora({ zplDeTeste }: { zplDeTeste: AcaoDeTeste }) {
  const [base, setBase] = useState('http://localhost:9100');
  const [pref, setPref] = useState<PreferenciaDaImpressora>({ uid: null, nome: null, resolucao: 203 });
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'procurando' });
  const [formato, setFormato] = useState<Formato>('E60X40');
  const [msg, setMsg] = useState<{ tom: 'ok' | 'erro' | 'neutro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [guardou, setGuardou] = useState(true);

  const procurar = async (b: string) => {
    setSituacao({ tipo: 'procurando' });
    const lista = await impressorasDisponiveis(b);
    if (lista === null) {
      setSituacao({ tipo: 'sem-aplicativo' });
      return;
    }
    const d = await detectar(b, null);
    setSituacao({ tipo: 'lista', impressoras: lista, padrao: d.estado === 'pronta' ? d.impressora.uid : null });
  };
  useEffect(() => {
    const p = lerPreferencia();
    const b = baseDoBrowserPrint(window.location.protocol);
    setPref(p);
    setBase(b);
    void procurar(b);
  }, []);

  const mudar = (p: PreferenciaDaImpressora) => {
    setPref(p);
    setGuardou(gravarPreferencia(p));
  };

  const escolhida = situacao.tipo === 'lista' ? (situacao.impressoras.find((i) => i.uid === pref.uid) ?? situacao.impressoras.find((i) => i.uid === situacao.padrao) ?? null) : null;

  async function testar(enviar: boolean) {
    setOcupado(true);
    setMsg(null);
    const r = await zplDeTeste(formato, String(pref.resolucao)).catch(() => null);
    if (!r || !r.ok) {
      setMsg({ tom: 'erro', texto: r && !r.ok ? r.erro : 'Sem conexão com o site: tente de novo.' });
      setOcupado(false);
      return;
    }
    if (!enviar) {
      setMsg(baixarArquivo(r.nomeArquivo, r.zpl) ? { tom: 'neutro', texto: `Arquivo de teste gerado: ${r.nomeArquivo}.` } : { tom: 'erro', texto: 'O navegador não deixou baixar o arquivo.' });
      setOcupado(false);
      return;
    }
    if (!escolhida) {
      setMsg({ tom: 'erro', texto: 'Escolha a impressora antes do teste.' });
      setOcupado(false);
      return;
    }
    const e = await enviarZpl(base, escolhida, r.zpl);
    setMsg(e.ok ? { tom: 'ok', texto: `Teste enviado para ${escolhida.name}. Confira: o texto deve caber inteiro em ${FORMATOS[formato].rotulo}, sem cortar. Saiu pequeno demais? Troque para 300 dpi.` } : { tom: 'erro', texto: e.erro });
    setOcupado(false);
  }

  return (
    <div className="space-y-5">
      <Painel titulo="Impressoras que o Browser Print vê" subtitulo="Neste computador" acessorio={<button type="button" onClick={() => void procurar(base)} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>Procurar de novo</button>}>
        <div aria-live="polite">
          {situacao.tipo === 'procurando' ? (
            <p className="text-sm text-suave">Procurando o Browser Print da Zebra neste computador…</p>
          ) : situacao.tipo === 'sem-aplicativo' ? (
            <p className="text-sm text-texto">
              <span className="font-semibold">O Browser Print não respondeu.</span> <span className="text-suave">Siga os passos ao lado e procure de novo. Sem ele, as etiquetas saem pelo arquivo .zpl ou pelo papel.</span>
            </p>
          ) : situacao.impressoras.length === 0 ? (
            <p className="text-sm text-texto">
              <span className="font-semibold">O Browser Print está aberto, mas não achou impressora.</span> <span className="text-suave">Ligue a Zebra (USB ou rede) e procure de novo.</span>
            </p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-texto">Qual usar neste computador</legend>
              <div className="grid gap-2">
                <label className="relative block">
                  <input type="radio" name="impressora" value="" checked={pref.uid === null} onChange={() => mudar({ ...pref, uid: null, nome: null })} className="peer sr-only" />
                  <span className={OPCAO}>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-texto">A padrão do Browser Print</span>
                      <span className="block text-[12px] text-suave [overflow-wrap:anywhere]">{situacao.padrao ? (situacao.impressoras.find((i) => i.uid === situacao.padrao)?.name ?? 'definida no aplicativo') : 'nenhuma padrão definida no aplicativo'}</span>
                    </span>
                  </span>
                </label>
                {situacao.impressoras.map((i) => (
                  <label key={i.uid} className="relative block">
                    <input type="radio" name="impressora" value={i.uid} checked={pref.uid === i.uid} onChange={() => mudar({ ...pref, uid: i.uid, nome: i.name })} className="peer sr-only" />
                    <span className={OPCAO}>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{i.name}</span>
                        <span className="block text-[12px] text-suave">{[i.connection === 'usb' ? 'USB' : i.connection === 'network' ? 'rede' : i.connection === 'driver' ? 'driver do Windows' : i.connection, i.uid === situacao.padrao ? 'a padrão' : null].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </Painel>

      <Painel titulo="Resolução e teste" subtitulo="A maioria das Zebra de balcão é de 203 dpi">
        <div className="space-y-5">
          <Segmentos<'203' | '300'> nome="resolucao" legenda="Resolução da impressora" opcoes={[['203', '203 dpi (comum)'], ['300', '300 dpi']]} valor={String(pref.resolucao) as '203' | '300'} aoMudar={(v) => mudar({ ...pref, resolucao: v === '300' ? 300 : 203 })} />
          <Segmentos<Formato> nome="formato-teste" legenda="Tamanho do rolo" opcoes={ORDEM_DOS_FORMATOS.map((f) => [f, FORMATOS[f].rotulo] as const)} valor={formato} aoMudar={setFormato} />
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={ocupado || !escolhida} onClick={() => void testar(true)} className={classeDeBotao('primario', 'w-full')}>
              {ocupado ? 'Enviando…' : 'Imprimir etiqueta de teste'}
            </button>
            <button type="button" disabled={ocupado} onClick={() => void testar(false)} className={classeDeBotao('secundario', 'w-full')}>
              Baixar o teste (.zpl)
            </button>
          </div>
          {!guardou && <p className="text-[13px] text-atencao">Este navegador não deixou guardar a escolha: ela vale só até fechar a tela.</p>}
          <div aria-live="polite" className="min-h-[1.25rem] text-[13px]">
            {msg && <p className={msg.tom === 'erro' ? 'text-erro' : msg.tom === 'ok' ? 'text-ok' : 'text-texto'}>{msg.texto}</p>}
          </div>
        </div>
      </Painel>
    </div>
  );
}
