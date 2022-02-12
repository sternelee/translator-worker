//TODO dividir em varios requests
//TODO Especificar o source lang com page no idioma do paragrafo (dividindo as requests)
import translationCache from "./translationCache";
import { ServiceName, ITransInfo, ISources3d } from "./interface";
import { googleTranslateTKK } from "./constant";
import { getYandexSID } from "./yandexSID";
import { getBingSID } from "./bingSID";
import global from "./global";

function escapeHTML(unsafe: string) {
  return unsafe
    .replace(/\&/g, "&amp;")
    .replace(/\</g, "&lt;")
    .replace(/\>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\'/g, "&#39;");
}

function unescapeHTML(unsafe: string) {
  return unsafe
    .replace(/\&amp;/g, "&")
    .replace(/\&lt;/g, "<")
    .replace(/\&gt;/g, ">")
    .replace(/\&quot;/g, '"')
    .replace(/\&\#39;/g, "'");
}

function shiftLeftOrRightThenSumOrXor(num: number, optString: string) {
  for (let i = 0; i < optString.length - 2; i += 3) {
    let acc: number | string = optString.charAt(i + 2);
    if ("a" <= acc) {
      acc = acc.charCodeAt(0) - 87;
    } else {
      acc = Number(acc);
    }
    if (optString.charAt(i + 1) == "+") {
      acc = num >>> acc;
    } else {
      acc = num << acc;
    }
    if (optString.charAt(i) == "+") {
      num += acc & 4294967295;
    } else {
      num ^= acc;
    }
  }
  return num;
}

function transformQuery(query: string) {
  // console.log("query", query);
  const bytesArray: number[] = [];
  let idx = 0;
  for (let i = 0; i < query.length; i++) {
    let charCode = query.charCodeAt(i);

    if (128 > charCode) {
      bytesArray[idx++] = charCode;
    } else {
      if (2048 > charCode) {
        bytesArray[idx++] = (charCode >> 6) | 192;
      } else {
        if (
          55296 == (charCode & 64512) &&
          i + 1 < query.length &&
          56320 == (query.charCodeAt(i + 1) & 64512)
        ) {
          charCode =
            65536 + ((charCode & 1023) << 10) + (query.charCodeAt(++i) & 1023);
          bytesArray[idx++] = (charCode >> 18) | 240;
          bytesArray[idx++] = ((charCode >> 12) & 63) | 128;
        } else {
          bytesArray[idx++] = (charCode >> 12) | 224;
        }
        bytesArray[idx++] = ((charCode >> 6) & 63) | 128;
      }
      bytesArray[idx++] = (charCode & 63) | 128;
    }
  }
  // console.log("bytesArray", bytesArray);
  return bytesArray;
}

function calcHash(query: string, windowTkk: string) {
  // console.log("calcHash", query, windowTkk);
  const tkkSplited = windowTkk.split(".");
  const tkkIndex = Number(tkkSplited[0]) || 0;
  const tkkKey = Number(tkkSplited[1]) || 0;

  const bytesArray = transformQuery(query);

  let encondingRound = tkkIndex;
  for (const item of bytesArray) {
    encondingRound += item;
    encondingRound = shiftLeftOrRightThenSumOrXor(encondingRound, "+-a^+6");
  }
  encondingRound = shiftLeftOrRightThenSumOrXor(encondingRound, "+-3^+b+-f");

  encondingRound ^= tkkKey;
  if (encondingRound <= 0) {
    encondingRound = (encondingRound & 2147483647) + 2147483648;
  }

  const normalizedResult = encondingRound % 1000000;
  return normalizedResult.toString() + "." + (normalizedResult ^ tkkIndex);
}

const googleTranslationInProgress = {};
const yandexTranslationInProgress = {};
const bingTranslationInProgress = {};

function getTranslationInProgress(
  translationService: ServiceName,
  targetLanguage: string
) {
  let translationInProgress: any;
  if (translationService === "yandex") {
    translationInProgress = yandexTranslationInProgress;
  } else if (translationInProgress === "bing") {
    translationInProgress = bingTranslationInProgress;
  } else {
    translationInProgress = googleTranslationInProgress;
  }

  if (!translationInProgress[targetLanguage]) {
    translationInProgress[targetLanguage] = [];
  }

  return translationInProgress[targetLanguage];
}

async function translateHTML(
  translationService: ServiceName,
  targetLanguage: string,
  translationServiceURL: string,
  sourceArray: string[],
  requestBody: string,
  textParamName: string,
  translationProgress: ITransInfo[],
  dontSaveInCache = false
): Promise<any> {
  const thisTranslationProgress: ITransInfo[] = [];
  const requests: any[] = [];
  /* console.log(
    "translateHTML",
    targetLanguage,
    translationServiceURL,
    sourceArray,
    requestBody,
    textParamName,
    translationProgress
  ); */

  for (const str of sourceArray) {
    const transInfo = translationProgress.find((value) => value.source === str);
    if (transInfo) {
      thisTranslationProgress.push(transInfo);
    } else {
      let translated: boolean = false;
      try {
        translated = await translationCache.get(
          translationService,
          str,
          targetLanguage
        );
        console.log("translated", translated);
      } catch (e) {
        console.error(e);
      }
      let newTransInfo: ITransInfo;
      if (translated) {
        newTransInfo = {
          source: str,
          translated,
          status: "complete",
        };
      } else {
        newTransInfo = {
          source: str,
          translated: null,
          status: "translating",
        };

        if (
          requests.length < 1 ||
          requests[requests.length - 1].requestBody.length > 800
        ) {
          requests.push({
            requestBody,
            fullSource: "",
            transInfos: [],
          });
        }

        requests[requests.length - 1].requestBody +=
          "&" + textParamName + "=" + encodeURIComponent(str);
        requests[requests.length - 1].fullSource += str;
        requests[requests.length - 1].transInfos.push(newTransInfo);
      }

      translationProgress.push(newTransInfo);
      thisTranslationProgress.push(newTransInfo);
    }
  }

  if (requests.length > 0) {
    for (const request of requests) {
      let tk = "";
      if (translationService === "google") {
        tk = calcHash(request.fullSource, googleTranslateTKK);
      }

      const http = new XMLHttpRequest();
      if (translationService === "google") {
        http.open("POST", translationServiceURL + tk);
        http.setRequestHeader(
          "Content-Type",
          "application/x-www-form-urlencoded"
        );
        http.responseType = "json";
        http.send(request.requestBody);
      } else if (translationService === "yandex") {
        http.open("GET", translationServiceURL + request.requestBody);
        http.setRequestHeader(
          "Content-Type",
          "application/x-www-form-urlencoded"
        );
        http.responseType = "json";
        http.send(request.requestBody);
      } else if (translationService === "bing") {
        http.open(
          "POST",
          "https://www.bing.com/ttranslatev3?isVertical=1&" +
            global.bingTranslate_IID_IG
        );
        http.setRequestHeader(
          "Content-Type",
          "application/x-www-form-urlencoded"
        );
        http.responseType = "json";
        http.send(
          `&fromLang=auto-detect${request.requestBody}&to=${targetLanguage}${global.bingTranslateSID}`
        );
      }

      http.onload = () => {
        try {
          const response = http.response;
          let responseJson: any;
          if (translationService === "yandex") {
            responseJson = response.text;
          } else if (translationService === "google") {
            if (typeof response[0] == "string") {
              responseJson = response;
            } else {
              responseJson = response.map((value) => value[0]);
            }
          } else if (translationService === "bing") {
            responseJson = [http.response[0].translations[0].text];
          }

          request.transInfos.forEach((transInfo, index) => {
            try {
              if (responseJson[index]) {
                transInfo.status = "complete";
                transInfo.translated = responseJson[index];

                if (!dontSaveInCache) {
                  try {
                    //TODO ERRO AQUI FAZ DA LENTIDAO
                    translationCache.set(
                      translationService,
                      transInfo.source,
                      transInfo.translated,
                      targetLanguage
                    );
                  } catch (e) {
                    console.error(e);
                  }
                }
              } else {
                transInfo.status = "error";
              }
            } catch (e) {
              transInfo.status = "error";
              console.error(e);
            }
          });
          return responseJson;
        } catch (e) {
          console.error(e);

          request.transInfos.forEach((transInfo, index) => {
            transInfo.status = "error";
          });
        }
      };
      http.onerror = (e) => {
        request.transInfos.forEach((transInfo) => {
          transInfo.status = "error";
        });
        console.error(e);
      };
    }
  }

  const promise = new Promise((resolve, reject) => {
    let iterationsCount = 0;

    function waitForTranslationFinish() {
      let isTranslating = false;
      for (const info of thisTranslationProgress) {
        if (info.status === "translating") {
          isTranslating = true;
          break;
        }
      }

      if (++iterationsCount < 100) {
        if (isTranslating) {
          setTimeout(waitForTranslationFinish, 100);
        } else {
          resolve(thisTranslationProgress);
          return;
        }
      } else {
        reject();
        return;
      }
    }
    waitForTranslationFinish();
  });

  try {
    return await promise;
  } catch (e) {
    console.error(e);
  }
}

// nao funciona bem por problemas em detectar o idioma do texto
async function fixSouceArray(sourceArray3d) {
  console.log("fixSouceArray", sourceArray3d);
  const newSourceArray3d: ISources3d = [];
  const fixIndexesMap: number[] = [];

  for (const i in sourceArray3d) {
    newSourceArray3d.push([]);
    fixIndexesMap.push(parseInt(i));

    const sourceArray = sourceArray3d[i];
    let prevDetectedLanguage = null;
    for (const j in sourceArray) {
      const text = sourceArray[j];
      const detectedLanguage = null;
      if (
        detectedLanguage &&
        prevDetectedLanguage &&
        detectedLanguage !== prevDetectedLanguage &&
        newSourceArray3d[newSourceArray3d.length - 1].length > 0
      ) {
        newSourceArray3d.push([text]);
        fixIndexesMap.push(parseInt(i));
      } else {
        newSourceArray3d[newSourceArray3d.length - 1].push(text);
      }
      prevDetectedLanguage = detectedLanguage;
    }
  }

  return [newSourceArray3d, fixIndexesMap];
}

function fixResultArray(resultArray3d, fixIndexesMap) {
  console.log("fixResultArray", resultArray3d, fixIndexesMap);
  const newResultArray3d: ISources3d = [];

  let idx = 0;
  for (const index of fixIndexesMap) {
    if (!newResultArray3d[index]) {
      newResultArray3d[index] = [];
    }
    if (resultArray3d[idx]) {
      for (const text of resultArray3d[idx]) {
        newResultArray3d[index].push(text);
      }
      idx++;
    } else {
      console.error("resultArray is undefined");
      break;
    }
  }

  if (newResultArray3d[newResultArray3d.length - 1].length < 1) {
    newResultArray3d.pop();
  }

  return newResultArray3d;
}
const translationService = {
  google: {
    translateHTML: async (
      _sourceArray3d: any,
      targetLanguage: string,
      dontSaveInCache = false,
      dontSortResults = false
    ) => {
      console.log("google translateHTML", _sourceArray3d, targetLanguage);
      if (targetLanguage == "zh") {
        targetLanguage = "zh-CN";
      }

      //const [sourceArray3d, fixIndexesMap] = await fixSouceArray(_sourceArray3d)
      const sourceArray = _sourceArray3d.map((sourceArray) => {
        sourceArray = sourceArray.map((value) => escapeHTML(value));
        if (sourceArray.length > 1) {
          sourceArray = sourceArray.map(
            (value, index) => "<a i=" + index + ">" + value + "</a>"
          );
        }
        return "<pre>" + sourceArray.join("") + "</pre>";
      });

      const requestBody = "";
      return translateHTML(
        "google",
        targetLanguage,
        `https://translate.googleapis.com/translate_a/t?anno=3&client=te&v=1.0&format=html&sl=auto&tl=` +
          targetLanguage +
          "&tk=",
        sourceArray,
        requestBody,
        "q",
        getTranslationInProgress("google", targetLanguage),
        dontSaveInCache
      ).then((thisTranslationProgress: any[]) => {
        console.log("thisTranslationProgress", thisTranslationProgress);
        const results = thisTranslationProgress.map(
          (value: any) => value.translated
        );
        const resultArray3d: any[] = [];

        for (const i in results) {
          let result = results[i];
          if (result.indexOf("<pre") !== -1) {
            result = result.replace("</pre>", "");
            const index = result.indexOf(">");
            result = result.slice(index + 1);
          }
          const sentences: any[] = [];

          let idx = 0;
          while (true) {
            const sentenceStartIndex = result.indexOf("<b>", idx);
            if (sentenceStartIndex === -1) break;

            const sentenceFinalIndex = result.indexOf(
              "<i>",
              sentenceStartIndex
            );

            if (sentenceFinalIndex === -1) {
              sentences.push(result.slice(sentenceStartIndex + 3));
              break;
            } else {
              sentences.push(
                result.slice(sentenceStartIndex + 3, sentenceFinalIndex)
              );
            }
            idx = sentenceFinalIndex;
          }

          result = sentences.length > 0 ? sentences.join(" ") : result;
          let resultArray = result.match(
            /\<a\si\=[0-9]+\>[^\<\>]*(?=\<\/a\>)/g
          );

          if (dontSortResults) {
            // Should not sort the <a i={number}> of Google Translate result
            // Instead of it, join the texts without sorting
            // https://github.com/FilipePS/Traduzir-paginas-web/issues/163

            if (resultArray && resultArray.length > 0) {
              resultArray = resultArray.map((value) => {
                const resultStartAtIndex = value.indexOf(">");
                return value.slice(resultStartAtIndex + 1);
              });
            } else {
              resultArray = [result];
            }

            resultArray = resultArray.map((value) =>
              value.replace(/\<\/b\>/g, "")
            );
            resultArray = resultArray.map((value) => unescapeHTML(value));

            resultArray3d.push(resultArray);
          } else {
            let indexes;
            if (resultArray && resultArray.length > 0) {
              indexes = resultArray
                .map((value) => parseInt(value.match(/[0-9]+(?=\>)/g)))
                .filter((value) => !isNaN(value));
              resultArray = resultArray.map((value) => {
                const resultStartAtIndex = value.indexOf(">");
                return value.slice(resultStartAtIndex + 1);
              });
            } else {
              resultArray = [result];
              indexes = [0];
            }

            resultArray = resultArray.map((value) =>
              value.replace(/\<\/b\>/g, "")
            );
            resultArray = resultArray.map((value) => unescapeHTML(value));

            const finalResulArray: any[] = [];
            for (const j in indexes) {
              if (finalResulArray[indexes[j]]) {
                finalResulArray[indexes[j]] += " " + resultArray[j];
              } else {
                finalResulArray[indexes[j]] = resultArray[j];
              }
            }

            resultArray3d.push(finalResulArray);
          }
        }

        //return fixResultArray(resultArray3d, fixIndexesMap)
        return resultArray3d;
      });
    },
    translateText: async (
      sourceArray: any[],
      targetLanguage: string,
      dontSaveInCache = false
    ) => {
      if (targetLanguage == "zh") {
        targetLanguage = "zh-CN";
      }
      console.log("google translateText", sourceArray, targetLanguage);
      return (
        await translationService.google.translateHTML(
          sourceArray.map((value) => [value]),
          targetLanguage,
          dontSaveInCache,
          true
        )
      ).map((value) => value[0]);
    },
    translateSingleText: async (
      source: string,
      targetLanguage: string,
      dontSaveInCache = false
    ) => {
      console.log("google translateSingleText", source, targetLanguage);
      return await translationService.google
        .translateText([source], targetLanguage, dontSaveInCache)
        .then((results) => results[0]);
    },
  },
  yandex: {
    translateHTML: async (
      sourceArray3d: any[],
      targetLanguage: string,
      dontSaveInCache = false
    ): Promise<any> => {
      await getYandexSID();
      if (!global.yandexTranslateSID) return;

      if (targetLanguage.indexOf("zh-") !== -1) {
        targetLanguage = "zh";
      }

      const sourceArray = sourceArray3d.map((sourceArray) =>
        sourceArray.map((value) => escapeHTML(value)).join("<wbr>")
      );

      const requestBody = "format=html&lang=" + targetLanguage;
      return await translateHTML(
        "yandex",
        targetLanguage,
        "https://translate.yandex.net/api/v1/tr.json/translate?srv=tr-url-widget&id=" +
          global.yandexTranslateSID +
          "-0-0&",
        sourceArray,
        requestBody,
        "text",
        getTranslationInProgress("yandex", targetLanguage),
        dontSaveInCache
      ).then((thisTranslationProgress: any[]) => {
        const results = thisTranslationProgress.map(
          (value) => value.translated
        );

        const resultArray3d: any[] = [];
        for (const result of results) {
          resultArray3d.push(
            result.split("<wbr>").map((value) => unescapeHTML(value))
          );
        }

        return resultArray3d;
      });
    },
    translateText: async (
      sourceArray: any[],
      targetLanguage: string,
      dontSaveInCache = false
    ): Promise<any> => {
      if (targetLanguage.indexOf("zh-") !== -1) {
        targetLanguage = "zh";
      }

      return (
        await translationService.yandex.translateHTML(
          sourceArray.map((value) => [value]),
          targetLanguage,
          dontSaveInCache
        )
      ).map((value) => value[0]);
    },
    translateSingleText: (
      source: string,
      targetLanguage: string,
      dontSaveInCache = false
    ) =>
      translationService.yandex
        .translateText([source], targetLanguage, dontSaveInCache)
        .then((results) => results[0]),
  },
  bing: {
    translateSingleText: async (
      source: string,
      targetLanguage: string,
      dontSaveInCache = false
    ) => {
      if (targetLanguage == "zh-CN") {
        targetLanguage = "zh-Hans";
      } else if (targetLanguage == "zh-TW") {
        targetLanguage = "zh-Hant";
      } else if (targetLanguage == "tl") {
        targetLanguage = "fil";
      } else if (targetLanguage.indexOf("zh-") !== -1) {
        targetLanguage = "zh-Hans";
      }
      await getBingSID();

      return await translateHTML(
        "bing",
        targetLanguage,
        "https://www.bing.com/ttranslatev3?isVertical=1",
        [source],
        "",
        "text",
        getTranslationInProgress("bing", targetLanguage),
        dontSaveInCache
      ).then(
        (thisTranslationProgress: ITransInfo[]) =>
          thisTranslationProgress[0].translated
      );
    },
  },
};

export default translationService;
