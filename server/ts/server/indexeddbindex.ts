/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class IndexedDBIndex<ObjectStoreName extends PropertyKey, Record> extends EventTarget {
  [Symbol.toStringTag] = "IndexedDBIndex";

  readonly STATE_CLOSED = 0;
  readonly STATE_UPGRADING = 1;
  readonly STATE_IDLE = 2;
  readonly STATE_OPERATING = 4;

  #index: IDBIndex;
  #state: number = this.STATE_CLOSED;
  #queue: (() => Promise<void>)[] = [];
  async #ready(): Promise<void> {
    if (this.#state == this.STATE_CLOSED) {
      this.#index = this.#index.objectStore.transaction.db.transaction([this.#index.objectStore.name], this.#index.objectStore.transaction.mode).objectStore(this.#index.objectStore.name).index(this.#index.name);

      this.dispatchEvent(new IndexedDBEvent("statechange", {
        cancelable: false,
        function: "statechange",
        arguments: null,
        result: this.STATE_IDLE
      }));
      this.#state = this.STATE_IDLE;
      // console.log("IndexedDBIndex: idle");
    }
  }

  get state() {
    return this.#state;
  }
  get name() {
    return this.#index.name;
  }
  get objectStoreName() {
    return <ObjectStoreName>this.#index.objectStore.name;
  }
  get keyPath() {
    return this.#index.keyPath;
  }
  get multiEntry() {
    return this.#index.multiEntry;
  }
  get unique() {
    return this.#index.unique;
  }
  get mode() {
    return this.#index.objectStore.transaction.mode;
  }

  constructor(index: IDBIndex) {
    super();

    this.#index = index;
    this.#index.objectStore.transaction.addEventListener("complete", () => {
      if (this.#state == this.STATE_OPERATING) {
        this.#index = this.#index.objectStore.transaction.db.transaction([this.#index.objectStore.name], this.#index.objectStore.transaction.mode).objectStore(this.#index.objectStore.name).index(this.#index.name);
      } else {
        this.dispatchEvent(new IndexedDBEvent("statechange", {
          cancelable: false,
          function: "statechange",
          arguments: null,
          result: this.STATE_CLOSED
        }));
        this.#state = this.STATE_CLOSED;
        // console.log("IndexedDBIndex: closed");
      }
    });
    this.#index.objectStore.transaction.addEventListener("abort", () => {
      this.dispatchEvent(new IndexedDBEvent("statechange", {
        cancelable: false,
        function: "statechange",
        arguments: null,
        result: this.STATE_CLOSED
      }));
      this.#state = this.STATE_CLOSED;
      // console.log("IndexedDBIndex: closed");
    });

    this.dispatchEvent(new IndexedDBEvent("statechange", {
      cancelable: false,
      function: "statechange",
      arguments: null,
      result: this.STATE_IDLE
    }));
    this.#state = this.STATE_IDLE;
    // console.log("IndexedDBIndex: idle");
  }

  async #dequeue() {
    await this.#ready();
    if (this.#state == this.STATE_IDLE && this.#queue.length > 0) {
      this.dispatchEvent(new IndexedDBEvent("statechange", {
        cancelable: false,
        function: "statechange",
        arguments: null,
        result: this.STATE_OPERATING
      }));
      this.#state = this.STATE_OPERATING;
      // console.log("IndexedDBIndex: operating");
      let task: (() => Promise<void> | void);
      while (this.#state == this.STATE_OPERATING && (task = this.#queue.shift())) {
        try {
          await task();
        } catch (error) {
          console.error(error);
        }
      }
      if (this.#state == this.STATE_OPERATING) {
        this.dispatchEvent(new IndexedDBEvent("statechange", {
          cancelable: false,
          function: "statechange",
          arguments: null,
          result: this.STATE_IDLE
        }));
        this.#state = this.STATE_IDLE;
        // console.log("IndexedDBIndex: idle");
      }
    }
  }

  #get(query: IndexedDBQuery<Record> | ((record: Record) => boolean | Promise<boolean>)): Promise<IndexedDBRecord<Record>[]> {
    let results: IndexedDBRecord<Record>[] = [];
    return this.#cursor(typeof query == "function" ? async cursor => {
      if (await query(cursor.value)) {
        results.push(cursor.value);
      }
    } : cursor => {
      if (this.#record_matches_query(cursor.value, query)) {
        results.push(cursor.value);
      }
    }).then(() => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("success", {
        cancelable: false,
        function: "get",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        result: results
      }));
      return results
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("error", {
        cancelable: false,
        function: "get",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        error: reason
      }));
      throw reason;
    });
  }
  #getAll(): Promise<IndexedDBRecord<Record>[]> {
    return new Promise(async (resolve, reject) => {
      await this.#ready();
      let request = this.#index.getAll();
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("success", {
          cancelable: false,
          function: "get",
          arguments: {
            objectStoreName: this.objectStoreName,
            callback: null,
            query: null
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("error", {
          cancelable: false,
          function: "get",
          arguments: {
            objectStoreName: this.objectStoreName,
            callback: null,
            query: null
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }

  #count(query: IndexedDBQuery<Record> | ((record: Record) => boolean | Promise<boolean>)): Promise<number> {
    let results = 0;
    return this.#cursor(typeof query == "function" ? async cursor => {
      if (await query(cursor.value)) {
        results++;
      }
    } : cursor => {
      if (this.#record_matches_query(cursor.value, query)) {
        results++;
      }
    }).then(() => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("success", {
        cancelable: false,
        function: "count",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        result: results
      }));
      return results
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("error", {
        cancelable: false,
        function: "count",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        error: reason
      }));
      throw reason;
    });
  }
  #countAll(): Promise<number> {
    return new Promise(async (resolve, reject) => {
      await this.#ready();
      let request = this.#index.count();
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("success", {
          cancelable: false,
          function: "count",
          arguments: {
            objectStoreName: this.objectStoreName,
            callback: null,
            query: null
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("error", {
          cancelable: false,
          function: "count",
          arguments: {
            objectStoreName: this.objectStoreName,
            callback: null,
            query: null
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }

  #delete(query: IndexedDBQuery<Record> | ((record: Record) => boolean | Promise<boolean>)): Promise<void> {
    return this.#cursor(typeof query == "function" ? async cursor => {
      if (await query(cursor.value)) {
        await new Promise<void>((resolve, reject) => {
          let request = cursor.delete();
          request.addEventListener("success", () => {
            resolve();
          });
          request.addEventListener("error", () => reject(request.error));
        });
      }
    } : async cursor => {
      if (this.#record_matches_query(cursor.value, query)) {
        await new Promise<void>((resolve, reject) => {
          let request = cursor.delete();
          request.addEventListener("success", () => {
            resolve();
          });
          request.addEventListener("error", () => reject(request.error));
        });
      }
    }).then(() => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("success", {
        cancelable: false,
        function: "delete",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        result: null
      }));
      return null;
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("error", {
        cancelable: false,
        function: "delete",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        error: reason
      }));
      throw reason;
    });
  }
  #deleteAll(): Promise<void> {
    return this.#cursor(async cursor => {
      await new Promise<void>((resolve, reject) => {
        let request = cursor.delete();
        request.addEventListener("success", () => {
          resolve();
        });
        request.addEventListener("error", () => reject(request.error));
      });
    }).then(() => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("success", {
        cancelable: false,
        function: "delete",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: null,
          query: null
        },
        result: null
      }));
      return null;
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<ObjectStoreName, Record, keyof IndexedDBEventInitMap<ObjectStoreName, Record>>("error", {
        cancelable: false,
        function: "delete",
        arguments: {
          objectStoreName: this.objectStoreName,
          callback: null,
          query: null
        },
        error: reason
      }));
      throw reason;
    });
  }

  #cursor(callback: (cursor: IDBCursorWithValue) => void): Promise<void> {
    return new Promise(async (resolve, reject) => {
      await this.#ready();
      let request = this.#index.openCursor();
      request.addEventListener("success", () => {
        let cursor = request.result;
        if (cursor) {
          callback(cursor);
          cursor.continue();
        } else {
          resolve();
        }
      });
      request.addEventListener("error", () => {
        reject(request.error);
      });
    });
  }

  #record_matches_query(record: IndexedDBRecord<Record>, query: IndexedDBQuery<Record>): boolean {
    if (query) {
      let property: string;
      for (property in query) {
        if (
          typeof query[property] != typeof record[property] &&
          typeof query[property] == "object" &&
          query[property]
        ) {
          if (
            query[property] instanceof RegExp &&
            !query[property].test(record[property])
          ) {
            return false;
          } else if (
            query[property] instanceof Array &&
            query[property].length == 2 &&
            record[property] < query[property][0] ||
            record[property] > query[property][1]
          ) {
            return false;
          }
        } else if (record[property] != query[property]) {
          return false;
        }
      }
    }
    return true;
  }

  /** Gets all items */
  get(): Promise<IndexedDBRecord<Record>[]>;
  /** Gets all items matching the query */
  get(query: IndexedDBQuery<Record>): Promise<IndexedDBRecord<Record>[]>;
  /** Gets every item for which `true` is returned by the callback  */
  get(callback: (record: Record) => boolean): Promise<IndexedDBRecord<Record>[]>;
  get(query: IndexedDBQuery<Record> | ((record: Record) => boolean) = null): Promise<IndexedDBRecord<Record>[]> {
    return new Promise((resolve, reject) => {
      if (query) {
        this.#queue.push(() => this.#get(query).then(resolve, reject));
      } else {
        this.#queue.push(() => this.#getAll().then(resolve, reject));
      }
      this.#dequeue();
    });
  }

  /** Counts all items */
  count(): Promise<number>;
  /** Counts all items matching the query */
  count(query: IndexedDBQuery<Record>): Promise<number>;
  /** Counts every item for which `true` is returned by the callback  */
  count(callback: (record: Record) => boolean): Promise<number>;
  count(query: IndexedDBQuery<Record> | ((record: Record) => boolean) = null): Promise<number> {
    return new Promise((resolve, reject) => {
      if (query) {
        this.#queue.push(() => this.#count(query).then(resolve, reject));
      } else {
        this.#queue.push(() => this.#countAll().then(resolve, reject));
      }
      this.#dequeue();
    });
  }

  /** Deletes all items */
  delete(): Promise<void>;
  /** Deletes all items matching the query */
  delete(query: IndexedDBQuery<Record>): Promise<void>;
  /** Deletes every item for which `true` is returned by the callback  */
  delete(callback: (record: Record) => boolean | Promise<boolean>): Promise<void>;
  delete(query: IndexedDBQuery<Record> | ((record: Record) => boolean | Promise<boolean>) = null): Promise<void> {
    if (this.#index.objectStore.transaction.mode != "readwrite") {
      return Promise.reject(new DOMException(`Failed to execute 'delete' on '${this.constructor.name}': The record may not be deleted inside a read-only transaction.`, "ReadOnlyError"));
    }
    return new Promise((resolve, reject) => {
      if (query) {
        this.#queue.push(() => this.#delete(query).then(resolve, reject));
      } else {
        this.#queue.push(() => this.#deleteAll().then(resolve, reject));
      }
      this.#dequeue();
    });
  }

  #staticEvents: Map<keyof IndexedDBIndexEventMap<ObjectStoreName>, (this: IndexedDBIndex<ObjectStoreName, Record>, event: IndexedDBIndexEventMap<ObjectStoreName>[keyof IndexedDBIndexEventMap<ObjectStoreName>]) => any> = new Map();
  get onsuccess() {
    return this.#staticEvents.get("success") || null;
  }
  set onsuccess(value: (this: IndexedDBIndex<ObjectStoreName, Record>, event: IndexedDBIndexEventMap<ObjectStoreName>["success"]) => any) {
    if (this.#staticEvents.has("success")) {
      this.removeEventListener("success", <EventListener>this.#staticEvents.get("success"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("success", value);
      this.addEventListener("success", <EventListener>value);
    } else {
      this.#staticEvents.delete("success");
    }
  }
  get onerror() {
    return this.#staticEvents.get("error") || null;
  }
  set onerror(value: (this: IndexedDBIndex<ObjectStoreName, Record>, event: IndexedDBIndexEventMap<ObjectStoreName>["error"]) => any) {
    if (this.#staticEvents.has("error")) {
      this.removeEventListener("error", <EventListener>this.#staticEvents.get("error"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("error", value);
      this.addEventListener("error", <EventListener>value);
    } else {
      this.#staticEvents.delete("error");
    }
  }
}

interface IndexedDBIndex<ObjectStoreName, Record> {
  addEventListener<K extends keyof IndexedDBIndexEventMap<ObjectStoreName>>(type: K, listener: (this: IndexedDBIndex<ObjectStoreName, Record>, event: IndexedDBIndexEventMap<ObjectStoreName>[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void;
}

interface IndexedDBIndexEventMap<ObjectStoreName extends PropertyKey> {
  success: IndexedDBEvent<ObjectStoreName, string, keyof IndexedDBEventInitMap<ObjectStoreName, string>>;
  error: IndexedDBEvent<ObjectStoreName, string, keyof IndexedDBEventInitMap<ObjectStoreName, string>>;
}
