import global from "./global";

let lastYandexRequestSIDTime: number | null = null;
let yandexTranslateSID: string | null = null;
let yandexSIDNotFound = false;
let yandexGetSidPromise: Promise<void> | null = null;

export async function getYandexSID() {
  if (yandexGetSidPromise) {
    return yandexGetSidPromise;
  }

  yandexGetSidPromise = new Promise((resolve) => {
    let updateYandexSid = false;
    if (lastYandexRequestSIDTime) {
      const date = new Date();
      if (yandexTranslateSID) {
        date.setHours(date.getHours() - 12);
      } else if (yandexSIDNotFound) {
        date.setMinutes(date.getMinutes() - 30);
      } else {
        date.setMinutes(date.getMinutes() - 2);
      }
      if (date.getTime() > lastYandexRequestSIDTime) {
        updateYandexSid = true;
      }
    } else {
      updateYandexSid = true;
    }

    if (updateYandexSid) {
      lastYandexRequestSIDTime = Date.now();

      const http = new XMLHttpRequest();
      http.open(
        "GET",
        "https://translate.yandex.net/website-widget/v1/widget.js?widgetId=ytWidget&pageLang=es&widgetTheme=light&autoMode=false"
      );
      http.send();
      http.onload = () => {
        const result = http.responseText.match(/sid\:\s\'[0-9a-f\.]+/);
        if (result && result[0] && result[0].length > 7) {
          yandexTranslateSID = result[0].substring(6);
          yandexSIDNotFound = false;
          global.yandexTranslateSID = yandexTranslateSID;
        } else {
          yandexSIDNotFound = true;
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

  yandexGetSidPromise.finally(() => {
    yandexGetSidPromise = null;
  });

  return await yandexGetSidPromise;
}
