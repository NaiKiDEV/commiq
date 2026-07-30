import type { StateSnapshot, TimelineEntry } from "@naikidev/commiq-devtools-core";
import type { TabId } from "./components/TabBar";
import { EventLog } from "./tabs/EventLog";
import { CausalityGraph } from "./tabs/CausalityGraph";
import { TimelineChart } from "./tabs/TimelineChart";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { StoreStateView } from "./tabs/StoreStateView";
import { DependencyMap } from "./tabs/DependencyMap";
import { DispatchTab } from "./tabs/DispatchTab";
import type { DevtoolsStoreRegistry, PinActions } from "./types";

type TabContentProps = {
  activeTab: TabId;
  timeline: readonly TimelineEntry[];
  storeNames: string[];
  stores: DevtoolsStoreRegistry;
  storeStates: Record<string, unknown>;
  getStateHistory: (storeName: string) => readonly StateSnapshot[];
  errorFilter: boolean;
  onClearErrorFilter: () => void;
  onSelectCorrelation: (correlationId: string) => void;
  pinActions: PinActions;
}

export function TabContent({
  activeTab,
  timeline,
  storeNames,
  stores,
  storeStates,
  getStateHistory,
  errorFilter,
  onClearErrorFilter,
  onSelectCorrelation,
  pinActions,
}: TabContentProps) {
  if (activeTab === "events") {
    return (
      <EventLog
        timeline={timeline}
        storeNames={storeNames}
        errorFilter={errorFilter}
        onClearErrorFilter={onClearErrorFilter}
        onSelectCorrelation={onSelectCorrelation}
        pinActions={pinActions}
      />
    );
  }

  if (activeTab === "graph") {
    return (
      <CausalityGraph
        timeline={timeline}
        storeNames={storeNames}
        pinActions={pinActions}
      />
    );
  }

  if (activeTab === "timeline") {
    return <TimelineChart timeline={timeline} storeNames={storeNames} />;
  }

  if (activeTab === "perf") {
    return <PerformanceTab timeline={timeline} storeNames={storeNames} />;
  }

  if (activeTab === "state") {
    return (
      <StoreStateView
        stores={stores}
        storeStates={storeStates}
        getStateHistory={getStateHistory}
      />
    );
  }

  if (activeTab === "deps") {
    return <DependencyMap timeline={timeline} storeNames={storeNames} />;
  }

  return <DispatchTab timeline={timeline} stores={stores} storeNames={storeNames} />;
}
