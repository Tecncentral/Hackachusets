import { IncidentId, IncidentSchema } from '@scenebrief/contracts';
export async function fetchIncident() {
 const response = await fetch(`/api/incidents/${IncidentId}`);
 if (!response.ok) throw new Error('Cannot load incident. Is the API running?');
 return IncidentSchema.parse(await response.json());
}
export async function mutate(path: string, body: unknown = {}) {
 const url = path === 'reset' ? '/api/demo/reset' : `/api/incidents/${IncidentId}/${path}`;
 const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
 const data = await response.json();
 if (!response.ok) throw new Error(data.error ?? 'Request failed');
 return IncidentSchema.parse(data);
}
