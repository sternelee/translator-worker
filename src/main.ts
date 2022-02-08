import translator from "./index";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>Hello Vite!</h1>
  <p>I love code</p>
  <a href="https://vitejs.dev/guide/features.html" target="_blank">Documentation</a>
`;

window.addEventListener("load", async () => {
  console.log("1231321");
  console.log(document.getElementById("app"));
  console.log(translator);
  translator.translatePage("zh");
  setTimeout(() => {
    translator.restorePage()
  }, 5000)
});
