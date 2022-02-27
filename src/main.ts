import translator from "./index";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>Hello Vite!</h1>
  <p>I love code</p>
  <a href="https://vitejs.dev/guide/features.html" target="_blank">Documentation</a>
`;

window.addEventListener("load", async () => {
  console.log(document.getElementById("app"));
  console.log(translator);
  translator.translatePage("zh");
  const title = await translator.translateText("google", "zh", "I Love Code")
  console.log('title', title)
  setTimeout(() => {
    translator.restorePage()
  }, 5000)
  // setTimeout(() => {
  //   translator.clearCache()
  // }, 10000)
});
