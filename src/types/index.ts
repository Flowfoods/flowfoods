export interface Servico {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  beneficios: string[];
}

export interface CaseStudy {
  id: string;
  nome: string;
  descricao: string;
  desafios: string;
  resultados: string[];
  impacto: string;
}

export interface EtapaProcesso {
  numero: string;
  titulo: string;
  descricao: string;
}

export interface Diferencial {
  icone: string;
  titulo: string;
  descricao: string;
}

export interface ContactInfo {
  whatsapp: string;
  whatsappUrl: string;
  whatsappDisplay: string;
  email: string;
  instagram: string;
  instagramUrl: string;
  linkedin: string;
  linkedinUrl: string;
}
