/**
 * A aba Impressora (3.4): como ligar a Zebra ao computador da cozinha (Browser Print) e a configuração deste navegador. A
 * impressora física e o aplicativo dependem de quem está na loja: a tela diz o passo a passo e oferece o arquivo e o papel
 * enquanto isso.
 */

import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Painel } from '../../ui/superficies';
import { ConfigDaImpressora, type AcaoDeTeste } from './config-impressora';

const PASSOS = [
  'No computador ligado à Zebra (USB ou rede), instale o Zebra Browser Print, o aplicativo gratuito da Zebra para Windows e macOS.',
  'Abra o Browser Print e confira se ele mostra a impressora. Marque-a como padrão.',
  'Na primeira vez, o Browser Print pergunta se aceita este site: aceite.',
  'Volte aqui, procure de novo e imprima a etiqueta de teste no rolo que vai usar.',
];

export function TelaDaImpressora({ contexto, zplDeTeste }: { contexto?: string; zplDeTeste: AcaoDeTeste }) {
  return (
    <div className="space-y-5">
      <PageHeader icone="config" cor={COR.etiquetas} titulo="Impressora" subtitulo={[contexto, 'a Zebra deste computador'].filter(Boolean).join(' · ')} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <ConfigDaImpressora zplDeTeste={zplDeTeste} />
        <Painel titulo="Como ligar a Zebra" subtitulo="Uma vez por computador">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-texto">
            {PASSOS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <p className="mt-4 border-t border-linha pt-3 text-[13px] text-suave">Sem o Browser Print, cada etiqueta ainda sai pelo arquivo .zpl (para o programa da Zebra) ou pelo papel A4 em tamanho real.</p>
        </Painel>
      </div>
    </div>
  );
}
