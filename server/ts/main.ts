/// <reference no-default-lib="true" />
/// <reference path="server/index.ts" />

let idb = new IndexedDB<{
  vocabulary: {
    Records: Entry;
    Indices: "by_set" | "by_lesson" | "by_german" | "by_hebrew" | "by_tries" | "by_fails" | "is_well_known" | "is_known" | "is_unknown" | "is_very_unknown";
  };
  lessons: {
    Records: {
      name: string;
      number: number;
    };
    Indices: null;
  };
  vocabulary_sets: {
    Records: EntrySet;
    Indices: "by_lesson" | "by_points" | "is_well_known" | "is_known" | "is_unknown" | "is_very_unknown";
  };
}>("voc", 2, {
  vocabulary: {
    name: "vocabulary",
    keyPath: "id",
    autoIncrement: false,
    indices: [
      { name: "by_set", keyPath: "set_id", multiEntry: false, unique: false },
      { name: "by_lesson", keyPath: "lesson", multiEntry: false, unique: false },
      { name: "by_german", keyPath: "german", multiEntry: true, unique: false },
      { name: "by_hebrew", keyPath: "hebrew", multiEntry: false, unique: false },
      { name: "by_tries", keyPath: "tries", multiEntry: false, unique: false },
      { name: "by_fails", keyPath: "fails", multiEntry: false, unique: false },
    ]
  },
  lessons: {
    name: "lessons",
    keyPath: "number",
    autoIncrement: false,
    indices: []
  },
  vocabulary_sets: {
    name: "vocabulary_sets",
    keyPath: "id",
    autoIncrement: false,
    indices: [
      { name: "by_lesson", keyPath: "lesson", multiEntry: false, unique: false },
      { name: "by_points", keyPath: "points", multiEntry: false, unique: false },
      { name: "is_well_known", keyPath: "is_well_known", multiEntry: false, unique: false },
      { name: "is_known", keyPath: "is_known", multiEntry: false, unique: false },
      { name: "is_unknown", keyPath: "is_unknown", multiEntry: false, unique: false },
      { name: "is_very_unknown", keyPath: "is_very_unknown", multiEntry: false, unique: false }
    ]
  }
});

async function update_lessons(): Promise<number> {
  let server_lessons = await server.apiFetch("get_lessons");
  let local_lessons = (await idb.get("lessons")).map(a => a.number);
  let new_lessons = server_lessons.filter(a => local_lessons.indexOf(a) < 0);
  if (new_lessons.length > 0) {
    let i = 0;
    let l = new_lessons.length;
    for (i; i < l; i++) {
      await add_lesson(new_lessons[i]);
    }
    return l;
  }
  return 0;
}

async function add_lesson(lesson: string | number): Promise<boolean> {
  let lesson_text = await server.apiFetch(
    "get_lesson",
    [
      lesson
    ]
  );
  
  if (
    lesson_text === false
  ) {
    return false;
  }

  let sets: Set<string> = new Set();
  let lessons: Set<number> = new Set();

  if (
    await idb.count("vocabulary_sets") > 0
  ) {
    (
      await idb.get("vocabulary_sets")
    ).forEach(
      set => sets.add(set.id)
    );
  }

  await Promise.all(
    lesson_text.replace(
      /\r/g,
      ""
    ).split(
      "\n"
    ).map(
      async line => {
        let entry = <LessonFileLine>line.split("\t");
        if (
          entry.length < 8
        ) {
          return false;
        }

        let id = (entry[0].length < 2 ? "0" : "") + entry[0] + "-" + (entry[1].length < 2 ? "0" : "") + entry[1];
        let set_id = (entry[2].length < 2 ? "0" : "") + entry[2] + "-" + (entry[3].length < 2 ? "0" : "") + entry[3];

        if (
          !sets.has(set_id)
        ) {
          sets.add(set_id);
          await idb.add(
            "vocabulary_sets",
            { id: set_id, lesson: Number(entry[2]), points: 0, tries: 0 }
          );
        }

        lessons.add(Number(entry[0]));

        let voc = (await idb.get(
          "vocabulary",
          { id }
        ))[0] || <Entry>{ lesson: Number(entry[0]), id, set_id, tries: 0 };

        if (
          voc.set_id != set_id &&
          await idb.count(
            "vocabulary",
            { set_id }
          ) == 0
        ) {
          await idb.delete(
            "vocabulary_sets",
            { id: set_id }
          );

          sets.delete(set_id);
        }

        voc.set_id = set_id;
        voc.german = (
          entry[4] ||
          ""
        ).normalize("NFD").split("; ");
        voc.transcription = (
          entry[5] ||
          ""
        ).normalize("NFD");
        voc.hebrew = (
          entry[6] ||
          ""
        ).normalize("NFD");
        voc.hints_german = (
          entry[7] ||
          ""
        ).normalize("NFD").split("; ");
        voc.hints_hebrew = (
          entry[7] ||
          ""
        ).normalize("NFD").split("; ").map(
          hint => {
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
          }
        );

        await idb.put(
          "vocabulary",
          voc
        );
      }
    )
  );

  let promises = [];
  lessons.forEach(
    lesson => promises.push(
      idb.put(
        "lessons",
        { name: "Lesson " + lesson, number: Number(lesson) }
      )
    )
  );
  await Promise.all(promises);

  return true;
}

interface Entry {
  id: string;
  set_id: string;
  lesson: number;
  german: string[];
  transcription: string;
  hebrew: string;
  hints_german: string[];
  hints_hebrew: string[];
  tries: number;
  fails?: number;
}

interface EntrySet {
  id: string;
  lesson: number;
  points: number;
  tries: number;
  is_well_known?: 1;
  is_known?: 1;
  is_unknown?: 1;
  is_very_unknown?: 1;
}

interface LessonFileLine extends Array<string> {
  /** Current Lesson */
  0: string;
  /** Current Word in Lesson */
  1: string;
  /** Linked Lesson */
  2: string;
  /** Linked Word in Linked Lesson */
  3: string;
  /** German[] */
  4: string;
  /** Transcription */
  5: string;
  /** Hebrew */
  6: string;
  /** Hint */
  7: string;
}

interface APIFunctions {
  get_lessons: {
    args: [];
    return: number[];
  }
  get_lesson: {
    args: [string | number];
    return: string | false;
  }
}

// server.addEventListener("ping", event => {
//   event.data.await(update_lessons());
// });

server.addEventListener("beforestart", event => {
  event.data.await(idb.ready);
});
