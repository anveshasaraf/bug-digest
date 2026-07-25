/**
 * Message contract between the main-world capture script, the isolated-world
 * content script, and the background service worker.
 *
 * main-world.ts -> (window.postMessage) -> content.ts -> (chrome.runtime.sendMessage) -> background/index.ts
 */
import type { RawEvent } from './types';

/** Marker on window.postMessage payloads so content.ts can ignore unrelated page messages. */
export const MAIN_WORLD_SOURCE = 'bug-digest-main' as const;

export interface MainWorldEventMessage {
  source: typeof MAIN_WORLD_SOURCE;
  type: 'event';
  payload: RawEvent;
}

export interface MainWorldPageInitMessage {
  source: typeof MAIN_WORLD_SOURCE;
  type: 'page-init';
  url: string;
  ts: number;
}

export type MainWorldMessage = MainWorldEventMessage | MainWorldPageInitMessage;

/** chrome.runtime message types exchanged between content.ts, the popup, and the background worker. */
export const RELAY_EVENT = 'bug-digest:relay-event' as const;
export const RELAY_PAGE_INIT = 'bug-digest:relay-page-init' as const;
export const GET_DIGEST = 'bug-digest:get-digest' as const;
export const CLEAR_BUFFER = 'bug-digest:clear-buffer' as const;

export interface RelayEventMessage {
  type: typeof RELAY_EVENT;
  event: RawEvent;
}

export interface RelayPageInitMessage {
  type: typeof RELAY_PAGE_INIT;
  url: string;
  ts: number;
}

/** Sent by the popup for a specific tab (a popup has no "current tab" of its own). */
export interface GetDigestMessage {
  type: typeof GET_DIGEST;
  tabId: number;
}

export interface ClearBufferMessage {
  type: typeof CLEAR_BUFFER;
  tabId: number;
}

export type RuntimeMessage = RelayEventMessage | RelayPageInitMessage | GetDigestMessage | ClearBufferMessage;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isRawEvent(v: unknown): v is RawEvent {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  if (!isFiniteNumber(e.ts)) return false;

  switch (e.kind) {
    case 'console':
      return (
        (e.level === 'error' || e.level === 'warn') &&
        typeof e.message === 'string' &&
        (e.stack === undefined || typeof e.stack === 'string')
      );
    case 'exception':
      return (
        typeof e.message === 'string' &&
        (e.stack === undefined || typeof e.stack === 'string') &&
        (e.filename === undefined || typeof e.filename === 'string') &&
        (e.lineno === undefined || isFiniteNumber(e.lineno)) &&
        (e.colno === undefined || isFiniteNumber(e.colno))
      );
    case 'rejection':
      return typeof e.message === 'string' && (e.stack === undefined || typeof e.stack === 'string');
    case 'network':
      return (
        typeof e.method === 'string' &&
        typeof e.url === 'string' &&
        (e.status === null || isFiniteNumber(e.status)) &&
        isFiniteNumber(e.durationMs)
      );
    default:
      return false;
  }
}

/** Runtime shape validation for messages crossing the main-world -> isolated-world boundary. */
export function isMainWorldMessage(data: unknown): data is MainWorldMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.source !== MAIN_WORLD_SOURCE) return false;

  if (d.type === 'event') return isRawEvent(d.payload);
  if (d.type === 'page-init') return typeof d.url === 'string' && isFiniteNumber(d.ts);
  return false;
}
