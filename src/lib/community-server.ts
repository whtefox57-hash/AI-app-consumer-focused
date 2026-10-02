import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "./ai";
import { checked } from "./supabase";
import {
  communityPanels,
  suggestedProfiles,
  type CommunityBoot,
  type CommunityProfile,
  type CommunityNetwork,
} from "./community-types";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const https = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(2000)
    .refine((v) => new URL(v).protocol === "https:", "Use an HTTPS address."),
]);
const topics = z.array(text(60)).max(12);
const networkSchema = z.object({
  name: text(100),
  purpose: z.string().trim().max(2000),
  visibility: z.enum(["public", "private"]),
  topics,
});
const postSchema = z.object({
  network_id: uuid.nullable(),
  content: text(10000),
  link_url: https.default(""),
  audience: z.enum(["private", "connections", "public"]).default("connections"),
});
const eventSchema = z.object({
  network_id: uuid.nullable(),
  title: text(160),
  starts_at: z.string().datetime({ offset: true }),
  location: z.string().trim().max(200).default(""),
  url: https.default(""),
});
const resourceSchema = z.object({
  network_id: uuid,
  title: text(160),
  url: z
    .string()
    .url()
    .max(2000)
    .refine((v) => new URL(v).protocol === "https:"),
  kind: z.enum(["project", "resource", "game"]),
});
export type CommunityRequest = {
  supabase: SupabaseClient;
  user: { id: string; email?: string };
  path: string[];
  method: string;
  readBody: () => Promise<unknown>;
};

export async function handleCommunity({
  supabase,
  user,
  path,
  method,
  readBody,
}: CommunityRequest): Promise<unknown | undefined> {
  if (path[0] !== "community") return undefined;
  const resource = path[1];
  if (resource === "boot" && method === "GET") {
    checked(
      await supabase.from("community_profiles").upsert(
        {
          user_id: user.id,
          display_name: user.email?.split("@")[0]?.slice(0, 80) || "You",
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      ),
    );
    const profile: CommunityProfile = checked(
      await supabase
        .from("community_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single(),
    );
    const tables = [
      "community_profiles",
      "community_networks",
      "community_members",
      "community_posts",
      "community_replies",
      "community_reactions",
      "community_invitations",
      "community_connections",
      "community_events",
      "community_resources",
      "community_layouts",
    ];
    const results = await Promise.all(
      tables.map((table) => {
        const query = supabase.from(table).select("*");
        return (
          table === "community_posts" || table === "community_replies"
            ? query.order("created_at", { ascending: false })
            : table === "community_events"
              ? query.order("starts_at", { ascending: true })
              : query
        ).limit(
          table === "community_replies" || table === "community_reactions"
            ? 2000
            : 500,
        );
      }),
    );
    const data = Object.fromEntries(
      tables.map((table, i) => [
        table.replace("community_", ""),
        checked(results[i]),
      ]),
    );
    const counts = checked(await supabase.rpc("community_member_counts")) as {
      network_id: string;
      member_count: number;
    }[];
    const networks = (data.networks as CommunityNetwork[]).map((network) => ({
      ...network,
      member_count: Number(
        counts.find((c) => c.network_id === network.id)?.member_count || 0,
      ),
    }));
    const excluded = (data.connections as CommunityBoot["connections"])
      .filter((c) => c.status !== "declined")
      .map((c) => (c.sender_id === user.id ? c.target_id : c.sender_id));
    return {
      ...data,
      profile,
      networks,
      suggestions: suggestedProfiles(
        data.profiles as CommunityProfile[],
        profile,
        excluded,
      ),
    } as CommunityBoot;
  }
  if (resource === "profile" && method === "PATCH") {
    const value = z
      .object({
        display_name: text(80),
        bio: z.string().trim().max(1000),
        interests: z.array(text(60)).max(20),
        discoverable: z.boolean(),
      })
      .parse(await readBody());
    return checked(
      await supabase
        .from("community_profiles")
        .upsert({ ...value, user_id: user.id })
        .select("*")
        .single(),
    );
  }
  if (resource === "layout" && method === "PATCH") {
    const value = z
      .object({
        view: z.enum(["feed", "networks"]),
        panels: z
          .array(
            z.object({
              id: z.enum(communityPanels),
              collapsed: z.boolean(),
              hidden: z.boolean(),
            }),
          )
          .max(12)
          .refine(
            (items) => new Set(items.map((p) => p.id)).size === items.length,
            "Each panel appears once.",
          ),
      })
      .parse(await readBody());
    return checked(
      await supabase
        .from("community_layouts")
        .upsert({ ...value, user_id: user.id })
        .select("*")
        .single(),
    );
  }
  if (resource === "networks") {
    if (path[3] === "join" && method === "POST") {
      checked(
        await supabase.rpc("community_join", {
          p_network: uuid.parse(path[2]),
        }),
      );
      return { ok: true };
    }
    if (path[3] === "invitations" && method === "POST") {
      const value = z
        .object({
          target_id: uuid,
          role: z.enum(["member", "moderator"]).default("member"),
        })
        .parse(await readBody());
      return checked(
        await supabase.rpc("community_invite", {
          p_network: uuid.parse(path[2]),
          p_target: value.target_id,
          p_role: value.role,
        }),
      );
    }
    if (method === "POST" && !path[2])
      return checked(
        await supabase
          .from("community_networks")
          .insert({
            ...networkSchema.parse(await readBody()),
            owner_id: user.id,
          })
          .select("*")
          .single(),
      );
    if (method === "PATCH" && path[2])
      return checked(
        await supabase
          .from("community_networks")
          .update(networkSchema.parse(await readBody()))
          .eq("id", uuid.parse(path[2]))
          .select("*")
          .single(),
      );
    if (method === "DELETE" && path[2]) {
      checked(
        await supabase
          .from("community_networks")
          .delete()
          .eq("id", uuid.parse(path[2])),
      );
      return { ok: true };
    }
  }
  if (
    resource === "members" &&
    path[2] &&
    path[3] &&
    (method === "PATCH" || method === "DELETE")
  ) {
    const role =
      method === "DELETE"
        ? null
        : z
            .object({ role: z.enum(["member", "moderator"]) })
            .parse(await readBody()).role;
    checked(
      await supabase.rpc("community_manage_member", {
        p_network: uuid.parse(path[2]),
        p_user: uuid.parse(path[3]),
        p_role: role,
      }),
    );
    return { ok: true };
  }
  if (
    resource === "invitations" &&
    method === "POST" &&
    ["accept", "decline"].includes(path[3])
  ) {
    checked(
      await supabase.rpc("community_accept_invitation", {
        p_invitation: uuid.parse(path[2]),
        p_accept: path[3] === "accept",
      }),
    );
    return { ok: true };
  }
  if (resource === "connections") {
    if (method === "POST" && !path[2]) {
      const value = z.object({ target_id: uuid }).parse(await readBody());
      return checked(
        await supabase
          .from("community_connections")
          .insert({ ...value, sender_id: user.id })
          .select("*")
          .single(),
      );
    }
    if (method === "POST" && ["accept", "decline"].includes(path[3])) {
      checked(
        await supabase.rpc("community_accept_connection", {
          p_connection: uuid.parse(path[2]),
          p_accept: path[3] === "accept",
        }),
      );
      return { ok: true };
    }
    if (method === "DELETE" && path[2]) {
      checked(
        await supabase
          .from("community_connections")
          .delete()
          .eq("id", uuid.parse(path[2])),
      );
      return { ok: true };
    }
  }
  if (resource === "posts") {
    if (method === "POST" && !path[2])
      return checked(
        await supabase
          .from("community_posts")
          .insert({ ...postSchema.parse(await readBody()), user_id: user.id })
          .select("*")
          .single(),
      );
    if (method === "PATCH" && path[2])
      return checked(
        await supabase
          .from("community_posts")
          .update(postSchema.parse(await readBody()))
          .eq("id", uuid.parse(path[2]))
          .select("*")
          .single(),
      );
    if (method === "DELETE" && path[2]) {
      checked(
        await supabase
          .from("community_posts")
          .delete()
          .eq("id", uuid.parse(path[2])),
      );
      return { ok: true };
    }
  }
  if (resource === "replies") {
    if (method === "POST" && !path[2])
      return checked(
        await supabase
          .from("community_replies")
          .insert({
            ...z
              .object({ post_id: uuid, content: text(3000) })
              .parse(await readBody()),
            user_id: user.id,
          })
          .select("*")
          .single(),
      );
    if (method === "DELETE" && path[2]) {
      checked(
        await supabase
          .from("community_replies")
          .delete()
          .eq("id", uuid.parse(path[2])),
      );
      return { ok: true };
    }
  }
  if (resource === "reactions" && method === "POST") {
    const { active, ...value } = z
      .object({
        post_id: uuid,
        kind: z.enum(["like", "bookmark"]),
        active: z.boolean(),
      })
      .parse(await readBody());
    checked(
      active
        ? await supabase
            .from("community_reactions")
            .upsert({ ...value, user_id: user.id })
        : await supabase
            .from("community_reactions")
            .delete()
            .eq("post_id", value.post_id)
            .eq("kind", value.kind)
            .eq("user_id", user.id),
    );
    return { ok: true };
  }
  if (resource === "events" || resource === "resources") {
    const table = `community_${resource}`;
    const schema = resource === "events" ? eventSchema : resourceSchema;
    if (method === "POST" && !path[2])
      return checked(
        await supabase
          .from(table)
          .insert({ ...schema.parse(await readBody()), user_id: user.id })
          .select("*")
          .single(),
      );
    if (method === "PATCH" && path[2])
      return checked(
        await supabase
          .from(table)
          .update(schema.parse(await readBody()))
          .eq("id", uuid.parse(path[2]))
          .select("*")
          .single(),
      );
    if (method === "DELETE" && path[2]) {
      checked(
        await supabase.from(table).delete().eq("id", uuid.parse(path[2])),
      );
      return { ok: true };
    }
  }
  throw new AppError(404, "This community action was not found.");
}
