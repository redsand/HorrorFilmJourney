export type NodePrototypeDefinition = {
  nodeSlug: string;
  positivePrototypes: number[][];
  positiveTitles?: string[];
  negativeTitles?: string[];
};

export type SeasonPrototypePack = {
  seasonId: string;
  taxonomyVersion: string;
  nodes: NodePrototypeDefinition[];
};
