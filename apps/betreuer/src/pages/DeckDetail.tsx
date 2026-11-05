import { useState } from 'react';
import { t } from '../i18n.ts';
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
    if (!(await confirmDialog(t('Diese Karte löschen? Sie verschwindet auch aus dem Lernstand aller Kinder.'), { confirmLabel: t('Löschen'), danger: true }))) return;
    if (await attempt(() => api.del(`/cards/${card.id}`), t('Karte gelöscht'))) void reload();
  };

  const deleteDeck = async () => {
    if (!(await confirmDialog(t('Stapel „{deck}“ mit {n} Karten endgültig löschen? Auch der Lernstand aller Kinder für diesen Stapel wird gelöscht.', { deck: deck.title, n: cards.length }), { confirmLabel: t('Endgültig löschen'), danger: true }))) return;
    if (await attempt(() => api.del(`/decks/${id}`), t('Stapel gelöscht'))) navigate('/stapel');
  };

  const duplicate = async () => {
    let newId = 0;
    if (await attempt(async () => { newId = (await api.post<{ deck: Deck }>(`/decks/${id}/duplicate`)).deck.id; }, t('Kopie erstellt'))) navigate(`/stapel/${newId}`);
  };

  return (
    <div className="page">
      <div className="breadcrumbs"><Link to="/stapel">{t('Kartenstapel')}</Link> {t('›')} <bdi>{deck.title}</bdi></div>
      <div className="page-head">
        <div>
          <h1 dir="auto">{deck.title}</h1>
          {deck.description && <p className="muted" dir="auto">{deck.description}</p>}
        </div>
        <div className="button-row">
          <button className="btn" onClick={() => setEditingDeck(true)}>{t('Bearbeiten')}</button>
          <button className="btn" onClick={() => void duplicate()} title={t('z. B. als Vorlage für eine andere Ausbildung')}>{t('Kopieren')}</button>
          <button className="btn btn-danger-outline" onClick={() => void deleteDeck()}>{t('Löschen')}</button>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>{t('Karten ({n})', { n: cards.length })}</h2>
          <button className="btn btn-primary" onClick={() => setEditor({})}>{t('+ Neue Karte')}</button>
        </div>
        {cards.length === 0 ? (
          <EmptyState title={t('Dieser Stapel hat noch keine Karten')}>
            <button className="btn btn-primary" onClick={() => setEditor({})}>{t('Erste Karte anlegen')}</button>
          </EmptyState>
        ) : (
          <ol className="card-list">
            {cards.map((c, i) => (
              <li key={c.id} className="card-row">
                <div className="card-row-order">
                  <button className="icon-btn" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={t('Nach oben')}>▲</button>
                  <span>{i + 1}</span>
                  <button className="icon-btn" disabled={i === cards.length - 1} onClick={() => void move(i, 1)} aria-label={t('Nach unten')}>▼</button>
                </div>
                {c.questionImage && <img className="card-row-thumb" src={imageUrl(c.questionImage)} alt="" />}
                <button className="card-row-main" onClick={() => setEditor({ card: c })}>
                  <span className={`type-badge type-${c.type}`}>{t(CARD_TYPE_LABELS[c.type])}</span>
                  <span className="card-row-q" dir="auto">{c.question || <em className="muted">{t('(nur Bild)')}</em>}</span>
                  <span className="card-row-a muted" dir="auto">
                    {c.type === 'flip' && (c.answer || t('(Bild)'))}
                    {c.type === 'input' && `→ ${c.acceptedAnswers.join(' / ')}`}
                    {c.type === 'choice' && `→ ${c.options.filter((o) => o.correct).map((o) => o.text).join(', ')}`}
                  </span>
                </button>
                <div className="card-row-actions">
                  <button className="btn btn-small" onClick={() => setEditor({ card: c })}>{t('Bearbeiten')}</button>
                  <button className="btn btn-small btn-danger-outline" onClick={() => void deleteCard(c)}>{t('Löschen')}</button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{t('Zugeteilte Kinder ({n})', { n: children.length })}</h2>
          <button className="btn" onClick={() => setAssigning(true)}>{t('Kinder zuteilen')}</button>
        </div>
        {children.length === 0 ? (
          <p className="muted">{t('Noch keinem Kind zugeteilt.')}</p>
        ) : (
          <table className="table">
            <thead><tr><th>{t('Kind')}</th><th>{t('Fortschritt')}</th><th>{t('Status')}</th></tr></thead>
            <tbody>
              {children.map((ch) => (
                <tr key={ch.id}>
                  <td><Link to={`/kinder/${ch.id}`}><bdi>{ch.displayName}</bdi></Link></td>
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
    if (await attempt(() => api.put(`/decks/${deckId}/children`, { childIds: selected }), t('Zuteilung gespeichert'))) onSaved();
  };
  return (
    <Modal title={t('Kinder zuteilen')} onClose={onClose}>
      {!data ? <Loading error={error} /> : data.length === 0 ? (
        <EmptyState title={t('Es gibt noch keine Kinder')}><Link to="/kinder">{t('Kinder anlegen')}</Link></EmptyState>
      ) : (
        <>
          <div className="button-row">
            <button className="btn btn-small" onClick={() => setSelected(data.map((c) => c.id))}>{t('Alle')}</button>
            <button className="btn btn-small" onClick={() => setSelected([])}>{t('Keine')}</button>
          </div>
          <div className="checklist">
            {data.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={selected.includes(c.id)}
                  onChange={(e) => setSelected(e.currentTarget.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
                <span><bdi>{c.displayName}</bdi>{!c.active && <span className="muted"> {t('(deaktiviert)')}</span>}</span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={onClose}>{t('Abbrechen')}</button>
            <button className="btn btn-primary" onClick={() => void save()}>{t('Speichern')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
