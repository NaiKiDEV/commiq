import { useSelector, useQueue } from "@naikidev/commiq-react";
import { userStore } from "./store";
import { UserCommand } from "./commands";

export function useUserState() {
  return {
    users: useSelector(userStore, (s) => s.users),
    status: useSelector(userStore, (s) => s.status),
    errorMessage: useSelector(userStore, (s) => s.errorMessage),
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
