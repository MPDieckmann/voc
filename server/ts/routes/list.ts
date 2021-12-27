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

    let range: ("very-unknown" | "unknown" | "known" | "well-known" | "new" | "random")[] = [];
    if (very_unknown_items_count > 15) {
      range.push(...Array(150).fill("very-unknown"));
    } else if (very_unknown_items_count > 5) {
      range.push(...Array(100).fill("very-unknown"));
    } else if (very_unknown_items_count > 0) {
      range.push(...Array(50).fill("very-unknown"));
    }

    if (unknown_items_count > 15) {
      range.push(...Array(50).fill("unknown"));
    } else if (unknown_items_count > 0) {
      range.push(...Array(25).fill("unknown"));
    }

    if (known_items_count > 15) {
      range.push(...Array(50).fill("known"));
    } else if (known_items_count > 0) {
      range.push(...Array(25).fill("known"));
    }

    let range_length = range.length;

    if (well_known_items_count >= 25) {
      range.push(...Array(25).fill("well-known"));
    } else {
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
    <tbody>` + (await Promise.all(lessons.map(async lesson => {
      let very_unknown_entry_sets = 0;
      let unknown_entry_sets = 0;
      let known_entry_sets = 0;
      let well_known_entry_sets = 0;
      let new_entry_sets = 0;
      let entry_sets = await idb.count("vocabulary_sets", entry_set => {
        if (entry_set.lesson == lesson.number) {
          if (entry_set.is_very_unknown) {
            very_unknown_entry_sets++;
          } else if (entry_set.is_unknown) {
            unknown_entry_sets++;
          } else if (entry_set.is_known) {
            known_entry_sets++;
          } else if (entry_set.is_well_known) {
            well_known_entry_sets++;
          } else {
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
      let very_unknown_items: EntrySet[] = [];
      let unknown_items: EntrySet[] = [];
      let known_items: EntrySet[] = [];
      let well_known_items: EntrySet[] = [];
      let tried_items: EntrySet[] = [];
      let new_items: EntrySet[] = [];

      let items = await idb.get("vocabulary_sets", { lesson: this.GET.lesson });
      items_count = items.length;

      items.forEach(entry_set => {
        if (entry_set.is_very_unknown) {
          very_unknown_items.push(entry_set);
        } else if (entry_set.is_unknown) {
          unknown_items.push(entry_set);
        } else if (entry_set.is_known) {
          known_items.push(entry_set);
        } else if (entry_set.is_well_known) {
          well_known_items.push(entry_set);
        }
        if (entry_set.points == 0) {
          new_items.push(entry_set);
        } else {
          tried_items.push(entry_set);
        }
      });

      async function createTable(entry_sets: EntrySet[], title: string) {
        let entries: string[] = [];
        let esi = 0;
        let esl = entry_sets.length;
        for (esi; esi < esl; esi++) {
          let entry_set_entries = await idb.get("vocabulary", { set_id: entry_sets[esi].id });
          let esei = 0;
          let esel = entry_set_entries.length;
          for (esei; esei < esel; esei++) {
            let entry = entry_set_entries[esei];
            entries.push(
              `
      <tr>
        <td class="debug">${entry.id}</td>
        <td class="debug">${entry.set_id}</td>
        <td lang="heb">${entry.hebrew}</td>
        <td lang="und">${entry.transcription}</td>
        <td lang="deu">${entry.german.join(" / ")}</td>
        <td>${entry.hints_german.join(" / ")}</td>
        <td>${entry.fails ? `<i>(${entry.fails})</i> ` : ""}${entry.tries}</td>
        <td>${entry_sets[esi].points}</td>
      </tr>`
            );
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
</div>`
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
