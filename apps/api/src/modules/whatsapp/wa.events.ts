import { EventEmitter } from 'events';

// Lightweight module-level event bus for internal WA events.
// Campaign trigger module will subscribe to 'wa.verified' in a later prompt.
export const waEvents = new EventEmitter();
