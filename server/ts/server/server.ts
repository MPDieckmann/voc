/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class Server extends EventTarget {
  [Symbol.toStringTag] = "Server";

  static readonly APP_SCOPE = registration.scope.replace(/\/$/, "");
  static readonly API_URL = Server.APP_SCOPE + "/api.php";
  static readonly API_VERSION = 2;
  static readonly MPC_CACHE_NAME: string = "MPC-Server-Cache";
  static readonly server: Server;
  static readonly ICON_SIZES = [
    "48x48",
    "72x72",
    "96x96",
    "144x144",
    "192x192",
    "512x512"
  ];
  static readonly ICON_PURPOSES = [
    "any",
    "maskable",
    "monochrome"
  ];
  static get VERSION() {
    return (this.server && this.server.#VERSION) || "Fehler: Der ServiceWorker wurde noch nicht initialisiert!";
  }

  readonly #routes: Map<string, Route<any> | "cache"> = new Map();
  readonly APP_SCOPE = Server.APP_SCOPE;
  readonly API_URL = Server.API_URL;
  readonly API_VERSION = Server.API_VERSION;
  readonly MPC_CACHE_NAME = Server.MPC_CACHE_NAME;
  readonly ready: PromiseLike<this>;
  #pinging: boolean = false;
  #connected: boolean = false;
  // #online: boolean = typeof DEBUG_MODE == "string" ? DEBUG_MODE == "online" : navigator.onLine;
  #online: boolean = navigator.onLine;
  #VERSION: string;
  #settings: Map<keyof ServerSettingsMap, ServerSettingsMap[keyof ServerSettingsMap]> = new Map();
  #start: Promise<null> & { resolve(value: null): void; };
  #idb = new IndexedDB<{
    settings: {
      Records: { key: keyof ServerSettingsMap, value: ServerSettingsMap[keyof ServerSettingsMap]; };
      Indices: never;
    };
    log: {
      Records: { type: string, message: string, stack: string, timestamp: number };
      Indices: "by_type";
    }
  }>("Server", 2, {
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
        } else {
          this.ping();
        }
      }
    });

    let _resolve: (value: null) => void;
    this.#start = <Promise<null> & { resolve(value: null): void; }>new Promise(resolve => _resolve = resolve);
    this.#start.resolve = _resolve;

    this.registerRoute(Server.APP_SCOPE + "/serviceworker.js", "cache");

    this.ready = (async () => {
      let promises: PromiseLike<void>[] = [];
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

  async #log(type: string, message: string, stack: string): Promise<void> {
    await this.#idb.put("log", {
      timestamp: Date.now(),
      type,
      message,
      stack
    });
  }

  async log(message: string, stack: string = null): Promise<void> {
    console.log(message, stack);
    await this.#log("log", message, stack);
  }
  async warn(message: string, stack: string = null): Promise<void> {
    console.warn(message, stack);
    await this.#log("warn", message, stack);
  }
  async error(message: string, stack: string = null): Promise<void> {
    console.error(message, stack);
    await this.#log("error", message, stack);
  }
  async clear_log(): Promise<void> {
    await this.#idb.delete("log");
    this.#log("clear", "Das Protokoll wurde erfolgreich gelöscht", null);
    console.clear();
  }
  async get_log(types: {
    log?: boolean;
    warn?: boolean;
    error?: boolean;
  } = {
      log: true,
      warn: true,
      error: true
    }): Promise<{
      type: string;
      message: string;
      stack: string;
      timestamp: number;
    }[]> {
    if (types.log && types.warn && types.error) {
      return this.#idb.get("log");
    } else {
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
    let promises: PromiseLike<void>[] = [];
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
    let promises: PromiseLike<void>[] = [];
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
    } catch (e) {
      this.error(e.message, e.stack);
      return "Update fehlgeschlagen!";
    }
  }
  async activate() {
    // console.log("server called 'activate'", { server, routes: this.#routes });
    let promises: PromiseLike<void>[] = [];
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
  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    // console.log("server called 'fetch'", { server, routes: this.#routes, arguments });
    let response: Response = null;
    let respondWithResponse: Response | PromiseLike<Response> = null;
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
      } else if (typeof route == "object") {
        if (typeof route.response == "function") {
          let scope = await new Scope<any>(request, route).ready;
          let rtn = await route.response.call(scope, scope);
          response = (typeof rtn == "object" && rtn instanceof Response) ? rtn : new Response(rtn, {
            headers: scope.headers,
            status: scope.status,
            statusText: scope.statusText
          });
        } else {
          let rtn = await route.response;
          response = (typeof rtn == "object" && rtn instanceof Response) ? rtn : new Response(rtn);
        }
      } else {
        throw "File not cached: " + request.url;
      }
    } catch (error) {
      if (error && error.message) {
        this.error(error.message, error.stack);
      } else {
        this.error(error);
      }
      response = new Response(await this.generate_error(new Scope<any>(request, {
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
    let promises: PromiseLike<void>[] = [];
    this.dispatchEvent(new ServerEvent("start", { cancelable: false, group: "start", data: { await(promise) { promises.push(promise); } } }));
    await Promise.all(promises);
    this.#start.resolve(null);
  }
  async message<K extends keyof ServerMessageMap>(message: ServerMessage<K>, source: Client | ServiceWorker | MessagePort) {
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
  setSetting<K extends keyof ServerSettingsMap>(property: K, value: ServerSettingsMap[K]): boolean {
    this.#settings.set(property, value);
    this.#idb.put("settings", { key: property, value: value });
    return true;
  }
  hasSetting<K extends keyof ServerSettingsMap>(property: K): boolean {
    return this.#settings.has(property);
  }
  getSetting<K extends keyof ServerSettingsMap>(property: K): ServerSettingsMap[K] {
    if (this.#settings.has(property)) {
      return <ServerSettingsMap[K]>this.#settings.get(property);
    }
    return null;
  }
  async ping() {
    if (!this.#pinging) {
      this.#pinging = true;
      let promises: PromiseLike<void>[] = [];
      this.dispatchEvent(new ServerEvent("beforeping", { cancelable: false, group: "ping", data: { await(promise) { promises.push(promise); } } }));
      await Promise.all(promises);
      this.#connected = await this.is_connected();
      let was_ping = false;
      if (this.#connected && this.is_logged_in()) {
        was_ping = true;
        let promises: PromiseLike<void>[] = [];
        this.dispatchEvent(new ServerEvent("ping", { cancelable: false, group: "ping", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
      }
      this.#pinging = false;
      if (was_ping) {
        let promises: PromiseLike<void>[] = [];
        this.dispatchEvent(new ServerEvent("afterping", { cancelable: false, group: "ping", data: { await(promise) { promises.push(promise); } } }));
        await Promise.all(promises);
      }
    }
  }
  async apiFetch<F extends keyof APIFunctions>(func: F, args: APIFunctions[F]["args"] = []): Promise<APIFunctions[F]["return"]> {
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
  async awaitEventListener<T extends Event>(target: EventTarget, resolve_type: string, reject_type: string = "error"): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      function resolveCallback(event: T) {
        resolve(event);
        target.removeEventListener(resolve_type, resolveCallback);
        target.removeEventListener(reject_type, rejectCallback);
      }
      function rejectCallback(event: T) {
        reject(event);
        target.removeEventListener(resolve_type, resolveCallback);
        target.removeEventListener(reject_type, rejectCallback);
      }
      target.addEventListener(resolve_type, resolveCallback);
      target.addEventListener(reject_type, rejectCallback);
    });
  }
  async is_connected(): Promise<boolean> {
    try {
      let value = await this.apiFetch("is_connected");
      if (value === false && this.is_logged_in()) {
        this.error("Der Server hat die Authentifizierung abgelehnt");
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  async generate_error(scope: Scope<any>, options: { message: string; stack?: string; code?: number; }): Promise<string> {
    if (typeof options.code != "number") {
      options.code = 500;
    }
    scope.status = options.code;
    return scope.build(options, `Error ${options.code}: ${options.message}\n${options.stack}`);
  }

  is_logged_in() {
    return !!(
      this.getSetting("id") &&
      this.getSetting("access-token")
    );
  }

  registerRoute<F extends string>(pathname: string, route: Route<F> | "cache") {
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
    } else if (route != "cache" && this.#routes.get(pathname) != "cache") {
      this.#routes.set(pathname, route);
    }
  }
  iterateRoutes(callback: <F extends string>(route: Route<F> | "cache", pathname: string) => void) {
    this.#routes.forEach(callback);
  }

  createRedirection(url: string): Response {
    return new Response(url, {
      status: 302,
      statusText: "Found",
      headers: {
        Location: url
      }
    });
  }

  #staticEvents: Map<keyof ServerEventMap, (this: Server, ev: ServerEventMap[keyof ServerEventMap]) => any> = new Map();
  get onbeforeinstall() {
    return this.#staticEvents.get("beforeinstall") || null;
  }
  set onbeforeinstall(value: (this: Server, ev: ServerEventMap["beforeinstall"]) => any) {
    if (this.#staticEvents.has("beforeinstall")) {
      this.removeEventListener("beforeinstall", this.#staticEvents.get("beforeinstall"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforeinstall", value);
      this.addEventListener("beforeinstall", value);
    } else {
      this.#staticEvents.delete("beforeinstall");
    }
  }
  get oninstall() {
    return this.#staticEvents.get("install") || null;
  }
  set oninstall(value: (this: Server, ev: ServerEventMap["install"]) => any) {
    if (this.#staticEvents.has("install")) {
      this.removeEventListener("install", this.#staticEvents.get("install"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("install", value);
      this.addEventListener("install", value);
    } else {
      this.#staticEvents.delete("install");
    }
  }
  get onafterinstall() {
    return this.#staticEvents.get("afterinstall") || null;
  }
  set onafterinstall(value: (this: Server, ev: ServerEventMap["afterinstall"]) => any) {
    if (this.#staticEvents.has("afterinstall")) {
      this.removeEventListener("afterinstall", this.#staticEvents.get("afterinstall"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("afterinstall", value);
      this.addEventListener("afterinstall", value);
    } else {
      this.#staticEvents.delete("afterinstall");
    }
  }

  get onbeforeupdate() {
    return this.#staticEvents.get("beforeupdate") || null;
  }
  set onbeforeupdate(value: (this: Server, ev: ServerEventMap["beforeupdate"]) => any) {
    if (this.#staticEvents.has("beforeupdate")) {
      this.removeEventListener("beforeupdate", this.#staticEvents.get("beforeupdate"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforeupdate", value);
      this.addEventListener("beforeupdate", value);
    } else {
      this.#staticEvents.delete("beforeupdate");
    }
  }
  get onupdate() {
    return this.#staticEvents.get("update") || null;
  }
  set onupdate(value: (this: Server, ev: ServerEventMap["update"]) => any) {
    if (this.#staticEvents.has("update")) {
      this.removeEventListener("update", this.#staticEvents.get("update"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("update", value);
      this.addEventListener("update", value);
    } else {
      this.#staticEvents.delete("update");
    }
  }
  get onafterupdate() {
    return this.#staticEvents.get("afterupdate") || null;
  }
  set onafterupdate(value: (this: Server, ev: ServerEventMap["afterupdate"]) => any) {
    if (this.#staticEvents.has("afterupdate")) {
      this.removeEventListener("afterupdate", this.#staticEvents.get("afterupdate"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("afterupdate", value);
      this.addEventListener("afterupdate", value);
    } else {
      this.#staticEvents.delete("afterupdate");
    }
  }

  get onbeforeactivate() {
    return this.#staticEvents.get("beforeactivate") || null;
  }
  set onbeforeactivate(value: (this: Server, ev: ServerEventMap["beforeactivate"]) => any) {
    if (this.#staticEvents.has("beforeactivate")) {
      this.removeEventListener("beforeactivate", this.#staticEvents.get("beforeactivate"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforeactivate", value);
      this.addEventListener("beforeactivate", value);
    } else {
      this.#staticEvents.delete("beforeactivate");
    }
  }
  get onactivate() {
    return this.#staticEvents.get("activate") || null;
  }
  set onactivate(value: (this: Server, ev: ServerEventMap["activate"]) => any) {
    if (this.#staticEvents.has("activate")) {
      this.removeEventListener("activate", this.#staticEvents.get("activate"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("activate", value);
      this.addEventListener("activate", value);
    } else {
      this.#staticEvents.delete("activate");
    }
  }
  get onafteractivate() {
    return this.#staticEvents.get("afteractivate") || null;
  }
  set onafteractivate(value: (this: Server, ev: ServerEventMap["afteractivate"]) => any) {
    if (this.#staticEvents.has("afteractivate")) {
      this.removeEventListener("afteractivate", this.#staticEvents.get("afteractivate"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("afteractivate", value);
      this.addEventListener("afteractivate", value);
    } else {
      this.#staticEvents.delete("afteractivate");
    }
  }

  get onbeforefetch() {
    return this.#staticEvents.get("beforefetch") || null;
  }
  set onbeforefetch(value: (this: Server, ev: ServerEventMap["beforefetch"]) => any) {
    if (this.#staticEvents.has("beforefetch")) {
      this.removeEventListener("beforefetch", this.#staticEvents.get("beforefetch"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforefetch", value);
      this.addEventListener("beforefetch", value);
    } else {
      this.#staticEvents.delete("beforefetch");
    }
  }
  get onfetch() {
    return this.#staticEvents.get("fetch") || null;
  }
  set onfetch(value: (this: Server, ev: ServerEventMap["fetch"]) => any) {
    if (this.#staticEvents.has("fetch")) {
      this.removeEventListener("fetch", this.#staticEvents.get("fetch"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("fetch", value);
      this.addEventListener("fetch", value);
    } else {
      this.#staticEvents.delete("fetch");
    }
  }
  get onafterfetch() {
    return this.#staticEvents.get("afterfetch") || null;
  }
  set onafterfetch(value: (this: Server, ev: ServerEventMap["afterfetch"]) => any) {
    if (this.#staticEvents.has("afterfetch")) {
      this.removeEventListener("afterfetch", this.#staticEvents.get("afterfetch"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("afterfetch", value);
      this.addEventListener("afterfetch", value);
    } else {
      this.#staticEvents.delete("afterfetch");
    }
  }

  get onbeforestart() {
    return this.#staticEvents.get("beforestart") || null;
  }
  set onbeforestart(value: (this: Server, ev: ServerEventMap["beforestart"]) => any) {
    if (this.#staticEvents.has("beforestart")) {
      this.removeEventListener("beforestart", this.#staticEvents.get("beforestart"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforestart", value);
      this.addEventListener("beforestart", value);
    } else {
      this.#staticEvents.delete("beforestart");
    }
  }
  get onstart() {
    return this.#staticEvents.get("start") || null;
  }
  set onstart(value: (this: Server, ev: ServerEventMap["start"]) => any) {
    if (this.#staticEvents.has("start")) {
      this.removeEventListener("start", this.#staticEvents.get("start"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("start", value);
      this.addEventListener("start", value);
    } else {
      this.#staticEvents.delete("start");
    }
  }
  get onafterstart() {
    return this.#staticEvents.get("afterstart") || null;
  }
  set onafterstart(value: (this: Server, ev: ServerEventMap["afterstart"]) => any) {
    if (this.#staticEvents.has("afterstart")) {
      this.removeEventListener("afterstart", this.#staticEvents.get("afterstart"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("afterstart", value);
      this.addEventListener("afterstart", value);
    } else {
      this.#staticEvents.delete("afterstart");
    }
  }

  get onbeforemessage() {
    return this.#staticEvents.get("beforemessage") || null;
  }
  set onbeforemessage(value: (this: Server, ev: ServerEventMap["beforemessage"]) => any) {
    if (this.#staticEvents.has("beforemessage")) {
      this.removeEventListener("beforemessage", this.#staticEvents.get("beforemessage"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforemessage", value);
      this.addEventListener("beforemessage", value);
    } else {
      this.#staticEvents.delete("beforemessage");
    }
  }
  get onmessage() {
    return this.#staticEvents.get("message") || null;
  }
  set onmessage(value: (this: Server, ev: ServerEventMap["message"]) => any) {
    if (this.#staticEvents.has("message")) {
      this.removeEventListener("message", this.#staticEvents.get("message"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("message", value);
      this.addEventListener("message", value);
    } else {
      this.#staticEvents.delete("message");
    }
  }
  get onaftermessage() {
    return this.#staticEvents.get("aftermessage") || null;
  }
  set onaftermessage(value: (this: Server, ev: ServerEventMap["aftermessage"]) => any) {
    if (this.#staticEvents.has("aftermessage")) {
      this.removeEventListener("aftermessage", this.#staticEvents.get("aftermessage"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("aftermessage", value);
      this.addEventListener("aftermessage", value);
    } else {
      this.#staticEvents.delete("aftermessage");
    }
  }

  get onbeforeping() {
    return this.#staticEvents.get("beforeping") || null;
  }
  set onbeforeping(value: (this: Server, ev: ServerEventMap["beforeping"]) => any) {
    if (this.#staticEvents.has("beforeping")) {
      this.removeEventListener("beforeping", this.#staticEvents.get("beforeping"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("beforeping", value);
      this.addEventListener("beforeping", value);
    } else {
      this.#staticEvents.delete("beforeping");
    }
  }
  get onping() {
    return this.#staticEvents.get("ping") || null;
  }
  set onping(value: (this: Server, ev: ServerEventMap["ping"]) => any) {
    if (this.#staticEvents.has("ping")) {
      this.removeEventListener("ping", this.#staticEvents.get("ping"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("ping", value);
      this.addEventListener("ping", value);
    } else {
      this.#staticEvents.delete("ping");
    }
  }
  get onafterping() {
    return this.#staticEvents.get("afterping") || null;
  }
  set onafterping(value: (this: Server, ev: ServerEventMap["afterping"]) => any) {
    if (this.#staticEvents.has("afterping")) {
      this.removeEventListener("afterping", this.#staticEvents.get("afterping"));
    }
    if (typeof value == "function") {
      this.#staticEvents.set("afterping", value);
      this.addEventListener("afterping", value);
    } else {
      this.#staticEvents.delete("afterping");
    }
  }
}

interface Server {
  addEventListener<K extends keyof ServerEventMap>(type: K, listener: (this: Server, ev: ServerEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
}

interface ServerEventMap {
  online: ServerEvent<"network">;
  offline: ServerEvent<"network">;
  connected: ServerEvent<"network">;
  disconnected: ServerEvent<"network">;

  beforeinstall: ServerEvent<"start">;
  install: ServerEvent<"start">;
  afterinstall: ServerEvent<"start">;

  beforeupdate: ServerEvent<"start">;
  update: ServerEvent<"start">;
  afterupdate: ServerEvent<"start">;

  beforeactivate: ServerEvent<"start">;
  activate: ServerEvent<"start">;
  afteractivate: ServerEvent<"start">;

  beforefetch: ServerEvent<"fetch">;
  fetch: ServerEvent<"fetch">;
  afterfetch: ServerEvent<"fetch">;

  beforestart: ServerEvent<"start">;
  start: ServerEvent<"start">;
  afterstart: ServerEvent<"start">;

  beforemessage: ServerEvent<"message">;
  message: ServerEvent<"message">;
  aftermessage: ServerEvent<"message">;

  beforeping: ServerEvent<"ping">;
  ping: ServerEvent<"ping">;
  afterping: ServerEvent<"ping">;
}

interface ServerEventGroupMap {
  start: {
    await(promise: PromiseLike<any>): void;
  };
  network: null;
  fetch: {
    url: string;
    request: Request;
    response: Response;
    respondWith(response: Response | PromiseLike<Response>): void;
  };
  message: ServerMessage<keyof ServerMessageMap>;
  ping: {
    await(promise: PromiseLike<any>): void;
  };
}

interface ServerSettingsMap {
  "offline-mode": boolean;
  "access-token": string;
  "id": string;
  "site-title": string;
  "theme-color": string;
  copyright: string;
  "server-icon": string;
}

interface APIFunctions {
  is_connected: {
    args: [];
    return: boolean;
  }
}

interface Route<F extends string> {
  label?: string;
  icon?: string;
  is_shortcut?: boolean;
  files?: {
    [s in F]: string;
  };
  response: RouteResponseBody<F> | Response;
}

type RouteResponseBody<F extends string> = BodyInit | null | Promise<BodyInit | null> | RouteResponseBodyHandler<F>;
type RouteResponseBodyHandler<F extends string> = (this: Scope<F>, scope: Scope<F>) => Response | BodyInit | null | Promise<Response | BodyInit | null>;

type ServerMessage<K extends keyof ServerMessageMap> = { type: K } & ServerMessageMap[K];

interface ServerMessageMap {
  "set-setting": {
    property: keyof ServerSettingsMap;
    value: ServerSettingsMap[keyof ServerSettingsMap];
  };
}
