/**
 * Hub "Módulos da Rede": a tela de entrada do ERP de um parceiro, a MESMA
 * para a pessoa do parceiro (/erp) e para o nível 1 dentro do parceiro
 * (/rodolfo/erp/<slug>). Recebe os módulos já filtrados pelo alcance de quem
 * vê (`modulosDoParceiro`): em uso, uma tela por card; os do plano ainda sem
 * tela, desabilitados com a fase.
 */

import type { ModuloNav } from '@/lib/erp/modulos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../ui/cabecalho';
import { HubDeModulos } from '../ui/hub';
import { Aviso } from '../ui/superficies';

export function HubDoParceiro({
  titulo,
  subtitulo,
  modulos,
  semAcesso,
}: {
  titulo: string;
  subtitulo: string;
  modulos: ModuloNav[];
  /** Chegou aqui vindo de uma tela fora do acesso (`?sem-acesso=1`). */
  semAcesso: boolean;
}) {
  const emUso = modulos.filter((m) => m.href);
  const futuros = modulos.filter((m) => !m.href);
  return (
    <div className="space-y-8">
      <PageHeader icone="inicio" cor={COR.inicio} titulo={titulo} subtitulo={subtitulo} />
      {semAcesso && (
        <Aviso tom="alerta" titulo="Essa tela não está no seu acesso.">
          Se precisar dela, fale com quem cuida da equipe.
        </Aviso>
      )}
      <HubDeModulos
        secoes={[
          {
            rotulo: 'Em uso',
            cartoes: emUso.flatMap((m) =>
              m.grupos.flatMap((g) =>
                g.itens.map((i) => ({
                  chave: i.href,
                  nome: i.rotulo,
                  subtitulo: i.subtitulo,
                  icone: i.icone,
                  cor: m.cor,
                  href: i.href,
                })),
              ),
            ),
          },
          {
            rotulo: 'Chegam nas próximas fases',
            cartoes: futuros.map((m) => ({
              chave: m.chave,
              nome: m.nome,
              subtitulo: m.subtitulo,
              icone: m.icone,
              cor: m.cor,
              href: null,
              fase: m.fase,
            })),
          },
        ]}
      />
    </div>
  );
}
