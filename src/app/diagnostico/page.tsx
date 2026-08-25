import type { Metadata } from 'next';
import Diagnostico from './Diagnostico';

export const metadata: Metadata = {
  title: 'Diagnóstico gratuito para o seu restaurante | FlowFoods',
  description:
    'Em 4 minutos você responde sobre a sua operação e vê o que os números dizem — e por onde começar. Depois, uma conversa de 30 min com Rodolfo Cavalcante.',
  // A página é uma ferramenta de conversão, não conteúdo para busca: sem
  // indexar, o site não compete consigo mesmo por esta URL.
  robots: 'noindex, follow',
};

export default function Page() {
  return <Diagnostico />;
}
