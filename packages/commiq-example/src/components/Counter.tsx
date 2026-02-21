import React, { useState } from "react";
import { useSelector, useQueue, useEvent } from "@naikidev/commiq-react";
import {
  counterStore,
  counterReset,
  increment,
  decrement,
  reset,
  incrementBy,
} from "../stores/counter.store";

export function Counter() {
  const count = useSelector(counterStore, (s) => s.count);
  const queue = useQueue(counterStore);
  const [amount, setAmount] = useState(5);
  const [resetMessage, setResetMessage] = useState("");

  useEvent(counterStore, counterReset, () => {
    setResetMessage("Counter was reset!");
    setTimeout(() => setResetMessage(""), 2000);
  });

  return (
    <section>
      <h2>Counter</h2>
      <p style={{ fontSize: "2rem", margin: "0.5rem 0" }}>{count}</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={() => queue(decrement())}>-1</button>
        <button onClick={() => queue(increment())}>+1</button>
        <button onClick={() => queue(incrementBy(amount))}>+{amount}</button>
        <button onClick={() => queue(reset())}>Reset</button>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <label>
          Amount:{" "}
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ width: "4rem" }}
          />
        </label>
      </div>
      {resetMessage && (
        <p style={{ color: "green", fontStyle: "italic" }}>{resetMessage}</p>
      )}
    </section>
  );
}
