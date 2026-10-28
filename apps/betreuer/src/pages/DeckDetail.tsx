import { useState } from 'react';
import { api, CARD_TYPE_LABELS, imageUrl, type Card, type ChildListItem, type Deck, type Progress } from '../api.ts';
import { CardEditor } from '../components/CardEditor.tsx';
import { attempt, confirmDialog, EmptyState, Loading, Modal, ProgressBar, StatusBadge, useLoad } from '../components/ui.tsx';
import { Link, navigate } from '../router.tsx';
import { DeckModal } from './Decks.tsx';

type DeckChild = { id: number; displayName: string; username: string; progress: Progress };

export function DeckDetailPage({ id }: { id: number }) {
  const { data, error, reload, setData } = useLoad(() => api.get<{ deck: Deck; cards: Card[]; children: DeckChild[] }>(`/decks/${id}`), [id]);
  const [editingDeck, setEditingDeck] = useState(false);
  const [editor, setEditor] = useState<{ card?: Card } | null>(null);
  const [assigning, setAssigning] = useState(false);

  if (!data) return <div className="page"><Loading error={error} onRetry={reload} /></div>;
  const { deck, cards, children } = data;

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...cards];
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved!);
    setData({ ...data, cards: next });
    if (!(await attempt(() => api.put(`/decks/${id}/order`, { cardIds: next.map((c) => c.id) })))) void reload();
  };

  const deleteCard = async (card: Card) => {
    if (!(await confirmDialog('Diese Karte löschen? Sie verschwindet auch aus dem Lernstand aller Kinder.', { confirmLabel: 'Löschen', danger: true }))) return;
    if (await attempt(() => api.del(`/cards/${card.id}`), 'Karte gelöscht')) void reload();
  };

  const deleteDeck = async () => {
    if (!(await confirmDialog(`Stapel „${deck.title}“ mit ${cards.length} Karten endgültig löschen? Auch der Lernstand aller Kinder für diesen Stapel wird gelöscht.`, { confirmLabel: 'Endgültig löschen', danger: true }))) return;
    if (await attempt(() => api.del(`/decks/${id}`), 'Stapel gelöscht')) navigate('/stapel');
  };

  const duplicate = async () => {
    let newId = 0;
    if (await attempt(async () => { newId = (await api.post<{ deck: Deck }>(`/decks/${id}/duplicate`)).deck.id; }, 'Kopie erstellt')) navigate(`/stapel/${newId}`);
  };

  return (
    <div className="page">
      <div className="breadcrumbs"><Link to="/stapel">Kartenstapel</Link> › {deck.title}</div>
      <div className="page-head">
        <div>
          <h1>{deck.title}</h1>
          {deck.description && <p className="muted">{deck.description}</p>}
        </div>
        <div className="button-row">
          <button className="btn" onClick={() => setEditingDeck(true)}>Bearbeiten</button>
          <button className="btn" onClick={() => void duplicate()} title="z. B. als Vorlage für eine andere Ausbildung">Kopieren</button>
          <button className="btn btn-danger-outline" onClick={() => void deleteDeck()}>Löschen</button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Karten ({cards.length})</h2>
          <button className="btn btn-primary" onClick={() => setEditor({})}>+ Neue Karte</button>
        </div>
        {cards.length === 0 ? (
          <EmptyState title="Dieser Stapel hat noch keine Karten">
            <button className="btn btn-primary" onClick={() => setEditor({})}>Erste Karte anlegen</button>
          </EmptyState>
        ) : (
          <ol className="card-list">
            {cards.map((c, i) => (
              <li key={c.id} className="card-row">
                <div className="card-row-order">
                  <button className="icon-btn" disabled={i === 0} onClick={() => void move(i, -1)} aria-label="Nach oben">▲</button>
                  <span>{i + 1}</span>
                  <button className="icon-btn" disabled={i === cards.length - 1} onClick={() => void move(i, 1)} aria-label="Nach unten">▼</button>
                </div>
                {c.questionImage && <img className="card-row-thumb" src={imageUrl(c.questionImage)} alt="" />}
                <button className="card-row-main" onClick={() => setEditor({ card: c })}>
                  <span className={`type-badge type-${c.type}`}>{CARD_TYPE_LABELS[c.type]}</span>
                  <span className="card-row-q">{c.question || <em className="muted">(nur Bild)</em>}</span>
                  <span className="card-row-a muted">
                    {c.type === 'flip' && (c.answer || '(Bild)')}
                    {c.type === 'input' && `→ ${c.acceptedAnswers.join(' / ')}`}
                    {c.type === 'choice' && `→ ${c.options.filter((o) => o.correct).map((o) => o.text).join(', ')}`}
                  </span>
                </button>
                <div className="card-row-actions">
                  <button className="btn btn-small" onClick={() => setEditor({ card: c })}>Bearbeiten</button>
                  <button className="btn btn-small btn-danger-outline" onClick={() => void deleteCard(c)}>Löschen</button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Zugeteilte Kinder ({children.length})</h2>
          <button className="btn" onClick={() => setAssigning(true)}>Kinder zuteilen</button>
        </div>
        {children.length === 0 ? (
          <p className="muted">Noch keinem Kind zugeteilt.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Kind</th><th>Fortschritt</th><th>Status</th></tr></thead>
            <tbody>
              {children.map((ch) => (
                <tr key={ch.id}>
                  <td><Link to={`/kinder/${ch.id}`}>{ch.displayName}</Link></td>
                  <td className="progress-cell"><ProgressBar value={ch.progress.solved} max={ch.progress.totalCards} /> <span className="muted small">{ch.progress.solved}/{ch.progress.totalCards}</span></td>
                  <td><StatusBadge status={ch.progress.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editingDeck && <DeckModal deck={deck} onClose={() => setEditingDeck(false)} onSaved={() => { setEditingDeck(false); void reload(); }} />}
      {editor && (
        <CardEditor deckId={id} card={editor.card} onClose={() => setEditor(null)}
          onSaved={(again) => { if (!again) setEditor(null); void reload(); }} />
      )}
      {assigning && <AssignChildrenModal deckId={id} assigned={children.map((c) => c.id)} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); void reload(); }} />}
    </div>
  );
}

function AssignChildrenModal({ deckId, assigned, onClose, onSaved }: { deckId: number; assigned: number[]; onClose: () => void; onSaved: () => void }) {
  const { data, error } = useLoad(() => api.get<{ children: ChildListItem[] }>('/children').then((r) => r.children));
  const [selected, setSelected] = useState<number[]>(assigned);
  const save = async () => {
    if (await attempt(() => api.put(`/decks/${deckId}/children`, { childIds: selected }), 'Zuteilung gespeichert')) onSaved();
  };
  return (
    <Modal title="Kinder zuteilen" onClose={onClose}>
      {!data ? <Loading error={error} /> : data.length === 0 ? (
        <EmptyState title="Es gibt noch keine Kinder"><Link to="/kinder">Kinder anlegen</Link></EmptyState>
      ) : (
        <>
          <div className="button-row">
            <button className="btn btn-small" onClick={() => setSelected(data.map((c) => c.id))}>Alle</button>
            <button className="btn btn-small" onClick={() => setSelected([])}>Keine</button>
          </div>
          <div className="checklist">
            {data.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={selected.includes(c.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
                <span>{c.displayName} <span className="muted mono">{c.username}</span>{!c.active && <span className="muted"> (deaktiviert)</span>}</span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" onClick={() => void save()}>Speichern</button>
          </div>
        </>
      )}
    </Modal>
  );
}
