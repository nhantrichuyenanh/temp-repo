const observer = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const commentBoxes = node.querySelectorAll?.('#commentbox');
        commentBoxes?.forEach(confCmtBox);
      }
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

function confCmtBox(commentBox) {
  if (commentBox.dataset.enhanced === "true") return;
  commentBox.dataset.enhanced = "true";
  const emojiButton = commentBox.querySelector('#emoji-button');
  const input = commentBox.querySelector('#contenteditable-root');
  const footer = commentBox.querySelector('#footer');
  // checking if user is editing
  const isEditingComment = input && input.innerHTML.trim() !== "" && input.innerHTML.trim() !== "<br>";

  // preview pop-up
  const previewContainer = document.createElement("div");
  previewContainer.className = "yt-comments-enhanced-preview-container";
  previewContainer.style.display = "none";
  previewContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  previewContainer.style.transform = 'translateY(-10px)';
  previewContainer.style.opacity = '0';
  const previewBody = document.createElement("span");
  previewContainer.appendChild(previewBody);
  footer.insertAdjacentElement('afterend', previewContainer);

  // format buttons
  const buttons = [
    {
      label: "<b>B</b>",
      classes: ["yt-comments-enhanced-bold"],
      symbol: "*",
      onClick: () => toggleFormatting("*"),
    },
    {
      label: "<i>I</i>",
      classes: ["yt-comments-enhanced-italic"],
      symbol: "_",
      onClick: () => toggleFormatting("_"),
    },
    {
      label: "<s>S</s>",
      classes: ["yt-comments-enhanced-strikethrough"],
      symbol: "-",
      onClick: () => toggleFormatting("-"),
    },
    {
      label: "<u><i>T</i></u><sub>ₓ</sub>",
      classes: ["yt-comments-enhanced-clear"],
      onClick: () => clearAllFormatting(),
    },
    {
      label: "🖋",
      classes: ["yt-comments-enhanced-preview-toggle"],
      onClick: () => togglePreview(),
    },
  ];

  // insert format buttons next to emoji button
  let previewToggleButton = null;
  buttons.reverse().forEach(config => {
    const btn = createBtn(config);
    if (config.classes.includes("yt-comments-enhanced-preview-toggle")) {
      previewToggleButton = btn;
      // show preview button immediately if editing comment
      btn.style.display = isEditingComment ? "inline-flex" : "none";
    }
    emojiButton.insertAdjacentElement("afterend", btn);
  });

  if (isEditingComment) {
    updatePreview();
  }
  input.addEventListener("input", () => {
    updatePreview();
    setTimeout(togglePBvisibile, 10);
  });
  input.addEventListener("focus", () => {
    updatePreview();
    setTimeout(togglePBvisibile, 10);
  });
  input.addEventListener("blur", () => {
    updatePreview();
    setTimeout(togglePBvisibile, 10);
  });
  input.addEventListener("keydown", () => {
    setTimeout(() => {
      updatePreview();
      togglePBvisibile();
    }, 10);
  });

  const inputObserver = new MutationObserver(() => {
    setTimeout(() => {
      updatePreview();
      togglePBvisibile();
    }, 10);
  });

  inputObserver.observe(input, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: false
  });

  function createBtn({ label, classes, onClick }) {
    const button = document.createElement("button");
    button.innerHTML = label;
    button.classList.add("yt-comments-enhanced-buttons", ...classes);

    button.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
      input.focus();
      const inputEvent = new Event('input', { bubbles: true });
      input.dispatchEvent(inputEvent);
      updatePreview();
      setTimeout(togglePBvisibile, 10);
    });
    return button;
  }

  // restore cursor position after formatting
  function restoreCursorPos(textNode, offset) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const selection = window.getSelection();
    const range = document.createRange();
    const maxOffset = textNode.textContent.length;
    const safeOffset = Math.min(offset, maxOffset);

    try {
      range.setStart(textNode, safeOffset);
      range.setEnd(textNode, safeOffset);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) {
      range.setStart(textNode, maxOffset);
      range.setEnd(textNode, maxOffset);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function isTextAlreadyFormatted(text, cursorStart, cursorEnd, symbol) {
    let openPos = -1;
    for (let i = cursorStart - 1; i >= 0; i--) {
      if (text[i] === symbol) {
        if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\n') {
          openPos = i;
          break;
        }
      } else if (text[i] === ' ' || text[i] === '\n') {
        break;
      }
    }

    let closePos = -1;
    for (let i = cursorEnd; i < text.length; i++) {
      if (text[i] === symbol) {
        if (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\n') {
          closePos = i;
        break;
        }
      } else if (text[i] === ' ' || text[i + 1] === '\n') {
        break;
      }
    }

    return { isFormatted: openPos !== -1 && closePos !== -1, openPos, closePos };
  }

  function toggleFormatting(symbol) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const textNode = range.commonAncestorContainer;
    const actualTextNode = textNode.nodeType === Node.TEXT_NODE ? textNode : textNode.firstChild;
    if (!actualTextNode || actualTextNode.nodeType !== Node.TEXT_NODE) return;

    const fullText = actualTextNode.textContent;
    const cursorStart = range.startOffset;
    const cursorEnd = range.endOffset;
    const selectedText = fullText.substring(cursorStart, cursorEnd);

    const originalCursorPos = cursorStart;
    const formatCheck = isTextAlreadyFormatted(fullText, cursorStart, cursorEnd, symbol);

    if (formatCheck.isFormatted) {
      const beforeFormat = fullText.substring(0, formatCheck.openPos);
      const formattedContent = fullText.substring(formatCheck.openPos + 1, formatCheck.closePos);
      const afterFormat = fullText.substring(formatCheck.closePos + 1);
      const newText = beforeFormat + formattedContent + afterFormat;
      actualTextNode.textContent = newText;

      let newCursorPos;
      if (originalCursorPos <= formatCheck.openPos) {
        newCursorPos = originalCursorPos;
      } else if (originalCursorPos >= formatCheck.closePos) {
        newCursorPos = originalCursorPos - 2;
      } else {
        newCursorPos = originalCursorPos - 1;
      }
      restoreCursorPos(actualTextNode, newCursorPos);
    } else {
      if (selectedText === "") {
        const wordBoundaries = findWordBoundariesAtCursor(fullText, cursorStart);
        if (wordBoundaries && wordBoundaries.word.trim().length > 0) {
          const beforeWord = fullText.substring(0, wordBoundaries.start);
          const afterWord = fullText.substring(wordBoundaries.end);
          const word = wordBoundaries.word;
          const needsSpaceBefore = beforeWord.length > 0 && !beforeWord.endsWith(' ');
          const needsSpaceAfter = afterWord.length > 0 && !afterWord.startsWith(' ');
          const spaceBefore = needsSpaceBefore ? ' ' : '';
          const spaceAfter = needsSpaceAfter ? ' ' : '';
          const newText = `${beforeWord}${spaceBefore}${symbol}${word}${symbol}${spaceAfter}${afterWord}`;
          actualTextNode.textContent = newText;

          let newCursorPos;
          if (originalCursorPos <= wordBoundaries.start) {
            newCursorPos = originalCursorPos + spaceBefore.length;
          } else if (originalCursorPos >= wordBoundaries.end) {
            newCursorPos = beforeWord.length + spaceBefore.length + symbol.length + word.length + symbol.length + (originalCursorPos - wordBoundaries.end);
          } else {
            const relativePos = originalCursorPos - wordBoundaries.start;
            newCursorPos = beforeWord.length + spaceBefore.length + symbol.length + relativePos;
          }
          restoreCursorPos(actualTextNode, newCursorPos);
        } else {
          restoreCursorPos(actualTextNode, originalCursorPos);
        }
      } else {
        const beforeText = fullText.substring(0, cursorStart);
        const afterText = fullText.substring(cursorEnd);
        const needsSpaceBefore = beforeText.length > 0 && !beforeText.endsWith(' ');
        const needsSpaceAfter = afterText.length > 0 && !afterText.startsWith(' ');
        const spaceBefore = needsSpaceBefore ? ' ' : '';
        const spaceAfter = needsSpaceAfter ? ' ' : '';
        const newText = `${beforeText}${spaceBefore}${symbol}${selectedText}${symbol}${spaceAfter}${afterText}`;
        actualTextNode.textContent = newText;
        const newCursorPos = beforeText.length + spaceBefore.length + symbol.length + selectedText.length + symbol.length;
        restoreCursorPos(actualTextNode, newCursorPos);
      }
    }
  }

  function findWordBoundariesAtCursor(text, position) {
    if (position < 0 || position > text.length) return null;
    let start = position;
    let end = position;
    while (start > 0 && text[start - 1].match(/\S/)) {
      start--;
    }
    while (end < text.length && text[end].match(/\S/)) {
      end++;
    }
    if (start === end) return null;
    return {
      start: start,
      end: end,
      word: text.substring(start, end)
    };
  }

  function clearAllFormatting() {
    const selection = window.getSelection();
    let originalCursorPos = 0;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      originalCursorPos = range.startOffset;
    }

    const walker = document.createTreeWalker(
      input,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      if (textNode.textContent) {
        const originalText = textNode.textContent;
        const cleanText = originalText
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/_(.+?)_/g, '$1')
          .replace(/-(.+?)-/g, '$1');
        if (cleanText !== originalText) {
          textNode.textContent = cleanText;
          if (originalCursorPos > cleanText.length) {
            originalCursorPos = cleanText.length;
          }
          restoreCursorPos(textNode, originalCursorPos);
        }
      }
    });
    updatePreview();
  }

  function togglePBvisibile() {
    const currentText = input.innerHTML.trim();
    const hasText = currentText !== "" && currentText !== "<br>" && currentText.length > 0;

    if (previewToggleButton) {
      previewToggleButton.style.display = hasText ? "inline-flex" : "none";
    }

    if (!hasText && previewContainer.style.display === "block") {
      previewContainer.style.transform = 'translateY(-10px)';
      previewContainer.style.opacity = '0';
      setTimeout(() => {
        previewContainer.style.display = "none";
      }, 300);
    }
  }

  function togglePreview() {
    if (previewContainer.style.display === "none") {
      previewContainer.style.display = "block";
      setTimeout(() => {
        previewContainer.style.transform = 'translateY(0)';
        previewContainer.style.opacity = '1';
      }, 10);
      updatePreview();
    } else {
      previewContainer.style.transform = 'translateY(-10px)';
      previewContainer.style.opacity = '0';
      setTimeout(() => {
        previewContainer.style.display = "none";
      }, 300);
    }
  }

  function updatePreview() {
    const currentText = input.innerHTML.trim();
    if (currentText === "<br>" || currentText === "" || currentText.length === 0) {
      if (previewContainer.style.display === "block") {
        previewBody.innerHTML = "<em></em>";
      }
    } else {
      previewBody.innerHTML = formatText(getTextContentWithLineBreaks(input));
    }
  }

  // get text content with line breaks and special handling for <br> and <img>
  function getTextContentWithLineBreaks(element) {
    let text = '';
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ALL,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'br') {
          text += '\n';
        } else if (tagName === 'img' && node.alt) {
          // include the emoji from the alt attribute of the <img> tag
          text += node.alt;
        } else if (tagName === 'div' && node !== element) {
          if (text && !text.endsWith('\n')) {
            text += '\n';
          }
        }
      }
    }
    return text;
  }
}

// format text with nested formatting patterns
function formatText(input) {
  let output = input;

  // triple combinations
  output = output.replace(
    /(^|\s|\n)\*_-([^\s\n]+?)-_\*(?=\s|$|\n)/g,
    '$1<span style="font-weight: 500;"><span class="yt-core-attributed-string--italicized"><span class="yt-core-attributed-string--strikethrough">$2</span></span></span>'
  );

  output = output.replace(
    /(^|\s|\n)\*-_([^\s\n]+?)_-\*(?=\s|$|\n)/g,
    '$1<span style="font-weight: 500;"><span class="yt-core-attributed-string--strikethrough"><span class="yt-core-attributed-string--italicized">$2</span></span></span>'
  );

  output = output.replace(
    /(^|\s|\n)_\*-([^\s\n]+?)-\*_(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--italicized"><span style="font-weight: 500;"><span class="yt-core-attributed-string--strikethrough">$2</span></span></span>'
  );

  output = output.replace(
    /(^|\s|\n)_-\*([^\s\n]+?)\*-_(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--italicized"><span class="yt-core-attributed-string--strikethrough"><span style="font-weight: 500;">$2</span></span></span>'
  );

  output = output.replace(
    /(^|\s|\n)-\*_([^\s\n]+?)_\*-(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--strikethrough"><span style="font-weight: 500;"><span class="yt-core-attributed-string--italicized">$2</span></span></span>'
  );

  output = output.replace(
    /(^|\s|\n)-_\*([^\s\n]+?)\*_-(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--strikethrough"><span class="yt-core-attributed-string--italicized"><span style="font-weight: 500;">$2</span></span></span>'
  );

  // double combinations
  output = output.replace(
    /(^|\s|\n)\*_([^\s\n]+?)_\*(?=\s|$|\n)/g,
    '$1<span style="font-weight: 500;"><span class="yt-core-attributed-string--italicized">$2</span></span>'
  );

  output = output.replace(
    /(^|\s|\n)_\*([^\s\n]+?)\*_(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--italicized"><span style="font-weight: 500;">$2</span></span>'
  );

  output = output.replace(
    /(^|\s|\n)\*-([^\s\n]+?)-\*(?=\s|$|\n)/g,
    '$1<span style="font-weight: 500;"><span class="yt-core-attributed-string--strikethrough">$2</span></span>'
  );

  output = output.replace(
    /(^|\s|\n)-\*([^\s\n]+?)\*-(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--strikethrough"><span style="font-weight: 500;">$2</span></span>'
  );

  output = output.replace(
    /(^|\s|\n)_-([^\s\n]+?)-_(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--italicized"><span class="yt-core-attributed-string--strikethrough">$2</span></span>'
  );

  output = output.replace(
    /(^|\s|\n)-_([^\s\n]+?)_-(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--strikethrough"><span class="yt-core-attributed-string--italicized">$2</span></span>'
  );

  // single formatting
  output = output.replace(
    /(^|\s|\n)\*([^\s\n]+?)\*(?=\s|$|\n)/g,
    '$1<span style="font-weight: 500;">$2</span>'
  );

  output = output.replace(
    /(^|\s|\n)_([^\s\n]+?)_(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--italicized">$2</span>'
  );

  output = output.replace(
    /(^|\s|\n)-([^\s\n]+?)-(?=\s|$|\n)/g,
    '$1<span class="yt-core-attributed-string--strikethrough">$2</span>'
  );

  // links
  output = output.replace(
    /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+\.(?:[A-Za-z]{2,3}(?:\.[A-Za-z]{2,3})?)(?:\/[^\s]*)?/gi,
    (url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" style="color: #3ea2f7; text-decoration: underline;">${url}</a>`;
    }
  );

  return output.trim();
}