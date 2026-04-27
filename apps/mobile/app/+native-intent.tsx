import { routePathFromNotificationLink } from "@/lib/notification-deeplink";

type RedirectSystemPathOptions = {
  path: string;
  initial: boolean;
};

export function redirectSystemPath({ path }: RedirectSystemPathOptions): string {
  return routePathFromNotificationLink(path) ?? path;
}
