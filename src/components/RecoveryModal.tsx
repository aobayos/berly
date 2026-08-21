// Offered once at startup, when the app finds work that never reached its
// file — a crash, a power cut, a force-quit. Nothing is decided for the
// writer: recovering opens the work as unsaved so they can read it before
// committing it over the file they already have.
import { useEffect, useState } from 'react';
import type { RecoveryInfo } from '../types';
import { useI18n } from '../i18n';
import { discardRecovery, isFileBased, listRecoveries, recover } from '../documents';
import type { TabMeta } from '../tabs';

interface Props {
  onOpenProject(projectId: string, meta?: TabMeta): void;
}

export default function RecoveryModal({ onOpenProject }: Props) {
  const { t, lang } = useI18n();
  const [found, setFound] = useState<RecoveryInfo[]>([]);

  useEffect(() => {
    if (!isFileBased) return;
    void listRecoveries().then(setFound);
  }, []);

  if (found.length === 0) return null;

  const dismiss = (id: string) => setFound((list) => list.filter((r) => r.id !== id));

  const handleRecover = (entry: RecoveryInfo) => {
    void recover(entry.id).then((project) => {
      if (project) onOpenProject(project.id, { title: project.name, kind: project.kind });
      dismiss(entry.id);
    });
  };

  const handleDiscard = (entry: RecoveryInfo) => {
    void discardRecovery(entry.id);
    dismiss(entry.id);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h2 className="modal-title">{t.recoveryTitle}</h2>
        <p className="modal-text">{t.recoveryIntro}</p>
        <ul className="recovery-list">
          {found.map((entry) => (
            <li key={entry.id} className="recovery-item">
              <div className="recovery-info">
                <span className="recovery-name">{entry.name || t.untitled}</span>
                <span className="recovery-meta">
                  {entry.path ? `${t.recoveryFrom} ${entry.path}` : t.neverSaved}
                  {entry.savedAt
                    ? ` · ${new Date(entry.savedAt).toLocaleString(lang)}`
                    : ''}
                </span>
              </div>
              <div className="recovery-actions">
                <button
                  type="button"
                  className="btn btn-small btn-ghost btn-danger"
                  onClick={() => handleDiscard(entry)}
                >
                  {t.recoveryDiscard}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => handleRecover(entry)}
                >
                  {t.recoveryRecover}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
