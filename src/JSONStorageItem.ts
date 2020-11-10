export default class JSONStorageItem<T> {
  constructor(readonly key: string) { }

  get(): T | null {
    const maybeStr = localStorage.getItem(this.key);
    return maybeStr !== null ? JSON.parse(maybeStr) : null;
  }
  set(value: T): void {
    this.setRaw(JSON.stringify(value));
  }
  setRaw(str: string): void {
    localStorage.setItem(this.key, str);
  }
  remove(): void {
    return localStorage.removeItem(this.key);
  }
}
