import { useState, type FormEvent } from 'react';
import { t } from '../i18n.ts';
import { api, formatDate, type Deck, type DeckListItem } from '../api.ts';
import { attempt, EmptyState, Field, Loading, Modal, useLoad } from '../components/ui.tsx';
import { Link, navigate } from '../router.tsx';

export function DecksPage() {
  const { data, error, reload } = useLoad(() => api.get<{ decks: DeckListItem[] }>('/decks').then((r) => r.decks));
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const list = (data ?? []).filter((d) => !q || d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('Kartenstapel')}</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>{t('+ Stapel anlegen')}</button>
      </div>
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState title={t('Noch keine Kartenstapel')}>
          <p>{t('Ein Stapel ist eine Sammlung von Karteikarten zu einem Thema, z. B. „Erste Hilfe – Grundlagen“.')}</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>{t('Ersten Stapel anlegen')}</button>
        </EmptyState>
      ) : (
        <>
          {data.length > 6 && <input className="search" type="search" placeholder={t('Suchen …')} value={search} onChange={(e) => setSearch(e.target.value)} />}
          <div className="deck-grid">
            {list.map((d) => (
              <Link key={d.id} to={`/stapel/${d.id}`} className="deck-tile">
                <h3 dir="auto">{d.title}</h3>
                {d.description && <p className="muted" dir="auto">{d.description}</p>}
                <div className="deck-tile-meta">
                  <span>{t('{n} Karten', { n: d.cardCount })}</span>
                  <span>{d.childCount === 1 ? t('1 Kind') : t('{n} Kinder', { n: d.childCount })}</span>
                  <span className="muted">{t('geändert {date}', { date: formatDate(d.updatedAt, false) })}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
      {creating && <DeckModal onClose={() => setCreating(false)} onSaved={(d) => navigate(`/stapel/${d.id}`)} />}
    </div>
  );
}

export function DeckModal({ deck, onClose, onSaved }: { deck?: Deck; onClose: () => void; onSaved: (d: Deck) => void }) {
  const [title, setTitle] = useState(deck?.title ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let saved: Deck | undefined;
    const ok = await attempt(async () => {
      const r = deck
        ? await api.patch<{ deck: Deck }>(`/decks/${deck.id}`, { title, description })
        : await api.post<{ deck: Deck }>('/decks', { title, description });
      saved = r.deck;
    }, deck ? t('Gespeichert') : t('Stapel angelegt'));
    if (ok && saved) onSaved(saved);
  };
  return (
    <Modal title={deck ? t('Stapel bearbeiten') : t('Neuer Kartenstapel')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('Titel')}><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder={t('z. B. Erste Hilfe – Grundlagen')} dir="auto" /></Field>
        <Field label={t('Beschreibung (optional)')} hint={t('Wird den Kindern in der App angezeigt.')}>
          <textarea dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary">{deck ? t('Speichern') : t('Anlegen')}</button>
        </div>
      </form>
    </Modal>
  );
}
