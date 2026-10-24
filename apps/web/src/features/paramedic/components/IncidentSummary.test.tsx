import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IncidentProvider, patientScoped, type Incident, type Platform } from '../../../platform';
import { makePlatform, matched, temp } from '../../../test-helpers';
import { IncidentSummary } from './IncidentSummary';

const render = (platform: Platform, incident: Incident) => renderToStaticMarkup(
  <IncidentProvider platform={platform} pollMs={1e9}><IncidentSummary incident={patientScoped(incident)} /></IncidentProvider>
);

describe('IncidentSummary', () => {
  it('shows “Unidentified patient”, hides profile and wearable background when unmatched', async () => {
    const { platform } = makePlatform();
    const html = render(platform, await platform.getIncident());
    expect(html).toContain('Unidentified patient');
    expect(html).toContain('Identify patient (optional)');
    expect(html).not.toContain('Alex Morgan');
    expect(html).not.toContain('Wearable background (optional)');
    expect(html).toContain('No wearable data — not needed for documentation.');
  });

  it('shows profile context (self-reported) and the wearable toggle once matched', async () => {
    const { platform, incident } = await matched();
    const html = render(platform, incident);
    expect(html).toContain('Alex Morgan (fictional)');
    expect(html).toContain('No known drug allergies');
    expect(html).toContain('self-reported, not verified');
    expect(html).toContain('Wearable background (optional)');
  });

  it('renders Collapse as Unknown with the fixed caption, and the recorded call/arrival times', async () => {
    const { platform, incident } = await matched();
    const html = render(platform, incident);
    expect(html).toMatch(/Collapse<\/dt><dd><span class="chip chip-unknown">Unknown/);
    expect(html).toContain('Discovery time and device fall events do not establish collapse time.');
    expect(html).toContain('10:44');
    expect(html).toContain('10:55');
  });

  it('states “Not yet measured” when no clinical temperature exists', async () => {
    const { platform, incident } = await matched();
    const html = render(platform, incident);
    expect(html).toContain('Not yet measured');
    expect(html).toContain('A wearable skin reading is not a core temperature.');
  });

  it('flags a clinical temperature whose site is unknown', async () => {
    const { platform, incident } = await matched();
    const next = await platform.addMeasurement(temp(incident, 41.2, '2026-10-24T15:02:00Z', 'before_cooling', { site: 'unknown' }));
    const html = render(platform, next);
    expect(html).toContain('41.2 °C');
    expect(html).toContain('Method/site unknown');
  });

  it('does not treat a skin-temperature reading as a clinical temperature', async () => {
    const { platform, incident } = await matched();
    const next = await platform.addMeasurement(temp(incident, 38.5, '2026-10-24T15:02:00Z', 'unknown', { kind: 'skin_temperature', site: null, deviceClass: 'consumer' }));
    expect(render(platform, next)).toContain('Not yet measured');
  });
});
