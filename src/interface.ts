export type ServiceName = "google" | "yandex" | "bing";
export type ServicenameCache = "googleCache" | "yandexCache" | "bingCache";

type ITransInfoStatus = "translating" | "complete";
export type ITransInfo = {
  source: string;
  translated: boolean | null;
  status: ITransInfoStatus;
};

export type ISources = string[];
export type ISources3d = ISources[];

export interface IPiecesToTranslate {
  bottomElement: Element | null;
  isTranslated: boolean;
  nodes: Element[];
  parentElement: Element | null;
  topElement: Element | null;
}

export interface IAttribeToTranslate {
  node: Element;
  original: string;
  attrName: string;
}
