interface MailDraftInput {
  to: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
}

const buildMailtoUrl = ({ to, subject, body, cc, bcc }: MailDraftInput) => {
  const params = new URLSearchParams();

  if (subject?.trim()) {
    params.set('subject', subject.trim());
  }

  if (body?.trim()) {
    params.set('body', body.trim());
  }

  if (cc?.trim()) {
    params.set('cc', cc.trim());
  }

  if (bcc?.trim()) {
    params.set('bcc', bcc.trim());
  }

  const query = params.toString();
  return `mailto:${encodeURIComponent(to.trim())}${query ? `?${query}` : ''}`;
};

export const openMailDraft = (input: MailDraftInput) => {
  if (!input.to.trim()) {
    return;
  }

  window.location.href = buildMailtoUrl(input);
};
