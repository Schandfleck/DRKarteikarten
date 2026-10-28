import { api, formatDate, type AuditEntry } from '../api.ts';
import { Loading, useLoad } from '../components/ui.tsx';

export function AuditPage() {
  const { data, error, reload } = useLoad(() => api.get<{ entries: AuditEntry[] }>('/audit?limit=500').then((r) => r.entries));
  return (
    <div className="page">
      <div className="page-head">
        <h1>Protokoll</h1>
        <button className="btn" onClick={() => void reload()}>Aktualisieren</button>
      </div>
      <p className="muted">Wer hat wann was geändert. Passwörter werden hier nie protokolliert.</p>
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <div className="panel">
          <table className="table table-compact">
            <thead><tr><th>Zeitpunkt</th><th>Wer</th><th>Aktion</th><th>Details</th></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{formatDate(e.at)}</td>
                  <td>{e.actor}</td>
                  <td>{e.action}</td>
                  <td className="muted">{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
