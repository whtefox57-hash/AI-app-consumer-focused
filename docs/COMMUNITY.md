# Networks and personal feed

The redesigned community screens use the scenic references supplied by the owner: a large network cover, readable post column, a horizontal personal agent rail, and compact side panels. The personal feed has automations, connections, networks, and private projects on the left; posts in the center; and interests, events, maps, and related networks on the right. Empty states contain no invented people, posts, live calls, prices, or completed automations.

The connected app saves community records in Supabase through the authenticated `/api/community/*` handlers. Migration `202610020007_community.sql` supplies tables, row-level policies, and role-sensitive RPCs. The browser-only design preview uses the shared preview adapter and saves explicitly entered test content in that browser. It cannot authenticate another person, send an invitation, connect a provider, or generate an AI response.

## Roles and privacy

| Role | Access |
| --- | --- |
| Owner | Edit or delete the network, assign moderator/member roles, invite people, manage events/resources, and moderate posts. |
| Moderator | Edit the network, moderate posts and ordinary members, create/edit events and resources, and invite ordinary members. Cannot promote a person or remove the owner. |
| Member | Read permitted network content, post, reply, like, bookmark, and leave. Cannot grant themselves a higher role. |

Private networks require an invitation. The intended recipient must accept from their own authenticated account; the sender cannot accept for them. Pending private invitations reveal the network description but do not unlock its posts. Invitations expire after seven days and can be renewed by an authorized owner or moderator. Discoverable networks permit signed-in people to join as members. Removing a member removes their access to private network posts.

Personal posts can be private, visible to accepted connections, or discoverable. Discoverable personal posts require an explicitly opted-in discovery profile. Connections also need recipient acceptance. A bookmark is visible only to its owner; permitted viewers can see likes. Profile suggestions compare declared, shared interests and are described as interest matches. They do not claim an AI scan, infer friendship, or include private conversations, projects, or precise locations.

Network graph nodes represent accessible saved networks and real membership counts. Lines connect networks with shared declared topics. The graph has a keyboard-accessible 2D view and a rotatable perspective 3D view; it is loaded on demand. Widgets support collapse, hide/restore, drag reorder, and accessible move buttons. Layout changes survive refresh.

Events use user-entered venues and links. The display uses Arizona time; event entry names the browser's timezone. Resource, public project, and game links do not grant access to private Cast projects. Network post visibility follows the network's access settings, with no misleading “Only me” switch for a shared post.

Music, film, reading recommendations, market quotes, and live calls are not represented as connected services. Their integration dialogs explain the missing provider. Selecting a personal agent opens its private workspace; it does not share agent memory or documents with a network.

## Verification performed

`npx tsx --test tests/community.test.ts` passes five tests against actual PostgreSQL behavior in PGlite. These cover private record isolation; invitations accepted only by the recipient; direct membership and role escalation denial; moderator boundaries; immutable event authors; invitation renewal after decline; accepted connections; opt-in discovery; private bookmarks and layouts; public membership counts; and access revoked after removal.

Browser checks passed on the local connected application using two actual Supabase accounts and database records. Both test accounts were removed afterward. The checks exercised private post isolation before invitation acceptance, blocked private self-join, recipient acceptance, an actual member count of two, saved replies, bookmark privacy, blocked member self-promotion, owner promotion to moderator, moderator event editing, refresh durability, and loss of access after removal.

Browser checks also passed on the explicit design preview: create/edit a post, reply, like, bookmark, create a network, filter saved posts, create an event and resource link, rotate the graph in 3D, change panel order, hide a panel, refresh, and verify persistence. Desktop and 390-pixel mobile layouts showed no horizontal overflow and no JavaScript errors.

These results verify the local application and the browser preview. They do not establish a deployed Supabase migration, production social traffic, a connected recommendation provider, or successful live AI generation from these community screens.
