export type CommunityRole = "owner" | "moderator" | "member";
export type CommunityProfile = {
  user_id: string;
  display_name: string;
  bio: string;
  interests: string[];
  discoverable: boolean;
};
export type CommunityNetwork = {
  id: string;
  owner_id: string;
  name: string;
  purpose: string;
  visibility: "public" | "private";
  topics: string[];
  created_at: string;
  member_count?: number;
};
export type CommunityMember = {
  network_id: string;
  user_id: string;
  role: CommunityRole;
};
export type CommunityPost = {
  id: string;
  user_id: string;
  network_id: string | null;
  content: string;
  link_url: string;
  audience: "private" | "connections" | "public";
  created_at: string;
};
export type CommunityReply = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
};
export type CommunityReaction = {
  post_id: string;
  user_id: string;
  kind: "like" | "bookmark";
};
export type CommunityInvitation = {
  id: string;
  network_id: string;
  sender_id: string;
  target_id: string;
  role: "member" | "moderator";
  status: "pending" | "accepted" | "declined";
  expires_at: string;
};
export type CommunityConnection = {
  id: string;
  sender_id: string;
  target_id: string;
  status: "pending" | "accepted" | "declined";
};
export type CommunityEvent = {
  id: string;
  user_id: string;
  network_id: string | null;
  title: string;
  starts_at: string;
  location: string;
  url: string;
};
export type CommunityResource = {
  id: string;
  network_id: string;
  user_id: string;
  title: string;
  url: string;
  kind: "project" | "resource" | "game";
};
export type PanelState = { id: string; collapsed: boolean; hidden: boolean };
export type CommunityLayout = {
  view: "feed" | "networks";
  panels: PanelState[];
};
export type CommunityBoot = {
  profile: CommunityProfile;
  profiles: CommunityProfile[];
  networks: CommunityNetwork[];
  members: CommunityMember[];
  posts: CommunityPost[];
  replies: CommunityReply[];
  reactions: CommunityReaction[];
  invitations: CommunityInvitation[];
  connections: CommunityConnection[];
  events: CommunityEvent[];
  resources: CommunityResource[];
  layouts: CommunityLayout[];
  suggestions: (CommunityProfile & { shared_interests: string[] })[];
};
export const communityPanels = [
  "automations",
  "connections",
  "networks",
  "projects",
  "agents",
  "events",
  "map",
  "graph",
  "interests",
  "resources",
] as const;
export function suggestedProfiles(
  profiles: CommunityProfile[],
  current: CommunityProfile,
  excluded: string[] = [],
) {
  if (!current.discoverable) return [];
  const interests = new Set(
    current.interests.map((v) => v.trim().toLowerCase()),
  );
  return profiles
    .filter(
      (p) =>
        p.discoverable &&
        p.user_id !== current.user_id &&
        !excluded.includes(p.user_id),
    )
    .map((p) => ({
      ...p,
      shared_interests: p.interests.filter((v) =>
        interests.has(v.trim().toLowerCase()),
      ),
    }))
    .filter((p) => p.shared_interests.length > 0)
    .sort(
      (a, b) =>
        b.shared_interests.length - a.shared_interests.length ||
        a.display_name.localeCompare(b.display_name),
    )
    .slice(0, 8);
}
