// The movie/series mark, in one place so the tab strip, the project list and
// the open dialog can't drift apart. Phosphor rather than emoji: emoji are
// rendered by the OS, so they ignore the app's palette and look different on
// every machine.
import { FilmSlate, Television } from '@phosphor-icons/react';
import type { ProjectKind } from '../types';

interface Props {
  kind: ProjectKind;
  size?: number;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}

export default function KindIcon({ kind, size = 16, weight = 'regular' }: Props) {
  const Icon = kind === 'show' ? Television : FilmSlate;
  return <Icon size={size} weight={weight} aria-hidden />;
}
