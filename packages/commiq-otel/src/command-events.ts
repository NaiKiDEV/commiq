import { SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import type { StoreEvent } from "@naikidev/commiq";
import { recordError } from "./errors";
import { readCommand, readError, readInterrupted } from "./event-data";
import {
  CORRELATION_EVENT,
  commandAttributes,
  commandCorrelationAttributes,
  resolveParentContext,
} from "./spans";
import type { CommandInfo } from "./event-data";
import type { HandlerDeps } from "./deps";

export function onCommandStarted(deps: HandlerDeps, event: StoreEvent): void {
  const command = readCommand(event.data);
  if (command === null) return;

  const span = startCommandSpan(deps, command);
  deps.tracker.start(command.correlationId, span);
  deps.config.registry.link(command.correlationId, {
    spanContext: span.spanContext(),
    commandId: command.correlationId,
  });
}

export function onCommandHandled(deps: HandlerDeps, event: StoreEvent): void {
  const command = readCommand(event.data);
  if (command === null) return;

  deps.tracker.settle(command.correlationId, (span) => {
    span.setStatus({ code: SpanStatusCode.OK });
  });
}

export function onCommandHandlingError(
  deps: HandlerDeps,
  event: StoreEvent,
): void {
  const command = readCommand(event.data);
  if (command === null) return;

  const error = readError(event.data);
  deps.tracker.settle(command.correlationId, (span) => {
    recordError(span, error, deps.config.sanitizeError);
  });
}

export function onCommandInterrupted(
  deps: HandlerDeps,
  event: StoreEvent,
): void {
  const interrupted = readInterrupted(event.data);
  if (interrupted === null) return;

  deps.tracker.settle(interrupted.command.correlationId, (span) => {
    span.setAttribute("commiq.command.interrupted", true);
    span.setAttribute("commiq.command.interrupted_phase", interrupted.phase);
    span.setStatus({ code: SpanStatusCode.OK, message: "interrupted" });
  });
}

export function onInvalidCommand(deps: HandlerDeps, event: StoreEvent): void {
  const command = readCommand(event.data);
  if (command === null) return;

  const span = startCommandSpan(deps, command);
  const message = `No handler registered for command "${command.name}"`;
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.recordException({ name: "InvalidCommand", message });
  span.end();
}

function startCommandSpan(deps: HandlerDeps, command: CommandInfo): Span {
  const span = deps.config.tracer.startSpan(
    `commiq.command:${command.name}`,
    { attributes: commandAttributes(deps.config, command) },
    resolveParentContext(deps.config, command.causedBy),
  );
  if (!deps.config.recordCorrelationIds) {
    span.addEvent(CORRELATION_EVENT, commandCorrelationAttributes(command));
  }
  return span;
}
