import { useEffect, useMemo, useState } from 'react';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function useLocalStorageList(key, initialItems = []) {
  const initial = useMemo(() => clone(initialItems), [initialItems]);
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items));
  }, [key, items]);

  const createItem = (item) => setItems((prev) => [item, ...prev]);
  const updateItem = (id, updatedItem) => setItems((prev) => prev.map((item) => String(item.id || item.email || item.id) === String(id) ? { ...item, ...updatedItem } : item));
  const deleteItem = (id) => setItems((prev) => prev.filter((item) => String(item.id || item.email || item.id) !== String(id)));
  const resetItems = () => setItems(initial);

  return { items, setItems, createItem, updateItem, deleteItem, resetItems };
}
