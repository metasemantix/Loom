/** Searchable inventory of currently consequential operation branches. */
export const operationBranches = {
  "project-native.create": ["owner.active.allowed","admin.active.allowed","member.active.allowed","default-path.allowed","direct-upload.allowed","former.denied","archived.denied"],
  "project-native.edit": ["admin.active.allowed","member.active.allowed","former.denied","archived.denied"],
  "project-native.delete": ["creator.before.allowed","creator.at.denied","creator.after.denied","creator.voluntary-leave.before.allowed","creator.removed.before.allowed","admin.active.allowed","member.after.denied","archived-admin.denied"],
  "project-native.read": ["member.members-audience.allowed","former.denied","human.agents-only.denied"],
  "project-native.provenance": ["deleted-creator.resolves-tombstone","deleted-revision-actor.resolves-tombstone"],
  "project-native.history": ["member.reads-revisions-and-metadata"],
  "project-native.copy": ["new-id.independent","source-deleted.copy-survives"],
  "contribution.lifecycle": ["active","suspended-after-removal","retracted"],
  "invitation.lifecycle": ["outstanding","accepted","declined","revoked","expired"],
  "project.lifecycle": ["active","archived","deletion-pending","shell"],
  "project.deletion": ["owner.schedule.allowed","admin.schedule.denied","member.schedule.denied","confirmation.exact","active.archives","archived.schedules","before-deadline.cancel-owner","at-deadline.cancel-denied","reschedule.fresh-deadline","finalization.content-destroyed"],
  "document.read": ["owner-private.allowed","other-private.denied","anonymous-public.allowed"],
  "machine-credential.manage": ["owner.create.allowed","non-owner.create.denied","owner.revoke.allowed","revoked.next-request.denied","shell-finalization.revokes"],
  "machine-corpus.read": ["valid.introspect.allowed","participant-contribution.allowed","project-native.allowed","outside-project.denied","retracted.next-request.denied","archived.allowed","deletion-scheduled.allowed","shell.denied","malformed.denied","unknown.denied","mutation.denied-and-attributed"],
  "agent.discovery": ["llms.public","well-known.public-non-secret","entrance.public-parseable","human-login.unchanged"],
  "gpt-action.authenticate": ["active.allowed-and-equivalent","malformed.denied","unknown.denied","revoked.denied","archived.allowed","deletion-scheduled.allowed","shell.denied","unsupported-method.denied","credential-not-disclosed","schema.single-operation"],
  "agent-checkin.write": ["read-only.denied","enabled.active.allowed","provenance.owner-inspectable","malformed.denied","oversized.denied","revoked.denied","archived.denied","deletion-scheduled.denied","shell.denied","stale-lifecycle.denied"],
} as const;
export const caseName=(operation:keyof typeof operationBranches,branch:string)=>`${operation} :: ${branch}`;
