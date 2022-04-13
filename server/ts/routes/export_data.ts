/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />

server.registerRoute(Server.APP_SCOPE + "/export_data", {
  files: {
    "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
    "main.css": Server.APP_SCOPE + "/client/css/main.css",
    "print.css": Server.APP_SCOPE + "/client/css/print.css",
    "main.js": Server.APP_SCOPE + "/client/js/main.js",
    "layout.html": Server.APP_SCOPE + "/client/html/layout.html",
    "list.css": Server.APP_SCOPE + "/client/css/page/list.css",
    "export_data.html": Server.APP_SCOPE + "/client/html/page/export_data.html",
    "export_data.css": Server.APP_SCOPE + "/client/css/page/add_userdata.css",
    "export_data.js": Server.APP_SCOPE + "/client/js/page/export_data.js"
  },
  async response() {
    this.add_style("mpc-css", this.files["mpc.css"].url);
    this.add_style("main-css", this.files["main.css"].url);
    this.add_style("print-css", this.files["print.css"].url, "print");
    this.add_style("list-css", this.files["list.css"].url);
    this.add_style("export_data-css", this.files["export_data.css"].url);
    this.add_script("main-js", this.files["main.js"].url);
    this.add_script("export_data-js", this.files["export_data.js"].url, "text/javascript", "body");

    return await this.build({
      page_title: "Benutzerdaten exportieren / importieren",
      main: await this.build({
        user_data: `{"lessons":${JSON.stringify((await idb.get("lessons")))},"vocabulary":${JSON.stringify((await idb.get("vocabulary")))},"vocabulary_sets":${JSON.stringify((await idb.get("vocabulary_sets")))}`
      }, await this.files["export_data.html"].text())
    }, await this.files["layout.html"].text());
  }
});
