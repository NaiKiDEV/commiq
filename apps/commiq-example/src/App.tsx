import React from "react";
import { Routes, Route } from "react-router-dom";
import { CommiqProvider } from "@naikidev/commiq-react";
import { CommiqDevtools } from "@naikidev/commiq-devtools";
import { counterStore } from "./stores/counter.store";
import { todoStore } from "./stores/todo.store";
import { inventoryStore, cartStore } from "./stores/shop.store";
import { asyncStore } from "./stores/async.store";
import { cartPersistStore } from "./stores/cart.store";
import {
  orderStore,
  paymentStore,
  fulfillmentStore,
  notificationStore,
} from "./stores/pipeline.store";
import { Layout } from "./Layout";
import { CounterPage } from "./components/Counter";
import { TodoPage } from "./components/TodoList";
import { StoreDepsPage } from "./components/StoreDeps";
import { AsyncPage } from "./components/AsyncCommands";
import { StreamPage } from "./components/EventStream";
import { DevtoolsPage } from "./components/DevtoolsPanel";
import { OrderPipelinePage } from "./components/OrderPipeline";
import { ShoppingCartPage } from "./components/ShoppingCart";

const stores = {
  counter: counterStore,
  todo: todoStore,
  inventory: inventoryStore,
  cart: cartStore,
  async: asyncStore,
  order: orderStore,
  payment: paymentStore,
  fulfillment: fulfillmentStore,
  notification: notificationStore,
  persistedCart: cartPersistStore,
};

export function App() {
  return (
    <CommiqProvider stores={stores}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CounterPage />} />
          <Route path="todos" element={<TodoPage />} />
          <Route path="store-deps" element={<StoreDepsPage />} />
          <Route path="async" element={<AsyncPage />} />
          <Route path="stream" element={<StreamPage />} />
          <Route path="pipeline" element={<OrderPipelinePage />} />
          <Route path="cart" element={<ShoppingCartPage />} />
          <Route path="devtools" element={<DevtoolsPage />} />
        </Route>
      </Routes>
      <CommiqDevtools stores={stores} enabled={true} />
    </CommiqProvider>
  );
}
