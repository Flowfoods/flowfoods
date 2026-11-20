'use client';

import { useEffect, useState } from 'react';
import { MenuUsuario } from './MenuUsuario';
import type { PropsDoShell } from './tipos';

/** A conta continua acessível na barra fixa quando o avatar do cabeçalho sai da tela. */
export function ContaNaBarra({ props }: { props: PropsDoShell }) {
  const [fora, setFora] = useState(false);
  useEffect(() => {
    const conta = document.querySelector('.ff-cabecalho-conta');
    if (!conta || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entrada]) => setFora(!entrada.isIntersecting));
    observer.observe(conta);
    return () => observer.disconnect();
  }, []);
  return fora ? <div className="ff-conta-barra"><MenuUsuario usuario={props.usuario} tema={props.tema} links={props.links} sair={props.sair} /></div> : null;
}
