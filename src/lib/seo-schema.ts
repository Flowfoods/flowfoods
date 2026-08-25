import { CONTACT_INFO } from './constants';

/**
 * JSON-LD do site.
 *
 * Tudo que também existe em `CONTACT_INFO` é lido de lá, nunca redigitado: o
 * `sameAs` e o `url` são o que o Google usa para ligar esta entidade aos
 * perfis e ao domínio certos, e duas cópias do mesmo dado divergem com o tempo
 * — foi o que aconteceu aqui (o Instagram e o LinkedIn do schema apontavam para
 * perfis diferentes dos do rodapé, e o domínio era outro).
 */
const SITE = 'https://consultoriaflowfoods.com.br';

export function getSEOSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'FlowFoods Consultoria',
        url: SITE,
        description:
          'Consultoria gastronômica especializada em estruturação, otimização e escala de restaurantes.',
        foundingDate: '2010',
        founder: {
          '@type': 'Person',
          name: 'Rodolfo Cavalcante',
        },
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            email: CONTACT_INFO.email,
            telephone: `+${CONTACT_INFO.whatsapp}`,
            availableLanguage: 'Portuguese',
          },
        ],
        sameAs: [CONTACT_INFO.instagramUrl, CONTACT_INFO.linkedinUrl],
      },
      {
        '@type': 'LocalBusiness',
        '@id': `${SITE}/#business`,
        name: 'FlowFoods Consultoria',
        description: 'Gastronomia que flui. Negócio que cresce.',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'BR',
        },
        serviceArea: {
          '@type': 'Country',
          name: 'Brazil',
        },
      },
    ],
  };
}
