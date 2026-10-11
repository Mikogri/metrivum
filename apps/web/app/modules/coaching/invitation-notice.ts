/** What the person is told (top-right toast) after answering or revoking an invitation. */
export const invitationNotice: Record<string, { title: string; description?: string }> = {
  accept: { title: "Invitation accepted", description: "You can now fill out the application." },
  decline: { title: "Invitation declined" },
  revoke: { title: "Invitation revoked" },
};
