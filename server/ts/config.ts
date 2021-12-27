/// <reference no-default-lib="true" />
/// <reference path="server/index.ts" />

server.setSetting("site-title", "Vokabel-Trainer");
server.setSetting("theme-color", "#008000");
server.setSetting("copyright", "\u00a9 " + new Date().getFullYear() + " MPDieckmann.");
server.setSetting("server-icon", Server.APP_SCOPE + "/client/png/index/${p}/${w}-${h}.png");

server.setSetting("access-token", "default-access");
server.setSetting("id", "default");

server.start();
