import type { ScreenProps } from '../../types';
export function PatientPage({ incident, busy, act }: ScreenProps) {
 return <section><h2>Prepare your emergency profile</h2><p>{incident.patient.name}</p>
 <p>Apple Watch and WHOOP records are synthetic fixtures. No device account is connected and nobody is monitoring this profile.</p>
 <label className="row"><input type="checkbox" checked={incident.patient.sharing} disabled={busy} onChange={e => void act('sharing', { sharing: e.target.checked })}/> Enable fictional emergency sharing</label>
 <article><h3>Demo patient code</h3><code>{incident.patient.id}</code><p>The responder enters this identifier and confirms the patient association. This is not production authentication.</p></article></section>;
}
