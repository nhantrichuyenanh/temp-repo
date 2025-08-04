- add "id": "{}", to manifest
- add homepage to manifest
- integrate this add-on with this script:
(() => {
  const WRAP = { b: "*", i: "_", s: "-" };

  function isEditable(el) {
    return el && el.isContentEditable;
  }

  function findWordBounds(text, offset) {
    let start = offset;
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    let end = offset;
    while (end < text.length && !/\s/.test(text[end])) end++;
    return [start, end];
  }

  function toggleWrap(range, wrapper) {
    const txt = range.toString();
    const wlen = wrapper.length;
    let newText, caretOffset;

    if (
      txt.startsWith(wrapper) &&
      txt.endsWith(wrapper) &&
      txt.length >= 2 * wlen
    ) {
      // unwrap
      newText = txt.slice(wlen, txt.length - wlen);
      caretOffset = range.collapsed ? range.startOffset - wlen : null;
    } else {
      // wrap
      newText = wrapper + txt + wrapper;
      caretOffset = range.collapsed ? wlen + range.startOffset : null;
    }

    range.deleteContents();
    const node = document.createTextNode(newText);
    range.insertNode(node);

    const sel = window.getSelection();
    sel.removeAllRanges();
    const newR = document.createRange();

    if (caretOffset != null) {
      const pos = Math.max(0, Math.min(newText.length, caretOffset));
      newR.setStart(node, pos);
      newR.collapse(true);
    } else {
      newR.selectNodeContents(node);
    }

    sel.addRange(newR);
  }

  function applyFormatting(wrapper) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let range = sel.getRangeAt(0);

    if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
      const txtNode = range.startContainer;
      const txt = txtNode.textContent;
      const off = range.startOffset;
      const [w0, w1] = findWordBounds(txt, off);
      if (w0 !== w1) {
        range = document.createRange();
        range.setStart(txtNode, w0);
        range.setEnd(txtNode, w1);
      }
    }

    toggleWrap(range, wrapper);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const active = document.activeElement;
      if (!isEditable(active)) return;

      const isMac = navigator.platform.includes("Mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const key = e.key;

      // remove all formatting with Ctrl + Space or \
      if (!e.shiftKey && (key === " " || key === "\\")) {
        e.preventDefault();
        const clean = active.textContent.replace(/[\*\-_]/g, "");
        active.textContent = clean;
        const r = document.createRange();
        r.selectNodeContents(active);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        return;
      }

      // bold / italic / strikethrough
      if (!e.shiftKey) {
        const lk = key.toLowerCase();
        if (lk in WRAP) {
          e.preventDefault();
          applyFormatting(WRAP[lk]);
        }
      }
    },
    true
  );
})();

✅ completely remove superscript from this add-on
✅ add a button to remove all formatting
✅ add a button to show/hide the Live Preview pop-up (previewContainer)
✅ replace Live Preview title (previewHeader) using h2 tag with something else to avoid confusion with bolden text in Live Preview pop-up
✅ after clicking the format button (Bold/Italic/Strikethrough/Superscript), clicking it again it should remove the formatting symbols instead of adding more
✅ remove the gray round box that surrounds each format buttons
✅ for the Live Preview pop-up, completely remove the gray box and add an outline like a round border
✅ make the outline round border of Live Preview pop-up to be thin
✅ I know this sounds crazy but can you put the Live Preview title not in or outside the Live Preview pop-up but on the border itself like a cutout for it
✅ add the ability to format the text by putting the text cursor in the middle of it besides highlighting it to format
✅ account for how YouTube deals with special symbols next to formatting symbols because putting them together might render the comment unformatted after user clicking the Comment button, despite that the text is rendered formatted in Live Preview pop-up
✅ when user hovers over the format buttons, a full circle with the color gray appears
✅ make the format buttons' symbols a little bit bigger
✅ make the gray outline border for the Live Preview pop-up thinner
✅ remove the Live Preview title completely
✅ make the gray circle when hovering format buttons bigger
✅ replace ⌫ with an italic T with ₓ and 👁 with 🖋
✅ fix buttons when editing comment
✅ make the manifest.json full-fledge like this:
{
  "manifest_version": 3,
  "name": "YouTube Comment Formatter Hotkeys",
  "version": "1.0.2",
  "description": "Use Ctrl / ⌘ + B / I / S to wrap your YouTube comment text in *bold*, -italic- or _strikethrough_.",
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "host_permissions": [
    "https://www.youtube.com/watch?*",
    "https://www.youtube.com/shorts/*",
    "https://www.youtube.com/channel/*/community?*"
  ],
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "browser_specific_settings": {
    "gecko": {
      "id": "{686bfcbd-7def-41c3-9481-d720eb02efae}",
      "strict_min_version": "109.0"
    }
  }
}
