// These extension-owned markers appeared in the reported server/client diff.
// Never remove ordinary application attributes or suppress React diagnostics.
const extensionAttribute = /^(?:bis_skin_checked|bis_register|cz-shortcut-listen|rtrvr-(?:mw-(?:ready|busy)|react|gl-(?:click|input|keydown))|__processed_[0-9a-f-]+__)$/i;

export function cleanExtensionMarkers(root: Element) {
  for (const name of root.getAttributeNames()) {
    if (extensionAttribute.test(name)) root.removeAttribute(name);
  }
  for (const element of root.querySelectorAll("*")) {
    for (const name of element.getAttributeNames()) {
      if (extensionAttribute.test(name)) element.removeAttribute(name);
    }
  }
}

export function prepareHydration(doc: Document) {
  cleanExtensionMarkers(doc.documentElement);
  // Catch markers added between Next's client instrumentation and the first commit.
  // Disconnect once React has hydrated; this is not a permanent DOM sanitizer.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes" && record.attributeName && extensionAttribute.test(record.attributeName)) {
        (record.target as Element).removeAttribute(record.attributeName);
      } else if (record.type === "childList") {
        for (const node of record.addedNodes) if (node instanceof Element) cleanExtensionMarkers(node);
      }
    }
  });
  observer.observe(doc.documentElement, { attributes: true, childList: true, subtree: true });
  const stop = () => {
    observer.disconnect();
    doc.removeEventListener("msi:hydrated", stop);
    clearTimeout(timeout);
  };
  doc.addEventListener("msi:hydrated", stop, { once: true });
  const timeout = setTimeout(stop, 10000);
}
