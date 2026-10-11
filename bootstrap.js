// Small entry point: a failed runtime import must not make every entrance disappear.
import { mountEntry } from './src/entry.js';
mountEntry(async () => (await import('./index.js')).initializeWuku());
