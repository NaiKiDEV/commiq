import {
  useSelector,
  useQueue,
  useCommandStatus,
} from "@naikidev/commiq-react";
import type { DeepReadonly } from "@naikidev/commiq";
import { userStore, USER_FETCH_COMMAND } from "./store";
import type { UserState } from "./store";
import { UserCommand } from "./commands";

function selectUsers(s: DeepReadonly<UserState>) {
  return s.users;
}

function toMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  return error instanceof Error ? error.message : String(error);
}

export function useUserState() {
  const users = useSelector(userStore, selectUsers);
  const { pending, error } = useCommandStatus(userStore, USER_FETCH_COMMAND);

  return {
    users,
    loading: pending,
    errorMessage: toMessage(error),
  };
}

export function useUserActions() {
  const queue = useQueue(userStore);

  return {
    fetch: () => queue(UserCommand.fetch()),
    clear: () => queue(UserCommand.clear()),
    remove: (id: number) => queue(UserCommand.remove(id)),
  };
}
