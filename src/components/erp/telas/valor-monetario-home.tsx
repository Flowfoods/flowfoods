/** Apresentação do valor formatado existente: moeda separável, número inteiro. */
import { formatarDinheiro } from '@/lib/erp/unidades';

export function ValorMonetarioHome({ centavos }: { centavos: number }) {
  const texto = formatarDinheiro(centavos);
  // Tamanho por texto no servidor, sem medir DOM ou mudar o valor/precisão.
  const tamanho = texto.length > 22 ? 'text-[14px]' : texto.length > 18 ? 'text-[16px]' : texto.length > 14 ? 'text-[18px]' : 'text-[20px]';
  const separador = texto.indexOf('\u00a0');
  return (
    <span data-valor-monetario={texto} className={`inline-flex max-w-full flex-wrap items-baseline gap-x-1 ${tamanho}`}>
      {separador < 0 ? <span className="whitespace-nowrap">{texto}</span> : <>
        <span className="whitespace-nowrap">{texto.slice(0, separador)}</span>{'\u00a0'}<span data-parte-monetaria="numero" className="whitespace-nowrap">{texto.slice(separador + 1)}</span>
      </>}
    </span>
  );
}
