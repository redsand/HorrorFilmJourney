export type OntologyKeywordRule = {
  keyword: string;
  weight?: number;
  polarity?: 'positive' | 'negative';
  rationale?: string;
};

export type NodeRelationship = {
  targetSlug: string;
  type: string;
  weight?: number;
  notes?: string;
};

export type CanonAnchor = {
  title: string;
  year: number;
  tmdbId?: number;
};

export type OntologyNode = {
  slug: string;
  name: string;
  description: string;
  canonicalThemes: string[];
  commonKeywords: string[];
  negativeSignals: string[];
  typicalEra?: string[];
  requiredEvidence?: string[];
  keywordRules?: OntologyKeywordRule[];
  relationships?: NodeRelationship[];
  canonAnchors?: CanonAnchor[];
  orderIndex?: number;
};

export type SeasonOntology = {
  seasonId: string;
  seasonSlug: string;
  taxonomyVersion: string;
  nodes: OntologyNode[];
};

