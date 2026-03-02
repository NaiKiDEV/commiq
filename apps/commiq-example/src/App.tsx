import React from "react";
import { Routes, Route } from "react-router-dom";
import { CommiqProvider } from "@naikidev/commiq-react";
import { CommiqDevtools } from "@naikidev/commiq-devtools";
import { counterStore, CounterPage } from "./features/counter";
import { todoStore, TodoPage } from "./features/todo";
import { cartStore, CartPage } from "./features/cart";
import { userStore, UsersPage } from "./features/users";
import { searchStore, SearchPage } from "./features/search";
import { inventoryStore, shopCartStore, ShopPage } from "./features/shop";
import {
  orderStore,
  paymentStore,
  fulfillmentStore,
  notificationStore,
  PipelinePage,
} from "./features/pipeline";
import { StreamPage } from "./features/stream";
import { DevtoolsPage } from "./features/devtools";
import { Layout } from "./Layout";

const stores = {
  counter: counterStore,
  todo: todoStore,
  inventory: inventoryStore,
  shopCart: shopCartStore,
  users: userStore,
  order: orderStore,
  payment: paymentStore,
  fulfillment: fulfillmentStore,
  notification: notificationStore,
  persistedCart: cartStore,
  search: searchStore,
};

export function App() {
  return (
    <CommiqProvider stores={stores}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CounterPage />} />
          <Route path="todos" element={<TodoPage />} />
          <Route path="store-deps" element={<ShopPage />} />
          <Route path="async" element={<UsersPage />} />
          <Route path="stream" element={<StreamPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="devtools" element={<DevtoolsPage />} />
        </Route>
      </Routes>
      <CommiqDevtools stores={stores} enabled={true} />
    </CommiqProvider>
  );
}
