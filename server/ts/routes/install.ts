/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />

server.registerRoute(Server.APP_SCOPE + "/install.html", {
  response: server.createRedirection(Server.APP_SCOPE + "/")
});
