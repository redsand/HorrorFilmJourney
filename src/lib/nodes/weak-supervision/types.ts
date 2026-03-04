export type WeakSupervisionLabel = -1 | 0 | 1;

export type WeakSupervisionMovie = {
  id: string;
  tmdbId?: number;
  title: string;
  year: number | null;
  genres: string[];
  keywords?: string[];
  synopsis?: string | null;
  popularity?: number;
};

export type LabelingFunctionResult = {
  label: WeakSupervisionLabel;
  confidence: number;
  evidence?: string[];
};

export type LabelingFunction = {
  name: string;
  nodeSlug: string;
  apply: (movie: WeakSupervisionMovie) => LabelingFunctionResult;
};

export type FiredLabel = {
  lfName: string;
  nodeSlug: string;
  label: WeakSupervisionLabel;
  confidence: number;
  evidence: string[];
};

export type NodeProbability = {
  nodeSlug: string;
  probability: number;
  fired: FiredLabel[];
  positiveWeight: number;
  negativeWeight: number;
};

export type NodeExclusivityRule = {
  a: string;
  b: string;
  reason: string;
  strictness: 'soft' | 'hard';
};
