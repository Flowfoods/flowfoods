/**
 * Hub "Áreas da Rede": a tela de entrada do ERP de um parceiro, a MESMA para a
 * pessoa do parceiro (/erp) e para o nível 1 dentro do parceiro
 * (/rodolfo/erp/<slug>). Recebe as áreas já filtradas pelo alcance de quem vê
 * (`modulosDoParceiro`): em uso, UM CARD POR ÁREA (nome, descrição e as abas
 * que a pessoa pode abrir, cada uma um link; área sem aba permitida nem chega aqui); as do plano
 * ainda sem tela, desabilitadas com a fase. O card nunca é uma ação ("Novo
 * insumo", "Lançar nota"): as ações moram no cabeçalho da aba e no ⌘K.
 */

import type { ModuloNav } from '@/lib/erp/modulos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../ui/cabecalho';
import { HubDeModulos } from '../ui/hub';
import { Aviso } from '../ui/superficies';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { PainelDoDiaNaTela } from './painel-do-dia';

export function HubDoParceiro({
  titulo,
  subtitulo,
  modulos,
  semAcesso,
  painel,
}: {
  /** 24/10: indicadores e pendências do dia (só o que a permissão libera). */
  painel?: PainelDoDia;
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
      {painel && <PainelDoDiaNaTela painel={painel} />}
      <HubDeModulos
        secoes={[
          {
            rotulo: 'Em uso',
            cartoes: emUso.map((m) => ({
              chave: m.chave,
              nome: m.nome,
              subtitulo: m.subtitulo,
              icone: m.icone,
              cor: m.cor,
              href: m.href,
              abas: m.grupos.flatMap((g) => g.itens.map((i) => ({ rotulo: i.rotulo, href: i.href }))),
            })),
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
