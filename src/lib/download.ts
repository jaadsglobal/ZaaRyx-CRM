export const triggerClientDownload = (
  url: string,
  filename: string,
  cleanup?: () => void,
) => {
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  if (cleanup) {
    window.setTimeout(cleanup, 0);
  }
};
