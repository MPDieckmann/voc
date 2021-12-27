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
