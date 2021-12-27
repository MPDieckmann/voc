/// <reference no-default-lib="true" />
/// <reference path="index.ts" />

Number.prototype.toFloatingString = function (this: number, decimals: number): string {
  let value: string = this.toString();
  if (decimals > 0) {
    let floatings = new Array(decimals).fill(0).join("");
    if (value.indexOf(".") > -1) {
      let split = value.split(".");
      if (split[1].length >= floatings.length) {
        return split[0] + "." + split[1].substr(0, floatings.length);
      } else {
        return value + floatings.substr(split[1].length);
      }
    } else {
      return value + "." + floatings;
    }
  } else {
    return value.split(".")[0];
  }
};

interface Number {
  toFloatingString(decimals: number): string;
}

String.prototype.toRegExp = function (this: string, flags: string = ""): RegExp {
  return new RegExp(this.replace(/\s+/gm, " ").split(" ").map(string => string.replace(/([\\\/\[\]\{\}\?\*\+\.\^\$\(\)\:\=\!\|\,])/g, "\\$1")).join("|"), flags);
}

interface String {
  toRegExp(flags?: string): RegExp;
}

/**
 * replace i18n, if it is not available
 */
// @ts-ignore
let i18n = self.i18n || ((text: string): string => text.toString());

/**
 * Formatiert ein(e) angegebene(s) Ortszeit/Datum gemäß PHP 7
 * @param {string} string die Zeichenfolge, die umgewandelt wird
 * @param {number | string | Date} timestamp der zu verwendende Zeitpunkt
 * @return {string}
 */
function date(string: string, timestamp: number | string | Date = new Date): string {
  var d = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
  var escaped = false;

  return string.split("").map(string => {
    if (!escaped && string == "\\") {
      escaped = true;
      return "";
    } else if (!escaped && string in date._functions) {
      return date._functions[string](d).toString();
    } else {
      escaped = false;
      return string;
    }
  }).join("");
}
namespace date {
  /**
   * Diese Zeichenfolgen werden von `date()` benutzt um die Wochentage darzustellen
   * 
   * Sie werden von `i18n(weekdays[i] , "mpc-date")` übersetzt
   */
  export const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  /**
   * Diese Zeichenfolgen werden von `date()` benutzt um die Monate darzustellen
   * 
   * Sie werden von `i18n(months[i] , "mpc-date")` übersetzt
   */
  export const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  /**
   * Gibt die aktuelle Zeit und Datum in Millisekunden aus.
   * @param {number | string | Date} timestamp Zahl oder `Date`-Objekt/Zeichenfolge um nicht die aktuelle Zeit zu verwenden
   * @return {number}
   */
  export function time(timestamp: number | string | Date = new Date): number {
    var d = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
    return d.getTime();
  }

  /**
   * Fügt einer Zahl eine führende 0 hinzu, wenn sie kleiner als 10 ist
   * @param {number} value Zahl, der eine führende 0 hinzugefügt werden soll
   * @return {string}
   * @private
   */
  function leadingZero(value: number): string {
    return value < 10 ? "0" + value : value.toString();
  }

  // #region Tag
  /**
   * Die verwendeten Funktionen zur mwandlung der Buchstaben
   * @private
   */
  export const _functions: { [s: string]: (d: Date) => string | number; } = Object.create(null);
  /**
   * Tag des Monats, 2-stellig mit führender Null
   * 01 bis 31
   */
  _functions.d = date => {
    return leadingZero(date.getDate());
  };
  /**
   * Wochentag, gekürzt auf drei Buchstaben
   * Mon bis Sun
   */
  _functions.D = date => {
    return i18n(weekdays[date.getDay()], "mpc-date").substr(0, 3);
  }
  /**
   * Tag des Monats ohne führende Nullen
   * 1 bis 31
   */
  _functions.j = date => {
    return date.getDate();
  }
  /**
   * Ausgeschriebener Wochentag
   * Sunday bis Saturday
   */
  _functions.l = date => {
    return i18n(weekdays[date.getDay()], "mpc-date");
  };
  /**
   * Numerische Repräsentation des Wochentages gemäß ISO-8601 (in PHP 5.1.0 hinzugefügt)
   * 1 (für Montag) bis 7 (für Sonntag)
   */
  _functions.N = date => {
    return date.getDay() == 0 ? 7 : date.getDay();
  };
  /**
   * Anhang der englischen Aufzählung für einen Monatstag, zwei Zeichen
   * st, nd, rd oder th
   * Zur Verwendung mit j empfohlen.
   */
  _functions.S = date => {
    switch (date.getDate()) {
      case 1:
        return i18n("st", "mpc-date");
      case 2:
        return i18n("nd", "mpc-date");
      case 3:
        return i18n("rd", "mpc-date");
      default:
        return i18n("th", "mpc-date");
    }
  };
  /**
   * Numerischer Tag einer Woche
   * 0 (für Sonntag) bis 6 (für Samstag)
   */
  _functions.w = date => {
    return 7 == date.getDay() ? 0 : date.getDay();
  }
  /**
   * Der Tag des Jahres (von 0 beginnend)
   * 0 bis 366
   */
  _functions.z = date => {
    return Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 864e5).toString();
  };
  // #endregion

  // #region Woche
  /**
   * Der Tag des Jahres (von 0 beginnend)
   * Beispiel: 42 (die 42. Woche im Jahr)
   */
  _functions.W = date => {
    var tmp_date = new Date(date.getTime() + 864e5 * (3 - (date.getDay() + 6) % 7));
    return Math.floor(1.5 + (tmp_date.getTime() - new Date(new Date(tmp_date.getFullYear(), 0, 4).getTime() + 864e5 * (3 - (new Date(tmp_date.getFullYear(), 0, 4).getDay() + 6) % 7)).getTime()) / 864e5 / 7);
  };
  // #endregion

  // #region Monat
  /**
   * Monat als ganzes Wort, wie January oder March
   * January bis December
   */
  _functions.F = date => {
    return i18n(months[date.getMonth()], "mpc-date");
  };
  /**
   * Monat als Zahl, mit führenden Nullen
   * 01 bis 12
   */
  _functions.m = date => {
    return leadingZero(date.getMonth() + 1);
  };
  /**
   * Monatsname mit drei Buchstaben
   * Jan bis Dec
   */
  _functions.M = date => {
    return i18n(months[date.getMonth()], "mpc-date").substr(0, 3);
  };
  /**
   * Monatszahl, ohne führende Nullen
   * 1 bis 12
   */
  _functions.n = date => {
    return date.getMonth() + 1;
  };
  /**
   * Anzahl der Tage des angegebenen Monats
   * 28 bis 31
   */
  _functions.t = date => {
    switch (date.getMonth()) {
      case 1:
        if (
          date.getFullYear() % 4 == 0 &&
          date.getFullYear() % 100 != 0
        ) {
          return "29";
        } else {
          return "28";
        }
      case 3:
      case 5:
      case 8:
      case 10:
        return "30";
      default:
        return "31";
    }
  };
  // #endregion

  // #region Jahr
  /**
   * Schaltjahr oder nicht
   * 1 für ein Schaltjahr, ansonsten 0
   */
  _functions.L = date => {
    return date.getFullYear() % 4 == 0 && date.getFullYear() % 100 != 0 ? 1 : 0;
  };
  /**
   * Jahreszahl der Kalenderwoche gemäß ISO-8601. Dies ergibt den gleichen Wert wie Y, außer wenn die ISO-Kalenderwoche (W) zum vorhergehenden oder nächsten Jahr gehört, wobei dann jenes Jahr verwendet wird (in PHP 5.1.0 hinzugefügt).
   * Beispiele: 1999 oder 2003
   */
  _functions.o = date => {
    var tmp_d = new Date(date.toISOString());
    tmp_d.setDate(date.getDate() - (date.getDay() == 0 ? 7 : date.getDay()) + 1);
    return tmp_d.getFullYear();
  }
  /**
   * Vierstellige Jahreszahl
   * Beispiele: 1999 oder 2003
   */
  _functions.Y = date => {
    return date.getFullYear();
  };
  /**
   * Jahreszahl, zweistellig
   * Beispiele: 99 oder 03
   */
  _functions.y = date => {
    var year = date.getFullYear().toString();
    return year.substr(year.length - 2, 2);
  };
  // #endregion

  // #region Uhrzeit
  /**
   * Kleingeschrieben: Ante meridiem (Vormittag) und Post meridiem (Nachmittag)
   * am oder pm
   */
  _functions.a = date => {
    if (date.getHours() > 12) {
      return i18n("pm", "mpc-date");
    }
    return i18n("am", "mpc-date");
  };
  /**
   * Großgeschrieben: Ante meridiem (Vormittag) und Post meridiem (Nachmittag)
   * AM oder PM
   */
  _functions.A = date => {
    if (date.getHours() > 12) {
      return i18n("PM", "mpc-date");
    }
    return i18n("AM", "mpc-date");
  };
  /**
   * Swatch-Internet-Zeit
   * 000 - 999
   */
  _functions.B = () => {
    server.error("date(): B is currently not supported");
    return "B";
  };
  /**
   * Stunde im 12-Stunden-Format, ohne führende Nullen
   * 1 bis 12
   */
  _functions.g = date => {
    return date.getHours() > 12 ? date.getHours() - 11 : date.getHours() + 1;
  };
  /**
   * Stunde im 24-Stunden-Format, ohne führende Nullen
   * 0 bis 23
   */
  _functions.G = date => {
    return date.getHours() + 1;
  };
  /**
   * Stunde im 12-Stunden-Format, mit führenden Nullen
   * 01 bis 12
   */
  _functions.h = date => {
    return leadingZero(date.getHours() > 12 ? date.getHours() - 11 : date.getHours() + 1);
  };
  /**
   * Stunde im 24-Stunden-Format, mit führenden Nullen
   * 00 bis 23
   */
  _functions.H = date => {
    return leadingZero(date.getHours() + 1);
  };
  /**
   * Minuten, mit führenden Nullen
   * 00 bis 59
   */
  _functions.i = date => {
    return leadingZero(date.getMinutes());
  };
  /**
   * Sekunden, mit führenden Nullen
   * 00 bis 59
   */
  _functions.s = date => {
    return leadingZero(date.getSeconds());
  };
  /**
   * Mikrosekunden (hinzugefügt in PHP 5.2.2). Beachten Sie, dass date() immer die Ausgabe 000000 erzeugen wird, da es einen Integer als Parameter erhält, wohingegen DateTime::format() Mikrosekunden unterstützt, wenn DateTime mit Mikrosekunden erzeugt wurde.
   * Beispiel: 654321
   */
  _functions.u = date => {
    return date.getMilliseconds();
  };
  /**
   * Millisekunden (hinzugefügt in PHP 7.0.0). Es gelten die selben Anmerkungen wie für u.
   * Example: 654
   */
  _functions.v = date => {
    return date.getMilliseconds();
  };
  // #endregion

  // #region Zeitzone
  _functions.e = () => {
    server.error("date(): e is currently not supported");
    return "e";
  };
  /**
   * Fällt ein Datum in die Sommerzeit
   * 1 bei Sommerzeit, ansonsten 0.
   */
  _functions.I = () => {
    server.error("date(): I is currently not supported");
    return "I";
  };
  /**
   * Zeitunterschied zur Greenwich time (GMT) in Stunden
   * Beispiel: +0200
   */
  _functions.O = () => {
    server.error("date(): O is currently not supported");
    return "O";
  }
  /**
   * Zeitunterschied zur Greenwich time (GMT) in Stunden mit Doppelpunkt zwischen Stunden und Minuten (hinzugefügt in PHP 5.1.3)
   * Beispiel: +02:00
   */
  _functions.P = () => {
    server.error("date(): P is currently not supported");
    return "P";
  }
  /**
   * Abkürzung der Zeitzone
   * Beispiele: EST, MDT ...
   */
  _functions.T = () => {
    server.error("date(): T is currently not supported");
    return "T";
  }
  /**
   * Offset der Zeitzone in Sekunden. Der Offset für Zeitzonen westlich von UTC ist immer negativ und für Zeitzonen östlich von UTC immer positiv.
   * -43200 bis 50400
   */
  _functions.Z = () => {
    server.error("date(): Z is currently not supported");
    return "Z";
  }
  // #endregion

  // #region Vollständige(s) Datum/Uhrzeit
  /**
   * ISO 8601 Datum (hinzugefügt in PHP 5)
   * 2004-02-12T15:19:21+00:00
   */
  _functions.c = () => {
    server.error("date(): c is currently not supported");
    return "c";
  }
  /**
   * Gemäß » RFC 2822 formatiertes Datum
   * Beispiel: Thu, 21 Dec 2000 16:01:07 +0200
   */
  _functions.r = () => {
    server.error("date(): r is currently not supported");
    return "r";
  }
  /**
   * Sekunden seit Beginn der UNIX-Epoche (January 1 1970 00:00:00 GMT)
   * Siehe auch time()
   */
  _functions.U = date => {
    return date.getTime();
  };
  //#endregion
}
