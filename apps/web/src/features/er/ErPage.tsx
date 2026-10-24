import type { ScreenProps } from '../../types';
export function ErPage({ incident }: ScreenProps) {
 const latest = incident.handoffs.at(-1);
 return <section><h2>Receiving ER</h2><p>Refreshes every two seconds while this page is open. No hospital system is connected.</p>
 {!latest ? <article>No reviewed handoff has been shared.</article> : <article><h3>Reviewed handoff · Version {latest.version}</h3><p>Reviewed by {latest.reviewedBy} at {latest.reviewedAt}</p>
 {latest.revision !== incident.revision && <p className="notice">New incident information exists. This reviewed version has not yet been amended.</p>}
 <pre>{latest.text}</pre>
 <h3>Source evidence for this version</h3>{incident.sources.filter(s => latest.text.includes(s.id) || ['workout','fall'].includes(s.id)).map(s => <details key={s.id}><summary>{s.label}</summary><p>{s.text}</p></details>)}</article>}
 {incident.handoffs.length > 1 && <details><summary>Earlier reviewed versions</summary>{incident.handoffs.slice(0,-1).map(h => <pre key={h.version}>Version {h.version}{'\n'}{h.text}</pre>)}</details>}</section>;
}
