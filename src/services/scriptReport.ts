// Trelby's reports — script, characters, scenes, locations — computed in one
// walk over the element list. Page numbers come from the breaks ScriptPages
// measured, the same ones the sidebar and the pages on screen use, so a
// report never names a page the writer can't find.
import type { ElementType, ScriptElement } from '@/model/types';
import { ELEMENT_TYPES } from '@/model/types';
import { sceneLocation } from '@/services/suggestions';
import { plainResolver, type ResolveName } from '@/services/characterAliases';

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
  /** Words of dialogue per page, with the cue that opens the first speech
   * there — what the dialogue chart draws. */
  byPage: PageDialogue[];
}

export interface PageDialogue {
  page: number;
  words: number;
  elementId: string;
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
 * by ScriptPages; pages are numbered from 1. `resolve` turns a cue into the
 * character it stands for (see characterAliases.ts). */
export function scriptReport(
  elements: ScriptElement[],
  pageStarts: number[],
  resolve: ResolveName = plainResolver
): ScriptReport {
  const elementCounts = Object.fromEntries(
    ELEMENT_TYPES.map((type) => [type, 0])
  ) as Record<ElementType, number>;

  type CharacterAcc = Omit<CharacterReport, 'share' | 'scenes' | 'pages' | 'byPage'> & {
    scenes: Set<number>;
    pages: Set<number>;
    byPage: Map<number, PageDialogue>;
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
  let cueId = '';

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
      const name = resolve(el.text);
      speaker = null;
      if (!name) return;
      speaker = characters.get(name) ?? {
        name,
        firstElementId: el.id,
        speeches: 0,
        words: 0,
        scenes: new Set(),
        pages: new Set(),
        byPage: new Map(),
      };
      characters.set(name, speaker);
      spoke = false;
      cueId = el.id;
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
      if (n > 0) {
        const cell = speaker.byPage.get(page) ?? { page, words: 0, elementId: cueId };
        cell.words += n;
        speaker.byPage.set(page, cell);
      }
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
        byPage: [...c.byPage.values()].sort((a, b) => a.page - b.page),
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

export interface ReportPart {
  scriptId: string;
  name: string;
  elements: ScriptElement[];
  pageStarts: number[];
}

export interface EpisodeSummary {
  /** 1-based, in the project's order. */
  number: number;
  scriptId: string;
  name: string;
  pages: number;
  scenes: number;
  words: number;
}

/** The same report over several scripts — a whole series — or over one. Each
 * script is reported on its own and the results merged: counts add up,
 * shares are recomputed against the series' dialogue, and each row says
 * which episodes it appears in. Page numbers only mean something within one
 * script, so merged rows keep them per scene and drop them elsewhere. */
export interface ProjectReport extends Omit<ScriptReport, 'characters' | 'scenes' | 'locations'> {
  episodes: EpisodeSummary[];
  characters: (CharacterReport & { episodes: number[] })[];
  scenes: (SceneReport & { episode: number })[];
  locations: (LocationReport & { episodes: number[] })[];
  dialogue: DialogueChart;
}

/** Who speaks where, page by page — Trelby's dialogue chart. A series' pages
 * are laid end to end, episode after episode. */
export interface DialogueChart {
  columns: { episode: number; page: number }[];
  /** Characters with any dialogue, most words first. */
  rows: {
    name: string;
    firstElementId: string;
    words: number;
    /** Only the columns where they speak, in order. */
    cells: { column: number; words: number; elementId: string }[];
  }[];
}

export function projectReport(
  parts: ReportPart[],
  resolve: ResolveName = plainResolver
): ProjectReport {
  const reports = parts.map((part) => scriptReport(part.elements, part.pageStarts, resolve));
  const single = parts.length === 1;

  const elementCounts = Object.fromEntries(ELEMENT_TYPES.map((type) => [type, 0])) as Record<
    ElementType,
    number
  >;
  const characters = new Map<string, CharacterReport & { episodes: number[] }>();
  const locations = new Map<string, LocationReport & { episodes: number[] }>();
  const scenes: (SceneReport & { episode: number })[] = [];
  const columns: DialogueChart['columns'] = [];
  const cells = new Map<string, DialogueChart['rows'][number]['cells']>();
  let dialogueWords = 0;

  reports.forEach((report, i) => {
    const episode = i + 1;
    const offset = columns.length;
    for (let page = 1; page <= report.pages; page++) columns.push({ episode, page });
    for (const c of report.characters) {
      const row = cells.get(c.name) ?? [];
      for (const cell of c.byPage) {
        row.push({ column: offset + cell.page - 1, words: cell.words, elementId: cell.elementId });
      }
      cells.set(c.name, row);
    }
    for (const type of ELEMENT_TYPES) elementCounts[type] += report.elementCounts[type];
    dialogueWords += report.dialogueWords;
    scenes.push(...report.scenes.map((scene) => ({ ...scene, episode })));

    for (const c of report.characters) {
      const merged = characters.get(c.name);
      if (!merged) {
        characters.set(c.name, {
          ...c,
          pages: single ? c.pages : [],
          byPage: single ? c.byPage : [],
          episodes: [episode],
        });
        continue;
      }
      merged.speeches += c.speeches;
      merged.words += c.words;
      merged.scenes += c.scenes;
      merged.episodes.push(episode);
    }

    for (const l of report.locations) {
      const merged = locations.get(l.name);
      if (!merged) {
        locations.set(l.name, { ...l, pages: single ? l.pages : [], episodes: [episode] });
        continue;
      }
      merged.scenes += l.scenes;
      merged.characters = [...new Set([...merged.characters, ...l.characters])].sort();
      merged.episodes.push(episode);
    }
  });

  const ranked = [...characters.values()]
    .map((c) => ({ ...c, share: dialogueWords > 0 ? c.words / dialogueWords : 0 }))
    .sort((a, b) => b.words - a.words || a.name.localeCompare(b.name));

  return {
    pages: reports.reduce((sum, r) => sum + r.pages, 0),
    words: reports.reduce((sum, r) => sum + r.words, 0),
    dialogueWords,
    actionWords: reports.reduce((sum, r) => sum + r.actionWords, 0),
    elementCounts,
    episodes: parts.map((part, i) => ({
      number: i + 1,
      scriptId: part.scriptId,
      name: part.name,
      pages: reports[i].pages,
      scenes: reports[i].scenes.length,
      words: reports[i].words,
    })),
    characters: ranked,
    scenes,
    locations: [...locations.values()].sort(
      (a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name)
    ),
    dialogue: {
      columns,
      rows: ranked
        .filter((c) => c.words > 0)
        .map((c) => ({
          name: c.name,
          firstElementId: c.firstElementId,
          words: c.words,
          cells: cells.get(c.name) ?? [],
        })),
    },
  };
}
