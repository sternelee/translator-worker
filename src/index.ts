// import WebWorker from "./worker.ts?worker&inline";
import TranslationService from "./translationService";
import {
  ServiceName,
  ISources,
  ISources3d,
  IPiecesToTranslate,
  IAttribeToTranslate,
} from "./interface";
import global from "./global";

function backgroundTranslateHTML(
  translationService: ServiceName,
  targetLanguage: string,
  sourceArray3d: ISources3d,
  dontSortResults: boolean
) {
  console.log(
    translationService,
    targetLanguage,
    sourceArray3d,
    dontSortResults
  );
  return new Promise(async (resolve, reject) => {
    const translator = TranslationService[translationService];
    const res = await translator["translateHTML"](
      sourceArray3d,
      targetLanguage,
      dontSortResults
    );
    console.log(res);
    resolve(res);
  });
}

function backgroundTranslateText(
  translationService: ServiceName,
  targetLanguage: string,
  sourceArray: ISources
) {
  // console.log(translationService, targetLanguage, sourceArray);
  return new Promise(async (resolve, reject) => {
    const translator = TranslationService[translationService];
    const res = await translator["translateText"](sourceArray, targetLanguage);
    resolve(res);
  });
}

function backgroundTranslateSingleText(
  translationService: ServiceName,
  targetLanguage: string,
  source: string
) {
  console.log('backgroundTranslateSingleText', translationService, targetLanguage, source);
  return new Promise(async (resolve, reject) => {
    const translator = TranslationService[translationService];
    const res = await translator["translateSingleText"](source, targetLanguage);
    console.log('backgroundTranslateSingleText', res)
    resolve(res);
  });
}

const htmlTagsInlineText = [
  "#text",
  "A",
  "ABBR",
  "ACRONYM",
  "B",
  "BDO",
  "BIG",
  "CITE",
  "DFN",
  "EM",
  "I",
  "LABEL",
  "Q",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "TT",
  "VAR",
];
const htmlTagsInlineIgnore = ["BR", "CODE", "KBD", "WBR"]; // and input if type is submit or button, and pre depending on settings
const htmlTagsNoTranslate = ["TITLE", "SCRIPT", "STYLE", "TEXTAREA", "svg"]; //TODO verificar porque 'svg' é com letras minúsculas

if (global.translateTag_pre !== "yes") {
  htmlTagsInlineIgnore.push("PRE");
}

//TODO FOO
// Pieces are a set of nodes separated by inline tags that form a sentence or paragraph.
let piecesToTranslate: IPiecesToTranslate[] = [];
let originalTabLanguage = "und";
let currentPageLanguage = "und";
let pageLanguageState = "original";
let currentTargetLanguage = "zh-cn";
let currentPageTranslatorService: ServiceName = "google";
let dontSortResults = true;
let fooCount = 0;

let originalPageTitle;

let attributesToTranslate: any[] = [];

let translateNewNodesTimerHandler;
let newNodes: any[] = [];
let removedNodes: any[] = [];

let nodesToRestore: any[] = [];

function translateNewNodes() {
  try {
    newNodes.forEach((nn) => {
      if (removedNodes.indexOf(nn) != -1) return;

      let newPiecesToTranslate = getPiecesToTranslate(nn);
      console.log("newPiecesToTranslate", newPiecesToTranslate);

      for (const i in newPiecesToTranslate) {
        const newNodes = newPiecesToTranslate[i].nodes;
        let finded = false;

        for (const ntt of piecesToTranslate) {
          if (ntt.nodes.some((n1) => newNodes.some((n2) => n1 === n2))) {
            finded = true;
          }
        }

        if (!finded) {
          piecesToTranslate.push(newPiecesToTranslate[i]);
        }
      }
    });
  } catch (e) {
    console.error(e);
  } finally {
    newNodes = [];
    removedNodes = [];
  }
}

const mutationObserver = new MutationObserver(function (mutations) {
  const piecesToTranslate: any[] = [];

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((addedNode) => {
      if (htmlTagsNoTranslate.indexOf(addedNode.nodeName) == -1) {
        if (htmlTagsInlineText.indexOf(addedNode.nodeName) == -1) {
          if (htmlTagsInlineIgnore.indexOf(addedNode.nodeName) == -1) {
            piecesToTranslate.push(addedNode);
          }
        }
      }
    });

    mutation.removedNodes.forEach((removedNode) => {
      removedNodes.push(removedNode);
    });
  });

  piecesToTranslate.forEach((ptt) => {
    if (newNodes.indexOf(ptt) == -1) {
      newNodes.push(ptt);
    }
  });
});

function enableMutatinObserver() {
  disableMutatinObserver();

  translateNewNodesTimerHandler = setInterval(translateNewNodes, 2000);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function disableMutatinObserver() {
  clearInterval(translateNewNodesTimerHandler);
  newNodes = [];
  removedNodes = [];
  mutationObserver.disconnect();
  mutationObserver.takeRecords();
}

let pageIsVisible = document.visibilityState == "visible";

const handleVisibilityChange = function () {
  if (document.visibilityState == "visible") {
    pageIsVisible = true;
  } else {
    pageIsVisible = false;
  }

  if (pageIsVisible && pageLanguageState === "translated") {
    enableMutatinObserver();
  } else {
    disableMutatinObserver();
  }
};
document.addEventListener("visibilitychange", handleVisibilityChange, false);

function getPiecesToTranslate(root = document.body): IPiecesToTranslate[] {
  const piecesToTranslate: IPiecesToTranslate[] = [
    {
      isTranslated: false,
      parentElement: null,
      topElement: null,
      bottomElement: null,
      nodes: [],
    },
  ];
  let index = 0;
  let currentParagraphSize = 0;

  const getAllNodes = function (node: any, lastHTMLElement = null) {
    if (node.nodeType == 1 || node.nodeType == 11) {
      if (node.nodeType == 11) {
        lastHTMLElement = node.host;
      } else if (node.nodeType == 1) {
        lastHTMLElement = node;

        if (
          htmlTagsInlineIgnore.indexOf(node.nodeName) !== -1 ||
          htmlTagsNoTranslate.indexOf(node.nodeName) !== -1 ||
          node.classList.contains("notranslate") ||
          node.getAttribute("translate") === "no" ||
          node.isContentEditable
        ) {
          if (piecesToTranslate[index].nodes.length > 0) {
            currentParagraphSize = 0;
            piecesToTranslate[index].bottomElement = lastHTMLElement;
            piecesToTranslate.push({
              isTranslated: false,
              parentElement: null,
              topElement: null,
              bottomElement: null,
              nodes: [],
            });
            index++;
          }
          return;
        }
      }

      function getAllChilds(childNodes: any[]) {
        Array.from(childNodes).forEach((_node) => {
          if (_node.nodeType == 1) {
            lastHTMLElement = _node;
          }

          if (htmlTagsInlineText.indexOf(_node.nodeName) == -1) {
            if (piecesToTranslate[index].nodes.length > 0) {
              currentParagraphSize = 0;
              piecesToTranslate[index].bottomElement = lastHTMLElement;
              piecesToTranslate.push({
                isTranslated: false,
                parentElement: null,
                topElement: null,
                bottomElement: null,
                nodes: [],
              });
              index++;
            }

            getAllNodes(_node, lastHTMLElement);

            if (piecesToTranslate[index].nodes.length > 0) {
              currentParagraphSize = 0;
              piecesToTranslate[index].bottomElement = lastHTMLElement;
              piecesToTranslate.push({
                isTranslated: false,
                parentElement: null,
                topElement: null,
                bottomElement: null,
                nodes: [],
              });
              index++;
            }
          } else {
            getAllNodes(_node, lastHTMLElement);
          }
        });
      }

      getAllChilds(node.childNodes);
      if (!piecesToTranslate[index].bottomElement) {
        piecesToTranslate[index].bottomElement = node;
      }
      if (node.shadowRoot) {
        getAllChilds(node.shadowRoot.childNodes);
        if (!piecesToTranslate[index].bottomElement) {
          piecesToTranslate[index].bottomElement = node;
        }
      }
    } else if (node.nodeType == 3) {
      if (node.textContent.trim().length > 0) {
        if (!piecesToTranslate[index].parentElement) {
          let temp = node.parentNode;
          while (
            temp &&
            temp != root &&
            (htmlTagsInlineText.indexOf(temp.nodeName) != -1 ||
              htmlTagsInlineIgnore.indexOf(temp.nodeName) != -1)
          ) {
            temp = temp.parentNode;
          }
          if (temp && temp.nodeType === 11) {
            temp = temp.host;
          }
          piecesToTranslate[index].parentElement = temp;
        }
        if (!piecesToTranslate[index].topElement) {
          piecesToTranslate[index].topElement = lastHTMLElement;
        }
        if (currentParagraphSize > 1000) {
          currentParagraphSize = 0;
          piecesToTranslate[index].bottomElement = lastHTMLElement;
          const pieceInfo: IPiecesToTranslate = {
            isTranslated: false,
            parentElement: null,
            topElement: lastHTMLElement,
            bottomElement: null,
            nodes: [],
          };
          pieceInfo.parentElement = piecesToTranslate[index].parentElement;
          piecesToTranslate.push(pieceInfo);
          index++;
        }
        currentParagraphSize += node.textContent.length;
        piecesToTranslate[index].nodes.push(node);
        piecesToTranslate[index].bottomElement = null;
      }
    }
  };
  getAllNodes(root);

  if (
    piecesToTranslate.length > 0 &&
    piecesToTranslate[piecesToTranslate.length - 1].nodes.length == 0
  ) {
    piecesToTranslate.pop();
  }

  console.log("piecesToTranslate", piecesToTranslate);
  return piecesToTranslate;
}

function getAttributesToTranslate(root = document.body) {
  const attributesToTranslate: IAttribeToTranslate[] = [];

  const placeholdersElements = root.querySelectorAll(
    "input[placeholder], textarea[placeholder]"
  );
  const altElements = root.querySelectorAll(
    'area[alt], img[alt], input[type="image"][alt]'
  );
  const valueElements = root.querySelectorAll(
    'input[type="button"], input[type="submit"]'
  ) as any;
  const titleElements = root.querySelectorAll("body [title]");

  function hasNoTranslate(elem: Element) {
    if (
      elem &&
      (elem.classList.contains("notranslate") ||
        elem.getAttribute("translate") === "no")
    ) {
      return true;
    }
  }

  placeholdersElements.forEach((e) => {
    if (hasNoTranslate(e)) return;

    const txt = e.getAttribute("placeholder");
    if (txt && txt.trim()) {
      attributesToTranslate.push({
        node: e,
        original: txt,
        attrName: "placeholder",
      });
    }
  });

  altElements.forEach((e) => {
    if (hasNoTranslate(e)) return;

    const txt = e.getAttribute("alt");
    if (txt && txt.trim()) {
      attributesToTranslate.push({
        node: e,
        original: txt,
        attrName: "alt",
      });
    }
  });

  valueElements.forEach((e) => {
    if (hasNoTranslate(e)) return;

    const txt = e.getAttribute("value");
    if (e.type == "submit" && !txt) {
      attributesToTranslate.push({
        node: e,
        original: "Submit Query",
        attrName: "value",
      });
    } else if (txt && txt.trim()) {
      attributesToTranslate.push({
        node: e,
        original: txt,
        attrName: "value",
      });
    }
  });

  titleElements.forEach((e) => {
    if (hasNoTranslate(e)) return;

    const txt = e.getAttribute("title");
    if (txt && txt.trim()) {
      attributesToTranslate.push({
        node: e,
        original: txt,
        attrName: "title",
      });
    }
  });

  return attributesToTranslate;
}

function encapsulateTextNode(node: Element) {
  const fontNode = document.createElement("font");
  fontNode.setAttribute("style", "vertical-align: inherit;");
  fontNode.textContent = node.textContent;

  node.replaceWith(fontNode);

  return fontNode;
}

function translateResults(
  piecesToTranslateNow: IPiecesToTranslate[],
  results: any[]
) {
  if (dontSortResults) {
    for (let i = 0; i < results.length; i++) {
      for (let j = 0; j < results[i].length; j++) {
        if (piecesToTranslateNow[i].nodes[j]) {
          const nodes = piecesToTranslateNow[i].nodes;
          let translated = results[i][j] + " ";
          // In some case, results items count is over original node count
          // Rest results append to last node
          if (
            piecesToTranslateNow[i].nodes.length - 1 === j &&
            results[i].length > j
          ) {
            const restResults = results[i].slice(j + 1);
            translated += restResults.join(" ");
          }

          nodes[j] = encapsulateTextNode(nodes[j]);

          // showOriginal.add(nodes[j]);
          nodesToRestore.push({
            node: nodes[j],
            original: nodes[j].textContent,
          });

          nodes[j].textContent = translated;
        }
      }
    }
  } else {
    for (const i in piecesToTranslateNow) {
      for (const j in piecesToTranslateNow[i].nodes) {
        if (results[i][j]) {
          const nodes = piecesToTranslateNow[i].nodes;
          const translated = results[i][j] + " ";

          nodes[j] = encapsulateTextNode(nodes[j]);

          // showOriginal.add(nodes[j]);
          nodesToRestore.push({
            node: nodes[j],
            original: nodes[j].textContent,
          });

          nodes[j].textContent = translated;
        }
      }
    }
  }
  mutationObserver.takeRecords();
}

function translateAttributes(attributesToTranslateNow, results) {
  for (const i in attributesToTranslateNow) {
    const ati = attributesToTranslateNow[i];
    ati.node.setAttribute(ati.attrName, results[i]);
  }
}

function translateDynamically() {
  try {
    if (piecesToTranslate && pageIsVisible) {
      (function () {
        function isInScreen(element) {
          const rect = element.getBoundingClientRect();
          if (
            (rect.top > 0 && rect.top <= window.innerHeight) ||
            (rect.bottom > 0 && rect.bottom <= window.innerHeight)
          ) {
            return true;
          }
          return false;
        }

        function topIsInScreen(element) {
          if (!element) {
            debugger;
            return false;
          }
          const rect = element.getBoundingClientRect();
          if (rect.top > 0 && rect.top <= window.innerHeight) {
            return true;
          }
          return false;
        }

        function bottomIsInScreen(element) {
          if (!element) {
            debugger;
            return false;
          }
          const rect = element.getBoundingClientRect();
          if (rect.bottom > 0 && rect.bottom <= window.innerHeight) {
            return true;
          }
          return false;
        }

        const currentFooCount = fooCount;

        const piecesToTranslateNow: any[] = [];
        piecesToTranslate.forEach((ptt) => {
          if (!ptt.isTranslated) {
            if (
              bottomIsInScreen(ptt.topElement) ||
              topIsInScreen(ptt.bottomElement)
            ) {
              ptt.isTranslated = true;
              piecesToTranslateNow.push(ptt);
            }
          }
        });

        const attributesToTranslateNow: any[] = [];
        attributesToTranslate.forEach((ati) => {
          if (!ati.isTranslated) {
            if (isInScreen(ati.node)) {
              ati.isTranslated = true;
              attributesToTranslateNow.push(ati);
            }
          }
        });

        if (piecesToTranslateNow.length > 0) {
          backgroundTranslateHTML(
            currentPageTranslatorService,
            currentTargetLanguage,
            piecesToTranslateNow.map((ptt) =>
              ptt.nodes.map((node) => node.textContent)
            ),
            dontSortResults
          ).then((results: any) => {
            // console.log("results", results);
            if (
              pageLanguageState === "translated" &&
              currentFooCount === fooCount
            ) {
              translateResults(piecesToTranslateNow, results);
            }
          });
        }

        if (attributesToTranslateNow.length > 0) {
          backgroundTranslateText(
            currentPageTranslatorService,
            currentTargetLanguage,
            attributesToTranslateNow.map((ati) => ati.original)
          ).then((results) => {
            if (
              pageLanguageState === "translated" &&
              currentFooCount === fooCount
            ) {
              translateAttributes(attributesToTranslateNow, results);
            }
          });
        }
      })();
    }
  } catch (e) {
    console.error(e);
  }
  setTimeout(translateDynamically, 600);
}

translateDynamically();

function translatePageTitle() {
  const title = document.querySelector("title");
  if (
    title &&
    (title.classList.contains("notranslate") ||
      title.getAttribute("translate") === "no")
  ) {
    return;
  }
  if (document.title.trim().length < 1) return;
  originalPageTitle = document.title;

  backgroundTranslateSingleText(
    currentPageTranslatorService,
    currentTargetLanguage,
    originalPageTitle
  ).then((result: any) => {
    if (result) {
      document.title = result;
    }
  });
}

const pageLanguageStateObservers: Function[] = [];

let alreadyGotTheLanguage = false;
const observers: Function[] = [];

// Requests the detection of the tab language in the background
if (window.self === window.top) {
  setTimeout(function () {
    if (document.visibilityState == "visible") {
      // onTabVisible();
    } else {
      const handleVisibilityChange = function () {
        if (document.visibilityState == "visible") {
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
          );
          // onTabVisible();
        }
      };
      document.addEventListener(
        "visibilitychange",
        handleVisibilityChange,
        false
      );
    }
  }, 120);
}

let pageTranslator = {
  translatePage: function (targetLanguage?: string) {
    fooCount++;
    pageTranslator.restorePage();
    // showOriginal.enable();

    // dontSortResults = twpConfig.get("dontSortResults") == "yes" ? true : false;

    if (targetLanguage) {
      currentTargetLanguage = targetLanguage;
    }

    piecesToTranslate = getPiecesToTranslate();
    attributesToTranslate = getAttributesToTranslate();

    pageLanguageState = "translated";
    /* chrome.runtime.sendMessage({
      action: "setPageLanguageState",
      pageLanguageState,
    }); */
    pageLanguageStateObservers.forEach((callback) =>
      callback(pageLanguageState)
    );
    currentPageLanguage = currentTargetLanguage;

    translatePageTitle();

    enableMutatinObserver();

    translateDynamically();
  },
  restorePage: function () {
    fooCount++;
    piecesToTranslate = [];

    // showOriginal.disable();
    disableMutatinObserver();

    pageLanguageState = "original";
    /* chrome.runtime.sendMessage({
      action: "setPageLanguageState",
      pageLanguageState,
    }); */
    pageLanguageStateObservers.forEach((callback) =>
      callback(pageLanguageState)
    );
    currentPageLanguage = originalTabLanguage;

    if (originalPageTitle) {
      document.title = originalPageTitle;
    }
    originalPageTitle = null;

    for (const ntr of nodesToRestore) {
      ntr.node.replaceWith(ntr.original);
    }
    nodesToRestore = [];

    //TODO não restaurar atributos que foram modificados
    for (const ati of attributesToTranslate) {
      if (ati.isTranslated) {
        ati.node.setAttribute(ati.attrName, ati.original);
      }
    }
    attributesToTranslate = [];
  },
  onPageLanguageStateChange: function (callback: Function) {
    pageLanguageStateObservers.push(callback);
  },
  swapTranslationService: function () {
    if (currentPageTranslatorService === "google") {
      currentPageTranslatorService = "yandex";
    } else {
      currentPageTranslatorService = "google";
    }
    if (pageLanguageState === "translated") {
      pageTranslator.translatePage();
    }
  },
  onGetOriginalTabLanguage: function (callback: Function) {
    if (alreadyGotTheLanguage) {
      callback(originalTabLanguage);
    } else {
      observers.push(callback);
    }
  },
};

export default pageTranslator;
