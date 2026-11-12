/** Clientes da API recebem JSON. A navegação do formulário pede HTML explicitamente. */
export function formularioFinancialPedeHtml(headers: Headers): boolean {
  let html = 0, json = 0;
  for (const oferta of (headers.get('accept') ?? '').toLowerCase().split(',')) {
    const [tipo, ...parametros] = oferta.split(';').map(p => p.trim());
    if (tipo !== 'text/html' && tipo !== 'application/json') continue;
    const q = parametros.find(p => /^q\s*=/.test(p));
    const valor = q ? q.slice(q.indexOf('=') + 1).trim() : '1';
    const peso = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(valor) ? Number(valor) : 0;
    if (tipo === 'text/html') html = Math.max(html, peso);
    else json = Math.max(json, peso);
  }
  return html > 0 && (html > json || (html === json && headers.get('sec-fetch-mode') === 'navigate'));
}
