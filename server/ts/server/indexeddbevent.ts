/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class IndexedDBEvent<ObjectStoreName extends PropertyKey, Record, EventType extends keyof IndexedDBEventInitMap<ObjectStoreName, Record>> extends Event {
  [Symbol.toStringTag] = "IndexedDBEvent";

  readonly function: EventType;
  readonly arguments: IndexedDBEventInitMap<ObjectStoreName, Record>[EventType]["arguments"];
  readonly result: IndexedDBEventInitMap<ObjectStoreName, Record>[EventType]["result"];
  readonly error: DOMException;

  constructor(type: string, eventInitDict?: IndexedDBEventInit<ObjectStoreName, Record, EventType>) {
    super(type, eventInitDict);

    this.function = eventInitDict.function || null;
    this.arguments = eventInitDict.arguments || null;
    this.result = eventInitDict.result || null;
    this.error = eventInitDict.error || null;
  }
}

interface IndexedDBEventInit<ObjectStoreName extends PropertyKey, Record, EventType extends keyof IndexedDBEventInitMap<ObjectStoreName, Record>> extends EventInit {
  function?: EventType;
  arguments?: IndexedDBEventInitMap<ObjectStoreName, Record>[EventType]["arguments"];
  result?: IndexedDBEventInitMap<ObjectStoreName, Record>[EventType]["result"];
  error?: DOMException;
}

interface IndexedDBEventInitMap<ObjectStoreName extends PropertyKey, Record> {
  statechange: {
    arguments: null;
    result: number;
  }
  open: {
    arguments: {
      name: string;
      version: number;
      objectStoreDefinitions: { [K in ObjectStoreName]: IDBObjectStoreDefinition<K, string>; };
    };
    result: IDBDatabase;
  }
  add: {
    arguments: {
      objectStoreName: ObjectStoreName;
      record: IndexedDBRecord<Record>;
    };
    result: IDBValidKey;
  }
  put: {
    arguments: {
      objectStoreName: ObjectStoreName;
      record: IndexedDBRecord<Record>;
    };
    result: IDBValidKey;
  }
  get: {
    arguments: {
      objectStoreName: ObjectStoreName;
      callback: null | ((record: Record) => boolean | Promise<boolean>);
      query: null | IndexedDBQuery<Record>;
    };
    result: IndexedDBRecord<Record>[];
  }
  delete: {
    arguments: {
      objectStoreName: ObjectStoreName;
      callback: null | ((record: Record) => boolean | Promise<boolean>);
      query: null | IndexedDBQuery<Record>;
    };
    result: null;
  }
  count: {
    arguments: {
      objectStoreName: ObjectStoreName;
      callback: null | ((record: Record) => boolean | Promise<boolean>);
      query: null | IndexedDBQuery<Record>;
    };
    result: number;
  }
}
