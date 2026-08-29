/** Searchable inventory of currently consequential operation branches. */
export const operationBranches = {
  "project-native.create": ["owner.active.allowed","admin.active.allowed","member.active.allowed","former.denied","archived.denied"],
  "project-native.edit": ["admin.active.allowed","member.active.allowed","former.denied","archived.denied"],
  "project-native.delete": ["creator.before.allowed","creator.at.denied","creator.after.denied","creator.voluntary-leave.before.allowed","creator.removed.before.allowed","admin.active.allowed","member.after.denied","archived-admin.denied"],
  "project-native.read": ["member.members-audience.allowed","former.denied","human.agents-only.denied"],
  "project-native.provenance": ["deleted-creator.resolves-tombstone","deleted-revision-actor.resolves-tombstone"],
  "project-native.copy": ["new-id.independent","source-deleted.copy-survives"],
  "contribution.lifecycle": ["active","suspended-after-removal","retracted"],
  "invitation.lifecycle": ["outstanding","accepted","declined","revoked","expired"],
  "project.lifecycle": ["active","archived"],
  "document.read": ["owner-private.allowed","other-private.denied","anonymous-public.allowed"],
} as const;
export const caseName=(operation:keyof typeof operationBranches,branch:string)=>`${operation} :: ${branch}`;
