import { clerkClient, type User } from "@clerk/nextjs/server";

const USER_ID_BATCH_SIZE = 100;

export function formatClerkUserLabel(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;

  const primaryEmail = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId
  )?.emailAddress;
  if (primaryEmail) return primaryEmail;

  const fallbackEmail = user.emailAddresses[0]?.emailAddress;
  if (fallbackEmail) return fallbackEmail;

  if (user.username) return user.username;

  return user.id;
}

/** Resolve Clerk user IDs to display labels for lists and tables. */
export async function resolveUserLabels(
  userIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const labels = new Map<string, string>();
  if (uniqueIds.length === 0) return labels;

  const client = await clerkClient();

  for (let i = 0; i < uniqueIds.length; i += USER_ID_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + USER_ID_BATCH_SIZE);
    try {
      const { data } = await client.users.getUserList({ userId: batch });
      for (const user of data) {
        labels.set(user.id, formatClerkUserLabel(user));
      }
    } catch {
      // Fall back to raw IDs below for any batch that fails.
    }
  }

  for (const id of uniqueIds) {
    if (!labels.has(id)) labels.set(id, id);
  }

  return labels;
}
