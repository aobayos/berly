// The one place that asks "save changes?" — for a closing tab, and for the
// whole window. It sits above TabsProvider so closing a tab can await the
// answer before the tab disappears, and it renders the question in the app's
// own language and styling rather than a native message box.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import { saveDocument } from '../storage/documents';

export type UnsavedAnswer = 'saved' | 'discarded' | 'cancelled';

export interface UnsavedDoc {
  id: string;
  name: string;
}

interface GuardValue {
  /** Asks about the given documents and acts on the answer: 'saved' means
   * every one of them reached its file, so the caller may proceed. */
  confirm(docs: UnsavedDoc[]): Promise<UnsavedAnswer>;
}

const UnsavedGuardContext = createContext<GuardValue>({
  confirm: () => Promise.resolve('discarded'),
});

export function useUnsavedGuard(): GuardValue {
  return useContext(UnsavedGuardContext);
}

export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<UnsavedDoc[] | null>(null);
  const resolver = useRef<((answer: UnsavedAnswer) => void) | null>(null);

  const confirm = useCallback((docs: UnsavedDoc[]): Promise<UnsavedAnswer> => {
    if (docs.length === 0) return Promise.resolve('discarded');
    setPending(docs);
    return new Promise<UnsavedAnswer>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((value: UnsavedAnswer) => {
    setPending(null);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const handleSave = useCallback(async () => {
    const docs = pending ?? [];
    for (const doc of docs) {
      // A cancelled Save As dialog cancels the whole close — the writer asked
      // to keep this work, so nothing should slip through unsaved.
      if (!(await saveDocument(doc.id))) {
        answer('cancelled');
        return;
      }
    }
    answer('saved');
  }, [pending, answer]);

  const value = useMemo<GuardValue>(() => ({ confirm }), [confirm]);

  return (
    <UnsavedGuardContext.Provider value={value}>
      {children}
      {pending && (
        <div className="modal-backdrop" onMouseDown={() => answer('cancelled')}>
          <div
            className="modal modal-narrow"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">{t.unsavedTitle}</h2>
            <p className="modal-text">
              {pending.length === 1 ? t.unsavedOne : t.unsavedMany}
            </p>
            {pending.length > 1 && (
              <ul className="modal-list">
                {pending.map((doc) => (
                  <li key={doc.id}>{doc.name || t.untitled}</li>
                ))}
              </ul>
            )}
            {pending.length === 1 && (
              <p className="modal-emphasis">{pending[0].name || t.untitled}</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => answer('cancelled')}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={() => answer('discarded')}
              >
                {t.discardChanges}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                autoFocus
                onClick={() => void handleSave()}
              >
                {t.saveAndClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </UnsavedGuardContext.Provider>
  );
}
