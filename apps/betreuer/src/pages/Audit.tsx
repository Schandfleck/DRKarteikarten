import { api, formatDate, type AuditEntry } from '../api.ts';
import { t } from '../i18n.ts';
import { Loading, useLoad } from '../components/ui.tsx';

export function AuditPage() {
  const { data, error, reload } = useLoad(() => api.get<{ entries: AuditEntry[] }>('/audit?limit=500').then((r) => r.entries));
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('Protokoll')}</h1>
        <button className="btn" onClick={() => void reload()}>{t('Aktualisieren')}</button>
      </div>
      <p className="muted">{t('Wer hat wann was geändert. Passwörter werden hier nie protokolliert.')}</p>
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <div className="panel">
          <table className="table table-compact">
            <thead><tr><th>{t('Zeitpunkt')}</th><th>{t('Wer')}</th><th>{t('Aktion')}</th><th>{t('Details')}</th></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{formatDate(e.at)}</td>
                  <td><bdi>{e.actor}</bdi></td>
                  <td>{t(e.action)}</td>
                  <td className="muted" dir="auto">{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
