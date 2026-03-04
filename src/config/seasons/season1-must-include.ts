export type Season1MustIncludeAnchor = {
  nodeSlug: string;
  title: string;
  year: number;
  altTitle?: string;
};

export const SEASON1_MUST_INCLUDE_ANCHORS: Season1MustIncludeAnchor[] = [
  { nodeSlug: 'social-domestic-horror', title: 'Get Out', year: 2017 },
  { nodeSlug: 'social-domestic-horror', title: 'Us', year: 2019 },
  { nodeSlug: 'social-domestic-horror', title: 'Candyman', year: 1992 },
  { nodeSlug: 'social-domestic-horror', title: 'The Stepford Wives', year: 1975 },
  { nodeSlug: 'social-domestic-horror', title: 'The People Under the Stairs', year: 1991 },
  { nodeSlug: 'social-domestic-horror', title: 'His House', year: 2020 },
  { nodeSlug: 'social-domestic-horror', title: 'The Babadook', year: 2014 },
  { nodeSlug: 'social-domestic-horror', title: 'Hereditary', year: 2018 },

  { nodeSlug: 'slasher-serial-killer', title: 'Scream', year: 2022 },
  { nodeSlug: 'slasher-serial-killer', title: 'Scream VI', year: 2023 },
  { nodeSlug: 'slasher-serial-killer', title: 'Halloween', year: 2018 },
  { nodeSlug: 'slasher-serial-killer', title: 'Halloween Kills', year: 2021 },
  { nodeSlug: 'slasher-serial-killer', title: 'Halloween Ends', year: 2022 },
  { nodeSlug: 'slasher-serial-killer', title: 'A Nightmare on Elm Street', year: 1984 },
  { nodeSlug: 'slasher-serial-killer', title: 'Friday the 13th', year: 1980 },
  { nodeSlug: 'slasher-serial-killer', title: 'Candyman', year: 2021 },

  { nodeSlug: 'supernatural-horror', title: 'The Conjuring 2', year: 2016 },
  { nodeSlug: 'supernatural-horror', title: 'The Conjuring: The Devil Made Me Do It', year: 2021 },
  { nodeSlug: 'supernatural-horror', title: 'The Nun', year: 2018 },
  { nodeSlug: 'supernatural-horror', title: 'Insidious', year: 2010 },
  { nodeSlug: 'supernatural-horror', title: 'Insidious: Chapter 2', year: 2013 },
  { nodeSlug: 'supernatural-horror', title: 'Sinister', year: 2012 },
  { nodeSlug: 'supernatural-horror', title: 'The Ring', year: 2002 },
  { nodeSlug: 'supernatural-horror', title: 'The Grudge', year: 2004 },

  { nodeSlug: 'sci-fi-horror', title: '28 Days Later', year: 2002 },
  { nodeSlug: 'sci-fi-horror', title: '28 Weeks Later', year: 2007 },
  { nodeSlug: 'sci-fi-horror', title: 'Alien', year: 1979 },
  { nodeSlug: 'sci-fi-horror', title: 'Aliens', year: 1986 },
  { nodeSlug: 'sci-fi-horror', title: 'The Thing', year: 1982 },
  { nodeSlug: 'sci-fi-horror', title: 'The Fly', year: 1986 },
  { nodeSlug: 'sci-fi-horror', title: 'Event Horizon', year: 1997 },
  { nodeSlug: 'sci-fi-horror', title: 'Cube', year: 1998 },

  { nodeSlug: 'apocalyptic-horror', title: '28 Days Later', year: 2002 },
  { nodeSlug: 'apocalyptic-horror', title: '28 Weeks Later', year: 2007 },
  { nodeSlug: 'apocalyptic-horror', title: 'Train to Busan', year: 2016 },
  { nodeSlug: 'apocalyptic-horror', title: 'Dawn of the Dead', year: 2004 },
  { nodeSlug: 'apocalyptic-horror', title: 'World War Z', year: 2013 },
  { nodeSlug: 'apocalyptic-horror', title: 'REC', year: 2007 },

  { nodeSlug: 'horror-comedy', title: 'Shaun of the Dead', year: 2004 },
  { nodeSlug: 'horror-comedy', title: 'What We Do in the Shadows', year: 2014 },
  { nodeSlug: 'horror-comedy', title: 'Tucker and Dale vs. Evil', year: 2010 },
  { nodeSlug: 'horror-comedy', title: 'The Cabin in the Woods', year: 2011 },
  { nodeSlug: 'horror-comedy', title: 'Ready or Not', year: 2019 },

  { nodeSlug: 'gothic-horror', title: 'Dracula', year: 1992, altTitle: "Bram Stoker's Dracula" },
  { nodeSlug: 'gothic-horror', title: 'Crimson Peak', year: 2015 },
  { nodeSlug: 'gothic-horror', title: 'Sleepy Hollow', year: 1999 },
  { nodeSlug: 'gothic-horror', title: 'The Others', year: 2001 },

  { nodeSlug: 'experimental-horror', title: 'Suspiria', year: 1977 },
  { nodeSlug: 'experimental-horror', title: 'Eraserhead', year: 1977 },
  { nodeSlug: 'experimental-horror', title: 'Perfect Blue', year: 1998 },

  // Targeted omissions guardrail (eligible + strong journey but under-floor node score)
  { nodeSlug: 'survival-horror', title: '28 Years Later: The Bone Temple', year: 2026 },
  { nodeSlug: 'creature-monster', title: 'Sinners', year: 2025 },
  { nodeSlug: 'supernatural-horror', title: 'Princess Mononoke', year: 1997 },
  { nodeSlug: 'social-domestic-horror', title: 'Frankenstein', year: 2025 },
  { nodeSlug: 'slasher-serial-killer', title: 'Scream 7', year: 2026 },
  { nodeSlug: 'folk-horror', title: 'Weapons', year: 2025 },
  { nodeSlug: 'supernatural-horror', title: 'Constantine', year: 2005 },
  { nodeSlug: 'apocalyptic-horror', title: 'Return to Silent Hill', year: 2026 },
  { nodeSlug: 'gothic-horror', title: 'The Crow', year: 1994 },
  { nodeSlug: 'supernatural-horror', title: "Five Nights at Freddy's", year: 2023 },
  { nodeSlug: 'survival-horror', title: 'From Dusk Till Dawn', year: 1996 },
  { nodeSlug: 'splatter-extreme', title: 'Final Destination Bloodlines', year: 2025 },
  { nodeSlug: 'gothic-horror', title: 'Dracula', year: 2025 },
  { nodeSlug: 'survival-horror', title: 'Carrie', year: 1976 },
  { nodeSlug: 'psychological-horror', title: 'Orphan', year: 2009 },
  { nodeSlug: 'body-horror', title: 'The Cabinet of Dr. Caligari', year: 1920 },
  { nodeSlug: 'psychological-horror', title: 'Stonehearst Asylum', year: 2014 },
  { nodeSlug: 'sci-fi-horror', title: 'The Rocky Horror Picture Show', year: 1975 },
  { nodeSlug: 'supernatural-horror', title: 'The Omen', year: 1976 },
  { nodeSlug: 'slasher-serial-killer', title: 'Deep Red', year: 1975 },
  { nodeSlug: 'survival-horror', title: 'Send Help', year: 2026 },
  { nodeSlug: 'supernatural-horror', title: 'Triangle', year: 2009 },
  { nodeSlug: 'cosmic-horror', title: 'Freaks', year: 1932 },
  { nodeSlug: 'survival-horror', title: '28 Years Later', year: 2025 },
  { nodeSlug: 'slasher-serial-killer', title: "Five Nights at Freddy's 2", year: 2025 },
  { nodeSlug: 'psychological-horror', title: 'Speak No Evil', year: 2024 },
  { nodeSlug: 'creature-monster', title: 'Highlander', year: 1986 },
  { nodeSlug: 'supernatural-horror', title: 'Ninja Scroll', year: 1993 },
  { nodeSlug: 'splatter-extreme', title: 'Antichrist', year: 2009 },
  { nodeSlug: 'splatter-extreme', title: 'Primate', year: 2026 },
];

export function getSeason1MustIncludeForNode(nodeSlug: string): Season1MustIncludeAnchor[] {
  return SEASON1_MUST_INCLUDE_ANCHORS.filter((entry) => entry.nodeSlug === nodeSlug);
}
