import type { Incident } from '@scenebrief/contracts';
export interface ScreenProps { incident: Incident; busy: boolean; act: (path: string, body?: unknown) => Promise<void> }
