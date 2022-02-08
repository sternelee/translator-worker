interface IGlobal {
  [key: string]: any
}
const DATAS: IGlobal = {
  cacheState: 0, // 缓存状态
  targets: ['zh-CN'], // 翻译的目标语言
}

export function get (key: string) {
  return DATAS[key]
}

export function set (key: string, data: any) {
  DATAS[key] = data
}

const obj: IGlobal = {}

export default new Proxy(obj, {
  set(_, prop: string, value) {
    set(prop, value)
    return true
  },
  get(_, prop: string) {
    return get(prop)
  },
})
