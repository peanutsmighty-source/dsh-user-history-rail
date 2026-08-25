// dsh-user-history-rail — Host half (no-op).
// The loader entry must exist host-side so the client-modules node half can
// scan this package's `dsh.client` declaration into window.__DSH_BOOT__.
// All functionality lives in the browser half (lib/client.js).
export default {
  apply() {},
}
