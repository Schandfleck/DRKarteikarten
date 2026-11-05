import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, imageUrl, shuffle, type AnswerResult, type Deck, type Session, type StudyCard } from './api.ts';
import { t } from './i18n.ts';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'round-intro'; round: number; count: number }
  | { kind: 'card' }
  | { kind: 'finished'; summary: Extract<Session, { status: 'finished' }>['summary'] };

/**
 * Lernmodus: Karten der aktuellen Runde nacheinander abfragen.
 * Ist die Runde durch, liefert der Server die nächste Runde (nur noch falsche Karten) – bis alles richtig ist.
 */
export function Study({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState({ solved: 0, total: 0, round: 1 });

  const apply = useCallback((s: Session) => {
    if (s.status === 'empty') return setPhase({ kind: 'empty' });
    if (s.status === 'finished') {
      setProgress({ solved: s.summary.cards, total: s.summary.cards, round: s.summary.rounds });
      return setPhase({ kind: 'finished', summary: s.summary });
    }
    setQueue(shuffle(s.cards));
    setIndex(0);
    setProgress({ solved: s.solved, total: s.total, round: s.round });
    // Neue Runde ankündigen (außer ganz am Anfang)
    const freshRound = s.cards.length === s.roundSize;
    setPhase(s.round > 1 && freshRound ? { kind: 'round-intro', round: s.round, count: s.cards.length } : { kind: 'card' });
  }, []);

  const load = useCallback(() => {
    setPhase({ kind: 'loading' });
    api.get<Session>(`/kind/decks/${deck.id}/session`).then(apply, (e: Error) => setPhase({ kind: 'error', message: e.message }));
  }, [deck.id, apply]);

  useEffect(load, [load]);

  const restart = () => {
    setPhase({ kind: 'loading' });
    api.post<Session>(`/kind/decks/${deck.id}/restart`).then(apply, (e: Error) => setPhase({ kind: 'error', message: e.message }));
  };

  const next = (result: AnswerResult) => {
    setProgress(result.progress);
    if (index + 1 < queue.length) setIndex(index + 1);
    else load(); // Runde zu Ende → Server entscheidet: nächste Runde oder fertig
  };

  const pct = progress.total ? (progress.solved / progress.total) * 100 : 0;

  return (
    <div className="screen study">
      <header className="top-app-bar">
        <button className="icon-button" onClick={onExit} aria-label={t('Lernen beenden')}>✕</button>
        <div className="top-app-bar-title">
          <div className="title-text" dir="auto">{deck.title}</div>
          {phase.kind === 'card' && <div className="subtitle">{t('Runde {round} · Karte {n} von {total}', { round: progress.round, n: index + 1, total: queue.length })}</div>}
        </div>
      </header>
      <div className="linear-progress" role="progressbar" aria-valuenow={progress.solved} aria-valuemax={progress.total}>
        <div style={{ width: `${pct}%` }} />
      </div>

      <main className="study-body">
        {phase.kind === 'loading' && <div className="center pad"><div className="spinner" /></div>}
        {phase.kind === 'error' && (
          <div className="message-box">
            <div className="message-emoji">📡</div>
            <p>{phase.message}</p>
            <button className="btn filled" onClick={load}>{t('Nochmal versuchen')}</button>
          </div>
        )}
        {phase.kind === 'empty' && (
          <div className="message-box">
            <div className="message-emoji">🗂️</div>
            <p>{t('In diesem Stapel sind noch keine Karten.')}</p>
            <button className="btn filled" onClick={onExit}>{t('Zurück')}</button>
          </div>
        )}
        {phase.kind === 'round-intro' && (
          <div className="message-box">
            <div className="message-emoji">💪</div>
            <h2>{t('Runde {n}', { n: phase.round })}</h2>
            <p>
              {t('Super, {solved} von {total} Karten sitzen schon!', { solved: progress.solved, total: progress.total })}<br />
              {phase.count === 1 ? t('Jetzt üben wir die Karte, die noch nicht geklappt hat.') : t('Jetzt üben wir die {n} Karten, die noch nicht geklappt haben.', { n: phase.count })}
            </p>
            <button className="btn filled large" onClick={() => setPhase({ kind: 'card' })}>{t('Weiter')}</button>
          </div>
        )}
        {phase.kind === 'card' && queue[index] && (
          <CardView key={`${progress.round}-${queue[index].id}`} deckId={deck.id} card={queue[index]} onDone={next}
            onError={(message) => setPhase({ kind: 'error', message })} />
        )}
        {phase.kind === 'finished' && (
          <div className="message-box finished">
            <div className="confetti" aria-hidden="true">{['🎉', '⭐', '🎊', '✨', '🌟'].map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.15}s` }}>{c}</span>)}</div>
            <h2>{t('Geschafft!')}</h2>
            <p>{t('Du hast alle {n} Karten richtig beantwortet.', { n: phase.summary.cards })}</p>
            <div className="result-chips">
              <span className="chip">{phase.summary.rounds === 1 ? t('1 Runde') : t('{n} Runden', { n: phase.summary.rounds })}</span>
              {phase.summary.wrong === 0 ? <span className="chip success">{t('Alles auf Anhieb richtig!')}</span> : <span className="chip">{t('{n}× geübt', { n: phase.summary.wrong })}</span>}
            </div>
            <div className="button-stack">
              <button className="btn filled large" onClick={onExit}>{t('Fertig')}</button>
              <button className="btn outlined" onClick={restart}>{t('Nochmal von vorne')}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function CardView({ deckId, card, onDone, onError }: { deckId: number; card: StudyCard; onDone: (r: AnswerResult) => void; onError: (m: string) => void }) {
  const [flipped, setFlipped] = useState(false);
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const options = useRef(shuffle(card.options ?? [])).current;
  const continueBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (result) continueBtn.current?.focus();
  }, [result]);

  const send = async (body: { knew?: boolean; text?: string; optionIds?: string[] }) => {
    setBusy(true);
    try {
      const r = await api.post<AnswerResult>(`/kind/decks/${deckId}/answer`, { cardId: card.id, ...body });
      // Bei Umdrehkarten weiter ohne extra Lösungsseite – die Rückseite wurde ja schon gezeigt
      if (card.type === 'flip') onDone(r);
      else setResult(r);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) void send({ text });
  };

  const toggleOption = (id: string) => {
    if (result) return;
    if (card.multiple) setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
    else setChosen([id]);
  };

  const correctIds = result?.solution.correctOptionIds ?? [];

  return (
    <div className="card-area">
      <div className={`flashcard ${card.type === 'flip' ? 'flippable' : ''} ${flipped ? 'flipped' : ''}`}
        onClick={() => card.type === 'flip' && !flipped && setFlipped(true)}
        role={card.type === 'flip' && !flipped ? 'button' : undefined}
        tabIndex={card.type === 'flip' && !flipped ? 0 : undefined}
        onKeyDown={(e) => card.type === 'flip' && (e.key === 'Enter' || e.key === ' ') && setFlipped(true)}>
        <div className="flashcard-inner">
          <div className="face front">
            {card.questionImage && <img src={imageUrl(card.questionImage)} alt="" />}
            {card.question && <div className="card-text" dir="auto">{card.question}</div>}
            {card.type === 'flip' && <div className="hint">{t('Tippe zum Umdrehen')}</div>}
          </div>
          {card.type === 'flip' && (
            <div className="face back">
              {card.question && <div className="back-question" dir="auto">{card.question}</div>}
              {card.answerImage && <img src={imageUrl(card.answerImage)} alt="" />}
              {card.answer && <div className="card-text" dir="auto">{card.answer}</div>}
            </div>
          )}
        </div>
      </div>

      {card.type === 'flip' && flipped && (
        <div className="answer-row">
          <button className="btn tonal error-tone large" disabled={busy} onClick={() => void send({ knew: false })}>{t('✗ Wusste ich nicht')}</button>
          <button className="btn filled success-tone large" disabled={busy} onClick={() => void send({ knew: true })}>{t('✓ Wusste ich')}</button>
        </div>
      )}

      {card.type === 'input' && (
        <form className="input-answer" onSubmit={submitText}>
          <div className={`text-field ${result ? (result.correct ? 'is-correct' : 'is-wrong') : ''}`}>
            <input value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder=" " id="answer" disabled={!!result || busy}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellcheck={false} autoFocus dir="auto" />
            <label htmlFor="answer">{t('Deine Antwort')}</label>
          </div>
          {!result && <button className="btn filled large" disabled={busy || !text.trim()}>{t('Prüfen')}</button>}
        </form>
      )}

      {card.type === 'choice' && (
        <div className="choices">
          {card.multiple && !result && <div className="hint">{t('Mehrere Antworten können richtig sein.')}</div>}
          {options.map((o) => {
            const isChosen = chosen.includes(o.id);
            const state = result ? (correctIds.includes(o.id) ? 'correct' : isChosen ? 'wrong' : 'dim') : isChosen ? 'chosen' : '';
            return (
              <button key={o.id} className={`choice ${state}`} onClick={() => toggleOption(o.id)} disabled={busy} aria-pressed={isChosen}>
                <span className={`choice-mark ${card.multiple ? 'square' : ''}`}>{result ? (correctIds.includes(o.id) ? '✓' : isChosen ? '✗' : '') : isChosen ? '✓' : ''}</span>
                <span dir="auto">{o.text}</span>
              </button>
            );
          })}
          {!result && <button className="btn filled large" disabled={busy || chosen.length === 0} onClick={() => void send({ optionIds: chosen })}>{t('Prüfen')}</button>}
        </div>
      )}

      {result && (
        <div className={`feedback ${result.correct ? 'correct' : 'wrong'}`}>
          <div className="feedback-title">{result.correct ? t('🎉 Richtig!') : t('🤔 Leider nicht richtig')}</div>
          {!result.correct && card.type === 'input' && result.solution.acceptedAnswers && (
            <div className="feedback-solution">{t('Richtig wäre:')} <strong dir="auto">{result.solution.acceptedAnswers[0]}</strong></div>
          )}
          {result.solution.answerImage && <img src={imageUrl(result.solution.answerImage)} alt="" />}
          {result.solution.answer && <div className="feedback-text" dir="auto">{result.solution.answer}</div>}
          {!result.correct && <div className="feedback-note">{t('Kein Problem – die Karte kommt in der nächsten Runde nochmal.')}</div>}
          <button ref={continueBtn} className="btn filled large" onClick={() => onDone(result)}>{t('Weiter')}</button>
        </div>
      )}
    </div>
  );
}
