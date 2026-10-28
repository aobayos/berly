// Trelby's reports — script, characters, scenes, locations — computed in one
// walk over the element list. Page numbers come from the breaks ScriptPages
// measured, the same ones the sidebar and the pages on screen use, so a
// report never names a page the writer can't find.
import type { ElementType, ScriptElement } from '@/model/types';
import { ELEMENT_TYPES } from '@/model/types';
import { characterName, sceneLocation } from '@/services/suggestions';

export interface CharacterReport {
  name: string;
  firstElementId: string;
  /** Cues with something said under them. */
  speeches: number;
  words: number;
  /** Fraction of every word of dialogue in the script, 0–1. */
  share: number;
  scenes: number;
  pages: number[];
}

export interface SceneReport {
  /** 1-based, in script order. */
  number: number;
  elementId: string;
  heading: string;
  /** Pages the scene runs across, first to last. */
  firstPage: number;
  lastPage: number;
  speakers: string[];
  speeches: number;
  words: number;
}

export interface LocationReport {
  name: string;
  firstElementId: string;
  scenes: number;
  pages: number[];
  characters: string[];
}

export interface ScriptReport {
  pages: number;
  words: number;
  dialogueWords: number;
  actionWords: number;
  elementCounts: Record<ElementType, number>;
  characters: CharacterReport[];
  scenes: SceneReport[];
  locations: LocationReport[];
}

export function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

/** `pageStarts` is the index of the first element on each page, as measured
 * by ScriptPages; pages are numbered from 1. */
export function scriptReport(
  elements: ScriptElement[],
  pageStarts: number[]
): ScriptReport {
  const elementCounts = Object.fromEntries(
    ELEMENT_TYPES.map((type) => [type, 0])
  ) as Record<ElementType, number>;

  type CharacterAcc = Omit<CharacterReport, 'share' | 'scenes' | 'pages'> & {
    scenes: Set<number>;
    pages: Set<number>;
  };
  type LocationAcc = Omit<LocationReport, 'pages' | 'characters'> & {
    pages: Set<number>;
    characters: Set<string>;
  };
  const characters = new Map<string, CharacterAcc>();
  const locations = new Map<string, LocationAcc>();
  const scenes: SceneReport[] = [];

  let words = 0;
  let dialogueWords = 0;
  let actionWords = 0;
  let page = 1;
  let scene: SceneReport | null = null;
  let location: LocationAcc | null = null;
  // The cue the current dialogue belongs to, and whether it has spoken yet.
  let speaker: CharacterAcc | null = null;
  let spoke = false;

  elements.forEach((el, i) => {
    while (page < pageStarts.length && pageStarts[page] <= i) page++;
    elementCounts[el.type]++;
    const n = countWords(el.text);
    words += n;

    if (el.type === 'scene') {
      speaker = null;
      scene = {
        number: scenes.length + 1,
        elementId: el.id,
        heading: el.text.trim(),
        firstPage: page,
        lastPage: page,
        speakers: [],
        speeches: 0,
        words: 0,
      };
      scenes.push(scene);
      const place = sceneLocation(el.text);
      location = null;
      if (place) {
        location = locations.get(place) ?? {
          name: place,
          firstElementId: el.id,
          scenes: 0,
          pages: new Set(),
          characters: new Set(),
        };
        location.scenes++;
        location.pages.add(page);
        locations.set(place, location);
      }
      return;
    }

    // After the heading branch, so the next heading doesn't stretch the
    // scene before it (or its location) onto the page it starts on.
    if (scene) {
      scene.lastPage = page;
      scene.words += n;
    }
    location?.pages.add(page);

    if (el.type === 'character') {
      const name = characterName(el.text);
      speaker = null;
      if (!name) return;
      speaker = characters.get(name) ?? {
        name,
        firstElementId: el.id,
        speeches: 0,
        words: 0,
        scenes: new Set(),
        pages: new Set(),
      };
      characters.set(name, speaker);
      spoke = false;
      speaker.pages.add(page);
      if (scene) {
        speaker.scenes.add(scene.number);
        if (!scene.speakers.includes(name)) scene.speakers.push(name);
      }
      location?.characters.add(name);
      return;
    }

    // Lyrics are dialogue that happens to be sung, as in characterStats.
    if ((el.type === 'dialogue' || el.type === 'lyrics') && speaker) {
      if (!spoke && n > 0) {
        spoke = true;
        speaker.speeches++;
        if (scene) scene.speeches++;
      }
      speaker.words += n;
      speaker.pages.add(page);
      dialogueWords += n;
      return;
    }

    if (el.type === 'parenthetical' && speaker) return;

    // Anything else ends the speech block.
    speaker = null;
    if (el.type === 'action') actionWords += n;
  });

  return {
    pages: Math.max(1, pageStarts.length),
    words,
    dialogueWords,
    actionWords,
    elementCounts,
    characters: [...characters.values()]
      .map((c) => ({
        ...c,
        share: dialogueWords > 0 ? c.words / dialogueWords : 0,
        scenes: c.scenes.size,
        pages: [...c.pages].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.words - a.words || a.name.localeCompare(b.name)),
    scenes,
    locations: [...locations.values()]
      .map((l) => ({
        ...l,
        pages: [...l.pages].sort((a, b) => a - b),
        characters: [...l.characters].sort(),
      }))
      .sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name)),
  };
}

/** [1, 2, 3, 5, 7, 8] → "1–3, 5, 7–8", the way Trelby lists pages. */
export function pageRanges(pages: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < pages.length) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(j === i ? `${pages[i]}` : `${pages[i]}–${pages[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}
