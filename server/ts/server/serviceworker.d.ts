/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

declare function addEventListener<K extends keyof ServiceWorkerGlobalScopeEventMap>(type: K, listener: (this: DedicatedWorkerGlobalScope, ev: ServiceWorkerGlobalScopeEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
declare function addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
declare function removeEventListener<K extends keyof ServiceWorkerGlobalScopeEventMap>(type: K, listener: (this: DedicatedWorkerGlobalScope, ev: ServiceWorkerGlobalScopeEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
declare function removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;

declare var registration: ServiceWorkerRegistration;

declare var clients: Clients;
declare function skipWaiting(): Promise<void>;

interface WorkerNavigator {
  connection: NetworkInformation;
}

interface NetworkInformation extends EventTarget { }

/**
 * Datenbankeintrag
 */
interface InvoiceRecord {
  id: number;
  last_modified: string;
  date_of_invoice: string;
  date_of_payment: string;
  account: string;
  person: string;
  disbursed_for: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  amount: number;
}

/**
 * Datenbankabfrage
 */
interface InvoiceQuery {
  id?: number | RegExp | [number, number];
  last_modified?: string | [string, string];
  date_of_invoice?: string | RegExp | [string, string];
  date_of_payment?: string | RegExp | [string, string];
  account?: string | RegExp;
  person?: string | RegExp;
  disbursed_for?: string | RegExp;
  category?: string | RegExp;
  description?: string | RegExp;
  quantity?: number | RegExp | [number, number];
  unit?: string | RegExp;
  amount?: number | RegExp | [number, number];
}

// type TransferableData = string | number | boolean | null | object | TransferableData[];
