/// <reference path="client.d.ts" />

if (history.replaceState) {
  history.replaceState(null, null, location.href);
}

navigator.serviceWorker.register("serviceworker.js", {
  scope: "./"
});

navigator.serviceWorker.addEventListener("message", event => {
  let message = event.data;
  let source = event.source;
  switch (message.type) {
    case "set-setting-response":
      handleSetSettingResponse(message.property, message.value);
      break;
    default:
      createToast("Unbekannte Server-Nachricht: " + message.type);
      break;
  }
});

function handleSetSettingResponse(property: string, value: string | number | boolean) {
  switch (property) {
    case "offline-mode":
      (<HTMLInputElement>document.getElementById("switch_offline_mode")).checked = <boolean>value;
      createToast("Offline-Modus wurde " + (value ? "" : "de") + "aktiviert.");
      break;
    default:
      createToast("Unbekannte Eigenschaft wurde gesetzt: '" + property + "' => '" + value + "'.");
      break;
  }
}

function createToast(message: string, delay: number = 1000, color: string = "#000") {
  return new Promise(resolve => {
    let toast = document.createElement("mpc-toast");
    toast.textContent = message;
    toast.style.background = color;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("show");
    }, delay + 160);
    setTimeout(() => {
      document.body.removeChild(toast);
      resolve(null);
    }, delay + 460);
  });
}

Number.prototype.toFloatingString = function (decimals) {
  let value = this.toString();
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
}