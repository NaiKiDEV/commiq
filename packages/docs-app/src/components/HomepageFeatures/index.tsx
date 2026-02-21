import type { ReactNode } from "react";
import clsx from "clsx";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  emoji: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Command Driven",
    emoji: "📨",
    description: (
      <>
        Describe <em>what should happen</em> via commands. Handlers decide how
        the state changes — keeping your logic predictable and testable.
      </>
    ),
  },
  {
    title: "Event Based",
    emoji: "⚡",
    description: (
      <>
        Handlers emit events to notify other stores or UI. Built-in events like
        <code>stateChanged</code> and <code>commandHandled</code> give you full
        observability.
      </>
    ),
  },
  {
    title: "React Ready",
    emoji: "⚛️",
    description: (
      <>
        First-class React bindings with <code>useSelector</code>,{" "}
        <code>useQueue</code>, and <code>useEvent</code> — powered by
        <code> useSyncExternalStore</code>.
      </>
    ),
  },
];

function Feature({ title, emoji, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center" style={{ fontSize: "3rem" }}>
        {emoji}
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
