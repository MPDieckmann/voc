/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class CacheResponse {
    [Symbol.toStringTag] = "CacheResponse";
    #response = null;
    #arrayBuffer;
    #blob;
    #formData;
    #json;
    #text;
    #url;
    constructor(url) {
        this.#url = url;
    }
    get url() {
        return this.#url;
    }
    async #getResponse() {
        if (this.#response == null) {
            this.#response = await caches.match(this.url) || new Response(null, {
                status: 404,
                statusText: "File not cached: " + this.url
            });
        }
    }
    async arrayBuffer() {
        if (this.#response == null) {
            await this.#getResponse();
        }
        if (!this.#arrayBuffer) {
            this.#arrayBuffer = await this.#response.arrayBuffer();
        }
        return this.#arrayBuffer;
    }
    async blob() {
        if (this.#response == null) {
            await this.#getResponse();
        }
        if (!this.#blob) {
            this.#blob = await this.#response.blob();
        }
        return this.#blob;
    }
    async formData() {
        if (this.#response == null) {
            await this.#getResponse();
        }
        if (!this.#formData) {
            this.#formData = await this.#response.formData();
        }
        return this.#formData;
    }
    async json() {
        if (this.#response == null) {
            await this.#getResponse();
        }
        if (!this.#json) {
            this.#json = await this.#response.json();
        }
        return this.#json;
    }
    async text() {
        if (this.#response == null) {
            await this.#getResponse();
        }
        if (!this.#text) {
            this.#text = await this.#response.text();
        }
        return this.#text;
    }
    clone() {
        return new CacheResponse(this.#url);
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class IndexedDB extends EventTarget {
    [Symbol.toStringTag] = "IndexedDB";
    static STATE_CLOSED = 0;
    static STATE_UPGRADING = 1;
    static STATE_IDLE = 2;
    static STATE_OPERATING = 4;
    STATE_CLOSED = IndexedDB.STATE_CLOSED;
    STATE_UPGRADING = IndexedDB.STATE_UPGRADING;
    STATE_IDLE = IndexedDB.STATE_IDLE;
    STATE_OPERATING = IndexedDB.STATE_OPERATING;
    #idb;
    #state = this.STATE_CLOSED;
    #queue = [];
    #ready;
    #name;
    #version;
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
    constructor(name, version, objectStoreDefinitions) {
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
                this.dispatchEvent(new IndexedDBEvent("success", {
                    cancelable: false,
                    function: "open",
                    arguments: {
                        name,
                        version,
                        objectStoreDefinitions: objectStoreDefinitions
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
                this.dispatchEvent(new IndexedDBEvent("upgradeneeded", {
                    cancelable: false,
                    function: "open",
                    arguments: {
                        name,
                        version,
                        objectStoreDefinitions: objectStoreDefinitions
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
                this.dispatchEvent(new IndexedDBEvent("error", {
                    cancelable: false,
                    function: "open",
                    arguments: {
                        name,
                        version,
                        objectStoreDefinitions: objectStoreDefinitions
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
                this.dispatchEvent(new IndexedDBEvent("blocked", {
                    cancelable: false,
                    function: "open",
                    arguments: {
                        name,
                        version,
                        objectStoreDefinitions: objectStoreDefinitions
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
            let task;
            while (task = this.#queue.shift()) {
                try {
                    await task();
                }
                catch (error) {
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
    #add(objectStoreName, record) {
        return new Promise(async (resolve, reject) => {
            await this.#ready;
            let request = this.#idb.transaction([objectStoreName], "readwrite").objectStore(objectStoreName).add(record);
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #put(objectStoreName, record) {
        return new Promise(async (resolve, reject) => {
            await this.#ready;
            let request = this.#idb.transaction([objectStoreName], "readwrite").objectStore(objectStoreName).put(record);
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #get(objectStoreName, query) {
        let results = [];
        return this.#cursor(objectStoreName, "readonly", typeof query == "function" ? async (cursor) => {
            if (await query(cursor.value)) {
                results.push(cursor.value);
            }
        } : cursor => {
            if (this.#record_matches_query(cursor.value, query)) {
                results.push(cursor.value);
            }
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
                cancelable: false,
                function: "get",
                arguments: {
                    objectStoreName,
                    callback: typeof query == "function" ? query : null,
                    query: typeof query == "function" ? null : query
                },
                result: results
            }));
            return results;
        }, reason => {
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #getAll(objectStoreName) {
        return new Promise(async (resolve, reject) => {
            await this.#ready;
            let request = this.#idb.transaction([objectStoreName], "readonly").objectStore(objectStoreName).getAll();
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #count(objectStoreName, query) {
        let results = 0;
        return this.#cursor(objectStoreName, "readonly", typeof query == "function" ? async (cursor) => {
            if (await query(cursor.value)) {
                results++;
            }
        } : cursor => {
            if (this.#record_matches_query(cursor.value, query)) {
                results++;
            }
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
                cancelable: false,
                function: "count",
                arguments: {
                    objectStoreName,
                    callback: typeof query == "function" ? query : null,
                    query: typeof query == "function" ? null : query
                },
                result: results
            }));
            return results;
        }, reason => {
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #countAll(objectStoreName) {
        return new Promise(async (resolve, reject) => {
            await this.#ready;
            let request = this.#idb.transaction([objectStoreName]).objectStore(objectStoreName).count();
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #delete(objectStoreName, query) {
        return this.#cursor(objectStoreName, "readwrite", typeof query == "function" ? async (cursor) => {
            if (await query(cursor.value)) {
                await new Promise((resolve, reject) => {
                    let request = cursor.delete();
                    request.addEventListener("success", () => {
                        resolve();
                    });
                    request.addEventListener("error", () => reject(request.error));
                });
            }
        } : async (cursor) => {
            if (this.#record_matches_query(cursor.value, query)) {
                await new Promise((resolve, reject) => {
                    let request = cursor.delete();
                    request.addEventListener("success", () => {
                        resolve();
                    });
                    request.addEventListener("error", () => reject(request.error));
                });
            }
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
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
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #deleteAll(objectStoreName) {
        return new Promise(async (resolve, reject) => {
            await this.#ready;
            let request = this.#idb.transaction([objectStoreName], "readwrite").objectStore(objectStoreName).clear();
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #cursor(objectStoreName, mode, callback) {
        return new Promise(async (resolve, reject) => {
            await this.#ready;
            let request = this.#idb.transaction([objectStoreName], mode).objectStore(objectStoreName).openCursor();
            request.addEventListener("success", async () => {
                let cursor = request.result;
                if (cursor) {
                    await callback(cursor);
                    cursor.continue();
                }
                else {
                    resolve();
                }
            });
            request.addEventListener("error", () => {
                reject(request.error);
            });
        });
    }
    #record_matches_query(record, query) {
        if (query) {
            let property;
            for (property in query) {
                if (typeof query[property] != typeof record[property] &&
                    typeof query[property] == "object" &&
                    query[property]) {
                    if (query[property] instanceof RegExp &&
                        !query[property].test(record[property])) {
                        return false;
                    }
                    else if (query[property] instanceof Array &&
                        query[property].length == 2 &&
                        record[property] < query[property][0] ||
                        record[property] > query[property][1]) {
                        return false;
                    }
                }
                else if (record[property] != query[property]) {
                    return false;
                }
            }
        }
        return true;
    }
    add(objectStoreName, record) {
        return new Promise((resolve, reject) => {
            this.#queue.push(() => this.#add(objectStoreName, record).then(resolve, reject));
            this.#dequeue();
        });
    }
    put(objectStoreName, record) {
        return new Promise((resolve, reject) => {
            this.#queue.push(() => this.#put(objectStoreName, record).then(resolve, reject));
            this.#dequeue();
        });
    }
    get(objectStoreName, query = null) {
        return new Promise((resolve, reject) => {
            if (query) {
                this.#queue.push(() => this.#get(objectStoreName, query).then(resolve, reject));
            }
            else {
                this.#queue.push(() => this.#getAll(objectStoreName).then(resolve, reject));
            }
            this.#dequeue();
        });
    }
    delete(objectStoreName, query = null) {
        return new Promise((resolve, reject) => {
            if (query) {
                this.#queue.push(() => this.#delete(objectStoreName, query).then(resolve, reject));
            }
            else {
                this.#queue.push(() => this.#deleteAll(objectStoreName).then(resolve, reject));
            }
            this.#dequeue();
        });
    }
    count(objectStoreName, query = null) {
        return new Promise((resolve, reject) => {
            if (query) {
                this.#queue.push(() => this.#count(objectStoreName, query).then(resolve, reject));
            }
            else {
                this.#queue.push(() => this.#countAll(objectStoreName).then(resolve, reject));
            }
            this.#dequeue();
        });
    }
    index(objectStoreName, index, mode = "readonly") {
        return new IndexedDBIndex(this.#idb.transaction([objectStoreName], mode).objectStore(objectStoreName).index(index));
    }
    #staticEvents = new Map();
    get onsuccess() {
        return this.#staticEvents.get("success") || null;
    }
    set onsuccess(value) {
        if (this.#staticEvents.has("success")) {
            this.removeEventListener("success", this.#staticEvents.get("success"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("success", value);
            this.addEventListener("success", value);
        }
        else {
            this.#staticEvents.delete("success");
        }
    }
    get onerror() {
        return this.#staticEvents.get("error") || null;
    }
    set onerror(value) {
        if (this.#staticEvents.has("error")) {
            this.removeEventListener("error", this.#staticEvents.get("error"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("error", value);
            this.addEventListener("error", value);
        }
        else {
            this.#staticEvents.delete("error");
        }
    }
    get onblocked() {
        return this.#staticEvents.get("blocked") || null;
    }
    set onblocked(value) {
        if (this.#staticEvents.has("blocked")) {
            this.removeEventListener("blocked", this.#staticEvents.get("blocked"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("blocked", value);
            this.addEventListener("blocked", value);
        }
        else {
            this.#staticEvents.delete("blocked");
        }
    }
    get onstatechange() {
        return this.#staticEvents.get("statechange") || null;
    }
    set onstatechange(value) {
        if (this.#staticEvents.has("statechange")) {
            this.removeEventListener("statechange", this.#staticEvents.get("statechange"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("statechange", value);
            this.addEventListener("statechange", value);
        }
        else {
            this.#staticEvents.delete("statechange");
        }
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class IndexedDBIndex extends EventTarget {
    [Symbol.toStringTag] = "IndexedDBIndex";
    STATE_CLOSED = 0;
    STATE_UPGRADING = 1;
    STATE_IDLE = 2;
    STATE_OPERATING = 4;
    #index;
    #state = this.STATE_CLOSED;
    #queue = [];
    async #ready() {
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
        return this.#index.objectStore.name;
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
    constructor(index) {
        super();
        this.#index = index;
        this.#index.objectStore.transaction.addEventListener("complete", () => {
            if (this.#state == this.STATE_OPERATING) {
                this.#index = this.#index.objectStore.transaction.db.transaction([this.#index.objectStore.name], this.#index.objectStore.transaction.mode).objectStore(this.#index.objectStore.name).index(this.#index.name);
            }
            else {
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
            let task;
            while (this.#state == this.STATE_OPERATING && (task = this.#queue.shift())) {
                try {
                    await task();
                }
                catch (error) {
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
    #get(query) {
        let results = [];
        return this.#cursor(typeof query == "function" ? async (cursor) => {
            if (await query(cursor.value)) {
                results.push(cursor.value);
            }
        } : cursor => {
            if (this.#record_matches_query(cursor.value, query)) {
                results.push(cursor.value);
            }
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
                cancelable: false,
                function: "get",
                arguments: {
                    objectStoreName: this.objectStoreName,
                    callback: typeof query == "function" ? query : null,
                    query: typeof query == "function" ? null : query
                },
                result: results
            }));
            return results;
        }, reason => {
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #getAll() {
        return new Promise(async (resolve, reject) => {
            await this.#ready();
            let request = this.#index.getAll();
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #count(query) {
        let results = 0;
        return this.#cursor(typeof query == "function" ? async (cursor) => {
            if (await query(cursor.value)) {
                results++;
            }
        } : cursor => {
            if (this.#record_matches_query(cursor.value, query)) {
                results++;
            }
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
                cancelable: false,
                function: "count",
                arguments: {
                    objectStoreName: this.objectStoreName,
                    callback: typeof query == "function" ? query : null,
                    query: typeof query == "function" ? null : query
                },
                result: results
            }));
            return results;
        }, reason => {
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #countAll() {
        return new Promise(async (resolve, reject) => {
            await this.#ready();
            let request = this.#index.count();
            request.addEventListener("success", () => {
                this.dispatchEvent(new IndexedDBEvent("success", {
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
                this.dispatchEvent(new IndexedDBEvent("error", {
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
    #delete(query) {
        return this.#cursor(typeof query == "function" ? async (cursor) => {
            if (await query(cursor.value)) {
                await new Promise((resolve, reject) => {
                    let request = cursor.delete();
                    request.addEventListener("success", () => {
                        resolve();
                    });
                    request.addEventListener("error", () => reject(request.error));
                });
            }
        } : async (cursor) => {
            if (this.#record_matches_query(cursor.value, query)) {
                await new Promise((resolve, reject) => {
                    let request = cursor.delete();
                    request.addEventListener("success", () => {
                        resolve();
                    });
                    request.addEventListener("error", () => reject(request.error));
                });
            }
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
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
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #deleteAll() {
        return this.#cursor(async (cursor) => {
            await new Promise((resolve, reject) => {
                let request = cursor.delete();
                request.addEventListener("success", () => {
                    resolve();
                });
                request.addEventListener("error", () => reject(request.error));
            });
        }).then(() => {
            this.dispatchEvent(new IndexedDBEvent("success", {
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
            this.dispatchEvent(new IndexedDBEvent("error", {
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
    #cursor(callback) {
        return new Promise(async (resolve, reject) => {
            await this.#ready();
            let request = this.#index.openCursor();
            request.addEventListener("success", () => {
                let cursor = request.result;
                if (cursor) {
                    callback(cursor);
                    cursor.continue();
                }
                else {
                    resolve();
                }
            });
            request.addEventListener("error", () => {
                reject(request.error);
            });
        });
    }
    #record_matches_query(record, query) {
        if (query) {
            let property;
            for (property in query) {
                if (typeof query[property] != typeof record[property] &&
                    typeof query[property] == "object" &&
                    query[property]) {
                    if (query[property] instanceof RegExp &&
                        !query[property].test(record[property])) {
                        return false;
                    }
                    else if (query[property] instanceof Array &&
                        query[property].length == 2 &&
                        record[property] < query[property][0] ||
                        record[property] > query[property][1]) {
                        return false;
                    }
                }
                else if (record[property] != query[property]) {
                    return false;
                }
            }
        }
        return true;
    }
    get(query = null) {
        return new Promise((resolve, reject) => {
            if (query) {
                this.#queue.push(() => this.#get(query).then(resolve, reject));
            }
            else {
                this.#queue.push(() => this.#getAll().then(resolve, reject));
            }
            this.#dequeue();
        });
    }
    count(query = null) {
        return new Promise((resolve, reject) => {
            if (query) {
                this.#queue.push(() => this.#count(query).then(resolve, reject));
            }
            else {
                this.#queue.push(() => this.#countAll().then(resolve, reject));
            }
            this.#dequeue();
        });
    }
    delete(query = null) {
        if (this.#index.objectStore.transaction.mode != "readwrite") {
            return Promise.reject(new DOMException(`Failed to execute 'delete' on '${this.constructor.name}': The record may not be deleted inside a read-only transaction.`, "ReadOnlyError"));
        }
        return new Promise((resolve, reject) => {
            if (query) {
                this.#queue.push(() => this.#delete(query).then(resolve, reject));
            }
            else {
                this.#queue.push(() => this.#deleteAll().then(resolve, reject));
            }
            this.#dequeue();
        });
    }
    #staticEvents = new Map();
    get onsuccess() {
        return this.#staticEvents.get("success") || null;
    }
    set onsuccess(value) {
        if (this.#staticEvents.has("success")) {
            this.removeEventListener("success", this.#staticEvents.get("success"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("success", value);
            this.addEventListener("success", value);
        }
        else {
            this.#staticEvents.delete("success");
        }
    }
    get onerror() {
        return this.#staticEvents.get("error") || null;
    }
    set onerror(value) {
        if (this.#staticEvents.has("error")) {
            this.removeEventListener("error", this.#staticEvents.get("error"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("error", value);
            this.addEventListener("error", value);
        }
        else {
            this.#staticEvents.delete("error");
        }
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class IndexedDBEvent extends Event {
    [Symbol.toStringTag] = "IndexedDBEvent";
    function;
    arguments;
    result;
    error;
    constructor(type, eventInitDict) {
        super(type, eventInitDict);
        this.function = eventInitDict.function || null;
        this.arguments = eventInitDict.arguments || null;
        this.result = eventInitDict.result || null;
        this.error = eventInitDict.error || null;
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class ServerEvent extends Event {
    [Symbol.toStringTag] = "ServerEvent";
    #group;
    get group() {
        return this.#group;
    }
    #data;
    get data() {
        return this.#data;
    }
    constructor(type, eventInitDict) {
        super(type, eventInitDict);
        this.#group = eventInitDict.group || null;
        this.#data = eventInitDict.data || null;
    }
    /** @deprecated */
    initServerEvent(type, bubbles, cancelable, group, data) {
        super.initEvent(type, bubbles, cancelable);
        this.#group = group;
        this.#data = data;
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class Server extends EventTarget {
    [Symbol.toStringTag] = "Server";
    static APP_SCOPE = registration.scope.replace(/\/$/, "");
    static API_URL = Server.APP_SCOPE + "/api.php";
    static API_VERSION = 2;
    static MPC_CACHE_NAME = "MPC-Server-Cache";
    static server;
    static ICON_SIZES = [
        "48x48",
        "72x72",
        "96x96",
        "144x144",
        "192x192",
        "512x512"
    ];
    static ICON_PURPOSES = [
        "any",
        "maskable",
        "monochrome"
    ];
    static get VERSION() {
        return (this.server && this.server.#VERSION) || "Fehler: Der ServiceWorker wurde noch nicht initialisiert!";
    }
    #routes = new Map();
    APP_SCOPE = Server.APP_SCOPE;
    API_URL = Server.API_URL;
    API_VERSION = Server.API_VERSION;
    MPC_CACHE_NAME = Server.MPC_CACHE_NAME;
    ready;
    #pinging = false;
    #connected = false;
    // #online: boolean = typeof DEBUG_MODE == "string" ? DEBUG_MODE == "online" : navigator.onLine;
    #online = navigator.onLine;
    #VERSION;
    #settings = new Map();
    #start;
    #idb = new IndexedDB("Server", 2, {
        settings: {
            name: "settings",
            autoIncrement: false,
            keyPath: "key",
            indices: []
        },
        log: {
            name: "log",
            autoIncrement: true,
            keyPath: "id",
            indices: [
                { name: "by_type", keyPath: "type", multiEntry: false, unique: false }
            ]
        }
    });
    get version() { return this.#VERSION; }
    get pinging() { return this.#pinging; }
    get server_online() { return this.getSetting("offline-mode") ? false : this.#connected; }
    get network_online() { return this.#online; }
    constructor() {
        super();
        if (Server.server) {
            return Server.server;
        }
        // @ts-ignore
        Server.server = this;
        addEventListener("install", event => event.waitUntil(this.install()));
        addEventListener("message", event => event.waitUntil(this.message(event.data, event.source)));
        addEventListener("activate", event => event.waitUntil(this.activate()));
        addEventListener("fetch", event => event.respondWith(this.fetch(event.request)));
        navigator.connection.addEventListener("change", () => {
            // this.#online = typeof DEBUG_MODE == "string" ? DEBUG_MODE == "online" : navigator.onLine;
            this.#online = navigator.onLine;
            if (this.#online) {
                this.#connected = true;
                if (this.#pinging) {
                    this.awaitEventListener(this, "afterping").then(() => this.ping());
                }
                else {
                    this.ping();
                }
            }
        });
        let _resolve;
        this.#start = new Promise(resolve => _resolve = resolve);
        this.#start.resolve = _resolve;
        this.registerRoute(Server.APP_SCOPE + "/serviceworker.js", "cache");
        this.ready = (async () => {
            let promises = [];
            this.dispatchEvent(new ServerEvent("beforestart", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
            await Promise.all(promises);
            await this.#idb.ready;
            await this.#start;
            this.dispatchEvent(new ServerEvent("afterstart", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
            await Promise.all(promises);
            return this;
        })();
        this.#idb.get("settings").then(values => {
            values.forEach(record => {
                this.#settings.set(record.key, record.value);
            });
        });
    }
    async #log(type, message, stack) {
        await this.#idb.put("log", {
            timestamp: Date.now(),
            type,
            message,
            stack
        });
    }
    async log(message, stack = null) {
        console.log(message, stack);
        await this.#log("log", message, stack);
    }
    async warn(message, stack = null) {
        console.warn(message, stack);
        await this.#log("warn", message, stack);
    }
    async error(message, stack = null) {
        console.error(message, stack);
        await this.#log("error", message, stack);
    }
    async clear_log() {
        await this.#idb.delete("log");
        this.#log("clear", "Das Protokoll wurde erfolgreich gelöscht", null);
        console.clear();
    }
    async get_log(types = {
        log: true,
        warn: true,
        error: true
    }) {
        if (types.log && types.warn && types.error) {
            return this.#idb.get("log");
        }
        else {
            let type_array = [];
            types.log && type_array.push("log");
            types.warn && type_array.push("warn");
            types.error && type_array.push("error");
            return this.#idb.get("log", {
                type: new RegExp("^(" + type_array.join("|") + ")$")
            });
        }
    }
    async install() {
        // console.log("server called 'install'", { server, routes: this.#routes });
        let promises = [];
        this.dispatchEvent(new ServerEvent("beforeinstall", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        promises.splice(0, promises.length);
        this.dispatchEvent(new ServerEvent("install", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        promises.splice(0, promises.length);
        await this.update();
        this.log("Serviceworker erfolgreich installiert");
        skipWaiting();
        this.dispatchEvent(new ServerEvent("afterinstall", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
    }
    async update() {
        // console.log("server called 'update'", { server, routes: this.#routes });
        let promises = [];
        this.dispatchEvent(new ServerEvent("beforeupdate", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        promises.splice(0, promises.length);
        this.dispatchEvent(new ServerEvent("update", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        promises.splice(0, promises.length);
        try {
            await caches.delete(this.MPC_CACHE_NAME);
            this.log("Cache erfolgreich gelöscht");
            let cache = await caches.open(this.MPC_CACHE_NAME);
            await Promise.all(Array.from(this.#routes).map(([pathname, value]) => {
                if (value == "cache") {
                    return cache.add(pathname);
                }
            }));
            this.log("Dateien erfolgreich in den Cache geladen");
            this.dispatchEvent(new ServerEvent("afterupdate", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
            await Promise.all(promises);
            return "Update erfolgreich abgeschlossen!";
        }
        catch (e) {
            this.error(e.message, e.stack);
            return "Update fehlgeschlagen!";
        }
    }
    async activate() {
        // console.log("server called 'activate'", { server, routes: this.#routes });
        let promises = [];
        this.dispatchEvent(new ServerEvent("beforeactivate", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        promises.splice(0, promises.length);
        let response = await (await caches.open(this.MPC_CACHE_NAME)).match(Server.APP_SCOPE + "/serviceworker.js");
        this.#VERSION = response ? date("Y.md.Hi", response.headers.get("Date")) : "ServiceWorker is broken.";
        await this.ready;
        this.dispatchEvent(new ServerEvent("activate", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        promises.splice(0, promises.length);
        await clients.claim();
        this.log("Serviceworker erfolgreich aktiviert (Version: " + this.#VERSION + ")");
        this.dispatchEvent(new ServerEvent("afteractivate", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
    }
    async fetch(input, init) {
        // console.log("server called 'fetch'", { server, routes: this.#routes, arguments });
        let response = null;
        let respondWithResponse = null;
        this.dispatchEvent(new ServerEvent("beforefetch", { cancelable: false, group: "fetch", data: { url: typeof input == "string" ? input : input.url, request: null, response, respondWith(r) { respondWithResponse = r; } } }));
        await this.ready;
        let request = new Request(input, init);
        this.dispatchEvent(new ServerEvent("fetch", { cancelable: false, group: "fetch", data: { url: typeof input == "string" ? input : input.url, request, response, respondWith(r) { respondWithResponse = r; } } }));
        if (respondWithResponse) {
            response = (await respondWithResponse).clone();
            respondWithResponse = null;
            this.dispatchEvent(new ServerEvent("afterfetch", { cancelable: false, group: "fetch", data: { url: typeof input == "string" ? input : input.url, request, response, respondWith(r) { respondWithResponse = r; } } }));
            respondWithResponse && (response = (await respondWithResponse).clone());
            return response;
        }
        try {
            if (!this.getSetting("offline-mode")) {
                if (request.url == this.API_URL) {
                    response = await globalThis.fetch(request);
                    this.dispatchEvent(new ServerEvent("afterfetch", { cancelable: false, group: "fetch", data: { url: typeof input == "string" ? input : input.url, request, response, respondWith(r) { respondWithResponse = r; } } }));
                    respondWithResponse && (response = (await respondWithResponse).clone());
                    return response;
                }
                await this.ping();
            }
            let route = this.#routes.get(request.url.replace(/^([^\?\#]*)[\?\#].*$/, "$1"));
            if (typeof route == "string") {
                let cache = await caches.open(this.MPC_CACHE_NAME);
                response = await cache.match(request.url.replace(/^([^\?\#]*)[\?\#].*$/, "$1"));
                if (!response) {
                    console.error(request);
                    throw "File not cached: " + request.url;
                }
            }
            else if (typeof route == "object") {
                if (typeof route.response == "function") {
                    let scope = await new Scope(request, route).ready;
                    let rtn = await route.response.call(scope, scope);
                    response = (typeof rtn == "object" && rtn instanceof Response) ? rtn : new Response(rtn, {
                        headers: scope.headers,
                        status: scope.status,
                        statusText: scope.statusText
                    });
                }
                else {
                    let rtn = await route.response;
                    response = (typeof rtn == "object" && rtn instanceof Response) ? rtn : new Response(rtn);
                }
            }
            else {
                throw "File not cached: " + request.url;
            }
        }
        catch (error) {
            if (error && error.message) {
                this.error(error.message, error.stack);
            }
            else {
                this.error(error);
            }
            response = new Response(await this.generate_error(new Scope(request, {
                response: "Error 500: Internal ServiceWorker Error"
            }), {
                message: typeof error == "string" ? error : error.message,
                stack: typeof error == "string" ? null : error.stack,
                code: 500
            }), {
                status: 500,
                statusText: "Internal ServiceWorker Error",
                headers: {
                    "Content-Type": "text/plain; charset=utf-8"
                }
            });
        }
        this.dispatchEvent(new ServerEvent("afterfetch", { cancelable: false, group: "fetch", data: { url: typeof input == "string" ? input : input.url, request, response, respondWith(r) { respondWithResponse = r; } } }));
        respondWithResponse && (response = (await respondWithResponse).clone());
        return response;
    }
    async start() {
        // console.log("server called 'start'", { server, routes: this.#routes });
        let promises = [];
        this.dispatchEvent(new ServerEvent("start", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
        this.#start.resolve(null);
    }
    async message(message, source) {
        this.dispatchEvent(new ServerEvent("beforemessage", { cancelable: false, group: "message", data: message }));
        this.dispatchEvent(new ServerEvent("message", { cancelable: false, group: "message", data: message }));
        switch (message.type) {
            case "set-setting":
                this.setSetting(message.property, message.value);
                source.postMessage({
                    type: "set-setting",
                    property: message.property,
                    value: this.getSetting(message.property)
                }, null);
                break;
            default:
                this.log("Failed to prozess message", "type: " + message.type + "\nJSON: " + JSON.stringify(message, null, "  "));
        }
        this.dispatchEvent(new ServerEvent("aftermessage", { cancelable: false, group: "message", data: message }));
    }
    setSetting(property, value) {
        this.#settings.set(property, value);
        this.#idb.put("settings", { key: property, value: value });
        return true;
    }
    hasSetting(property) {
        return this.#settings.has(property);
    }
    getSetting(property) {
        if (this.#settings.has(property)) {
            return this.#settings.get(property);
        }
        return null;
    }
    async ping() {
        if (!this.#pinging) {
            this.#pinging = true;
            let promises = [];
            this.dispatchEvent(new ServerEvent("beforeping", { cancelable: false, group: "ping", data: { await(promise) { promises.push(promise); } } }));
            await Promise.all(promises);
            this.#connected = await this.is_connected();
            let was_ping = false;
            if (this.#connected && this.is_logged_in()) {
                was_ping = true;
                let promises = [];
                this.dispatchEvent(new ServerEvent("ping", { cancelable: false, group: "ping", data: { await(promise) { promises.push(promise); } } }));
                await Promise.all(promises);
            }
            this.#pinging = false;
            if (was_ping) {
                let promises = [];
                this.dispatchEvent(new ServerEvent("afterping", { cancelable: false, group: "ping", data: { await(promise) { promises.push(promise); } } }));
                await Promise.all(promises);
            }
        }
    }
    async apiFetch(func, args = []) {
        if (this.network_online == false || this.getSetting("offline-mode")) {
            throw new Error("Offline");
        }
        let headers = {
            method: "post",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({
                version: this.API_VERSION,
                id: this.getSetting("id"),
                token: this.getSetting("access-token"),
                function: func,
                arguments: args
            })
        };
        let json = await (await fetch(this.API_URL, headers)).json();
        if (json.version != this.API_VERSION) {
            throw new Error("Invalid API Version. Please update!");
        }
        if (json.function != func) {
            throw new Error("Invalid response function");
        }
        if ("error" in json) {
            throw new Error(json.error);
        }
        return json.return;
    }
    async awaitEventListener(target, resolve_type, reject_type = "error") {
        return new Promise((resolve, reject) => {
            function resolveCallback(event) {
                resolve(event);
                target.removeEventListener(resolve_type, resolveCallback);
                target.removeEventListener(reject_type, rejectCallback);
            }
            function rejectCallback(event) {
                reject(event);
                target.removeEventListener(resolve_type, resolveCallback);
                target.removeEventListener(reject_type, rejectCallback);
            }
            target.addEventListener(resolve_type, resolveCallback);
            target.addEventListener(reject_type, rejectCallback);
        });
    }
    async is_connected() {
        try {
            let value = await this.apiFetch("is_connected");
            if (value === false && this.is_logged_in()) {
                this.error("Der Server hat die Authentifizierung abgelehnt");
            }
            return true;
        }
        catch (e) {
            return false;
        }
    }
    async generate_error(scope, options) {
        if (typeof options.code != "number") {
            options.code = 500;
        }
        scope.status = options.code;
        return scope.build(options, `Error ${options.code}: ${options.message}\n${options.stack}`);
    }
    is_logged_in() {
        return !!(this.getSetting("id") &&
            this.getSetting("access-token"));
    }
    registerRoute(pathname, route) {
        if (typeof route == "object") {
            if (route.files) {
                Object.keys(route.files).forEach(key => {
                    this.registerRoute(route.files[key], "cache");
                });
            }
            if (route.icon) {
                Server.ICON_SIZES.forEach(size => {
                    let [width, height] = size.split("x");
                    Server.ICON_PURPOSES.forEach(purpose => {
                        server.registerRoute(route.icon.replace("${p}", purpose).replace("${w}", width).replace("${h}", height), "cache");
                    });
                });
            }
        }
        if (!this.#routes.has(pathname)) {
            this.#routes.set(pathname, route);
        }
        else if (route != "cache" && this.#routes.get(pathname) != "cache") {
            this.#routes.set(pathname, route);
        }
    }
    iterateRoutes(callback) {
        this.#routes.forEach(callback);
    }
    createRedirection(url) {
        return new Response(url, {
            status: 302,
            statusText: "Found",
            headers: {
                Location: url
            }
        });
    }
    #staticEvents = new Map();
    get onbeforeinstall() {
        return this.#staticEvents.get("beforeinstall") || null;
    }
    set onbeforeinstall(value) {
        if (this.#staticEvents.has("beforeinstall")) {
            this.removeEventListener("beforeinstall", this.#staticEvents.get("beforeinstall"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforeinstall", value);
            this.addEventListener("beforeinstall", value);
        }
        else {
            this.#staticEvents.delete("beforeinstall");
        }
    }
    get oninstall() {
        return this.#staticEvents.get("install") || null;
    }
    set oninstall(value) {
        if (this.#staticEvents.has("install")) {
            this.removeEventListener("install", this.#staticEvents.get("install"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("install", value);
            this.addEventListener("install", value);
        }
        else {
            this.#staticEvents.delete("install");
        }
    }
    get onafterinstall() {
        return this.#staticEvents.get("afterinstall") || null;
    }
    set onafterinstall(value) {
        if (this.#staticEvents.has("afterinstall")) {
            this.removeEventListener("afterinstall", this.#staticEvents.get("afterinstall"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("afterinstall", value);
            this.addEventListener("afterinstall", value);
        }
        else {
            this.#staticEvents.delete("afterinstall");
        }
    }
    get onbeforeupdate() {
        return this.#staticEvents.get("beforeupdate") || null;
    }
    set onbeforeupdate(value) {
        if (this.#staticEvents.has("beforeupdate")) {
            this.removeEventListener("beforeupdate", this.#staticEvents.get("beforeupdate"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforeupdate", value);
            this.addEventListener("beforeupdate", value);
        }
        else {
            this.#staticEvents.delete("beforeupdate");
        }
    }
    get onupdate() {
        return this.#staticEvents.get("update") || null;
    }
    set onupdate(value) {
        if (this.#staticEvents.has("update")) {
            this.removeEventListener("update", this.#staticEvents.get("update"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("update", value);
            this.addEventListener("update", value);
        }
        else {
            this.#staticEvents.delete("update");
        }
    }
    get onafterupdate() {
        return this.#staticEvents.get("afterupdate") || null;
    }
    set onafterupdate(value) {
        if (this.#staticEvents.has("afterupdate")) {
            this.removeEventListener("afterupdate", this.#staticEvents.get("afterupdate"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("afterupdate", value);
            this.addEventListener("afterupdate", value);
        }
        else {
            this.#staticEvents.delete("afterupdate");
        }
    }
    get onbeforeactivate() {
        return this.#staticEvents.get("beforeactivate") || null;
    }
    set onbeforeactivate(value) {
        if (this.#staticEvents.has("beforeactivate")) {
            this.removeEventListener("beforeactivate", this.#staticEvents.get("beforeactivate"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforeactivate", value);
            this.addEventListener("beforeactivate", value);
        }
        else {
            this.#staticEvents.delete("beforeactivate");
        }
    }
    get onactivate() {
        return this.#staticEvents.get("activate") || null;
    }
    set onactivate(value) {
        if (this.#staticEvents.has("activate")) {
            this.removeEventListener("activate", this.#staticEvents.get("activate"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("activate", value);
            this.addEventListener("activate", value);
        }
        else {
            this.#staticEvents.delete("activate");
        }
    }
    get onafteractivate() {
        return this.#staticEvents.get("afteractivate") || null;
    }
    set onafteractivate(value) {
        if (this.#staticEvents.has("afteractivate")) {
            this.removeEventListener("afteractivate", this.#staticEvents.get("afteractivate"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("afteractivate", value);
            this.addEventListener("afteractivate", value);
        }
        else {
            this.#staticEvents.delete("afteractivate");
        }
    }
    get onbeforefetch() {
        return this.#staticEvents.get("beforefetch") || null;
    }
    set onbeforefetch(value) {
        if (this.#staticEvents.has("beforefetch")) {
            this.removeEventListener("beforefetch", this.#staticEvents.get("beforefetch"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforefetch", value);
            this.addEventListener("beforefetch", value);
        }
        else {
            this.#staticEvents.delete("beforefetch");
        }
    }
    get onfetch() {
        return this.#staticEvents.get("fetch") || null;
    }
    set onfetch(value) {
        if (this.#staticEvents.has("fetch")) {
            this.removeEventListener("fetch", this.#staticEvents.get("fetch"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("fetch", value);
            this.addEventListener("fetch", value);
        }
        else {
            this.#staticEvents.delete("fetch");
        }
    }
    get onafterfetch() {
        return this.#staticEvents.get("afterfetch") || null;
    }
    set onafterfetch(value) {
        if (this.#staticEvents.has("afterfetch")) {
            this.removeEventListener("afterfetch", this.#staticEvents.get("afterfetch"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("afterfetch", value);
            this.addEventListener("afterfetch", value);
        }
        else {
            this.#staticEvents.delete("afterfetch");
        }
    }
    get onbeforestart() {
        return this.#staticEvents.get("beforestart") || null;
    }
    set onbeforestart(value) {
        if (this.#staticEvents.has("beforestart")) {
            this.removeEventListener("beforestart", this.#staticEvents.get("beforestart"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforestart", value);
            this.addEventListener("beforestart", value);
        }
        else {
            this.#staticEvents.delete("beforestart");
        }
    }
    get onstart() {
        return this.#staticEvents.get("start") || null;
    }
    set onstart(value) {
        if (this.#staticEvents.has("start")) {
            this.removeEventListener("start", this.#staticEvents.get("start"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("start", value);
            this.addEventListener("start", value);
        }
        else {
            this.#staticEvents.delete("start");
        }
    }
    get onafterstart() {
        return this.#staticEvents.get("afterstart") || null;
    }
    set onafterstart(value) {
        if (this.#staticEvents.has("afterstart")) {
            this.removeEventListener("afterstart", this.#staticEvents.get("afterstart"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("afterstart", value);
            this.addEventListener("afterstart", value);
        }
        else {
            this.#staticEvents.delete("afterstart");
        }
    }
    get onbeforemessage() {
        return this.#staticEvents.get("beforemessage") || null;
    }
    set onbeforemessage(value) {
        if (this.#staticEvents.has("beforemessage")) {
            this.removeEventListener("beforemessage", this.#staticEvents.get("beforemessage"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforemessage", value);
            this.addEventListener("beforemessage", value);
        }
        else {
            this.#staticEvents.delete("beforemessage");
        }
    }
    get onmessage() {
        return this.#staticEvents.get("message") || null;
    }
    set onmessage(value) {
        if (this.#staticEvents.has("message")) {
            this.removeEventListener("message", this.#staticEvents.get("message"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("message", value);
            this.addEventListener("message", value);
        }
        else {
            this.#staticEvents.delete("message");
        }
    }
    get onaftermessage() {
        return this.#staticEvents.get("aftermessage") || null;
    }
    set onaftermessage(value) {
        if (this.#staticEvents.has("aftermessage")) {
            this.removeEventListener("aftermessage", this.#staticEvents.get("aftermessage"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("aftermessage", value);
            this.addEventListener("aftermessage", value);
        }
        else {
            this.#staticEvents.delete("aftermessage");
        }
    }
    get onbeforeping() {
        return this.#staticEvents.get("beforeping") || null;
    }
    set onbeforeping(value) {
        if (this.#staticEvents.has("beforeping")) {
            this.removeEventListener("beforeping", this.#staticEvents.get("beforeping"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("beforeping", value);
            this.addEventListener("beforeping", value);
        }
        else {
            this.#staticEvents.delete("beforeping");
        }
    }
    get onping() {
        return this.#staticEvents.get("ping") || null;
    }
    set onping(value) {
        if (this.#staticEvents.has("ping")) {
            this.removeEventListener("ping", this.#staticEvents.get("ping"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("ping", value);
            this.addEventListener("ping", value);
        }
        else {
            this.#staticEvents.delete("ping");
        }
    }
    get onafterping() {
        return this.#staticEvents.get("afterping") || null;
    }
    set onafterping(value) {
        if (this.#staticEvents.has("afterping")) {
            this.removeEventListener("afterping", this.#staticEvents.get("afterping"));
        }
        if (typeof value == "function") {
            this.#staticEvents.set("afterping", value);
            this.addEventListener("afterping", value);
        }
        else {
            this.#staticEvents.delete("afterping");
        }
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
class Scope extends EventTarget {
    [Symbol.toStringTag] = "Scope";
    globalThis = server;
    data = {
        page_title: "",
        site_title: server.getSetting("site-title"),
        theme_color: server.getSetting("theme-color"),
        menus: {
            "navigation": {
                label: "Navigation",
                href: "#navigation",
                submenu: {}
            }
        },
        scripts: {},
        styles: {},
        main: "",
        toasts: []
    };
    version = "Version: " + Server.VERSION + (server.server_online ? " (Online)" : " (Offline)");
    copyright = server.getSetting("copyright");
    GET = {};
    POST = {};
    REQUEST = {};
    status = 200;
    statusText = "OK";
    headers = new Headers({
        "Content-Type": "text/html;charset=utf-8"
    });
    scope = this;
    url;
    ready;
    files = {};
    icon;
    request;
    constructor(request, route) {
        super();
        request = request.clone();
        this.request = request;
        this.url = new URL(request.url);
        this.icon = route.icon || server.getSetting("server-icon") || null;
        this.ready = (async () => {
            route.files && await Promise.all(Object.keys(route.files).map(async (file) => this.files[file] = new CacheResponse(route.files[file])));
            this.url.searchParams.forEach((value, key) => {
                this.GET[key] = value;
                this.REQUEST[key] = value;
            });
            if (this.request.headers.has("content-type") && /application\/x-www-form-urlencoded/i.test(request.headers.get("content-type"))) {
                new URLSearchParams(await this.request.text()).forEach((value, key) => {
                    this.POST[key] = value;
                    this.REQUEST[key] = value;
                });
            }
            return this;
        })();
    }
    /**
     * Füllt den Template-String mit Daten
     *
     * @param data Das zu benutzende Daten-Array
     * @param template Der Template-String
     */
    async build(data, template) {
        data = Object.assign({}, this.data, data);
        let matches = template.match(/\{\{ (generate_[a-z0-9_]+)\(([a-z0-9_, -+]*)\) \}\}/g);
        if (matches) {
            for (let value of matches) {
                let match = /\{\{ (generate_[a-z0-9_]+)\(([a-z0-9_, -+]*)\) \}\}/.exec(value);
                if (typeof this[match[1]] == "function") {
                    let pattern = match[0];
                    let args = match[2].split(",").map(a => a.trim());
                    args.unshift(data);
                    let replacement = await this[match[1]].apply(this, args);
                    template = template.replace(pattern, replacement);
                }
            }
        }
        return template;
    }
    /**
     * Gibt das Menü im HTML-Format aus
     *
     * @param menu Das Menü
     * @param options Die zu verwendenden Optionen
     * @returns &lt;ul&gt;-Tags mit Einträgen
     */
    build_menu(menu, options = {}) {
        options = Object.assign(options, {
            menu_class: "menu",
            submenu_class: "submenu",
            entry_class: "menuitem",
            id_prefix: "",
        });
        let html = "<ul class=\"" + this.htmlspecialchars(options.menu_class) + "\">";
        for (let id in menu) {
            let item = menu[id];
            html += "<li class=\"" + this.htmlspecialchars(options.entry_class);
            if ("submenu" in item && Object.keys(item.submenu).length > 0) {
                html += " has-submenu";
            }
            let url = new URL(new Request(item.href).url);
            if (this.scope.url.origin + this.scope.url.pathname == url.origin + url.pathname) {
                html += " selected";
            }
            html += "\" id=\"" + this.htmlspecialchars(options.id_prefix + id) + "_item\"><a href=\"" + this.htmlspecialchars(item.href) + "\" id=\"" + this.htmlspecialchars(id) + "\">" + this.htmlspecialchars(item.label) + "</a>";
            if ("submenu" in item && Object.keys(item.submenu).length > 0) {
                html += this.build_menu(item.submenu, Object.assign({
                    id_prefix: this.htmlspecialchars("id_prefix" in options ? options.id_prefix + "-" + id + "-" : id + "-"),
                    menu_class: options.submenu_class,
                }, options));
            }
            html += "</li>";
        }
        html += "</ul>";
        return html;
    }
    /**
     * Convert special characters to HTML entities
     *
     * @param string The string being converted.
     * @return The converted string.
     */
    htmlspecialchars(string) {
        return string.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }
    /**
     * Fügt ein Stylesheet hinzu oder ändert ein bestehendes
     *
     * @param data Das zu benutzende Daten-Array
     * @param id ID des Stylesheets
     * @param href URL zum Stylesheet
     * @param media Media Informationen
     * @param type Typ des Stylesheets
     */
    add_style(id, href, media = "all,screen,handheld,print", type = "text/css") {
        this.data.styles[id] = { id, href, media, type };
    }
    /**
     * Löscht ein zuvor hinzugefügtes Stylesheet
     *
     * @param data Das zu benutzende Daten-Array
     * @param id ID des Stylesheets
     */
    remove_style(id) {
        delete this.data.styles[id];
    }
    /**
     * Fügt ein Skript hinzu
     *
     * @param data Das zu benutzende Daten-Array
     * @param id ID des Skripts
     * @param src URL zum Skript
     * @param type Typ des Skripts
     * @param position Gibt an, an welcher Position das Sktip eingefügt werden soll
     */
    add_script(id, src, type = "text/javascript", position = "head") {
        this.data.scripts[id] = { id, src, type, position };
    }
    /**
     * Löscht ein zuvor hinzugefügtes Skript
     *
     * @param data Das zu benutzende Daten-Array
     * @param id ID des Skripts
     */
    remove_script(id) {
        delete this.data.scripts[id];
    }
    /**
     * Fügt einen Menüpunkt hinzu
     *
     * @param data Das zu benutzende Daten-Array
     * @param path Pfad zum Menü-Eintrag (geteilt durch "/")
     * @param label Beschriftung des Links
     * @param href URL
     * @param _menu `[Privater Parameter]` Das Menü, dem ein Eintrag hinzugefügt werden soll
     */
    add_menu_item(path, label, href, _menu = this.data.menus) {
        let patharray = path.split("/");
        let id = patharray.shift();
        if (patharray.length > 0) {
            if (id in _menu === false) {
                _menu[id] = {
                    label: id,
                    href: `#${id}`,
                    submenu: {}
                };
            }
            this.add_menu_item(patharray.join("/"), label, href, _menu[id].submenu);
        }
        else {
            _menu[id] = { label, href, submenu: {} };
        }
    }
    /**
     * Überprüft, ob ein Datensatz korrekt ist
     *
     * @param entry Der zu überprüfende Datensatz
     */
    is_valid_entry(entry) {
        if ("date_of_invoice" in entry && entry.date_of_invoice && this.is_valid_date(entry.date_of_invoice) &&
            "date_of_payment" in entry && (entry.date_of_payment ? this.is_valid_date(entry.date_of_payment) : true) &&
            "account" in entry && entry.account &&
            "person" in entry && entry.person &&
            "category" in entry && entry.category &&
            "description" in entry && entry.description &&
            "amount" in entry && entry.amount && !isNaN(entry.amount)) {
            if ("quantity" in entry && entry.quantity && !isNaN(entry.quantity) &&
                "unit" in entry && entry.unit) {
                return true;
            }
            else if (("quantity" in entry === false || !entry.quantity) &&
                ("unit" in entry === false || !entry.unit)) {
                return true;
            }
            else {
                return false;
            }
        }
        return false;
    }
    /**
     * Überprüft, ob eine Zeichenkette ein gültiges Datum (nach dem angegebenen Datumsformat) darstellt
     *
     * @param date Die zu überprüfende Zeichenkette
     * @param format Das Datumsformat
     */
    is_valid_date(date, format = "Y-m-d") {
        return globalThis.date(format, date) == date;
    }
    /**
     *
     * @param quantity
     * @param unit
     * @returns
     */
    format_quantity(quantity, unit) {
        if (unit.toLowerCase() == unit) {
            return Math.abs(quantity) + unit;
        }
        else if (unit == "Stk" || unit == "Pkg") {
            return Math.abs(quantity) + " " + unit + ".";
        }
        else {
            return Math.abs(quantity) + " " + unit;
        }
    }
    /**
     *
     * @param quantity
     * @param unit
     * @param amount
     * @returns
     */
    format_amount_per_kilo(quantity, unit, amount) {
        if (unit.toLowerCase() == unit) {
            return "1000" + unit + ": " + Math.abs(amount / quantity * 1000).toFloatingString(2).replace(".", ",") + "€";
        }
        else if (unit == "Stk" || unit == "Pkg") {
            return "1 " + unit + ".: " + Math.abs(amount / quantity).toFloatingString(2).replace(".", ",") + "€";
        }
        else {
            return "1 " + unit + ": " + Math.abs(amount / quantity).toFloatingString(2).replace(".", ",") + "€";
        }
    }
    /**
     * Gibt die Value des Daten-Arrays an einem Index aus
     *
     * @param data Daten-Array der build-Funktion
     * @param index Index des Menüs
     * @param escape html | url | plain
     * @return Der Hauptinhalt der Seite
     */
    generate_value(data, index, escape) {
        switch (escape) {
            case "html":
                return this.htmlspecialchars(data[index]);
            case "url":
                return encodeURI(data[index]);
            case "json":
                return JSON.stringify(data[index]);
            case "plain":
            default:
                return (data[index] || "").toString();
        }
    }
    generate_version(_data, escape) {
        return this.generate_value(this, "version", escape);
    }
    generate_copyright(_data, escape) {
        return this.generate_value(this, "copyright", escape);
    }
    generate_url(_data, url = "", escape = "url") {
        return this.generate_value({ url: Server.APP_SCOPE + url }, "url", escape);
    }
    generate_offline_switch(_data, hidden) {
        return `<input type="checkbox" id="switch_offline_mode" onclick="navigator.serviceWorker.controller.postMessage({type:&quot;set-setting&quot;,property:&quot;offline-mode&quot;,value:this.checked})" ${server.getSetting("offline-mode") ? ' checked=""' : ""}${hidden == "true" ? "" : ' hidden="'}/>`;
    }
    /**
     * Gibt den Inhalt des &lt;title&gt;-Tags aus
     *
     * @param data Daten-Array der build-Funktion
     * @param mode full | page | site
     * @return Inhalt des &lt;title&gt;-Tags
     */
    generate_title(data, mode) {
        switch (mode) {
            case "page":
                return this.htmlspecialchars(data.page_title);
            case "site":
                return this.htmlspecialchars(data.site_title);
            case "full":
            default:
                if (data.page_title) {
                    return this.htmlspecialchars(data.page_title + " | " + data.site_title);
                }
                else {
                    return this.htmlspecialchars(data.site_title);
                }
        }
    }
    generate_icons(_data) {
        let max_size = "";
        let max_width = 0;
        let max_icon = "";
        if (!this.icon) {
            return "";
        }
        return Server.ICON_SIZES.map(size => {
            let [width, height] = size.split("x");
            let icon = this.icon.replace("${p}", "any").replace("${w}", width).replace("${h}", height);
            if (Number(width) > max_width) {
                max_size = size;
                max_width = Number(width);
                max_icon = icon;
            }
            return `<link rel="apple-touch-icon" sizes="${size}" href="${icon}" /><link rel="icon" sizes="${size}" href="${icon}" />`;
        }).join("") + `<link rel="apple-touch-startup-image" sizes="${max_size}" href="${max_icon}" />`;
    }
    /**
     * Gibt die Stylesheets als &lt;link&gt;-Tags aus
     *
     * @param data Daten-Array der build-Funktion
     * @return &lt;link&gt;-Tags
     */
    generate_styles(data) {
        let html = "";
        for (let index in data.styles) {
            let style = data.styles[index];
            html += "<link id=\"" + this.htmlspecialchars(style.id) + "\" rel=\"stylesheet\" href=\"" + this.htmlspecialchars(style.href) + "\" media=\"" + this.htmlspecialchars(style.media) + "\" type=\"" + this.htmlspecialchars(style.type) + "\" />";
        }
        return html;
    }
    /**
     * Gibt das Skript als &lt;script&gt;-Tags aus
     *
     * @param data Daten-Array der build-Funktion
     * @param position Gibt an, für welche Position die Skripte ausgegeben werden sollen
     * @return &lt;script&gt;-Tags
     */
    generate_scripts(data, position = "head") {
        let html = "";
        for (let index in data.scripts) {
            let script = data.scripts[index];
            if (script.position == position) {
                html += "<script id=\"" + this.htmlspecialchars(script.id) + "\" src=\"" + this.htmlspecialchars(script.src) + "\" type=\"" + this.htmlspecialchars(script.type) + "\"></script>";
            }
        }
        ;
        return html;
    }
    /**
     * Gibt ein Menü aus
     *
     * @param data Daten-Array der build-Funktion
     * @param index Index des Menüs
     * @return
     */
    generate_menu(data, index) {
        if (index in data.menus) {
            return this.build_menu(data.menus[index].submenu);
        }
        else {
            return `<p>Men&uuml; "${index}" wurde nicht gefunden!</p>`;
        }
    }
    async generate_log_badge(_data, type, hide_empty = "false") {
        let options = {
            log: false,
            warn: false,
            error: false
        };
        switch (type) {
            case "log":
                options.log = true;
                break;
            case "warn":
                options.warn = true;
                break;
            case "error":
                options.error = true;
                break;
        }
        let entries = await server.get_log(options);
        if (entries.length == 0 && hide_empty == "true") {
            return "";
        }
        return `<span class="${this.htmlspecialchars(type)}-badge">${this.htmlspecialchars("" + entries.length)}</span>`;
    }
    toast(message, delay = 1000, color = "#000") {
        this.data.toasts.push([message, delay, color]);
    }
    generate_toasts(data) {
        if (data.toasts && data.toasts.length > 0) {
            return "<script type=\"text/javascript\">(async ()=>{let toasts=" + JSON.stringify(data.toasts) + ";let toast;while(toast=toasts.shift()){await createToast(...toast);}})()</script>";
        }
        return "";
    }
}
/// <reference no-default-lib="true" />
/// <reference path="index.ts" />
Number.prototype.toFloatingString = function (decimals) {
    let value = this.toString();
    if (decimals > 0) {
        let floatings = new Array(decimals).fill(0).join("");
        if (value.indexOf(".") > -1) {
            let split = value.split(".");
            if (split[1].length >= floatings.length) {
                return split[0] + "." + split[1].substr(0, floatings.length);
            }
            else {
                return value + floatings.substr(split[1].length);
            }
        }
        else {
            return value + "." + floatings;
        }
    }
    else {
        return value.split(".")[0];
    }
};
String.prototype.toRegExp = function (flags = "") {
    return new RegExp(this.replace(/\s+/gm, " ").split(" ").map(string => string.replace(/([\\\/\[\]\{\}\?\*\+\.\^\$\(\)\:\=\!\|\,])/g, "\\$1")).join("|"), flags);
};
/**
 * replace i18n, if it is not available
 */
// @ts-ignore
let i18n = self.i18n || ((text) => text.toString());
/**
 * Formatiert ein(e) angegebene(s) Ortszeit/Datum gemäß PHP 7
 * @param {string} string die Zeichenfolge, die umgewandelt wird
 * @param {number | string | Date} timestamp der zu verwendende Zeitpunkt
 * @return {string}
 */
function date(string, timestamp = new Date) {
    var d = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
    var escaped = false;
    return string.split("").map(string => {
        if (!escaped && string == "\\") {
            escaped = true;
            return "";
        }
        else if (!escaped && string in date._functions) {
            return date._functions[string](d).toString();
        }
        else {
            escaped = false;
            return string;
        }
    }).join("");
}
(function (date_1) {
    /**
     * Diese Zeichenfolgen werden von `date()` benutzt um die Wochentage darzustellen
     *
     * Sie werden von `i18n(weekdays[i] , "mpc-date")` übersetzt
     */
    date_1.weekdays = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];
    /**
     * Diese Zeichenfolgen werden von `date()` benutzt um die Monate darzustellen
     *
     * Sie werden von `i18n(months[i] , "mpc-date")` übersetzt
     */
    date_1.months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];
    /**
     * Gibt die aktuelle Zeit und Datum in Millisekunden aus.
     * @param {number | string | Date} timestamp Zahl oder `Date`-Objekt/Zeichenfolge um nicht die aktuelle Zeit zu verwenden
     * @return {number}
     */
    function time(timestamp = new Date) {
        var d = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
        return d.getTime();
    }
    date_1.time = time;
    /**
     * Fügt einer Zahl eine führende 0 hinzu, wenn sie kleiner als 10 ist
     * @param {number} value Zahl, der eine führende 0 hinzugefügt werden soll
     * @return {string}
     * @private
     */
    function leadingZero(value) {
        return value < 10 ? "0" + value : value.toString();
    }
    // #region Tag
    /**
     * Die verwendeten Funktionen zur mwandlung der Buchstaben
     * @private
     */
    date_1._functions = Object.create(null);
    /**
     * Tag des Monats, 2-stellig mit führender Null
     * 01 bis 31
     */
    date_1._functions.d = date => {
        return leadingZero(date.getDate());
    };
    /**
     * Wochentag, gekürzt auf drei Buchstaben
     * Mon bis Sun
     */
    date_1._functions.D = date => {
        return i18n(date_1.weekdays[date.getDay()], "mpc-date").substr(0, 3);
    };
    /**
     * Tag des Monats ohne führende Nullen
     * 1 bis 31
     */
    date_1._functions.j = date => {
        return date.getDate();
    };
    /**
     * Ausgeschriebener Wochentag
     * Sunday bis Saturday
     */
    date_1._functions.l = date => {
        return i18n(date_1.weekdays[date.getDay()], "mpc-date");
    };
    /**
     * Numerische Repräsentation des Wochentages gemäß ISO-8601 (in PHP 5.1.0 hinzugefügt)
     * 1 (für Montag) bis 7 (für Sonntag)
     */
    date_1._functions.N = date => {
        return date.getDay() == 0 ? 7 : date.getDay();
    };
    /**
     * Anhang der englischen Aufzählung für einen Monatstag, zwei Zeichen
     * st, nd, rd oder th
     * Zur Verwendung mit j empfohlen.
     */
    date_1._functions.S = date => {
        switch (date.getDate()) {
            case 1:
                return i18n("st", "mpc-date");
            case 2:
                return i18n("nd", "mpc-date");
            case 3:
                return i18n("rd", "mpc-date");
            default:
                return i18n("th", "mpc-date");
        }
    };
    /**
     * Numerischer Tag einer Woche
     * 0 (für Sonntag) bis 6 (für Samstag)
     */
    date_1._functions.w = date => {
        return 7 == date.getDay() ? 0 : date.getDay();
    };
    /**
     * Der Tag des Jahres (von 0 beginnend)
     * 0 bis 366
     */
    date_1._functions.z = date => {
        return Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 864e5).toString();
    };
    // #endregion
    // #region Woche
    /**
     * Der Tag des Jahres (von 0 beginnend)
     * Beispiel: 42 (die 42. Woche im Jahr)
     */
    date_1._functions.W = date => {
        var tmp_date = new Date(date.getTime() + 864e5 * (3 - (date.getDay() + 6) % 7));
        return Math.floor(1.5 + (tmp_date.getTime() - new Date(new Date(tmp_date.getFullYear(), 0, 4).getTime() + 864e5 * (3 - (new Date(tmp_date.getFullYear(), 0, 4).getDay() + 6) % 7)).getTime()) / 864e5 / 7);
    };
    // #endregion
    // #region Monat
    /**
     * Monat als ganzes Wort, wie January oder March
     * January bis December
     */
    date_1._functions.F = date => {
        return i18n(date_1.months[date.getMonth()], "mpc-date");
    };
    /**
     * Monat als Zahl, mit führenden Nullen
     * 01 bis 12
     */
    date_1._functions.m = date => {
        return leadingZero(date.getMonth() + 1);
    };
    /**
     * Monatsname mit drei Buchstaben
     * Jan bis Dec
     */
    date_1._functions.M = date => {
        return i18n(date_1.months[date.getMonth()], "mpc-date").substr(0, 3);
    };
    /**
     * Monatszahl, ohne führende Nullen
     * 1 bis 12
     */
    date_1._functions.n = date => {
        return date.getMonth() + 1;
    };
    /**
     * Anzahl der Tage des angegebenen Monats
     * 28 bis 31
     */
    date_1._functions.t = date => {
        switch (date.getMonth()) {
            case 1:
                if (date.getFullYear() % 4 == 0 &&
                    date.getFullYear() % 100 != 0) {
                    return "29";
                }
                else {
                    return "28";
                }
            case 3:
            case 5:
            case 8:
            case 10:
                return "30";
            default:
                return "31";
        }
    };
    // #endregion
    // #region Jahr
    /**
     * Schaltjahr oder nicht
     * 1 für ein Schaltjahr, ansonsten 0
     */
    date_1._functions.L = date => {
        return date.getFullYear() % 4 == 0 && date.getFullYear() % 100 != 0 ? 1 : 0;
    };
    /**
     * Jahreszahl der Kalenderwoche gemäß ISO-8601. Dies ergibt den gleichen Wert wie Y, außer wenn die ISO-Kalenderwoche (W) zum vorhergehenden oder nächsten Jahr gehört, wobei dann jenes Jahr verwendet wird (in PHP 5.1.0 hinzugefügt).
     * Beispiele: 1999 oder 2003
     */
    date_1._functions.o = date => {
        var tmp_d = new Date(date.toISOString());
        tmp_d.setDate(date.getDate() - (date.getDay() == 0 ? 7 : date.getDay()) + 1);
        return tmp_d.getFullYear();
    };
    /**
     * Vierstellige Jahreszahl
     * Beispiele: 1999 oder 2003
     */
    date_1._functions.Y = date => {
        return date.getFullYear();
    };
    /**
     * Jahreszahl, zweistellig
     * Beispiele: 99 oder 03
     */
    date_1._functions.y = date => {
        var year = date.getFullYear().toString();
        return year.substr(year.length - 2, 2);
    };
    // #endregion
    // #region Uhrzeit
    /**
     * Kleingeschrieben: Ante meridiem (Vormittag) und Post meridiem (Nachmittag)
     * am oder pm
     */
    date_1._functions.a = date => {
        if (date.getHours() > 12) {
            return i18n("pm", "mpc-date");
        }
        return i18n("am", "mpc-date");
    };
    /**
     * Großgeschrieben: Ante meridiem (Vormittag) und Post meridiem (Nachmittag)
     * AM oder PM
     */
    date_1._functions.A = date => {
        if (date.getHours() > 12) {
            return i18n("PM", "mpc-date");
        }
        return i18n("AM", "mpc-date");
    };
    /**
     * Swatch-Internet-Zeit
     * 000 - 999
     */
    date_1._functions.B = () => {
        server.error("date(): B is currently not supported");
        return "B";
    };
    /**
     * Stunde im 12-Stunden-Format, ohne führende Nullen
     * 1 bis 12
     */
    date_1._functions.g = date => {
        return date.getHours() > 12 ? date.getHours() - 11 : date.getHours() + 1;
    };
    /**
     * Stunde im 24-Stunden-Format, ohne führende Nullen
     * 0 bis 23
     */
    date_1._functions.G = date => {
        return date.getHours() + 1;
    };
    /**
     * Stunde im 12-Stunden-Format, mit führenden Nullen
     * 01 bis 12
     */
    date_1._functions.h = date => {
        return leadingZero(date.getHours() > 12 ? date.getHours() - 11 : date.getHours() + 1);
    };
    /**
     * Stunde im 24-Stunden-Format, mit führenden Nullen
     * 00 bis 23
     */
    date_1._functions.H = date => {
        return leadingZero(date.getHours() + 1);
    };
    /**
     * Minuten, mit führenden Nullen
     * 00 bis 59
     */
    date_1._functions.i = date => {
        return leadingZero(date.getMinutes());
    };
    /**
     * Sekunden, mit führenden Nullen
     * 00 bis 59
     */
    date_1._functions.s = date => {
        return leadingZero(date.getSeconds());
    };
    /**
     * Mikrosekunden (hinzugefügt in PHP 5.2.2). Beachten Sie, dass date() immer die Ausgabe 000000 erzeugen wird, da es einen Integer als Parameter erhält, wohingegen DateTime::format() Mikrosekunden unterstützt, wenn DateTime mit Mikrosekunden erzeugt wurde.
     * Beispiel: 654321
     */
    date_1._functions.u = date => {
        return date.getMilliseconds();
    };
    /**
     * Millisekunden (hinzugefügt in PHP 7.0.0). Es gelten die selben Anmerkungen wie für u.
     * Example: 654
     */
    date_1._functions.v = date => {
        return date.getMilliseconds();
    };
    // #endregion
    // #region Zeitzone
    date_1._functions.e = () => {
        server.error("date(): e is currently not supported");
        return "e";
    };
    /**
     * Fällt ein Datum in die Sommerzeit
     * 1 bei Sommerzeit, ansonsten 0.
     */
    date_1._functions.I = () => {
        server.error("date(): I is currently not supported");
        return "I";
    };
    /**
     * Zeitunterschied zur Greenwich time (GMT) in Stunden
     * Beispiel: +0200
     */
    date_1._functions.O = () => {
        server.error("date(): O is currently not supported");
        return "O";
    };
    /**
     * Zeitunterschied zur Greenwich time (GMT) in Stunden mit Doppelpunkt zwischen Stunden und Minuten (hinzugefügt in PHP 5.1.3)
     * Beispiel: +02:00
     */
    date_1._functions.P = () => {
        server.error("date(): P is currently not supported");
        return "P";
    };
    /**
     * Abkürzung der Zeitzone
     * Beispiele: EST, MDT ...
     */
    date_1._functions.T = () => {
        server.error("date(): T is currently not supported");
        return "T";
    };
    /**
     * Offset der Zeitzone in Sekunden. Der Offset für Zeitzonen westlich von UTC ist immer negativ und für Zeitzonen östlich von UTC immer positiv.
     * -43200 bis 50400
     */
    date_1._functions.Z = () => {
        server.error("date(): Z is currently not supported");
        return "Z";
    };
    // #endregion
    // #region Vollständige(s) Datum/Uhrzeit
    /**
     * ISO 8601 Datum (hinzugefügt in PHP 5)
     * 2004-02-12T15:19:21+00:00
     */
    date_1._functions.c = () => {
        server.error("date(): c is currently not supported");
        return "c";
    };
    /**
     * Gemäß » RFC 2822 formatiertes Datum
     * Beispiel: Thu, 21 Dec 2000 16:01:07 +0200
     */
    date_1._functions.r = () => {
        server.error("date(): r is currently not supported");
        return "r";
    };
    /**
     * Sekunden seit Beginn der UNIX-Epoche (January 1 1970 00:00:00 GMT)
     * Siehe auch time()
     */
    date_1._functions.U = date => {
        return date.getTime();
    };
    //#endregion
})(date || (date = {}));
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference path="serviceworker.d.ts" />
/// <reference path="cacheresponse.ts" />
/// <reference path="indexeddb.ts" />
/// <reference path="indexeddbindex.ts" />
/// <reference path="indexeddbevent.ts" />
/// <reference path="serverevent.ts" />
/// <reference path="server.ts" />
/// <reference path="scope.ts" />
/// <reference path="helper.ts" />
// const DEBUG_MODE = "online";
const server = new Server();
/// <reference no-default-lib="true" />
/// <reference path="server/index.ts" />
server.setSetting("site-title", "Vokabel-Trainer");
server.setSetting("theme-color", "#008000");
server.setSetting("copyright", "\u00a9 " + new Date().getFullYear() + " MPDieckmann.");
server.setSetting("server-icon", Server.APP_SCOPE + "/client/png/index/${p}/${w}-${h}.png");
server.setSetting("access-token", "default-access");
server.setSetting("id", "default");
server.start();
/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />
server.registerRoute(Server.APP_SCOPE + "/add_data", {
    files: {
        "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
        "main.css": Server.APP_SCOPE + "/client/css/main.css",
        "print.css": Server.APP_SCOPE + "/client/css/print.css",
        "main.js": Server.APP_SCOPE + "/client/js/main.js",
        "layout.html": Server.APP_SCOPE + "/client/html/layout.html",
        "add_data.html": Server.APP_SCOPE + "/client/html/page/add_data.html",
        "list.css": Server.APP_SCOPE + "/client/css/page/list.css",
        "add_data.css": Server.APP_SCOPE + "/client/css/page/add_data.css",
        "add_data.js": Server.APP_SCOPE + "/client/js/page/add_data.js"
    },
    async response() {
        this.add_style("mpc-css", this.files["mpc.css"].url);
        this.add_style("main-css", this.files["main.css"].url);
        this.add_style("print-css", this.files["print.css"].url, "print");
        this.add_style("list-css", this.files["list.css"].url);
        this.add_style("add_data-css", this.files["add_data.css"].url);
        this.add_script("main-js", this.files["main.js"].url);
        this.add_script("add_data-js", this.files["add_data.js"].url, "text/javascript", "body");
        if (this.POST["data"]) {
            let lesson_text = this.POST["data"];
            let sets = new Set();
            let lessons = new Set();
            if ((await idb.count("vocabulary_sets")) > 0) {
                (await idb.get("vocabulary_sets")).forEach(set => {
                    sets.add(set.id);
                });
            }
            await Promise.all(lesson_text.replace(/\r/g, "").split("\n").map(async (line) => {
                let entry = line.split("\t");
                if (entry.length < 8) {
                    return false;
                }
                let id = (entry[0].length < 2 ? "0" : "") + entry[0] + "-" + (entry[1].length < 2 ? "0" : "") + entry[1];
                let set_id = (entry[2].length < 2 ? "0" : "") + entry[2] + "-" + (entry[3].length < 2 ? "0" : "") + entry[3];
                if (!sets.has(set_id)) {
                    sets.add(set_id);
                    await idb.add("vocabulary_sets", {
                        id: set_id,
                        lesson: Number(entry[2]),
                        points: 0,
                        tries: 0
                    });
                }
                lessons.add(Number(entry[0]));
                let voc = (await idb.get("vocabulary", { id }))[0] || {
                    lesson: Number(entry[0]),
                    id,
                    set_id,
                    tries: 0
                };
                if (voc.set_id != set_id && await idb.count("vocabulary", { set_id }) == 0) {
                    await idb.delete("vocabulary_sets", { id: set_id });
                    sets.delete(set_id);
                }
                voc.set_id = set_id;
                voc.german = (entry[4] || "").normalize("NFD").split("; ");
                voc.transcription = (entry[5] || "").normalize("NFD");
                voc.hebrew = (entry[6] || "").normalize("NFD");
                voc.hints_german = (entry[7] || "").normalize("NFD").split("; ");
                voc.hints_hebrew = (entry[7] || "").normalize("NFD").split("; ").map(hint => {
                    switch (hint) {
                        case "m.Sg.":
                            return "ז'";
                        case "f.Sg.":
                            return "נ'";
                        case "m.Pl.":
                            return "ז\"ר";
                        case "f.Pl.":
                            return "נ\"ר";
                        case "ugs.":
                            return "\u05e1'";
                        default:
                            return hint;
                    }
                });
                await idb.put("vocabulary", voc);
            }));
            let promises = [];
            lessons.forEach(lesson => {
                promises.push(idb.put("lessons", {
                    name: "Lesson " + lesson,
                    number: Number(lesson)
                }));
            });
            await Promise.all(promises);
        }
        return await this.build({
            page_title: "Einträge hinzufügen",
            main: await this.files["add_data.html"].text(),
        }, await this.files["layout.html"].text());
    }
});
/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />
server.registerRoute(Server.APP_SCOPE + "/debug", {
    files: {
        "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
        "main.css": Server.APP_SCOPE + "/client/css/main.css",
        "print.css": Server.APP_SCOPE + "/client/css/print.css",
        "debug.css": Server.APP_SCOPE + "/client/css/debug.css",
        "main.js": Server.APP_SCOPE + "/client/js/main.js",
        "layout.html": Server.APP_SCOPE + "/client/html/layout.html"
    },
    async response() {
        this.add_style("mpc-css", this.files["mpc.css"].url);
        this.add_style("main-css", this.files["main.css"].url);
        this.add_style("debug-css", this.files["debug.css"].url);
        this.add_style("print-css", this.files["print.css"].url, "print");
        this.add_script("main-js", this.files["main.js"].url);
        let main = "";
        if (this.GET.clear_logs == 1) {
            await server.clear_log();
        }
        let props = new Map();
        let counters = new Map();
        let scope = this;
        function expand_property(prop, prefix = "") {
            if (typeof prop == "function" ||
                typeof prop == "object" && prop !== null) {
                if (props.has(prop)) {
                    return `<div class="value-non-primitive">${prefix}<span class="value type-${typeof prop}"><a href="#${scope.htmlspecialchars(encodeURIComponent(props.get(prop)))}">${props.get(prop)}</a></span></div>`;
                }
                let obj_id;
                if (typeof prop == "function") {
                    obj_id = scope.htmlspecialchars(prop.toString().split(" ", 1)[0] == "class" ? "class" : "function") + " " + scope.htmlspecialchars(prop.name);
                    let count = counters.get(obj_id) || 0;
                    counters.set(obj_id, ++count);
                    obj_id += `#${count}(${scope.htmlspecialchars(prop.length)} argument${prop.length == 1 ? "" : "s"})`;
                    props.set(prop, obj_id);
                }
                else {
                    obj_id = Object.prototype.toString.call(prop).replace(/^\[object (.*)\]$/, "$1");
                    let count = counters.get(obj_id) || 0;
                    counters.set(obj_id, ++count);
                    obj_id += "#" + count;
                    props.set(prop, obj_id);
                }
                return `<details class="value-non-primitive" id="${scope.htmlspecialchars(encodeURIComponent(props.get(prop)))}"><summary>${prefix}<span class="value type-${typeof prop}">${obj_id}</span></summary>${[Object.getOwnPropertyNames(prop), Object.getOwnPropertySymbols(prop)].flat().map(key => {
                    let desc = Object.getOwnPropertyDescriptor(prop, key);
                    let html = "";
                    if (typeof desc.get == "function") {
                        html += `<div class="property-${desc.enumerable ? "" : "non-"}enumerable">${expand_property(desc.get, `<span class="property-key"><span class="property-descriptor">get</span> ${scope.htmlspecialchars(key.toString())}</span>: `)}</div>`;
                    }
                    if (typeof desc.set == "function") {
                        html += `<div class="property-${desc.enumerable ? "" : "non-"}enumerable">${expand_property(desc.set, `<span class="property-key"><span class="property-descriptor">set</span> ${scope.htmlspecialchars(key.toString())}</span>: `)}</div>`;
                    }
                    if (typeof desc.get != "function" &&
                        typeof desc.set != "function") {
                        html += `<div class="property-${desc.enumerable ? "" : "non-"}enumerable">${expand_property(desc.value, `<span class="property-key">${desc.writable ? "" : `<span class="property-descriptor">readonly</span> `}${scope.htmlspecialchars(key.toString())}</span>: `)}</div>`;
                    }
                    return html;
                }).join("") + `<div class="property-non-enumerable">${expand_property(Object.getPrototypeOf(prop), `<span class="property-key"><span class="property-descriptor">[[Prototype]]:</span></span> `)}`}</details>`;
            }
            else {
                return `<div class="value-primitive">${prefix}<span class="value type-${typeof prop}">${scope.htmlspecialchars("" + prop)}</span></div>`;
            }
        }
        main += `<div class="server"><h2>Server</h2>${expand_property(server)}</div>`;
        main += `<div class="log">
  <h2>Log</h2>
  <input type="checkbox" id="hide_log" hidden />
  <input type="checkbox" id="hide_warn" hidden />
  <input type="checkbox" id="hide_error" hidden />
  ${(await server.get_log()).map(entry => `<details class="log-${this.htmlspecialchars("" + entry.type)}">
    <summary><span class="timestamp">${this.htmlspecialchars(date("d.m.Y h:i:s", entry.timestamp))}</span> ${this.htmlspecialchars("" + entry.message)}</summary>
    <pre>${this.htmlspecialchars("" + entry.stack)}</pre>
  </details>`).join("\n")}
  <div class="sticky-footer">
    <a class="mpc-button" href="${Server.APP_SCOPE}/debug?clear_logs=1">Alles l&ouml;schen</a>
    <label class="mpc-button" for="hide_log">Log ${await this.generate_log_badge(null, "log")}</label>
    <label class="mpc-button" for="hide_warn">Warnungen ${await this.generate_log_badge(null, "warn")}</label>
    <label class="mpc-button" for="hide_error">Fehler ${await this.generate_log_badge(null, "error")}</label>
  </div>
</div>`;
        return await this.build({
            page_title: "Debug ServiceWorker",
            main,
        }, await this.files["layout.html"].text());
    }
});
/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />
server.registerRoute(Server.APP_SCOPE + "/index.html", {
    response: server.createRedirection(Server.APP_SCOPE + "/")
});
server.registerRoute(Server.APP_SCOPE, {
    response: server.createRedirection(Server.APP_SCOPE + "/")
});
server.registerRoute(Server.APP_SCOPE + "/", {
    files: {
        "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
        "main.css": Server.APP_SCOPE + "/client/css/main.css",
        "print.css": Server.APP_SCOPE + "/client/css/print.css",
        "main.js": Server.APP_SCOPE + "/client/js/main.js",
        "layout.html": Server.APP_SCOPE + "/client/html/layout.html"
    },
    async response() {
        this.add_style("mpc-css", this.files["mpc.css"].url);
        this.add_style("main-css", this.files["main.css"].url);
        this.add_style("print-css", this.files["print.css"].url, "print");
        this.add_script("main-js", this.files["main.js"].url);
        return await this.build({
            page_title: "Startseite",
            main: `<ul>
  <li><a href="${this.generate_url(null)}/train">Trainieren</a></li>
  <li><a href="${this.generate_url(null)}/list">Liste</a></li>
  <li><a href="${this.generate_url(null)}/add_data">Eintr&auml;ge hinzuf&auml;gen</a></li>
  <li><a href="${this.generate_url(null)}/debug">Debug</a></li>
</ul>`,
        }, await this.files["layout.html"].text());
    }
});
/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />
server.registerRoute(Server.APP_SCOPE + "/install.html", {
    response: server.createRedirection(Server.APP_SCOPE + "/")
});
/// <reference no-default-lib="true" />
/// <reference path="server/index.ts" />
let idb = new IndexedDB("voc", 2, {
    vocabulary: {
        name: "vocabulary",
        keyPath: "id",
        autoIncrement: false,
        indices: [
            { name: "by_set", keyPath: "set_id", multiEntry: false, unique: false },
            { name: "by_lesson", keyPath: "lesson", multiEntry: false, unique: false },
            { name: "by_german", keyPath: "german", multiEntry: true, unique: false },
            { name: "by_hebrew", keyPath: "hebrew", multiEntry: false, unique: false },
            { name: "by_tries", keyPath: "tries", multiEntry: false, unique: false },
            { name: "by_fails", keyPath: "fails", multiEntry: false, unique: false },
        ]
    },
    lessons: {
        name: "lessons",
        keyPath: "number",
        autoIncrement: false,
        indices: []
    },
    vocabulary_sets: {
        name: "vocabulary_sets",
        keyPath: "id",
        autoIncrement: false,
        indices: [
            { name: "by_lesson", keyPath: "lesson", multiEntry: false, unique: false },
            { name: "by_points", keyPath: "points", multiEntry: false, unique: false },
            { name: "is_well_known", keyPath: "is_well_known", multiEntry: false, unique: false },
            { name: "is_known", keyPath: "is_known", multiEntry: false, unique: false },
            { name: "is_unknown", keyPath: "is_unknown", multiEntry: false, unique: false },
            { name: "is_very_unknown", keyPath: "is_very_unknown", multiEntry: false, unique: false }
        ]
    }
});
async function update_lessons() {
    let server_lessons = await server.apiFetch("get_lessons");
    let local_lessons = (await idb.get("lessons")).map(a => a.number);
    let new_lessons = server_lessons.filter(a => local_lessons.indexOf(a) < 0);
    if (new_lessons.length > 0) {
        let i = 0;
        let l = new_lessons.length;
        for (i; i < l; i++) {
            await add_lesson(new_lessons[i]);
        }
        return l;
    }
    return 0;
}
async function add_lesson(lesson) {
    let lesson_text = await server.apiFetch("get_lesson", [
        lesson
    ]);
    if (lesson_text === false) {
        return false;
    }
    let sets = new Set();
    let lessons = new Set();
    if (await idb.count("vocabulary_sets") > 0) {
        (await idb.get("vocabulary_sets")).forEach(set => sets.add(set.id));
    }
    await Promise.all(lesson_text.replace(/\r/g, "").split("\n").map(async (line) => {
        let entry = line.split("\t");
        if (entry.length < 8) {
            return false;
        }
        let id = (entry[0].length < 2 ? "0" : "") + entry[0] + "-" + (entry[1].length < 2 ? "0" : "") + entry[1];
        let set_id = (entry[2].length < 2 ? "0" : "") + entry[2] + "-" + (entry[3].length < 2 ? "0" : "") + entry[3];
        if (!sets.has(set_id)) {
            sets.add(set_id);
            await idb.add("vocabulary_sets", { id: set_id, lesson: Number(entry[2]), points: 0, tries: 0 });
        }
        lessons.add(Number(entry[0]));
        let voc = (await idb.get("vocabulary", { id }))[0] || { lesson: Number(entry[0]), id, set_id, tries: 0 };
        if (voc.set_id != set_id &&
            await idb.count("vocabulary", { set_id }) == 0) {
            await idb.delete("vocabulary_sets", { id: set_id });
            sets.delete(set_id);
        }
        voc.set_id = set_id;
        voc.german = (entry[4] ||
            "").normalize("NFD").split("; ");
        voc.transcription = (entry[5] ||
            "").normalize("NFD");
        voc.hebrew = (entry[6] ||
            "").normalize("NFD");
        voc.hints_german = (entry[7] ||
            "").normalize("NFD").split("; ");
        voc.hints_hebrew = (entry[7] ||
            "").normalize("NFD").split("; ").map(hint => {
            switch (hint) {
                case "m.Sg.":
                    return "ז'";
                case "f.Sg.":
                    return "נ'";
                case "m.Pl.":
                    return "ז\"ר";
                case "f.Pl.":
                    return "נ\"ר";
                case "ugs.":
                    return "\u05e1'";
                default:
                    return hint;
            }
        });
        await idb.put("vocabulary", voc);
    }));
    let promises = [];
    lessons.forEach(lesson => promises.push(idb.put("lessons", { name: "Lesson " + lesson, number: Number(lesson) })));
    await Promise.all(promises);
    return true;
}
// server.addEventListener("ping", event => {
//   event.data.await(update_lessons());
// });
server.addEventListener("beforestart", event => {
    event.data.await(idb.ready);
});
/// <reference no-default-lib="true" />
/// <reference path="../main.ts" />
// Möglichkeit, ein globales Navigationsmenü zu erstellen über die Unterseiten
// Jede Unterseite kann sich alleine hinzufügen (durch einen dezimal-Wert kann die eigene Position geregelt werden)
server.registerRoute(Server.APP_SCOPE + "/list", {
    files: {
        "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
        "main.css": Server.APP_SCOPE + "/client/css/main.css",
        "print.css": Server.APP_SCOPE + "/client/css/print.css",
        "list.css": Server.APP_SCOPE + "/client/css/page/list.css",
        "main.js": Server.APP_SCOPE + "/client/js/main.js",
        "layout.html": Server.APP_SCOPE + "/client/html/layout.html"
    },
    async response() {
        this.add_style("mpc-css", this.files["mpc.css"].url);
        this.add_style("main-css", this.files["main.css"].url);
        this.add_style("print-css", this.files["print.css"].url, "print");
        this.add_style("list-css", this.files["list.css"].url);
        this.add_script("main-js", this.files["main.js"].url);
        let main = ``;
        let very_unknown_items_count = await idb.index("vocabulary_sets", "is_very_unknown").count();
        let unknown_items_count = await idb.index("vocabulary_sets", "is_unknown").count();
        let well_known_items_count = await idb.index("vocabulary_sets", "is_well_known").count();
        let known_items_count = await idb.index("vocabulary_sets", "is_known").count();
        let items_count = await idb.count("vocabulary_sets");
        let tried_items_count = known_items_count + unknown_items_count + well_known_items_count;
        let new_items_count = items_count - tried_items_count;
        let lessons = await idb.get("lessons");
        let range = [];
        if (very_unknown_items_count > 15) {
            range.push(...Array(150).fill("very-unknown"));
        }
        else if (very_unknown_items_count > 5) {
            range.push(...Array(100).fill("very-unknown"));
        }
        else if (very_unknown_items_count > 0) {
            range.push(...Array(50).fill("very-unknown"));
        }
        if (unknown_items_count > 15) {
            range.push(...Array(50).fill("unknown"));
        }
        else if (unknown_items_count > 0) {
            range.push(...Array(25).fill("unknown"));
        }
        if (known_items_count > 15) {
            range.push(...Array(50).fill("known"));
        }
        else if (known_items_count > 0) {
            range.push(...Array(25).fill("known"));
        }
        let range_length = range.length;
        if (well_known_items_count >= 25) {
            range.push(...Array(25).fill("well-known"));
        }
        else {
            range.push(...Array(well_known_items_count).fill("well-known"));
        }
        range_length = range.length;
        if (new_items_count > 0) {
            range.push(...Array(25).fill("new"));
        }
        range.push(...Array(5).fill("random"));
        if (range_length < 100) {
            range.push(...Array(100 - range_length).fill("random"));
        }
        main += `<div class="table-scroller">
  <table>
    <caption>Übersicht über Lektionen</caption>
    <thead>
      <tr>
        <th>Lektion</th>
        <th>Sehr Schwierige Wörter</th>
        <th>Schwierige Wörter</th>
        <th>Bekannte Wörter</th>
        <th>Einfache Wörter</th>
        <th>Untrainierte Wörter</th>
        <th>Gesamte Wörter</th>
      </tr>
    </thead>
    <tbody>` + (await Promise.all(lessons.map(async (lesson) => {
            let very_unknown_entry_sets = 0;
            let unknown_entry_sets = 0;
            let known_entry_sets = 0;
            let well_known_entry_sets = 0;
            let new_entry_sets = 0;
            let entry_sets = await idb.count("vocabulary_sets", entry_set => {
                if (entry_set.lesson == lesson.number) {
                    if (entry_set.is_very_unknown) {
                        very_unknown_entry_sets++;
                    }
                    else if (entry_set.is_unknown) {
                        unknown_entry_sets++;
                    }
                    else if (entry_set.is_known) {
                        known_entry_sets++;
                    }
                    else if (entry_set.is_well_known) {
                        well_known_entry_sets++;
                    }
                    else {
                        new_entry_sets++;
                    }
                    return true;
                }
                return false;
            });
            return `
      <tr>
        <th><a href="list?lesson=${lesson.number}">Lektion ${lesson.number}</a></td>
        <td>${very_unknown_entry_sets}</td>
        <td>${unknown_entry_sets}</td>
        <td>${known_entry_sets}</td>
        <td>${well_known_entry_sets}</td>
        <td>${new_entry_sets}</td>
        <td>${entry_sets}</td>
      </tr>`;
        }))).join("") + `
    </tbody>
    <tfoot>
      <tr>
        <th><a href="list">Alle Lektionen</a></td>
        <th>${very_unknown_items_count} (${Math.round(very_unknown_items_count / items_count * 100)}%)</th>
        <th>${unknown_items_count} (${Math.round(unknown_items_count / items_count * 100)}%)</th>
        <th>${known_items_count} (${Math.round(known_items_count / items_count * 100)}%)</th>
        <th>${well_known_items_count} (${Math.round(well_known_items_count / items_count * 100)}%)</th>
        <th>${new_items_count} (${Math.round(new_items_count / items_count * 100)}%)</th>
        <th>${items_count}</th>
      </tr>
      <tr>
        <th>Wahrscheinlichkeiten beim Trainieren</td>
        <td>${range.filter(a => a == "very-unknown").length} (${Math.round(range.filter(a => a == "very-unknown").length / range.length * 100)}%)</td>
        <td>${range.filter(a => a == "unknown").length} (${Math.round(range.filter(a => a == "unknown").length / range.length * 100)}%)</td>
        <td>${range.filter(a => a == "known").length} (${Math.round(range.filter(a => a == "known").length / range.length * 100)}%)</td>
        <td>${range.filter(a => a == "well-known").length} (${Math.round(range.filter(a => a == "well-known").length / range.length * 100)}%)</td>
        <td>${range.filter(a => a == "new").length} (${Math.round(range.filter(a => a == "new").length / range.length * 100)}%)</td>
        <td>${range.filter(a => a == "random").length} (${Math.round(range.filter(a => a == "random").length / range.length * 100)}%)</td>
      </tr>
    </tfoot>
  </table>
</div>`;
        if ("lesson" in this.GET) {
            let very_unknown_items = [];
            let unknown_items = [];
            let known_items = [];
            let well_known_items = [];
            let tried_items = [];
            let new_items = [];
            let items = await idb.get("vocabulary_sets", { lesson: this.GET.lesson });
            items_count = items.length;
            items.forEach(entry_set => {
                if (entry_set.is_very_unknown) {
                    very_unknown_items.push(entry_set);
                }
                else if (entry_set.is_unknown) {
                    unknown_items.push(entry_set);
                }
                else if (entry_set.is_known) {
                    known_items.push(entry_set);
                }
                else if (entry_set.is_well_known) {
                    well_known_items.push(entry_set);
                }
                if (entry_set.points == 0) {
                    new_items.push(entry_set);
                }
                else {
                    tried_items.push(entry_set);
                }
            });
            async function createTable(entry_sets, title) {
                let entries = [];
                let esi = 0;
                let esl = entry_sets.length;
                for (esi; esi < esl; esi++) {
                    let entry_set_entries = await idb.get("vocabulary", { set_id: entry_sets[esi].id });
                    let esei = 0;
                    let esel = entry_set_entries.length;
                    for (esei; esei < esel; esei++) {
                        let entry = entry_set_entries[esei];
                        entries.push(`
      <tr>
        <td class="debug">${entry.id}</td>
        <td class="debug">${entry.set_id}</td>
        <td lang="heb">${entry.hebrew}</td>
        <td lang="und">${entry.transcription}</td>
        <td lang="deu">${entry.german.join(" / ")}</td>
        <td>${entry.hints_german.join(" / ")}</td>
        <td>${entry.fails ? `<i>(${entry.fails})</i> ` : ""}${entry.tries}</td>
        <td>${entry_sets[esi].points}</td>
      </tr>`);
                    }
                }
                return `<div class="table-scroller">
  <table>
    <caption>${title} (${entry_sets.length})</caption>
    <thead>
      <tr>
        <th class="debug">ID</th>
        <th class="debug">Set</th>
        <th>Hebräisch</th>
        <th>Lautschrift</th>
        <th>Deutsch</th>
        <th>Hinweise</th>
        <th><i>(Fehl)</i>Versuche</th>
        <th>Punkte</th>
      </tr>
    </thead>
    <tbody>` + entries.join("") + `
    </tbody>
  </table>
</div>`;
            }
            main += `<h2>Übersicht: Lektion ${this.GET.lesson}</h2>`;
            if (very_unknown_items.length > 0) {
                main += await createTable(very_unknown_items, "Sehr schwierige Wörter");
            }
            if (unknown_items.length > 0) {
                main += await createTable(unknown_items, "Schwierige Wörter");
            }
            if (known_items.length > 0) {
                main += await createTable(known_items, "Bekannte Wörter");
            }
            if (well_known_items.length > 0) {
                main += await createTable(well_known_items, "Einfache Wörter");
            }
            if (new_items.length > 0) {
                main += await createTable(new_items, "Untrainierte Wörter");
            }
        }
        return await this.build({
            page_title: "Vokabel-Trainer",
            main
        }, await this.files["layout.html"].text());
    }
});
/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />
server.registerRoute(Server.APP_SCOPE + "/manifest.webmanifest", {
    icon: Server.APP_SCOPE + "/client/png/index/${p}/${w}-${h}.png",
    response() {
        let manifest = {
            name: server.getSetting("site-title"),
            short_name: server.getSetting("site-title"),
            start_url: Server.APP_SCOPE + "/",
            display: "standalone",
            background_color: server.getSetting("theme-color"),
            theme_color: server.getSetting("theme-color"),
            description: server.getSetting("site-title") + "\n" + server.getSetting("copyright"),
            lang: "de-DE",
            orientation: "natural",
            icons: [],
            shortcuts: []
        };
        let logged_in = server.is_logged_in();
        Server.ICON_SIZES.forEach(size => {
            let [width, height] = size.split("x");
            Server.ICON_PURPOSES.forEach(purpose => {
                manifest.icons.push({
                    src: Server.APP_SCOPE + "/client/png/index/${p}/${w}-${h}.png".replace("${p}", purpose).replace("${w}", width).replace("${h}", height),
                    sizes: size,
                    type: "image/png",
                    purpose: purpose
                });
            });
        });
        logged_in && server.iterateRoutes((route, pathname) => {
            if (route == "cache") {
                return;
            }
            if (route.is_shortcut) {
                manifest.shortcuts.push({
                    name: route.label,
                    url: pathname,
                    icons: route.icon ? Server.ICON_SIZES.map(size => {
                        let [width, height] = size.split("x");
                        return Server.ICON_PURPOSES.map(purpose => {
                            return route.icon.replace("${p}", purpose).replace("${w}", width).replace("${h}", height);
                        });
                    }).flat() : manifest.icons
                });
            }
        });
        return JSON.stringify(manifest);
    }
});
/// <reference no-default-lib="true" />
/// <reference path="../main.ts" />
server.registerRoute(Server.APP_SCOPE + "/train", {
    files: {
        "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
        "main.css": Server.APP_SCOPE + "/client/css/main.css",
        "print.css": Server.APP_SCOPE + "/client/css/print.css",
        "main.js": Server.APP_SCOPE + "/client/js/main.js",
        "layout.html": Server.APP_SCOPE + "/client/html/layout.html",
        "train.html": Server.APP_SCOPE + "/client/html/page/train.html",
        "train.css": Server.APP_SCOPE + "/client/css/page/train.css",
    },
    async response() {
        this.add_style("mpc-css", this.files["mpc.css"].url);
        this.add_style("main-css", this.files["main.css"].url);
        this.add_style("print-css", this.files["print.css"].url, "print");
        this.add_script("main-js", this.files["main.js"].url);
        this.add_style("train-css", this.files["train.css"].url);
        if ("id" in this.GET &&
            "hints_used" in this.GET &&
            "known" in this.GET) {
            let entry = (await idb.get("vocabulary", { id: this.GET.id }))[0];
            if (entry) {
                entry.tries += 1;
                if (this.GET.known == -1) {
                    entry.fails = (entry.fails || 0) + 1;
                }
                await idb.put("vocabulary", entry);
                let entries = await idb.get("vocabulary", { set_id: entry.set_id });
                let entry_set = (await idb.get("vocabulary_sets", { id: entry.set_id }))[0];
                entry_set.points = (entry_set.points || 0) + Number(this.GET.known) - Number(this.GET.hints_used) * 0.5;
                entry_set.tries++;
                delete entry_set.is_well_known;
                delete entry_set.is_known;
                delete entry_set.is_unknown;
                delete entry_set.is_very_unknown;
                if (entry_set.points > 5) {
                    entry_set.is_well_known = 1;
                }
                else if (entry_set.points > 0) {
                    entry_set.is_known = 1;
                }
                else if (entry_set.points < -4) {
                    entry_set.is_very_unknown = 1;
                }
                else if (entry_set.points < 0) {
                    entry_set.is_unknown = 1;
                }
                await idb.put("vocabulary_sets", entry_set);
                await Promise.all(entries.map(async (entry) => {
                    if (entry_set.points > 20) {
                        delete entry.fails;
                    }
                    await idb.put("vocabulary", entry);
                }));
            }
        }
        let very_unknown_items_count = await idb.index("vocabulary_sets", "is_very_unknown").count();
        let unknown_items_count = await idb.index("vocabulary_sets", "is_unknown").count();
        let well_known_items_count = await idb.index("vocabulary_sets", "is_well_known").count();
        let known_items_count = await idb.index("vocabulary_sets", "is_known").count();
        let items_count = await idb.count("vocabulary_sets");
        let tried_items_count = known_items_count + unknown_items_count + well_known_items_count;
        let new_items_count = items_count - tried_items_count;
        let range = [];
        if (very_unknown_items_count > 15) {
            range.push(...Array(150).fill("very-unknown"));
        }
        else if (very_unknown_items_count > 5) {
            range.push(...Array(100).fill("very-unknown"));
        }
        else if (very_unknown_items_count > 0) {
            range.push(...Array(50).fill("very-unknown"));
        }
        if (unknown_items_count > 15) {
            range.push(...Array(50).fill("unknown"));
        }
        else if (unknown_items_count > 0) {
            range.push(...Array(25).fill("unknown"));
        }
        if (known_items_count > 15) {
            range.push(...Array(50).fill("known"));
        }
        else if (known_items_count > 0) {
            range.push(...Array(25).fill("known"));
        }
        let range_length = range.length;
        if (well_known_items_count >= 25) {
            range.push(...Array(25).fill("well-known"));
        }
        else {
            range.push(...Array(well_known_items_count).fill("well-known"));
        }
        range_length = range.length;
        if (new_items_count > 0) {
            range.push(...Array(25).fill("new"));
        }
        range.push(...Array(5).fill("random"));
        if (range_length < 100) {
            range.push(...Array(100 - range_length).fill("random"));
        }
        let item = null;
        let index = rndInt(0, range.length - 1);
        let entry = null;
        let entries = null;
        let entry_sets = null;
        switch (range[index]) {
            case "known":
                entry_sets = await idb.index("vocabulary_sets", "is_known").get();
                break;
            case "new":
                entry_sets = await idb.get("vocabulary_sets", { tries: 0 });
                break;
            case "random":
                entry_sets = await idb.get("vocabulary_sets");
                break;
            case "unknown":
                entry_sets = await idb.index("vocabulary_sets", "is_unknown").get();
                break;
            case "very-unknown":
                entry_sets = await idb.index("vocabulary_sets", "is_very_unknown").get();
                break;
            case "well-known":
                entry_sets = await idb.index("vocabulary_sets", "is_well_known").get();
                break;
        }
        entries = await idb.get("vocabulary", { set_id: entry_sets[rndInt(0, entry_sets.length - 1)].id });
        entry = entries[rndInt(0, entries.length - 1)];
        if (entry) {
            item = {
                id: entry.id,
                german: entry.german.join(" / "),
                hebrew: entry.hebrew,
                hint_german: entry.hints_german.join(" / "),
                hint_hebrew: entry.hints_hebrew.join(" / "),
                hint_lesson: entry.lesson.toString(),
                hint_transcription: entry.transcription,
                hint_tries: entry.tries,
                hint_points: (await idb.get("vocabulary_sets", { id: entry.set_id }))[0].points
            };
        }
        else {
            item = {
                id: "",
                german: "Eintrag nicht gefunden",
                hebrew: "Eintrag nicht gefunden",
                hint_german: "",
                hint_hebrew: "",
                hint_lesson: "",
                hint_transcription: "",
                hint_tries: 0,
                hint_points: 0
            };
        }
        let main = await this.build(item, await this.files["train.html"].text());
        return await this.build({
            page_title: "Vokabel-Trainer",
            main
        }, await this.files["layout.html"].text());
    }
});
/**
 *
 * @param min inklusive min
 * @param max inclusive max
 * @returns min <= random number <= max
 */
function rndInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}
//# sourceMappingURL=serviceworker.js.map