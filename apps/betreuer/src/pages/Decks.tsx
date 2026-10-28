import { useState, type FormEvent } from 'react';
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
        <h1>Kartenstapel</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Stapel anlegen</button>
      </div>
      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState title="Noch keine Kartenstapel">
          <p>Ein Stapel ist eine Sammlung von Karteikarten zu einem Thema, z. B. „Erste Hilfe – Grundlagen“.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Ersten Stapel anlegen</button>
        </EmptyState>
      ) : (
        <>
          {data.length > 6 && <input className="search" type="search" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />}
          <div className="deck-grid">
            {list.map((d) => (
              <Link key={d.id} to={`/stapel/${d.id}`} className="deck-tile">
                <h3>{d.title}</h3>
                {d.description && <p className="muted">{d.description}</p>}
                <div className="deck-tile-meta">
                  <span>{d.cardCount} Karten</span>
                  <span>{d.childCount} {d.childCount === 1 ? 'Kind' : 'Kinder'}</span>
                  <span className="muted">geändert {formatDate(d.updatedAt, false)}</span>
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
    }, deck ? 'Gespeichert' : 'Stapel angelegt');
    if (ok && saved) onSaved(saved);
  };
  return (
    <Modal title={deck ? 'Stapel bearbeiten' : 'Neuer Kartenstapel'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Titel"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="z. B. Erste Hilfe – Grundlagen" /></Field>
        <Field label="Beschreibung (optional)" hint="Wird den Kindern in der App angezeigt.">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary">{deck ? 'Speichern' : 'Anlegen'}</button>
        </div>
      </form>
    </Modal>
  );
}
