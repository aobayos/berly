// Groups a script's flat element list into per-scene blocks (a scene
// heading plus everything up to the next one) so the sidebar can let a
// writer drag whole scenes around without touching their contents.
import type { ScriptElement } from './types';

interface SceneBlocks {
  /** Elements before the first scene heading (rare, but possible if the
   * writer changed the first element away from 'scene') — never reordered. */
  preamble: ScriptElement[];
  blocks: ScriptElement[][];
}

function splitIntoSceneBlocks(elements: ScriptElement[]): SceneBlocks {
  const preamble: ScriptElement[] = [];
  const blocks: ScriptElement[][] = [];
  let current: ScriptElement[] | null = null;

  for (const el of elements) {
    if (el.type === 'scene') {
      if (current) blocks.push(current);
      current = [el];
    } else if (current) {
      current.push(el);
    } else {
      preamble.push(el);
    }
  }
  if (current) blocks.push(current);

  return { preamble, blocks };
}

/** Moves the scene at `fromIndex` (0-based, among scene headings only) to
 * `toIndex`, keeping each scene's body intact, and returns the new flat
 * element list. */
export function reorderScenes(
  elements: ScriptElement[],
  fromIndex: number,
  toIndex: number
): ScriptElement[] {
  const { preamble, blocks } = splitIntoSceneBlocks(elements);
  if (
    fromIndex < 0 ||
    fromIndex >= blocks.length ||
    toIndex < 0 ||
    toIndex >= blocks.length
  ) {
    return elements;
  }
  const reordered = [...blocks];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return [...preamble, ...reordered.flat()];
}
