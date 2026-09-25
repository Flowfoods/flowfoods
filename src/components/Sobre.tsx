import { CREDENCIAIS } from '@/lib/constants';
import { Etiqueta, Secao, Titulo } from './ui';

// Quase todas as fotos são prints do Instagram com etiquetas de carrossel nas
// bordas. Os recortes escondem isso: a 5 (quase quadrada) em 16:10 perde o
// topo, onde está a etiqueta; a 3 (larga) em 4:3 perde as laterais, onde
// estão as duas. A 2 é limpa. As fotos 1, 4 e 6 ficam de fora.
const FOTOS = [
  { src: '/images/galeria/foto-5.jpg', alt: 'Rodolfo no palco do Fórum de Restaurantes do iFood' },
  { src: '/images/galeria/foto-3.jpg', alt: 'Workshop no Fórum de Restaurantes' },
  { src: '/images/galeria/foto-2.jpg', alt: 'Equipe de cozinha treinada em campo' },
];

/** Quem conduz. Credenciais que se conferem, sem adjetivo. */
export default function Sobre() {
  return (
    <Secao id="sobre" className="bg-papel">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <Etiqueta>Quem conduz</Etiqueta>
          <Titulo>Rodolfo Cavalcante opera delivery todo dia. A consultoria vem daí.</Titulo>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-ink-3">
            <p>
              Chef de formação, passou pelo salão, pela cozinha e pela gestão antes de virar
              consultor. Hoje cuida do delivery, da fidelidade e da IA de uma rede carioca com 16
              lojas e 5 marcas, e senta no conselho do Fórum de Restaurantes do iFood.
            </p>
            <p>
              A FlowFoods é o jeito de levar essa rotina para restaurantes independentes: o que
              funciona numa rede, no tamanho que cabe numa casa.
            </p>
          </div>

          <ul className="mt-8 divide-y divide-ink/10 border-y border-ink/10">
            {CREDENCIAIS.map((c) => (
              <li key={c} className="py-3 text-[15px] text-ink">
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 self-start">
          {FOTOS.map((f, i) => (
            <figure key={f.src} className={`overflow-hidden border border-ink/10 bg-surface p-1.5 ${i === 0 ? 'col-span-2' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.src}
                alt={f.alt}
                loading="lazy"
                className={`w-full object-cover ${i === 0 ? 'aspect-[16/10]' : 'aspect-[4/3]'}`}
              />
            </figure>
          ))}
          <p className="col-span-2 text-[11px] uppercase tracking-[0.16em] text-ink-5">
            Fórum de Restaurantes do iFood · Workshops · Operação
          </p>
        </div>
      </div>
    </Secao>
  );
}
