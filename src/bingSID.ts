import global from "./global"

let lastBingRequestSIDTime: number | null = null;
let bingTranslateSID: string | null = null;
let bingTranslate_IID_IG: string | null = null;
let bingSIDNotFound = false;
let bingGetSidPromise: Promise<void> | null = null;

export async function getBingSID() {
  if (bingGetSidPromise) {
    return bingGetSidPromise;
  }

  bingGetSidPromise = new Promise((resolve) => {
    let updateBingSid = false;
    if (lastBingRequestSIDTime) {
      const date = new Date();
      if (bingTranslateSID) {
        date.setHours(date.getHours() - 12);
      } else if (bingSIDNotFound) {
        date.setMinutes(date.getMinutes() - 30);
      } else {
        date.setMinutes(date.getMinutes() - 2);
      }
      if (date.getTime() > lastBingRequestSIDTime) {
        updateBingSid = true;
      }
    } else {
      updateBingSid = true;
    }

    if (updateBingSid) {
      lastBingRequestSIDTime = Date.now();

      const http = new XMLHttpRequest();
      http.open("GET", "https://www.bing.com/translator");
      http.send();
      http.onload = () => {
        const result = http.responseText.match(
          /params_RichTranslateHelper\s=\s\[[^\]]+/
        );
        const data_iid_r = http.responseText.match(
          /data-iid\=\"[a-zA-Z0-9\.]+/
        );
        const IG_r = http.responseText.match(/IG\:\"[a-zA-Z0-9\.]+/);
        if (
          result &&
          result[0] &&
          result[0].length > 50 &&
          data_iid_r &&
          data_iid_r[0] &&
          IG_r &&
          IG_r[0]
        ) {
          const params_RichTranslateHelper = result[0]
            .substring("params_RichTranslateHelper = [".length)
            .split(",");
          const data_iid = data_iid_r[0].substring('data-iid="'.length);
          const IG = IG_r[0].substring('IG:"'.length);
          if (
            params_RichTranslateHelper &&
            params_RichTranslateHelper[0] &&
            params_RichTranslateHelper[1] &&
            parseInt(params_RichTranslateHelper[0]) &&
            data_iid &&
            IG
          ) {
            bingTranslateSID = `&token=${params_RichTranslateHelper[1].substring(
              1,
              params_RichTranslateHelper[1].length - 1
            )}&key=${parseInt(params_RichTranslateHelper[0])}`;
            bingTranslate_IID_IG = `IG=${IG}&IID=${data_iid}`;
            global.bingTranslate_IID_IG = bingTranslate_IID_IG
            bingSIDNotFound = false;
            global.bingTranslateSID = bingTranslateSID
          } else {
            bingSIDNotFound = true;
          }
        } else {
          bingSIDNotFound = true;
        }
        resolve();
      };
      http.onerror = (e) => {
        console.error(e);
        resolve();
      };
    } else {
      resolve();
    }
  });

  bingGetSidPromise.finally(() => {
    bingGetSidPromise = null;
  });

  return await bingGetSidPromise;
}
