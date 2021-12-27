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

    let props: Map<object, string> = new Map();
    let counters: Map<string, number> = new Map();
    let scope = this;
    function expand_property(prop: any, prefix: string = "") {
      if (
        typeof prop == "function" ||
        typeof prop == "object" && prop !== null
      ) {
        if (props.has(prop)) {
          return `<div class="value-non-primitive">${prefix}<span class="value type-${typeof prop}"><a href="#${scope.htmlspecialchars(encodeURIComponent(props.get(prop)))}">${props.get(prop)}</a></span></div>`;
        }
        let obj_id: string;
        if (typeof prop == "function") {
          obj_id = scope.htmlspecialchars(prop.toString().split(" ", 1)[0] == "class" ? "class" : "function") + " " + scope.htmlspecialchars(prop.name);
          let count = counters.get(obj_id) || 0;
          counters.set(obj_id, ++count);
          obj_id += `#${count}(${scope.htmlspecialchars(prop.length)} argument${prop.length == 1 ? "" : "s"})`;
          props.set(prop, obj_id);
        } else {
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
          if (
            typeof desc.get != "function" &&
            typeof desc.set != "function"
          ) {
            html += `<div class="property-${desc.enumerable ? "" : "non-"}enumerable">${expand_property(desc.value, `<span class="property-key">${desc.writable ? "" : `<span class="property-descriptor">readonly</span> `}${scope.htmlspecialchars(key.toString())}</span>: `)}</div>`;
          }
          return html;
        }).join("") + `<div class="property-non-enumerable">${expand_property(Object.getPrototypeOf(prop), `<span class="property-key"><span class="property-descriptor">[[Prototype]]:</span></span> `)}`}</details>`;
      } else {
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
