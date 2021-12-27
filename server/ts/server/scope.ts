/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

class Scope<F extends string> extends EventTarget {
  [Symbol.toStringTag] = "Scope";

  readonly globalThis: Server = server;
  readonly data: PageData = {
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
  readonly version = "Version: " + Server.VERSION + (server.server_online ? " (Online)" : " (Offline)");
  readonly copyright = server.getSetting("copyright");
  readonly GET: { [s in string | number]: string | number; } = {};
  readonly POST: { [s in string | number]: string | number; } = {};
  readonly REQUEST: { [s in string | number]: string | number; } = {};
  status: number = 200;
  statusText: string = "OK"
  readonly headers: Headers = new Headers({
    "Content-Type": "text/html;charset=utf-8"
  });
  readonly scope: Scope<F> = this;
  readonly url: URL;
  readonly ready: PromiseLike<this>;
  readonly files = <{
    [s in F]: CacheResponse;
  }>{};
  readonly icon: string;

  constructor(readonly request: Request, route: Route<F>) {
    super();
    this.url = new URL(request.url);
    this.icon = route.icon || server.getSetting("server-icon") || null;

    this.ready = (async () => {
      route.files && await Promise.all(Object.keys(route.files).map(async file => this.files[file] = new CacheResponse(route.files[file])));

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
  async build(data: { [s in keyof PageData]?: PageData[s]; } & { [s: string]: any; }, template: string): Promise<string> {
    data = Object.assign({}, this.data, data);

    let matches = template.match(/\{\{ (generate_[a-z0-9_]+)\(([a-z0-9_, -+]*)\) \}\}/g);
    if (matches) {
      for (let value of matches) {
        let match = /\{\{ (generate_[a-z0-9_]+)\(([a-z0-9_, -+]*)\) \}\}/.exec(value);

        if (typeof this[match[1]] == "function") {
          let pattern = match[0];
          let args: (object | string)[] = match[2].split(",").map(a => a.trim());
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
  build_menu(menu: Menu, options: BuildMenuOptions = {}): string {
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
  htmlspecialchars(string: string): string {
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
  add_style(id: string, href: string, media: string = "all,screen,handheld,print", type: string = "text/css") {
    this.data.styles[id] = { id, href, media, type };
  }
  /**
   * Löscht ein zuvor hinzugefügtes Stylesheet
   * 
   * @param data Das zu benutzende Daten-Array
   * @param id ID des Stylesheets
   */
  remove_style(id: string) {
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
  add_script(id: string, src: string, type: string = "text/javascript", position: string = "head") {
    this.data.scripts[id] = { id, src, type, position };
  }
  /**
   * Löscht ein zuvor hinzugefügtes Skript
   * 
   * @param data Das zu benutzende Daten-Array
   * @param id ID des Skripts
   */
  remove_script(id: string) {
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
  add_menu_item(path: string, label: string, href: string, _menu: Menu = this.data.menus) {
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
    } else {
      _menu[id] = { label, href, submenu: {} };
    }
  }
  /**
   * Überprüft, ob ein Datensatz korrekt ist
   * 
   * @param entry Der zu überprüfende Datensatz
   */
  is_valid_entry(entry: InvoiceRecord) {
    if (
      "date_of_invoice" in entry && entry.date_of_invoice && this.is_valid_date(entry.date_of_invoice) &&
      "date_of_payment" in entry && (entry.date_of_payment ? this.is_valid_date(entry.date_of_payment) : true) &&
      "account" in entry && entry.account &&
      "person" in entry && entry.person &&
      "category" in entry && entry.category &&
      "description" in entry && entry.description &&
      "amount" in entry && entry.amount && !isNaN(entry.amount)
    ) {
      if (
        "quantity" in entry && entry.quantity && !isNaN(entry.quantity) &&
        "unit" in entry && entry.unit
      ) {
        return true;
      } else if (
        ("quantity" in entry === false || !entry.quantity) &&
        ("unit" in entry === false || !entry.unit)
      ) {
        return true;
      } else {
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
  is_valid_date(date: string, format: string = "Y-m-d") {
    return globalThis.date(format, date) == date;
  }
  /**
   * 
   * @param quantity 
   * @param unit 
   * @returns 
   */
  format_quantity(quantity: number, unit: string) {
    if (unit.toLowerCase() == unit) {
      return Math.abs(quantity) + unit;
    } else if (unit == "Stk" || unit == "Pkg") {
      return Math.abs(quantity) + " " + unit + ".";
    } else {
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
  format_amount_per_kilo(quantity: number, unit: string, amount: number) {
    if (unit.toLowerCase() == unit) {
      return "1000" + unit + ": " + Math.abs(amount / quantity * 1000).toFloatingString(2).replace(".", ",") + "€";
    } else if (unit == "Stk" || unit == "Pkg") {
      return "1 " + unit + ".: " + Math.abs(amount / quantity).toFloatingString(2).replace(".", ",") + "€";
    } else {
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
  generate_value(data: object, index: string, escape: string): string {
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

  generate_version(_data: null, escape: string) {
    return this.generate_value(this, "version", escape);
  }

  generate_copyright(_data: null, escape: string) {
    return this.generate_value(this, "copyright", escape);
  }

  generate_url(_data: null, url: string = "", escape: string = "url") {
    return this.generate_value({ url: Server.APP_SCOPE + url }, "url", escape);
  }

  generate_offline_switch(_data: null, hidden: string) {
    return `<input type="checkbox" id="switch_offline_mode" onclick="navigator.serviceWorker.controller.postMessage({type:&quot;set-setting&quot;,property:&quot;offline-mode&quot;,value:this.checked})" ${server.getSetting("offline-mode") ? ' checked=""' : ""}${hidden == "true" ? "" : ' hidden="'}/>`;
  }
  /**
   * Gibt den Inhalt des &lt;title&gt;-Tags aus
   * 
   * @param data Daten-Array der build-Funktion
   * @param mode full | page | site
   * @return Inhalt des &lt;title&gt;-Tags
   */
  generate_title(data: PageData, mode: string): string {
    switch (mode) {
      case "page":
        return this.htmlspecialchars(data.page_title);
      case "site":
        return this.htmlspecialchars(data.site_title);
      case "full":
      default:
        if (data.page_title) {
          return this.htmlspecialchars(data.page_title + " | " + data.site_title);
        } else {
          return this.htmlspecialchars(data.site_title);
        }
    }
  }
  generate_icons(_data: null) {
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
  generate_styles(data: PageData): string {
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
  generate_scripts(data: PageData, position: string = "head"): string {
    let html = "";
    for (let index in data.scripts) {
      let script = data.scripts[index];
      if (script.position == position) {
        html += "<script id=\"" + this.htmlspecialchars(script.id) + "\" src=\"" + this.htmlspecialchars(script.src) + "\" type=\"" + this.htmlspecialchars(script.type) + "\"></script>";
      }
    };
    return html;
  }
  /**
   * Gibt ein Menü aus
   * 
   * @param data Daten-Array der build-Funktion
   * @param index Index des Menüs
   * @return
   */
  generate_menu(data: PageData, index: string): string {
    if (index in data.menus) {
      return this.build_menu(data.menus[index].submenu);
    } else {
      return `<p>Men&uuml; "${index}" wurde nicht gefunden!</p>`;
    }
  }
  async generate_log_badge(_data: null, type: string, hide_empty: string = "false") {
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

  toast(message: string, delay: number = 1000, color: string = "#000") {
    this.data.toasts.push([message, delay, color]);
  }

  generate_toasts(data: PageData) {
    if (data.toasts && data.toasts.length > 0) {
      return "<script type=\"text/javascript\">(async ()=>{let toasts=" + JSON.stringify(data.toasts) + ";let toast;while(toast=toasts.shift()){await createToast(...toast);}})()</script>";
    }
    return "";
  }
}

interface PageData {
  page_title: string;
  site_title: string;
  theme_color: string;
  menus: Menu;
  scripts: {
    [id: string]: {
      id: string;
      src: string;
      type: string;
      position: string;
    }
  };
  styles: {
    [id: string]: {
      id: string;
      href: string;
      media: string;
      type: string;
    }
  };
  main: string;
  toasts: [string, number, string][];
}

interface Menu {
  [id: string]: {
    label: string;
    href: string;
    submenu: Menu;
  }
}

interface BuildMenuOptions {
  menu_class?: string;
  submenu_class?: string;
  entry_class?: string;
  id_prefix?: string;
}
