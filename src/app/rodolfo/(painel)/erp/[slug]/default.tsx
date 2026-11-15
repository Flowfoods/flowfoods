/**
 * Conteúdo do parceiro sem página para a URL (janela de módulo, decisão 526). O espaço `@janela` tem uma rota vazia que
 * cobre qualquer URL do parceiro (é ela que fecha a janela ao sair dela), e o Next exige que cada URL coberta por um espaço
 * tenha página ou `default.tsx` em todos os outros. As URLs sem página aqui são rotas de arquivo (exportações e fotos), que
 * respondem antes do layout, ou endereços que não existem: para estes, "não encontrada", como antes.
 */
import { notFound } from 'next/navigation';

export default function SemPaginaNoParceiro() {
  notFound();
}
