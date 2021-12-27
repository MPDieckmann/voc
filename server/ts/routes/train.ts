/// <reference no-default-lib="true" />
/// <reference path="../main.ts" />

server.registerRoute(Server.APP_SCOPE + "/train", {
  files: {
    "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
    "main.css": Server.APP_SCOPE + "/client/css/main.css",
    "print.css": Server.APP_SCOPE + "/client/css/print.css",
    "main.js": Server.APP_SCOPE + "/client/js/main.js",
    "layout.html": Server.APP_SCOPE + "/client/html/layout.html",
    "train.html": Server.APP_SCOPE + "/client/html/page/train.html",
    "train.css": Server.APP_SCOPE + "/client/css/page/train.css",
  },
  async response() {
    this.add_style("mpc-css", this.files["mpc.css"].url);
    this.add_style("main-css", this.files["main.css"].url);
    this.add_style("print-css", this.files["print.css"].url, "print");
    this.add_script("main-js", this.files["main.js"].url);
    this.add_style("train-css", this.files["train.css"].url);

    if (
      "id" in this.GET &&
      "hints_used" in this.GET &&
      "known" in this.GET
    ) {
      let entry = (await idb.get("vocabulary", { id: this.GET.id }))[0];
      if (entry) {
        entry.tries += 1;
        if (this.GET.known == -1) {
          entry.fails = (entry.fails || 0) + 1;
        }
        await idb.put("vocabulary", entry);

        let entries = await idb.get("vocabulary", { set_id: entry.set_id });
        let entry_set = (await idb.get("vocabulary_sets", { id: entry.set_id }))[0];
        entry_set.points = (entry_set.points || 0) + Number(this.GET.known) - Number(this.GET.hints_used) * 0.5;
        entry_set.tries++;

        delete entry_set.is_well_known;
        delete entry_set.is_known;
        delete entry_set.is_unknown;
        delete entry_set.is_very_unknown;

        if (entry_set.points > 5) {
          entry_set.is_well_known = 1;
        } else if (entry_set.points > 0) {
          entry_set.is_known = 1;
        } else if (entry_set.points < -4) {
          entry_set.is_very_unknown = 1;
        } else if (entry_set.points < 0) {
          entry_set.is_unknown = 1;
        }

        await idb.put("vocabulary_sets", entry_set);

        await Promise.all(entries.map(async entry => {
          if (entry_set.points > 20) {
            delete entry.fails;
          }

          await idb.put("vocabulary", entry);
        }));
      }
    }

    let very_unknown_items_count = await idb.index("vocabulary_sets", "is_very_unknown").count();
    let unknown_items_count = await idb.index("vocabulary_sets", "is_unknown").count();
    let well_known_items_count = await idb.index("vocabulary_sets", "is_well_known").count();
    let known_items_count = await idb.index("vocabulary_sets", "is_known").count();
    let items_count = await idb.count("vocabulary_sets");
    let tried_items_count = known_items_count + unknown_items_count + well_known_items_count;
    let new_items_count = items_count - tried_items_count;

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

    let item: VocCardPageData = null;

    let index = rndInt(0, range.length - 1);
    let entry: Entry = null;
    let entries: Entry[] = null;
    let entry_sets: EntrySet[] = null;

    switch (range[index]) {
      case "known":
        entry_sets = await idb.index("vocabulary_sets", "is_known").get();
        break;
      case "new":
        entry_sets = await idb.get("vocabulary_sets", { tries: 0 });
        break;
      case "random":
        entry_sets = await idb.get("vocabulary_sets");
        break;
      case "unknown":
        entry_sets = await idb.index("vocabulary_sets", "is_unknown").get();
        break;
      case "very-unknown":
        entry_sets = await idb.index("vocabulary_sets", "is_very_unknown").get();
        break;
      case "well-known":
        entry_sets = await idb.index("vocabulary_sets", "is_well_known").get();
        break;
    }

    entries = await idb.get("vocabulary", { set_id: entry_sets[rndInt(0, entry_sets.length - 1)].id });
    entry = entries[rndInt(0, entries.length - 1)];

    if (entry) {
      item = {
        id: entry.id,
        german: entry.german.join(" / "),
        hebrew: entry.hebrew,
        hint_german: entry.hints_german.join(" / "),
        hint_hebrew: entry.hints_hebrew.join(" / "),
        hint_lesson: entry.lesson.toString(),
        hint_transcription: entry.transcription,
        hint_tries: entry.tries,
        hint_points: (await idb.get("vocabulary_sets", { id: entry.set_id }))[0].points
      };
    } else {
      item = {
        id: "",
        german: "Eintrag nicht gefunden",
        hebrew: "Eintrag nicht gefunden",
        hint_german: "",
        hint_hebrew: "",
        hint_lesson: "",
        hint_transcription: "",
        hint_tries: 0,
        hint_points: 0
      }
    }

    let main = await this.build(item, await this.files["train.html"].text());

    return await this.build({
      page_title: "Vokabel-Trainer",
      main
    }, await this.files["layout.html"].text());
  }
});

/**
 * 
 * @param min inklusive min
 * @param max inclusive max
 * @returns min <= random number <= max
 */
function rndInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

interface VocCardPageData {
  id: string;
  hebrew: string;
  hint_transcription: string;
  hint_lesson: string;
  hint_hebrew: string;
  german: string;
  hint_german: string;
  hint_tries: number;
  hint_points: number;
}
