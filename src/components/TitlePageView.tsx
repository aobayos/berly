import type { TitlePage } from '../types';
import { useI18n } from '../i18n';

interface Props {
  titlePage: TitlePage;
  onChange: (titlePage: TitlePage) => void;
  className?: string;
}

export default function TitlePageView({ titlePage, onChange, className }: Props) {
  const { t } = useI18n();

  function set<K extends keyof TitlePage>(key: K, value: string) {
    onChange({ ...titlePage, [key]: value });
  }

  return (
    <div className={`page title-page ${className ?? ''}`}>
      <div className="tp-center">
        <input
          className="tp-input tp-title"
          value={titlePage.title}
          placeholder={t.tpTitle}
          onChange={(e) => set('title', e.target.value)}
        />
        <input
          className="tp-input tp-credit"
          value={titlePage.credit}
          placeholder={t.tpCredit}
          onChange={(e) => set('credit', e.target.value)}
        />
        <input
          className="tp-input tp-author"
          value={titlePage.author}
          placeholder={t.tpAuthor}
          onChange={(e) => set('author', e.target.value)}
        />
      </div>
      <div className="tp-bottom">
        <textarea
          className="tp-input tp-contact"
          value={titlePage.contact}
          placeholder={t.tpContact}
          rows={3}
          onChange={(e) => set('contact', e.target.value)}
        />
        <input
          className="tp-input tp-date"
          value={titlePage.draftDate}
          placeholder={t.tpDraftDate}
          onChange={(e) => set('draftDate', e.target.value)}
        />
      </div>
    </div>
  );
}
