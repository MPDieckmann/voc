/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class ServerEvent<G extends keyof ServerEventGroupMap> extends Event {
  [Symbol.toStringTag] = "ServerEvent";

  #group: G | null;
  get group() {
    return this.#group;
  }
  #data: ServerEventGroupMap[G] | null;
  get data() {
    return this.#data;
  }
  constructor(type: string, eventInitDict: ServerEventInit<G>) {
    super(type, eventInitDict);
    this.#group = eventInitDict.group || null;
    this.#data = eventInitDict.data || null;
  }
  /** @deprecated */
  initServerEvent(type: string, bubbles?: boolean, cancelable?: boolean, group?: G, data?: ServerEventGroupMap[G]) {
    super.initEvent(type, bubbles, cancelable);
    this.#group = group;
    this.#data = data;
  }
}

interface ServerEventInit<G extends keyof ServerEventGroupMap> extends EventInit {
  group?: G;
  data?: ServerEventGroupMap[G];
}

interface ServerEventGroupMap {}
