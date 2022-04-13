/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class IndexedDB<ObjectStoreDefinitionMap extends { [ObjectStoreName in string]: IDBDefinition<object, string> }> extends EventTarget {
  [Symbol.toStringTag] = "IndexedDB";

  static readonly STATE_CLOSED = 0;
  static readonly STATE_UPGRADING = 1;
  static readonly STATE_IDLE = 2;
  static readonly STATE_OPERATING = 4;
  readonly STATE_CLOSED = IndexedDB.STATE_CLOSED;
  readonly STATE_UPGRADING = IndexedDB.STATE_UPGRADING;
  readonly STATE_IDLE = IndexedDB.STATE_IDLE;
  readonly STATE_OPERATING = IndexedDB.STATE_OPERATING;

  #idb: IDBDatabase;
  #state: number = this.STATE_CLOSED;
  #queue: (() => Promise<void> | void)[] = [];
  #ready: Promise<this>;
  #name: string;
  #version: number;

  get ready() {
    return this.#ready;
  }
  get state() {
    return this.#state;
  }
  get name() {
    return this.#name;
  }
  get version() {
    return this.#version;
  }

  constructor(name: string, version: number, objectStoreDefinitions: { [K in keyof ObjectStoreDefinitionMap]?: IDBObjectStoreDefinition<K, ObjectStoreDefinitionMap[K]["Indices"]> }) {
    super();

    this.#name = name;
    this.#version = version;

    this.#ready = new Promise((resolve, reject) => {
      let request = indexedDB.open(name, version);
      request.addEventListener("success", () => {
        this.#version = request.result.version;
        this.#idb = request.result;
        this.dispatchEvent(new IndexedDBEvent("statechange", {
          cancelable: false,
          function: "statechange",
          arguments: null,
          result: this.STATE_IDLE
        }));
        this.#state = this.STATE_IDLE;
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
          cancelable: false,
          function: "open",
          arguments: {
            name,
            version,
            objectStoreDefinitions: <{ [K in keyof ObjectStoreDefinitionMap]: IDBObjectStoreDefinition<K, ObjectStoreDefinitionMap[K]["Indices"]> }>objectStoreDefinitions
          },
          result: request.result
        }));
        resolve(this);
      });
      request.addEventListener("upgradeneeded", () => {
        this.#version = request.result.version;
        this.dispatchEvent(new IndexedDBEvent("statechange", {
          cancelable: false,
          function: "statechange",
          arguments: null,
          result: this.STATE_UPGRADING
        }));
        this.#state = this.STATE_UPGRADING;
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("upgradeneeded", {
          cancelable: false,
          function: "open",
          arguments: {
            name,
            version,
            objectStoreDefinitions: <{ [K in keyof ObjectStoreDefinitionMap]: IDBObjectStoreDefinition<K, ObjectStoreDefinitionMap[K]["Indices"]> }>objectStoreDefinitions
          },
          result: request.result
        }));

        Object.keys(objectStoreDefinitions).forEach(objectStoreName => {
          let objectStoreDefinition = objectStoreDefinitions[objectStoreName];
          let objectStore = request.result.createObjectStore(objectStoreDefinition.name, objectStoreDefinition);
          objectStoreDefinition.indices.forEach(index => {
            objectStore.createIndex(index.name, index.keyPath, index);
          });
        });
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
          cancelable: false,
          function: "open",
          arguments: {
            name,
            version,
            objectStoreDefinitions: <{ [K in keyof ObjectStoreDefinitionMap]: IDBObjectStoreDefinition<K, ObjectStoreDefinitionMap[K]["Indices"]> }>objectStoreDefinitions
          },
          error: request.error
        }));
        this.dispatchEvent(new IndexedDBEvent("statechange", {
          cancelable: false,
          function: "statechange",
          arguments: null,
          result: this.STATE_CLOSED
        }));
        this.#state = this.STATE_CLOSED;
        reject(request.error);
      });
      request.addEventListener("blocked", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("blocked", {
          cancelable: false,
          function: "open",
          arguments: {
            name,
            version,
            objectStoreDefinitions: <{ [K in keyof ObjectStoreDefinitionMap]: IDBObjectStoreDefinition<K, ObjectStoreDefinitionMap[K]["Indices"]> }>objectStoreDefinitions
          },
          error: request.error
        }));
        this.dispatchEvent(new IndexedDBEvent("statechange", {
          cancelable: false,
          function: "statechange",
          arguments: null,
          result: this.STATE_CLOSED
        }));
        this.#state = this.STATE_CLOSED;
        reject(request.error);
      });
    });
  }

  async #dequeue() {
    if (this.#state == this.STATE_IDLE && this.#queue.length > 0) {
      this.dispatchEvent(new IndexedDBEvent("statechange", {
        cancelable: false,
        function: "statechange",
        arguments: null,
        result: this.STATE_OPERATING
      }));
      this.#state = this.STATE_OPERATING;
      // console.log("IndexedDB: operating");
      let task: (() => Promise<void> | void);
      while (task = this.#queue.shift()) {
        try {
          await task();
        } catch (error) {
          console.error(error);
        }
      }
      this.dispatchEvent(new IndexedDBEvent("statechange", {
        cancelable: false,
        function: "statechange",
        arguments: null,
        result: this.STATE_IDLE
      }));
      this.#state = this.STATE_IDLE;
      // console.log("IndexedDB: idle");
    }
  }

  #add<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<IDBValidKey> {
    return new Promise(async (resolve, reject) => {
      await this.#ready;
      let request = this.#idb.transaction([<string>objectStoreName], "readwrite").objectStore(<string>objectStoreName).add(record);
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
          cancelable: false,
          function: "add",
          arguments: {
            objectStoreName,
            record,
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
          cancelable: false,
          function: "add",
          arguments: {
            objectStoreName,
            record
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }
  #put<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<IDBValidKey> {
    return new Promise(async (resolve, reject) => {
      await this.#ready;
      let request = this.#idb.transaction([<string>objectStoreName], "readwrite").objectStore(<string>objectStoreName).put(record);
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
          cancelable: false,
          function: "put",
          arguments: {
            objectStoreName,
            record
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
          cancelable: false,
          function: "put",
          arguments: {
            objectStoreName,
            record
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }

  #get<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> | ((record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>)): Promise<IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[]> {
    let results: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[] = [];
    return this.#cursor(objectStoreName, "readonly", typeof query == "function" ? async cursor => {
      if (await query(cursor.value)) {
        results.push(cursor.value);
      }
    } : cursor => {
      if (this.#record_matches_query(cursor.value, query)) {
        results.push(cursor.value);
      }
    }).then(() => {
      this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
        cancelable: false,
        function: "get",
        arguments: {
          objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        result: results
      }));
      return results
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
        cancelable: false,
        function: "get",
        arguments: {
          objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        error: reason
      }));
      throw reason;
    });
  }
  #getAll<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName): Promise<IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[]> {
    return new Promise(async (resolve, reject) => {
      await this.#ready;
      let request = this.#idb.transaction([<string>objectStoreName], "readonly").objectStore(<string>objectStoreName).getAll();
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
          cancelable: false,
          function: "get",
          arguments: {
            objectStoreName,
            callback: null,
            query: null
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
          cancelable: false,
          function: "get",
          arguments: {
            objectStoreName,
            callback: null,
            query: null
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }

  #count<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> | ((record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>)): Promise<number> {
    let results = 0;
    return this.#cursor(objectStoreName, "readonly", typeof query == "function" ? async cursor => {
      if (await query(cursor.value)) {
        results++;
      }
    } : cursor => {
      if (this.#record_matches_query(cursor.value, query)) {
        results++;
      }
    }).then(() => {
      this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
        cancelable: false,
        function: "count",
        arguments: {
          objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        result: results
      }));
      return results
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
        cancelable: false,
        function: "count",
        arguments: {
          objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        error: reason
      }));
      throw reason;
    });
  }
  #countAll<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName): Promise<number> {
    return new Promise(async (resolve, reject) => {
      await this.#ready;
      let request = this.#idb.transaction([<string>objectStoreName]).objectStore(<string>objectStoreName).count();
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
          cancelable: false,
          function: "count",
          arguments: {
            objectStoreName,
            callback: null,
            query: null
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
          cancelable: false,
          function: "count",
          arguments: {
            objectStoreName,
            callback: null,
            query: null
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }

  #delete<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> | ((record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>)): Promise<void> {
    return this.#cursor(objectStoreName, "readwrite", typeof query == "function" ? async cursor => {
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
      this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
        cancelable: false,
        function: "delete",
        arguments: {
          objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        result: null
      }));
      return null;
    }, reason => {
      this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
        cancelable: false,
        function: "delete",
        arguments: {
          objectStoreName,
          callback: typeof query == "function" ? query : null,
          query: typeof query == "function" ? null : query
        },
        error: reason
      }));
      throw reason;
    });
  }
  #deleteAll<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName): Promise<void> {
    return new Promise(async (resolve, reject) => {
      await this.#ready;
      let request = this.#idb.transaction([<string>objectStoreName], "readwrite").objectStore(<string>objectStoreName).clear();
      request.addEventListener("success", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("success", {
          cancelable: false,
          function: "delete",
          arguments: {
            objectStoreName,
            callback: null,
            query: null
          },
          result: request.result
        }));
        resolve(request.result);
      });
      request.addEventListener("error", () => {
        this.dispatchEvent(new IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[ObjectStoreName]["Records"], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>("error", {
          cancelable: false,
          function: "delete",
          arguments: {
            objectStoreName,
            callback: null,
            query: null
          },
          error: request.error
        }));
        reject(request.error);
      });
    });
  }

  #cursor<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, mode: IDBTransactionMode, callback: (cursor: IDBCursorWithValue) => void | Promise<void>): Promise<void> {
    return new Promise(async (resolve, reject) => {
      await this.#ready;
      let request = this.#idb.transaction([<string>objectStoreName], mode).objectStore(<string>objectStoreName).openCursor();
      request.addEventListener("success", async () => {
        let cursor = request.result;
        if (cursor) {
          await callback(cursor);
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

  #record_matches_query<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): boolean {
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

  add<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<IDBValidKey> {
    return new Promise((resolve, reject) => {
      this.#queue.push(() => this.#add(objectStoreName, record).then(resolve, reject));
      this.#dequeue();
    });
  }

  put<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<IDBValidKey> {
    return new Promise((resolve, reject) => {
      this.#queue.push(() => this.#put(objectStoreName, record).then(resolve, reject));
      this.#dequeue();
    });
  }

  /** Gets all items */
  get<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName): Promise<IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[]>;
  /** Gets all items matching the query */
  get<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[]>;
  /** Gets every item for which `true` is returned by the callback  */
  get<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, callback: (record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>): Promise<IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[]>;
  get<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> | ((record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>) = null): Promise<IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>[]> {
    return new Promise((resolve, reject) => {
      if (query) {
        this.#queue.push(() => this.#get(objectStoreName, query).then(resolve, reject));
      } else {
        this.#queue.push(() => this.#getAll(objectStoreName).then(resolve, reject));
      }
      this.#dequeue();
    });
  }

  /** Deletes all items */
  delete<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName): Promise<void>;
  /** Deletes all items matching the query */
  delete<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<void>;
  /** Deletes every item for which `true` is returned by the callback  */
  delete<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, callback: (record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>): Promise<void>;
  delete<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> | ((record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>) = null): Promise<void> {
    return new Promise((resolve, reject) => {
      if (query) {
        this.#queue.push(() => this.#delete(objectStoreName, query).then(resolve, reject));
      } else {
        this.#queue.push(() => this.#deleteAll(objectStoreName).then(resolve, reject));
      }
      this.#dequeue();
    });
  }

  /** Counts all items */
  count<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName): Promise<number>;
  /** Counts all items matching the query */
  count<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>): Promise<number>;
  /** Counts every item for which `true` is returned by the callback  */
  count<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, callback: (record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>): Promise<number>;
  count<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, query: IndexedDBQuery<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> | ((record: IndexedDBRecord<ObjectStoreDefinitionMap[ObjectStoreName]["Records"]>) => boolean | Promise<boolean>) = null): Promise<number> {
    return new Promise((resolve, reject) => {
      if (query) {
        this.#queue.push(() => this.#count(objectStoreName, query).then(resolve, reject));
      } else {
        this.#queue.push(() => this.#countAll(objectStoreName).then(resolve, reject));
      }
      this.#dequeue();
    });
  }

  index<ObjectStoreName extends keyof ObjectStoreDefinitionMap>(objectStoreName: ObjectStoreName, index: ObjectStoreDefinitionMap[ObjectStoreName]["Indices"], mode: IDBTransactionMode = "readonly"): IndexedDBIndex<ObjectStoreName, ObjectStoreDefinitionMap[ObjectStoreName]["Records"]> {
    return new IndexedDBIndex(this.#idb.transaction([<string>objectStoreName], mode).objectStore(<string>objectStoreName).index(index));
  }

  #staticEvents: Map<keyof IndexedDBEventMap<ObjectStoreDefinitionMap>, (this: IndexedDB<ObjectStoreDefinitionMap>, event: IndexedDBEventMap<ObjectStoreDefinitionMap>[keyof IndexedDBEventMap<ObjectStoreDefinitionMap>]) => any> = new Map();
  get onsuccess() {
    return this.#staticEvents.get("success") || null;
  }
  set onsuccess(value: (this: IndexedDB<ObjectStoreDefinitionMap>, event: IndexedDBEventMap<ObjectStoreDefinitionMap>["success"]) => any) {
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
  set onerror(value: (this: IndexedDB<ObjectStoreDefinitionMap>, event: IndexedDBEventMap<ObjectStoreDefinitionMap>["error"]) => any) {
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
  get onblocked() {
    return this.#staticEvents.get("blocked") || null;
  }
  set onblocked(value: (this: IndexedDB<ObjectStoreDefinitionMap>, event: IndexedDBEventMap<ObjectStoreDefinitionMap>["blocked"]) => any) {
    if (this.#staticEvents.has("blocked")) {
      this.removeEventListener("blocked", <EventListener>this.#staticEvents.get("blocked"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("blocked", value);
      this.addEventListener("blocked", <EventListener>value);
    } else {
      this.#staticEvents.delete("blocked");
    }
  }
  get onstatechange() {
    return this.#staticEvents.get("statechange") || null;
  }
  set onstatechange(value: (this: IndexedDB<ObjectStoreDefinitionMap>, event: IndexedDBEventMap<ObjectStoreDefinitionMap>["statechange"]) => any) {
    if (this.#staticEvents.has("statechange")) {
      this.removeEventListener("statechange", <EventListener>this.#staticEvents.get("statechange"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("statechange", value);
      this.addEventListener("statechange", <EventListener>value);
    } else {
      this.#staticEvents.delete("statechange");
    }
  }
}

interface IndexedDB<ObjectStoreDefinitionMap> {
  addEventListener<K extends keyof IndexedDBEventMap<ObjectStoreDefinitionMap>>(type: K, listener: (this: IndexedDB<ObjectStoreDefinitionMap>, event: IndexedDBEventMap<ObjectStoreDefinitionMap>[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void;
}

interface IndexedDBEventMap<ObjectStoreDefinitionMap> {
  success: IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>;
  error: IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>;
  blocked: IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>;
  statechange: IndexedDBEvent<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap], keyof IndexedDBEventInitMap<keyof ObjectStoreDefinitionMap, ObjectStoreDefinitionMap[keyof ObjectStoreDefinitionMap]>>;
}

interface IDBDefinition<Record, IndexName extends string> {
  Records: Record;
  Indices: IndexName;
}

interface IDBObjectStoreDefinition<ObjectStoreName extends PropertyKey, IndexName extends string> {
  name: ObjectStoreName;
  autoIncrement: boolean;
  keyPath: string;
  indices: IDBIndexConfiguration<IndexName>[];
}

interface IDBIndexConfiguration<IndexName extends string> {
  name: IndexName;
  keyPath: string;
  multiEntry: boolean;
  unique: boolean;
}

type IndexedDBQuery<Record> = { [K in keyof Record]?: Record[K] | [string | number, string | number] | string | number | RegExp; }

type IndexedDBRecord<Record> = Record;
