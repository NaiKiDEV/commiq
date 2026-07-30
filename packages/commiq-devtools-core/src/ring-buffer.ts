export class RingBuffer<T> {
  private _items: T[] = [];
  private _head = 0;
  private readonly _capacity: number;

  constructor(capacity: number) {
    this._capacity = Math.max(1, Math.floor(capacity));
  }

  get capacity(): number {
    return this._capacity;
  }

  get size(): number {
    return this._items.length;
  }

  push(item: T): void {
    if (this._items.length < this._capacity) {
      this._items.push(item);
      return;
    }
    this._items[this._head] = item;
    this._head = (this._head + 1) % this._capacity;
  }

  toArray(): T[] {
    if (this._head === 0) {
      return [...this._items];
    }
    return [...this._items.slice(this._head), ...this._items.slice(0, this._head)];
  }

  clear(): void {
    this._items = [];
    this._head = 0;
  }
}
