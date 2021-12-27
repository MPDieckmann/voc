document.getElementById("switch_offline_mode").addEventListener("click", event => {
    navigator.serviceWorker.controller.postMessage({ type: "set-setting", property: "offline-mode", value: event.target.checked });
});
//# sourceMappingURL=main-body.js.map