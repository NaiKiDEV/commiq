const maxTrackedEventDefs = 1024;
const idsBySymbol = new Map<symbol, string>();
const countsByName = new Map<string, number>();

export function eventIdFor(id: symbol, name: string): string {
  const existing = idsBySymbol.get(id);
  if (existing !== undefined) {
    return existing;
  }
  if (idsBySymbol.size >= maxTrackedEventDefs) {
    return name;
  }
  const seen = (countsByName.get(name) ?? 0) + 1;
  countsByName.set(name, seen);
  const eventId = seen === 1 ? name : `${name}#${seen}`;
  idsBySymbol.set(id, eventId);
  return eventId;
}
