import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { instrumentStore } from "@naikidev/commiq-otel";
import { counterStore } from "./stores/counter.store";
import { todoStore } from "./stores/todo.store";
import { inventoryStore, cartStore } from "./stores/shop.store";
import { asyncStore } from "./stores/async.store";
import {
  orderStore,
  paymentStore,
  fulfillmentStore,
  notificationStore,
} from "./stores/pipeline.store";

export function setupOtel(): void {
  const exporter = new OTLPTraceExporter({
    url: "http://localhost:5173/v1/traces",
  });

  const provider = new WebTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: "commiq-example",
      [ATTR_SERVICE_VERSION]: "0.0.1",
    }),
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();

  const cleanups = [
    instrumentStore(counterStore, { storeName: "counter" }),
    instrumentStore(todoStore, { storeName: "todo" }),
    instrumentStore(inventoryStore, { storeName: "inventory" }),
    instrumentStore(cartStore, { storeName: "cart" }),
    instrumentStore(asyncStore, { storeName: "async" }),
    instrumentStore(orderStore, { storeName: "order" }),
    instrumentStore(paymentStore, { storeName: "payment" }),
    instrumentStore(fulfillmentStore, { storeName: "fulfillment" }),
    instrumentStore(notificationStore, { storeName: "notification" }),
  ];

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanups.forEach((fn) => fn());
      provider.shutdown();
    });
  }
}
