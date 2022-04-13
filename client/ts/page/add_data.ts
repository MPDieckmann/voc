const data = <HTMLTextAreaElement>document.getElementById("data");
const cells = document.getElementById("cells");
const info = document.getElementById("info");
const check_button = document.getElementById("check_button");

check_button.addEventListener("click", event => {
  event.preventDefault();
  checkData(data.value);
});

function checkData(data: string) {
  info.innerHTML = "";
  try {
    let lines = data.split("\n").filter(line => line.trim().length > 0);
    cells.innerHTML = lines.map(line => "<tr><td>" + line.replace(/\t/g, "</td><td>") + "</td></tr>").join("");
    info.innerHTML += `<p>${lines.length} Einträge</p>`;
  } catch (e) {
    info.innerHTML += `<p style="color:red;">${e}</p>`;
  }
}
