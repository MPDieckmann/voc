/// <reference no-default-lib="true" />
/// <reference path="../config.ts" />

server.registerRoute(Server.APP_SCOPE + "/add_data", {
  files: {
    "mpc.css": Server.APP_SCOPE + "/client/css/mpc.css",
    "main.css": Server.APP_SCOPE + "/client/css/main.css",
    "print.css": Server.APP_SCOPE + "/client/css/print.css",
    "main.js": Server.APP_SCOPE + "/client/js/main.js",
    "layout.html": Server.APP_SCOPE + "/client/html/layout.html",
    "list.css": Server.APP_SCOPE + "/client/css/page/list.css",
    "add_data.html": Server.APP_SCOPE + "/client/html/page/add_data.html",
    "add_data.css": Server.APP_SCOPE + "/client/css/page/add_data.css",
    "add_data.js": Server.APP_SCOPE + "/client/js/page/add_data.js"
  },
  async response() {
    this.add_style("mpc-css", this.files["mpc.css"].url);
    this.add_style("main-css", this.files["main.css"].url);
    this.add_style("print-css", this.files["print.css"].url, "print");
    this.add_style("list-css", this.files["list.css"].url);
    this.add_script("main-js", this.files["main.js"].url);
    this.add_style("add_data-css", this.files["add_data.css"].url);
    this.add_script("add_data-js", this.files["add_data.js"].url, "text/javascript", "body");

    if (this.POST["data"]) {
      let lesson_text = <string>this.POST["data"];

      let sets: Set<string> = new Set();
      let lessons: Set<number> = new Set();

      if ((await idb.count("vocabulary_sets")) > 0) {
        (await idb.get("vocabulary_sets")).forEach(
          set => {
            sets.add(set.id);
          }
        );
      }

      await Promise.all(
        lesson_text.replace(/\r/g, "").split("\n").map(
          async line => {
            let entry = <LessonFileLine>line.split("\t");
            if (entry.length < 8) {
              return false;
            }
            let id = (entry[0].length < 2 ? "0" : "") + entry[0] + "-" + (entry[1].length < 2 ? "0" : "") + entry[1];
            let set_id = (entry[2].length < 2 ? "0" : "") + entry[2] + "-" + (entry[3].length < 2 ? "0" : "") + entry[3];
            if (!sets.has(set_id)) {
              sets.add(set_id);
              await idb.add(
                "vocabulary_sets",
                {
                  id: set_id,
                  lesson: Number(entry[2]),
                  points: 0,
                  tries: 0
                }
              );
            }
            lessons.add(Number(entry[0]));
            let voc = (await idb.get("vocabulary", { id }))[0] || <Entry>{
              lesson: Number(entry[0]),
              id,
              set_id,
              tries: 0
            };
            if (voc.set_id != set_id && await idb.count("vocabulary", { set_id }) == 0) {
              await idb.delete("vocabulary_sets", { id: set_id });
              sets.delete(set_id);
            }
            voc.set_id = set_id;
            voc.german = (entry[4] || "").normalize("NFD").split("; ");
            voc.transcription = (entry[5] || "").normalize("NFD");
            voc.hebrew = (entry[6] || "").normalize("NFD");
            voc.hints_german = (entry[7] || "").normalize("NFD").split("; ");
            voc.hints_hebrew = (entry[7] || "").normalize("NFD").split("; ").map(hint => {
              switch (hint) {
                case "m.Sg.":
                  return "ז'";
                case "f.Sg.":
                  return "נ'";
                case "m.Pl.":
                  return "ז\"ר";
                case "f.Pl.":
                  return "נ\"ר";
                case "ugs.":
                  return "\u05e1'";
                default:
                  return hint;
              }
            });

            await idb.put("vocabulary", voc);
          }
        )
      );

      let promises = [];
      lessons.forEach(
        lesson => {
          promises.push(
            idb.put(
              "lessons",
              {
                name: "Lesson " + lesson,
                number: Number(lesson)
              }
            )
          );
        }
      );
      await Promise.all(promises);
    }

    return await this.build({
      page_title: "Einträge hinzufügen",
      main: await this.files["add_data.html"].text(),
    }, await this.files["layout.html"].text());
  }
});
