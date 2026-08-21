// Per-character breakdown: how many scenes and dialogue lines each
// character has, either within one script or totalled across a project.
import type { Script, ScriptElement } from './types';

export interface CharacterStat {
  name: string;
  firstElementId: string;
  sceneCount: number;
  dialogueCount: number;
}

export function characterStats(elements: ScriptElement[]): CharacterStat[] {
  const stats = new Map<
    string,
    { firstElementId: string; sceneCount: number; dialogueCount: number; lastSceneIndex: number }
  >();
  let currentCharacter: string | null = null;
  let sceneIndex = -1;

  for (const el of elements) {
    if (el.type === 'scene') {
      sceneIndex++;
      currentCharacter = null;
      continue;
    }

    if (el.type === 'character') {
      const name = el.text.trim().toUpperCase().replace(/\s*\(.*\)\s*$/, '');
      currentCharacter = name || null;
      if (currentCharacter) {
        const s = stats.get(currentCharacter) ?? {
          firstElementId: el.id,
          sceneCount: 0,
          dialogueCount: 0,
          lastSceneIndex: -1,
        };
        if (s.lastSceneIndex !== sceneIndex) {
          s.sceneCount++;
          s.lastSceneIndex = sceneIndex;
        }
        stats.set(currentCharacter, s);
      }
      continue;
    }

    if (el.type === 'dialogue' && currentCharacter) {
      const s = stats.get(currentCharacter);
      if (s) s.dialogueCount++;
      continue;
    }

    if (el.type !== 'parenthetical') {
      // Action/transition ends the current dialogue block.
      currentCharacter = null;
    }
  }

  return [...stats.entries()]
    .map(([name, s]) => ({
      name,
      firstElementId: s.firstElementId,
      sceneCount: s.sceneCount,
      dialogueCount: s.dialogueCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Totals scene/dialogue counts for every character across every script in
 * a project (e.g. all episodes of a show) — used by the Bible page, which
 * is project-level rather than tied to one script. */
export function aggregateCharacterStats(
  scripts: Script[]
): Map<string, { sceneCount: number; dialogueCount: number }> {
  const totals = new Map<string, { sceneCount: number; dialogueCount: number }>();
  for (const script of scripts) {
    for (const stat of characterStats(script.elements)) {
      const existing = totals.get(stat.name) ?? { sceneCount: 0, dialogueCount: 0 };
      existing.sceneCount += stat.sceneCount;
      existing.dialogueCount += stat.dialogueCount;
      totals.set(stat.name, existing);
    }
  }
  return totals;
}
