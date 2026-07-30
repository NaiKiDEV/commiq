import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { createTraceRegistry, instrumentStore } from "@naikidev/commiq-otel";
import { counterStore } from "./features/counter";
import { todoStore } from "./features/todo";
import { inventoryStore, shopCartStore } from "./features/shop";
import { userStore } from "./features/users";
import {
  orderStore,
  paymentStore,
  fulfillmentStore,
  notificationStore,
} from "./features/pipeline";

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

  const registry = createTraceRegistry();

  const instrumentations = [
    instrumentStore(counterStore, { storeName: "counter", registry }),
    instrumentStore(todoStore, { storeName: "todo", registry }),
    instrumentStore(inventoryStore, { storeName: "inventory", registry }),
    instrumentStore(shopCartStore, { storeName: "shopCart", registry }),
    instrumentStore(userStore, { storeName: "users", registry }),
    instrumentStore(orderStore, { storeName: "order", registry }),
    instrumentStore(paymentStore, { storeName: "payment", registry }),
    instrumentStore(fulfillmentStore, { storeName: "fulfillment", registry }),
    instrumentStore(notificationStore, { storeName: "notification", registry }),
  ];

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      instrumentations.forEach((instrumentation) => instrumentation.destroy());
      registry.clear();
      provider.shutdown();
    });
  }
}
