'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ApuracaoReferenciaFinancial } from '@/lib/integracoes/ifood/financial-v3-apuracao-referencia';
import { Campo, CAMPO } from '@/components/erp/ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Painel } from '@/components/erp/ui/superficies';
import { ResultadoApuracaoReferencia } from './resultado-apuracao-referencia';

interface Conferencia {
  app: { clientId: string; ambiente: 'TEST' };
  origem: 'ARQUIVOS_APRESENTADOS';
  apuracao: ApuracaoReferenciaFinancial;
}

function baixar(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FormApuracaoReferencia({ rota }: { rota: string }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ dados: Conferencia; original: File } | null>(null);
  const requisicao = useRef<AbortController | null>(null);
  const leitura = useRef<HTMLDivElement>(null);
  useEffect(() => () => requisicao.current?.abort(), []);
  useEffect(() => { if (resultado) leitura.current?.focus(); }, [resultado]);

  async function conferir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (requisicao.current) return;
    const form = new FormData(evento.currentTarget);
    const original = form.get('conciliacao');
    if (!(original instanceof File)) return;
    const envio = new AbortController();
    requisicao.current = envio;
    setEnviando(true);
    setErro('');
    setResultado(null);
    try {
      const resposta = await fetch(rota, { method: 'POST', body: form, signal: envio.signal, redirect: 'error', cache: 'no-store',
        headers: { accept: 'application/json' } });
      const dados = await resposta.json();
      if (!resposta.ok) { setErro(dados.mensagem || 'Não foi possível conferir as fontes.'); return; }
      setResultado({ dados, original });
    } catch {
      if (!envio.signal.aborted) setErro('A conferência foi interrompida. Confira sua sessão na central e tente novamente.');
    } finally {
      requisicao.current = null;
      if (!envio.signal.aborted) setEnviando(false);
    }
  }

  return <div className="space-y-4">
    {resultado && <div tabIndex={-1} ref={leitura} aria-label="Resultado da conferência" className="space-y-3">
      <ResultadoApuracaoReferencia apuracao={resultado.dados.apuracao} />
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <button type="button" className={`${LINK_DE_TEXTO} min-h-11`} onClick={() => baixar(resultado.original, 'conciliacao-referencia.csv.gz')}>Baixar CSV.gz apresentado</button>
        <button type="button" className={`${LINK_DE_TEXTO} min-h-11`} onClick={() => baixar(
          new Blob([JSON.stringify(resultado.dados, null, 2)], { type: 'application/json' }), 'conferencia-financial-test.json',
        )}>Baixar registro da conferência</button>
      </div>
    </div>}
    <Painel titulo="Selecionar apuração e fontes" subtitulo="Até 2 MiB por arquivo e 6 MiB no total. As fontes permanecem disponíveis nesta tela durante a conferência.">
      <form action={rota} onSubmit={conferir} method="post" encType="multipart/form-data" onChange={() => { setErro(''); setResultado(null); }}>
        <fieldset disabled={enviando} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id="ref-competencia" rotulo="Competência"><input id="ref-competencia" type="month" name="competencia" className={CAMPO} required /></Campo>
            <Campo id="ref-inicio" rotulo="Início da apuração"><input id="ref-inicio" type="date" name="inicio" className={CAMPO} required /></Campo>
            <Campo id="ref-fim" rotulo="Fim da apuração"><input id="ref-fim" type="date" name="fim" className={CAMPO} required /></Campo>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Campo id="ref-csv" rotulo="Arquivo mensal de reconciliação (CSV.gz)"><input id="ref-csv" name="conciliacao" type="file" accept=".gz,.gzip,.txt" className={CAMPO} required /></Campo>
            <Campo id="ref-eventos" rotulo="Financial Events (JSON ou TXT)"><input id="ref-eventos" name="eventos" type="file" multiple accept=".json,.txt" className={CAMPO} required /></Campo>
            <Campo id="ref-settlements" rotulo="Settlements (JSON ou TXT)"><input id="ref-settlements" name="liquidacao" type="file" accept=".json,.txt" className={CAMPO} required /></Campo>
          </div>
          <p className="text-[13px] text-suave">Selecione um arquivo por página de eventos e a resposta de Settlements por data de apuração.</p>
          <button className={classeDeBotao('primario')} type="submit">{enviando ? 'Conferindo…' : 'Conferir apuração'}</button>
        </fieldset>
      </form>
    </Painel>
    {erro && <div role="alert"><Aviso tom="erro" titulo="Não foi possível concluir a conferência">{erro}</Aviso></div>}
  </div>;
}
