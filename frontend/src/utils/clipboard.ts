/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` is a secure-context API, and this system is deployed
 * LAN-only over plain HTTP inside the hospital network — so on real
 * workstations the fallback below is the path that actually runs, not the
 * modern API. Returns whether the copy went through, so callers can show an
 * honest success/failure message.
 */
export function copyText(text: string): boolean {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    return true;
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(el);
  }
}

export default copyText;
