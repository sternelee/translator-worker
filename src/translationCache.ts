import global from "./global";
import { ServiceName, ServicenameCache, ITransInfo } from "./interface";

openIndexeddb("googleCache", 1);
openIndexeddb("yandexCache", 1);
openIndexeddb("bingCache", 1);

function getTableSize(
  db: IDBDatabase | null,
  dbName: ServiceName
): Promise<void | number> {
  return new Promise((resolve, reject) => {
    if (db === null) {
      return reject();
    }
    let size = 0;
    const transaction = db
      .transaction([dbName])
      .objectStore(dbName)
      .openCursor();
    transaction.onsuccess = (event: Event | any) => {
      const cursor = event.target.result;
      if (cursor) {
        const storedObject = cursor.value;
        const json = JSON.stringify(storedObject);
        size += json.length;
        cursor.continue();
      } else {
        resolve(size);
      }
    };
    transaction.onerror = (err) => reject("error in " + dbName + ": " + err);
  });
}
function getDatabaseSize(dbName: ServiceName): Promise<void | number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = (event) => console.error(event);
    request.onsuccess = (event: Event | any) => {
      const db = event.target.result;
      const tableNames = [...db.objectStoreNames];
      ((tableNames, db) => {
        const tableSizeGetters = tableNames.reduce((acc, tableName) => {
          acc.push(getTableSize(db, tableName));
          return acc;
        }, []);
        Promise.all(tableSizeGetters)
          .then((sizes) => {
            const total = sizes.reduce((acc, val) => acc + val, 0);
            resolve(total);
          })
          .catch((e) => {
            console.error(e);
            reject();
          });
      })(tableNames, db);
    };
  });
}
function humanReadableSize(bytes: number) {
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }
  const units = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + " " + units[u];
}

async function stringToSHA1String(message: string) {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgUint8); // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert bytes to hex string
}
const cache = {
  yandex: {},
  bing: {},
  google: {},
};
const db: {
  google: IDBDatabase | null;
  yandex: IDBDatabase | null;
  bing: IDBDatabase | null;
} = {
  yandex: null,
  bing: null,
  google: null,
};
function getCache(translationService: ServiceName) {
  switch (translationService) {
    case "yandex":
      return cache.yandex;
    case "bing":
      return cache.bing;
    case "google":
      return cache.google;
  }
}
function getDB(translationService: ServiceName) {
  switch (translationService) {
    case "yandex":
      return db.yandex;
    case "bing":
      return db.bing;
    case "google":
      return db.google;
  }
}
function useDB(name: string, db_: IDBDatabase) {
  switch (name) {
    case "googleCache":
      db.google = db_;
      break;
    case "yandexCache":
      db.yandex = db_;
      break;
    case "bingCache":
      db.bing = db_;
      break;
  }
}

function openIndexeddb(name: ServicenameCache, version: number) {
  const request = indexedDB.open(name, version);

  request.onsuccess = function () {
    useDB(name, this.result);
    global.cacheState = 1;
  };

  request.onerror = (event) =>
    console.error(
      "Error opening the database, switching to non-database mode",
      event
    );

  request.onupgradeneeded = function () {
    const db = this.result;

    for (const langCode of global.targets) {
      db.createObjectStore(langCode, {
        keyPath: "key",
      });
    }
  };

  return request;
}

function queryInDB(
  db: IDBDatabase,
  objectName: string,
  keyPath: string
): Promise<ITransInfo> {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject();
    }

    const objectStore = db
      .transaction([objectName], "readonly")
      .objectStore(objectName);
    const request = objectStore.get(keyPath);

    request.onerror = (event) => {
      console.error(event);
      reject(event);
    };

    request.onsuccess = () => {
      const result = request.result;
      resolve(result);
    };
  });
}

function addInDb(db: IDBDatabase, objectName: string, data: object) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject();
    }

    const objectStore = db
      .transaction([objectName], "readwrite")
      .objectStore(objectName);
    const request = objectStore.add(data);

    request.onerror = (event) => {
      console.error(event);
      reject(event);
    };

    request.onsuccess = function () {
      resolve(this.result);
    };
  });
}
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const DBDeleteRequest = indexedDB.deleteDatabase(name);

    DBDeleteRequest.onerror = () => {
      console.warn("Error deleting database.");
      resolve();
    };

    DBDeleteRequest.onsuccess = () => {
      console.info("Database deleted successfully");
      resolve();
    };
  });
}

const translationCache = {
  get: async (
    translationService: ServiceName,
    source: string,
    targetLanguage: string
  ): Promise<any> => {
    // console.log(
    //   "translationCache get",
    //   translationService,
    //   source,
    //   targetLanguage
    // );
    const cache = getCache(translationService);
    let translations = cache[targetLanguage];

    if (translations && translations.has(source)) {
      return translations.get(source);
    } else {
      cache[targetLanguage] = new Map();
      translations = cache[targetLanguage];
    }

    const db = getDB(translationService);
    // console.log("db", db);
    if (db) {
      try {
        const transInfo = await queryInDB(
          db,
          targetLanguage,
          await stringToSHA1String(source)
        );
        if (transInfo) {
          translations.set(source, transInfo.translated);
          return transInfo.translated;
        }
        //TODO RETURN AQUI DA LENTIDAO
      } catch (e) {
        console.error(e);
      }
    }
  },
  set: async (
    translationService: ServiceName,
    source: string,
    translated: boolean,
    targetLanguage: string
  ) => {
    const cache = getCache(translationService);
    if (!cache) return false;

    if (cache[targetLanguage]) {
      cache[targetLanguage].set(source, translated);
    } else {
      let translations = new Map();
      translations.set(source, translated);
      cache[targetLanguage] = translations;
    }

    const db = getDB(translationService);

    if (db) {
      try {
        addInDb(db, targetLanguage, {
          key: await stringToSHA1String(source),
          source,
          translated,
        });
      } catch (e) {
        console.error(e);
      }
    }

    return true;
  },
  google: {
    get: (source: string, targetLanguage: string) => {
      translationCache.get("google", source, targetLanguage);
    },
    set: (source: string, translated: boolean, targetLanguage: string) => {
      translationCache.set("google", source, translated, targetLanguage);
    },
  },
  yandex: {
    get: (source: string, targetLanguage: string) => {
      translationCache.get("yandex", source, targetLanguage);
    },

    set: (source: string, translated: boolean, targetLanguage: string) => {
      translationCache.set("yandex", source, translated, targetLanguage);
    },
  },
  bing: {
    get: (source: string, targetLanguage: string) => {
      translationCache.get("bing", source, targetLanguage);
    },

    set: (source: string, translated: boolean, targetLanguage: string) => {
      translationCache.set("bing", source, translated, targetLanguage);
    },
  },
  deleteTranslationCache: (reload: boolean = false) => {
    if (db.google) {
      db.google.close();
      db.google = null;
    }
    if (db.yandex) {
      db.yandex.close();
      db.yandex = null;
    }
    if (db.bing) {
      db.bing.close();
      db.bing = null;
    }
    Promise.all([
      deleteDatabase("googleCache"),
      deleteDatabase("yandexCache"),
      deleteDatabase("bingCache"),
    ]).finally(() => {
      if (reload) {
        location.reload();
      } else {
        openIndexeddb("googleCache", 1);
        openIndexeddb("yandexCache", 1);
        openIndexeddb("bingCache", 1);
      }
    });
  },
};

export default translationCache;
