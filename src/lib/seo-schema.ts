export function getSEOSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://flowfoods.com.br/#organization',
        name: 'FlowFoods Consultoria',
        url: 'https://flowfoods.com.br',
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
            email: 'rrodolfoacifood@gmail.com',
            telephone: '+5521996416060',
            availableLanguage: 'Portuguese',
          },
        ],
        sameAs: [
          'https://instagram.com/flowfoods.rj',
          'https://linkedin.com/in/rodolfo-flowfoods',
        ],
      },
      {
        '@type': 'LocalBusiness',
        '@id': 'https://flowfoods.com.br/#business',
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
