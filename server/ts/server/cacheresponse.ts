/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class CacheResponse {
  [Symbol.toStringTag] = "CacheResponse";

  #response: Response = null;
  #arrayBuffer: ArrayBuffer;
  #blob: Blob;
  #formData: FormData;
  #json: any;
  #text: string;
  #url: string;
  constructor(url: string) {
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
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.#response == null) {
      await this.#getResponse();
    }
    if (!this.#arrayBuffer) {
      this.#arrayBuffer = await this.#response.arrayBuffer();
    }
    return this.#arrayBuffer;
  }
  async blob(): Promise<Blob> {
    if (this.#response == null) {
      await this.#getResponse();
    }
    if (!this.#blob) {
      this.#blob = await this.#response.blob();
    }
    return this.#blob;
  }
  async formData(): Promise<FormData> {
    if (this.#response == null) {
      await this.#getResponse();
    }
    if (!this.#formData) {
      this.#formData = await this.#response.formData();
    }
    return this.#formData;
  }
  async json(): Promise<any> {
    if (this.#response == null) {
      await this.#getResponse();
    }
    if (!this.#json) {
      this.#json = await this.#response.json();
    }
    return this.#json;
  }
  async text(): Promise<string> {
    if (this.#response == null) {
      await this.#getResponse();
    }
    if (!this.#text) {
      this.#text = await this.#response.text();
    }
    return this.#text;
  }
  clone(): CacheResponse {
    return new CacheResponse(this.#url);
  }
}
