export class StorageItem<T> extends EventTarget {
  _lastSaveTime = 0;

  _cached: T | null = null;
  _cacheValid = false;

  constructor(readonly key: string,
              readonly stringify: (t: T) => string,
              readonly parse: (s: string) => T) {
    super();

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== this.key) { return; }
      if (this._lastSaveTime + 100 > +new Date()) { return; }  // HACK: We shouldn't be noticing our own writes, but we are?

      this._cacheValid = false;

      this.dispatchEvent(new Event('storage'));
    };
    window.addEventListener('storage', onStorage);
  }

  get(): T | null {
    if (this._cacheValid) {
      return this._cached;
    }

    const maybeStr = localStorage.getItem(this.key);
    this._cached = maybeStr !== null ? this.parse(maybeStr) : null;

    this._cacheValid = true;
    return this._cached;
  }
  set(value: T): void {
    // TODO: queue up the change, to debounce multiple calls to set?
    const str = this.stringify(value);
    if (str !== localStorage.getItem(this.key)) {  // TODO: Is deduping like this necessary / a good idea?
      this._lastSaveTime = +new Date();
      localStorage.setItem(this.key, this.stringify(value));
    }

    this._cached = value;
    this._cacheValid = true;
  }
  remove(): void {
    this._cached = null;
    this._cacheValid = true;

    return localStorage.removeItem(this.key);
  }

  asString(): StringStorageItem { return new StringStorageItem(this.key); }
  asJSON(): JSONStorageItem<T> { return new JSONStorageItem(this.key); }
}

function identity<T> (t: T) { return t; }

export class StringStorageItem extends StorageItem<string> {
  constructor(readonly key: string) {
    super(key, identity, identity);
  }
}

export class JSONStorageItem<T> extends StorageItem<T> {
  constructor(readonly key: string) {
    super(key, JSON.stringify, JSON.parse);
  }
}