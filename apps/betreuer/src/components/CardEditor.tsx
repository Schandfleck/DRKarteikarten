import { useState, type FormEvent } from 'react';
import { api, CARD_TYPE_LABELS, imageUrl, type Card, type CardInput, type CardType } from '../api.ts';
import { t, tKey } from '../i18n.ts';
import { ImageUpload } from './ImageUpload.tsx';
import { Field, Modal, toast } from './ui.tsx';

const TYPE_HELP: Record<CardType, string> = {
  flip: tKey('Klassische Karte: Das Kind dreht sie um und sagt selbst, ob es die Antwort wusste.'),
  input: tKey('Das Kind tippt die Antwort ein, die App prüft sie automatisch.'),
  choice: tKey('Das Kind wählt aus mehreren Antworten. Eine oder mehrere können richtig sein.'),
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
      toast.ok(card ? t('Karte gespeichert') : t('Karte angelegt'));
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
    <Modal title={card ? t('Karte bearbeiten') : t('Neue Karte')} onClose={onClose} wide>
      <form onSubmit={submit} className="card-editor">
        <div className="card-editor-form">
          <div className="type-picker" role="radiogroup" aria-label={t('Kartentyp')}>
            {(Object.keys(CARD_TYPE_LABELS) as CardType[]).map((type) => (
              <button type="button" key={type} role="radio" aria-checked={form.type === type}
                className={`type-option ${form.type === type ? 'selected' : ''}`} onClick={() => set('type', type)}>
                <span className="type-icon">{type === 'flip' ? '⇄' : type === 'input' ? '⌨' : '☑'}</span>
                {t(CARD_TYPE_LABELS[type])}
              </button>
            ))}
          </div>
          <p className="muted small">{t(TYPE_HELP[form.type])}</p>

          <h3 className="editor-section">{t('Vorderseite (Frage)')}</h3>
          <Field label={t('Text')}>
            <textarea value={form.question} onChange={(e) => set('question', e.target.value)} rows={3} maxLength={2000} placeholder={t('z. B. Welche Nummer hat der Notruf?')} dir="auto" />
          </Field>
          <ImageUpload value={form.questionImage} onChange={(id) => set('questionImage', id)} />

          {form.type === 'input' && (
            <>
              <h3 className="editor-section">{t('Richtige Antwort(en)')}</h3>
              <p className="muted small">{t('Mehrere Schreibweisen möglich (z. B. „112“ und „eins eins zwei“). Leerzeichen am Rand und ein Punkt am Ende werden ignoriert.')}</p>
              {form.acceptedAnswers.map((a, i) => (
                <div className="input-group" key={i}>
                  <input value={a} placeholder={i === 0 ? t('Richtige Antwort') : t('Weitere richtige Schreibweise')} maxLength={300} dir="auto"
                    onChange={(e) => set('acceptedAnswers', form.acceptedAnswers.map((x, j) => (j === i ? e.target.value : x)))} />
                  {form.acceptedAnswers.length > 1 && (
                    <button type="button" className="btn" aria-label={t('Entfernen')} onClick={() => set('acceptedAnswers', form.acceptedAnswers.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              <div className="button-row">
                <button type="button" className="btn btn-small" onClick={() => set('acceptedAnswers', [...form.acceptedAnswers, ''])}>{t('+ Schreibweise')}</button>
                <label className="check"><input type="checkbox" checked={form.caseSensitive} onChange={(e) => set('caseSensitive', e.target.checked)} /> {t('Groß-/Kleinschreibung beachten')}</label>
              </div>
            </>
          )}

          {form.type === 'choice' && (
            <>
              <h3 className="editor-section">{t('Antwortmöglichkeiten')}</h3>
              <p className="muted small">{t('Haken = richtige Antwort. Die Reihenfolge wird in der App gemischt.')}</p>
              {form.options.map((o, i) => (
                <div className="input-group option-row" key={i}>
                  <label className="option-correct" title={t('Richtig?')}>
                    <input type="checkbox" checked={o.correct}
                      onChange={(e) => set('options', form.options.map((x, j) => (j === i ? { ...x, correct: e.target.checked } : x)))} />
                  </label>
                  <input value={o.text} placeholder={t('Antwort {n}', { n: i + 1 })} maxLength={500} dir="auto"
                    onChange={(e) => set('options', form.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  {form.options.length > 2 && (
                    <button type="button" className="btn" aria-label={t('Entfernen')} onClick={() => set('options', form.options.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              {form.options.length < 10 && (
                <button type="button" className="btn btn-small" onClick={() => set('options', [...form.options, { text: '', correct: false }])}>{t('+ Antwortmöglichkeit')}</button>
              )}
            </>
          )}

          <h3 className="editor-section">{form.type === 'flip' ? t('Rückseite (Antwort)') : t('Erklärung (optional)')}</h3>
          <p className="muted small">{form.type === 'flip' ? t('Das sieht das Kind nach dem Umdrehen.') : t('Wird nach dem Antworten angezeigt – gut für kurze Erklärungen.')}</p>
          <Field label={t('Text')}>
            <textarea dir="auto" value={form.answer} onChange={(e) => set('answer', e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <ImageUpload value={form.answerImage} onChange={(id) => set('answerImage', id)} />
        </div>

        <aside className="card-editor-preview">
          <div className="preview-label">{t('Vorschau in der Kinder-App')}</div>
          <CardPreview card={form} />
        </aside>

        <div className="form-actions card-editor-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          {!card && <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>{t('Speichern & nächste Karte')}</button>}
          <button className="btn btn-primary" disabled={busy}>{t('Speichern')}</button>
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
        <div className="preview-text" dir="auto">{card.question || <span className="muted">{t('Frage …')}</span>}</div>
      </div>
      {card.type === 'input' && <div className="preview-input">{t('Antwort eintippen …')}</div>}
      {card.type === 'choice' && (
        <div className="preview-options">
          {card.options.filter((o) => o.text.trim()).map((o, i) => (
            <div key={i} className={`preview-option ${o.correct ? 'correct' : ''}`} dir="auto">{o.text}</div>
          ))}
        </div>
      )}
      {(card.answer || card.answerImage || card.type === 'input') && (
        <div className="preview-back">
          <div className="preview-back-label">{card.type === 'flip' ? t('Rückseite') : t('Nach dem Antworten')}</div>
          {card.type === 'input' && card.acceptedAnswers.some((a) => a.trim()) && (
            <div className="preview-solution">{t('Richtig:')} {card.acceptedAnswers.filter((a) => a.trim()).join(' / ')}</div>
          )}
          {card.answerImage && <img src={imageUrl(card.answerImage)} alt="" />}
          {card.answer && <div className="preview-text" dir="auto">{card.answer}</div>}
        </div>
      )}
    </div>
  );
}
