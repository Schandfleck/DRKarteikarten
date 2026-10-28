import { useState, type FormEvent } from 'react';
import { api, CARD_TYPE_LABELS, imageUrl, type Card, type CardInput, type CardType } from '../api.ts';
import { ImageUpload } from './ImageUpload.tsx';
import { Field, Modal, toast } from './ui.tsx';

const TYPE_HELP: Record<CardType, string> = {
  flip: 'Klassische Karte: Das Kind dreht sie um und sagt selbst, ob es die Antwort wusste.',
  input: 'Das Kind tippt die Antwort ein, die App prüft sie automatisch.',
  choice: 'Das Kind wählt aus mehreren Antworten. Eine oder mehrere können richtig sein.',
};

const empty: CardInput = {
  type: 'flip', question: '', questionImage: null, answer: '', answerImage: null,
  acceptedAnswers: [''], caseSensitive: false,
  options: [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }],
};

function toInput(card: Card): CardInput {
  return {
    type: card.type,
    question: card.question,
    questionImage: card.questionImage,
    answer: card.answer,
    answerImage: card.answerImage,
    acceptedAnswers: card.acceptedAnswers.length ? card.acceptedAnswers : [''],
    caseSensitive: card.caseSensitive,
    options: card.options.length ? card.options : empty.options,
  };
}

export function CardEditor({ deckId, card, onClose, onSaved }: { deckId: number; card?: Card; onClose: () => void; onSaved: (again: boolean) => void }) {
  const [form, setForm] = useState<CardInput>(card ? toInput(card) : empty);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CardInput>(key: K, value: CardInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (again: boolean) => {
    setBusy(true);
    try {
      const body = {
        ...form,
        acceptedAnswers: form.acceptedAnswers.map((a) => a.trim()).filter(Boolean),
        options: form.options.filter((o) => o.text.trim()),
      };
      if (card) await api.patch(`/cards/${card.id}`, body);
      else await api.post(`/decks/${deckId}/cards`, body);
      toast.ok(card ? 'Karte gespeichert' : 'Karte angelegt');
      if (again) setForm({ ...empty, type: form.type });
      onSaved(again);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <Modal title={card ? 'Karte bearbeiten' : 'Neue Karte'} onClose={onClose} wide>
      <form onSubmit={submit} className="card-editor">
        <div className="card-editor-form">
          <div className="type-picker" role="radiogroup" aria-label="Kartentyp">
            {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((t) => (
              <button type="button" key={t} role="radio" aria-checked={form.type === t}
                className={`type-option ${form.type === t ? 'selected' : ''}`} onClick={() => set('type', t)}>
                <span className="type-icon">{t === 'flip' ? '⇄' : t === 'input' ? '⌨' : '☑'}</span>
                {CARD_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="muted small">{TYPE_HELP[form.type]}</p>

          <h3 className="editor-section">Vorderseite (Frage)</h3>
          <Field label="Text">
            <textarea value={form.question} onChange={(e) => set('question', e.target.value)} rows={3} maxLength={2000} placeholder="z. B. Welche Nummer hat der Notruf?" />
          </Field>
          <ImageUpload value={form.questionImage} onChange={(id) => set('questionImage', id)} />

          {form.type === 'input' && (
            <>
              <h3 className="editor-section">Richtige Antwort(en)</h3>
              <p className="muted small">Mehrere Schreibweisen möglich (z. B. „112“ und „eins eins zwei“). Leerzeichen am Rand und ein Punkt am Ende werden ignoriert.</p>
              {form.acceptedAnswers.map((a, i) => (
                <div className="input-group" key={i}>
                  <input value={a} placeholder={i === 0 ? 'Richtige Antwort' : 'Weitere richtige Schreibweise'} maxLength={300}
                    onChange={(e) => set('acceptedAnswers', form.acceptedAnswers.map((x, j) => (j === i ? e.target.value : x)))} />
                  {form.acceptedAnswers.length > 1 && (
                    <button type="button" className="btn" aria-label="Entfernen" onClick={() => set('acceptedAnswers', form.acceptedAnswers.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              <div className="button-row">
                <button type="button" className="btn btn-small" onClick={() => set('acceptedAnswers', [...form.acceptedAnswers, ''])}>+ Schreibweise</button>
                <label className="check"><input type="checkbox" checked={form.caseSensitive} onChange={(e) => set('caseSensitive', e.target.checked)} /> Groß-/Kleinschreibung beachten</label>
              </div>
            </>
          )}

          {form.type === 'choice' && (
            <>
              <h3 className="editor-section">Antwortmöglichkeiten</h3>
              <p className="muted small">Haken = richtige Antwort. Die Reihenfolge wird in der App gemischt.</p>
              {form.options.map((o, i) => (
                <div className="input-group option-row" key={i}>
                  <label className="option-correct" title="Richtig?">
                    <input type="checkbox" checked={o.correct}
                      onChange={(e) => set('options', form.options.map((x, j) => (j === i ? { ...x, correct: e.target.checked } : x)))} />
                  </label>
                  <input value={o.text} placeholder={`Antwort ${i + 1}`} maxLength={500}
                    onChange={(e) => set('options', form.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  {form.options.length > 2 && (
                    <button type="button" className="btn" aria-label="Entfernen" onClick={() => set('options', form.options.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              {form.options.length < 10 && (
                <button type="button" className="btn btn-small" onClick={() => set('options', [...form.options, { text: '', correct: false }])}>+ Antwortmöglichkeit</button>
              )}
            </>
          )}

          <h3 className="editor-section">{form.type === 'flip' ? 'Rückseite (Antwort)' : 'Erklärung (optional)'}</h3>
          <p className="muted small">{form.type === 'flip' ? 'Das sieht das Kind nach dem Umdrehen.' : 'Wird nach dem Antworten angezeigt – gut für kurze Erklärungen.'}</p>
          <Field label="Text">
            <textarea value={form.answer} onChange={(e) => set('answer', e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <ImageUpload value={form.answerImage} onChange={(id) => set('answerImage', id)} />
        </div>

        <aside className="card-editor-preview">
          <div className="preview-label">Vorschau in der Kinder-App</div>
          <CardPreview card={form} />
        </aside>

        <div className="form-actions card-editor-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          {!card && <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>Speichern &amp; nächste Karte</button>}
          <button className="btn btn-primary" disabled={busy}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

export function CardPreview({ card }: { card: CardInput }) {
  return (
    <div className="preview">
      <div className="preview-card">
        {card.questionImage && <img src={imageUrl(card.questionImage)} alt="" />}
        <div className="preview-text">{card.question || <span className="muted">Frage …</span>}</div>
      </div>
      {card.type === 'input' && <div className="preview-input">Antwort eintippen …</div>}
      {card.type === 'choice' && (
        <div className="preview-options">
          {card.options.filter((o) => o.text.trim()).map((o, i) => (
            <div key={i} className={`preview-option ${o.correct ? 'correct' : ''}`}>{o.text}</div>
          ))}
        </div>
      )}
      {(card.answer || card.answerImage || card.type === 'input') && (
        <div className="preview-back">
          <div className="preview-back-label">{card.type === 'flip' ? 'Rückseite' : 'Nach dem Antworten'}</div>
          {card.type === 'input' && card.acceptedAnswers.some((a) => a.trim()) && (
            <div className="preview-solution">Richtig: {card.acceptedAnswers.filter((a) => a.trim()).join(' / ')}</div>
          )}
          {card.answerImage && <img src={imageUrl(card.answerImage)} alt="" />}
          {card.answer && <div className="preview-text">{card.answer}</div>}
        </div>
      )}
    </div>
  );
}
