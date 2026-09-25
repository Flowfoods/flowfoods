import { CONTACT_INFO } from '@/lib/constants';

const SITE = 'https://consultoriaflowfoods.com.br';

/**
 * JSON-LD do site.
 *
 * Trocado na F1 porque o grafo anterior apontava para `flowfoods.com.br` (domínio errado),
 * trazia um `sameAs` de LinkedIn que não existe, um `foundingDate` sem fonte e o e-mail
 * pessoal do Rodolfo. Agora só entra o que é fato verificável.
 */
export function getSEOSchema() {
  const contatos: Record<string, string>[] = [
    {
      '@type': 'ContactPoint',
      contactType: 'sales',
      telephone: '+55' + CONTACT_INFO.whatsapp,
      availableLanguage: 'Portuguese',
    },
  ];
  if (CONTACT_INFO.email) {
    contatos[0].email = CONTACT_INFO.email;
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfessionalService',
        '@id': `${SITE}/#business`,
        name: 'FlowFoods Consultoria',
        url: SITE,
        slogan: 'Gastronomia que flui. Negócio que cresce.',
        description:
          'Consultoria para restaurantes no Rio de Janeiro: estrutura, rentabilidade e crescimento, do diagnóstico à execução. Seis frentes: estrutura de restaurante, iFood e delivery, treinamento de equipes, gestão financeira, fidelidade e CRM, e sistemas com IA.',
        priceRange: '$$',
        telephone: '+55' + CONTACT_INFO.whatsapp,
        founder: { '@id': `${SITE}/#rodolfo` },
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Rio de Janeiro',
          addressRegion: 'RJ',
          addressCountry: 'BR',
        },
        areaServed: { '@type': 'City', name: 'Rio de Janeiro' },
        contactPoint: contatos,
        sameAs: [CONTACT_INFO.instagramUrl, CONTACT_INFO.linkedinUrl],
        hasOfferCatalog: { '@id': `${SITE}/#ofertas` },
      },
      {
        '@type': 'Person',
        '@id': `${SITE}/#rodolfo`,
        name: 'Rodolfo Cavalcante',
        jobTitle: 'Chef, gestor e consultor de food service',
        description:
          'Chef de formação, gestor do delivery de 16 lojas do Grupo Bibi Sucos, conselheiro do Fórum de Restaurantes do iFood e desenvolvedor dos próprios sistemas. 14+ anos no food service carioca.',
        worksFor: { '@id': `${SITE}/#business` },
        alumniOf: [
          { '@type': 'CollegeOrUniversity', name: 'UNISUAM — Gastronomia' },
          { '@type': 'CollegeOrUniversity', name: 'Estácio — Pós em Gestão de Restaurante' },
        ],
        knowsAbout: [
          'Gestão de delivery',
          'iFood',
          'CMV e DRE para restaurantes',
          'Programas de fidelidade',
          'Treinamento de equipe de restaurante',
        ],
        sameAs: [CONTACT_INFO.instagramUrl, CONTACT_INFO.linkedinUrl],
      },
      {
        '@type': 'OfferCatalog',
        '@id': `${SITE}/#ofertas`,
        name: 'Serviços FlowFoods',
        itemListElement: [
          {
            '@type': 'Offer',
            name: 'Consultoria contínua para restaurantes',
            description:
              'Ciclo contínuo em seis frentes: estrutura de restaurante, iFood e delivery, treinamento de equipes, gestão financeira, fidelidade e CRM, e sistemas com IA. Duas visitas presenciais por mês e reunião mensal com relatório.',
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            itemOffered: {
              '@type': 'Service',
              name: 'Consultoria contínua para restaurantes',
              serviceType: 'Consultoria gastronômica',
              provider: { '@id': `${SITE}/#business` },
            },
          },
        ],
      },
    ],
  };
}
