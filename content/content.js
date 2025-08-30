// CONFIGURATION //
const PREVIEW_BORDER_SIZE = 2
const PREVIEW_MARGIN = 10
const PREVIEW_MAX_HEIGHT = 175
const PREVIEW_MIN_HEIGHT = 40
const PREVIEW_WIDTH_PADDING = 5
const PREVIEW_DEFAULT_WIDTH = 320

// Live overlay configuration
const OVERLAY_DURATION = 4000 // 4 seconds
const OVERLAY_FADE_DURATION = 500 // 0.5 seconds
const MAX_CONCURRENT_OVERLAYS = 3
const OVERLAY_SPACING = 60 // pixels between overlays
const TIME_TOLERANCE = 0.5 // seconds

let timeComments = []
let activeOverlays = []
let lastVideoTime = 0
let overlayContainer = null

main()
onLocationHrefChange(() => {
    removeBar()
    removeOverlayContainer()
    timeComments = []
    activeOverlays = []
    main()
})

function main() {
    const videoId = getVideoId()
    if (!videoId) return

    fetchTimeComments(videoId)
        .then(comments => {
            if (videoId === getVideoId()) {
                timeComments = comments
                addTimeComments(comments)
                startVideoTimeMonitoring()
            }
        })
}

function getVideoId() {
    if (window.location.pathname === '/watch') {
        return parseParams(window.location.href)['v']
    } else if (window.location.pathname.startsWith('/embed/')) {
        return window.location.pathname.substring('/embed/'.length)
    }
    return null
}

function getVideo() {
    return document.querySelector('#movie_player video')
}

function fetchTimeComments(videoId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({type: 'fetchTimeComments', videoId}, resolve)
    })
}

// Video time monitoring for live overlays
function startVideoTimeMonitoring() {
    const video = getVideo()
    if (!video) return

    // Remove existing listeners
    video.removeEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('timeupdate', handleTimeUpdate)
}

function handleTimeUpdate(event) {
    const video = event.target
    const currentTime = video.currentTime

    // Only check if video is playing and time has advanced
    if (video.paused || Math.abs(currentTime - lastVideoTime) < 0.1) {
        lastVideoTime = currentTime
        return
    }

    // Find comments that should appear at this time
    const commentsToShow = timeComments.filter(tc => {
        const timeDiff = Math.abs(tc.time - currentTime)
        return timeDiff <= TIME_TOLERANCE && !isCommentCurrentlyShown(tc)
    })

    // Show new overlays
    commentsToShow.forEach(showLiveOverlay)

    lastVideoTime = currentTime
}

function isCommentCurrentlyShown(comment) {
    return activeOverlays.some(overlay =>
        overlay.commentId === comment.commentId &&
        overlay.timestamp === comment.timestamp
    )
}

function showLiveOverlay(timeComment) {
    // Limit concurrent overlays
    if (activeOverlays.length >= MAX_CONCURRENT_OVERLAYS) {
        const oldestOverlay = activeOverlays.shift()
        removeOverlay(oldestOverlay)
    }

    const container = getOrCreateOverlayContainer()
    const overlay = createOverlayElement(timeComment)

    // Position overlay
    const yPosition = calculateOverlayYPosition()
    overlay.style.top = yPosition + 'px'

    container.appendChild(overlay)

    // Track active overlay
    const overlayData = {
        element: overlay,
        commentId: timeComment.commentId,
        timestamp: timeComment.timestamp,
        startTime: Date.now()
    }
    activeOverlays.push(overlayData)

    // Animate in
    requestAnimationFrame(() => {
        overlay.style.opacity = '1'
        overlay.style.transform = 'translateX(0)'
    })

    // Auto-remove after duration
    setTimeout(() => {
        removeOverlay(overlayData)
    }, OVERLAY_DURATION)
}

function calculateOverlayYPosition() {
    const baseY = 80 // Start position from top
    const usedPositions = activeOverlays.map(overlay =>
        parseInt(overlay.element.style.top) || 0
    )

    // Find the first available position
    for (let i = 0; i < MAX_CONCURRENT_OVERLAYS; i++) {
        const yPos = baseY + (i * OVERLAY_SPACING)
        if (!usedPositions.includes(yPos)) {
            return yPos
        }
    }

    return baseY // Fallback
}

function removeOverlay(overlayData) {
    if (!overlayData || !overlayData.element) return

    const overlay = overlayData.element

    // Animate out
    overlay.style.opacity = '0'
    overlay.style.transform = 'translateX(100px)'

    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay)
        }
    }, OVERLAY_FADE_DURATION)

    // Remove from active overlays
    const index = activeOverlays.indexOf(overlayData)
    if (index > -1) {
        activeOverlays.splice(index, 1)
    }
}

function formatCommentTextWithTimestampSpans(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  // Loosely match mm:ss or h:mm:ss patterns (same as earlier)
  const regex = /(\d?\d:)?(\d?\d:)\d\d/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const from = match.index;
    const to = regex.lastIndex;
    if (from > lastIndex) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex, from)));
    }
    const ts = text.slice(from, to);
    const span = document.createElement('span');
    span.className = '__youtube-timestamps__live-overlay__text-stamp';
    span.textContent = ts;
    span.setAttribute('role', 'button');
    span.tabIndex = 0;
    // click => seek
    span.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const secs = parseTimestampToSeconds(ts);
      const video = getVideo && getVideo();
      if (video && secs != null) {
        video.currentTime = Math.max(0, Math.min(video.duration || Infinity, secs));
        video.play().catch(()=>{});
      }
    });
    span.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        span.click();
      }
    });
    frag.appendChild(span);
    lastIndex = to;
  }
  if (lastIndex < text.length) {
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  return frag;
}

const __yt_overlay_queue = [];
let __yt_active_overlays = 0;

function getOrCreateOverlayStackContainer() {
  let container = document.querySelector('.__youtube-timestamps__overlay-stack');
  if (!container) {
    container = document.createElement('div');
    container.className = '__youtube-timestamps__overlay-stack';
    const player = document.querySelector('.html5-video-player') || document.querySelector('#player') || document.body;
    player.appendChild(container);
  }
  return container;
}

// Call this to display a comment overlay. It will either show immediately (if under MAX_CONCURRENT) or queue.
function showOverlayForCommentQueued(timeComment) {
  // Push the comment into the FIFO queue and attempt to process
  __yt_overlay_queue.push(timeComment);
  processOverlayQueue();
}

// Internal: try to show queued overlays while under the concurrency limit
function processOverlayQueue() {
  if (__yt_active_overlays >= MAX_CONCURRENT) return;
  if (__yt_overlay_queue.length === 0) return;

  const next = __yt_overlay_queue.shift();
  displayOverlayImmediate(next);
}

// Internal: actually create, show and schedule removal of an overlay (assumes concurrency slot reserved)
function displayOverlayImmediate(timeComment) {
  const container = getOrCreateOverlayStackContainer();
  const overlay = createOverlayElement(timeComment); // re-use your createOverlayElement implementation

  // append to container
  container.appendChild(overlay);

  // mark active
  __yt_active_overlays++;

  // animate show
  requestAnimationFrame(() => overlay.classList.add('show'));

  // schedule removal
  const removeAfter = OVERLAY_DURATION;
  const hideDelay = 260; // allow CSS fade-out time (ms)
  const removalTimer = setTimeout(() => {
    overlay.classList.remove('show');
    overlay.classList.add('hide');

    setTimeout(() => {
      // cleanup DOM
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      __yt_active_overlays = Math.max(0, __yt_active_overlays - 1);
      // show next in queue if any
      processOverlayQueue();
    }, hideDelay);
  }, removeAfter);

  // If overlay gets clicked and that behavior seeks / plays, we still let it be removed normally.
  // Optionally: if you want clicking to immediately remove an overlay and show next, uncomment below:
  /*
  overlay.addEventListener('click', () => {
    clearTimeout(removalTimer);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    __yt_active_overlays = Math.max(0, __yt_active_overlays - 1);
    processOverlayQueue();
  });
  */
}



function parseTimestampToSeconds(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const parts = ts.split(':').map(p => parseInt(p, 10));
  if (parts.some(p => Number.isNaN(p))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) {
    const [m, s] = parts;
    if (s > 59) return null;
    return m * 60 + s;
  }
  const last3 = parts.slice(-3);
  const [h, m, s] = last3;
  if (s > 59 || m > 59) return null;
  return h * 3600 + m * 60 + s;
}

function formatSecondsToHMS(sec) {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '';
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function createOverlayElement(timeComment) {
  const overlay = document.createElement('div');
  overlay.className = '__youtube-timestamps__live-overlay';

  // Avatar
  const avatar = document.createElement('img');
  avatar.className = '__youtube-timestamps__live-overlay__avatar';
  avatar.alt = timeComment.authorName || 'User';
  avatar.src = timeComment.authorAvatar || '';

  // Content
  const content = document.createElement('div');
  content.className = '__youtube-timestamps__live-overlay__content';

  const authorName = document.createElement('div');
  authorName.className = '__youtube-timestamps__live-overlay__author';
  authorName.textContent = timeComment.authorName || 'Unknown';

  const commentText = document.createElement('div');
  commentText.className = '__youtube-timestamps__live-overlay__text';
  commentText.appendChild(formatCommentTextWithTimestampSpans(timeComment.text || ''));

  content.appendChild(authorName);
  content.appendChild(commentText);

  overlay.appendChild(avatar);
  overlay.appendChild(content);

  // Make overlay clickable: seek to the primary time for this comment (if available)
  overlay.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const video = getVideo && getVideo();
    // prefer explicit numeric time if provided, otherwise try parse from .timestamp
    const secs = (typeof timeComment.time === 'number') ? timeComment.time : parseTimestampToSeconds(timeComment.timestamp || '');
    if (video && secs != null) {
      video.currentTime = Math.max(0, Math.min(video.duration || Infinity, secs));
      video.play().catch(()=>{});
    }
  });

  // keyboard accessible
  overlay.tabIndex = 0;

  return overlay;
}

function showOverlayForComment(timeComment) {
  const container = getOrCreateOverlayStackContainer();
  const overlay = createOverlayElement(timeComment);

  // Append overlay as the last child -> stacks under existing ones
  container.appendChild(overlay);

  // allow CSS animation (add 'show' after appending)
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  // Remove overlay after duration (fade out then remove)
  const removeAfter = OVERLAY_DURATION;
  setTimeout(() => {
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    // give fade animation time (match CSS transition)
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 280);
  }, removeAfter);

  return overlay;
}

function getOrCreateOverlayContainer() {
    if (!overlayContainer) {
        overlayContainer = document.createElement('div')
        overlayContainer.classList.add('__youtube-timestamps__overlay-container')

        const player = document.querySelector('#movie_player')
        if (player) {
            player.appendChild(overlayContainer)
        }
    }
    return overlayContainer
}

function removeOverlayContainer() {
    if (overlayContainer) {
        overlayContainer.remove()
        overlayContainer = null
    }
    activeOverlays = []
}

function addTimeComments(timeComments) {
    const bar = getOrCreateBar()
    const videoDuration = getVideo().duration
    const groupedComments = new Map()

    for (const tc of timeComments) {
        if (typeof tc.time !== 'number' || tc.time > videoDuration) continue

        const timeKey = tc.time.toString()
        if (!groupedComments.has(timeKey)) {
            groupedComments.set(timeKey, [])
        }
        groupedComments.get(timeKey).push(tc)
    }

    for (const [timeKey, commentsAtTime] of groupedComments) {
        const time = parseFloat(timeKey)
        const stamp = createTimestampStamp(time, videoDuration, commentsAtTime)
        bar.appendChild(stamp)
    }
}

function createTimestampStamp(time, videoDuration, commentsAtTime) {
    const stamp = document.createElement('div')
    stamp.classList.add('__youtube-timestamps__stamp')

    if (commentsAtTime.length > 1) {
        stamp.classList.add('__youtube-timestamps__stamp--multiple')
    }

    const offset = time / videoDuration * 100
    stamp.style.left = `calc(${offset}% - 2px)`

    let currentCommentIndex = 0

    stamp.addEventListener('mouseenter', () => {
        showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
    })

    stamp.addEventListener('mouseleave', hidePreview)

    stamp.addEventListener('wheel', withWheelThrottle((deltaY) => {
        handleWheelNavigation(deltaY, commentsAtTime, currentCommentIndex, (newIndex) => {
            currentCommentIndex = newIndex
        })
    }), { passive: false })

    const openCommentInNewTab = createDebouncedCommentOpener()
    stamp.addEventListener('auxclick', e => {
        if (e.button === 1) {
            e.preventDefault()
            e.stopPropagation()
            openCommentInNewTab(commentsAtTime[currentCommentIndex])
        }
    })

    return stamp
}

function handleWheelNavigation(deltaY, commentsAtTime, currentIndex, updateIndex) {
    const SWITCH_THRESHOLD = 100
    const preview = getOrCreatePreview()
    const textElement = preview.querySelector('.__youtube-timestamps__preview__text')

    if (!preview || preview.style.display === 'none') {
        showPreview(commentsAtTime[currentIndex], commentsAtTime.length, currentIndex)
        return
    }

    const switchTo = (newIndex) => {
        updateIndex(newIndex)
        showPreview(commentsAtTime[newIndex], commentsAtTime.length, newIndex)
        const newText = document.querySelector('.__youtube-timestamps__preview__text')
        if (newText) newText.scrollTop = 0
    }

    if (textElement && textElement.scrollHeight > textElement.clientHeight) {
        const atTop = textElement.scrollTop <= 1
        const atBottom = (textElement.scrollTop + textElement.clientHeight) >= (textElement.scrollHeight - 1)

        if ((deltaY > 0 && !atBottom) || (deltaY < 0 && !atTop)) {
            textElement.scrollBy({ top: deltaY, left: 0, behavior: 'auto' })
            return
        }

        if (commentsAtTime.length > 1 && Math.abs(deltaY) >= SWITCH_THRESHOLD) {
            const direction = deltaY > 0 ? 1 : -1
            const newIndex = (currentIndex + direction + commentsAtTime.length) % commentsAtTime.length
            switchTo(newIndex)
        }
        return
    }

    if (commentsAtTime.length > 1 && Math.abs(deltaY) >= SWITCH_THRESHOLD) {
        const direction = deltaY > 0 ? 1 : -1
        const newIndex = (currentIndex + direction + commentsAtTime.length) % commentsAtTime.length
        switchTo(newIndex)
    }
}

function createDebouncedCommentOpener() {
    let lastOpenedAt = 0
    const DEBOUNCE_MS = 400

    return (comment) => {
        const now = Date.now()
        if (now - lastOpenedAt < DEBOUNCE_MS) return
        lastOpenedAt = now

        const videoId = getVideoId()
        const commentId = comment?.commentId
        if (videoId && commentId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`, '_blank')
        }
    }
}

function getOrCreateBar() {
    let bar = document.querySelector('.__youtube-timestamps__bar')
    if (!bar) {
        const container = document.querySelector('#movie_player .ytp-timed-markers-container') ||
                          document.querySelector('#movie_player .ytp-progress-list')
        bar = document.createElement('div')
        bar.classList.add('__youtube-timestamps__bar')
        container.appendChild(bar)
    }
    return bar
}

function removeBar() {
    const bar = document.querySelector('.__youtube-timestamps__bar')
    bar?.remove()
}

function getTooltip() {
    return document.querySelector('#movie_player .ytp-tooltip')
}

function getTooltipBgWidth() {
    const tooltip = getTooltip()
    if (!tooltip) return PREVIEW_DEFAULT_WIDTH

    const tooltipBg = tooltip.querySelector('.ytp-tooltip-bg')
    if (tooltipBg) {
        const rect = tooltipBg.getBoundingClientRect()
        if (rect?.width > 0) return rect.width

        const computed = window.getComputedStyle(tooltipBg).width
        if (computed?.endsWith('px')) {
            const parsed = parseFloat(computed)
            if (!isNaN(parsed)) return parsed
        }

        if (tooltipBg.style?.width) {
            const parsed = parseFloat(tooltipBg.style.width)
            if (!isNaN(parsed)) return parsed
        }
    }

    const progressBar = document.querySelector('#movie_player .ytp-progress-bar')
    const rect = progressBar?.getBoundingClientRect()
    return rect?.width > 0 ? rect.width * 0.9 : PREVIEW_DEFAULT_WIDTH
}

function applyPreviewWidth(preview, measuredWidth) {
    let w = measuredWidth + PREVIEW_WIDTH_PADDING

    const computed = window.getComputedStyle(preview)
    const minW = parseFloat(computed.minWidth) || 0
    const maxW = parseFloat(computed.maxWidth) || Infinity

    if (minW > 0) w = Math.max(w, minW)
    if (maxW > 0 && isFinite(maxW)) w = Math.min(w, maxW)

    preview.style.width = Math.round(w) + 'px'
}

function showPreview(timeComment, totalComments = 1, currentIndex = 0) {
    const tooltip = getTooltip()
    if (!tooltip) return

    const preview = getOrCreatePreview()
    preview.style.display = ''
    preview.style.bottom = (PREVIEW_MARGIN + 12) + 'px'
    preview.style.transform = 'translateY(0) scale(1)'

    preview.querySelector('.__youtube-timestamps__preview__avatar').src = timeComment.authorAvatar || ''
    preview.querySelector('.__youtube-timestamps__preview__name').textContent = timeComment.authorName || 'Unknown'

    const textNode = preview.querySelector('.__youtube-timestamps__preview__text')
    textNode.innerHTML = ''

    const safeText = timeComment.text?.trim() || '(no comment text)'
    const safeFragment = timeComment.timestamp || ''

    textNode.style.opacity = safeText === '(no comment text)' ? '0.88' : '1'
    textNode.appendChild(highlightTextFragment(safeText, safeFragment))

    const navIndicator = preview.querySelector('.__youtube-timestamps__preview__nav')
    if (totalComments > 1) {
        navIndicator.textContent = `${currentIndex + 1} of ${totalComments} comments`
        navIndicator.style.display = 'block'
    } else {
        navIndicator.style.display = 'none'
    }

    const measured = getTooltipBgWidth()
    applyPreviewWidth(preview, measured)

    preview.style.height = 'auto'
    const contentHeight = preview.scrollHeight
    const idealHeight = Math.max(PREVIEW_MIN_HEIGHT, Math.min(PREVIEW_MAX_HEIGHT, contentHeight))
    preview.style.height = idealHeight + 'px'

    positionPreview(preview, measured)
    setTextMaxHeight(preview, idealHeight)
}

function positionPreview(preview, measured) {
    const halfPreviewWidth = (preview.getBoundingClientRect().width || measured) / 2
    const playerRect = document.querySelector('#movie_player .ytp-progress-bar').getBoundingClientRect()
    const pivot = preview.parentElement.getBoundingClientRect().left
    const minPivot = playerRect.left + halfPreviewWidth
    const maxPivot = playerRect.right - halfPreviewWidth

    let previewLeft
    if (pivot < minPivot) {
        previewLeft = playerRect.left - pivot
    } else if (pivot > maxPivot) {
        previewLeft = -preview.getBoundingClientRect().width + (playerRect.right - pivot)
    } else {
        previewLeft = -halfPreviewWidth
    }

    preview.style.left = (previewLeft - PREVIEW_BORDER_SIZE) + 'px'
}

function setTextMaxHeight(preview, idealHeight) {
    const textNode = preview.querySelector('.__youtube-timestamps__preview__text')
    const headerEl = preview.querySelector('.__youtube-timestamps__preview__author')
    const navIndicator = preview.querySelector('.__youtube-timestamps__preview__nav')

    const headerH = headerEl?.offsetHeight || 0
    const navH = navIndicator?.offsetHeight || 0
    const paddingTotal = 32
    const textMax = Math.max(24, idealHeight - headerH - navH - paddingTotal)

    textNode.style.maxHeight = textMax + 'px'
}

let tooltipBgResizeObserver = null

function ensureTooltipBgObserver() {
    const tooltip = getTooltip()
    if (!tooltip) return

    const tooltipBg = tooltip.querySelector('.ytp-tooltip-bg')
    if (tooltipBgResizeObserver?._observed === tooltipBg) return

    tooltipBgResizeObserver?.disconnect()
    tooltipBgResizeObserver = null

    if (tooltipBg) {
        tooltipBgResizeObserver = new ResizeObserver(() => {
            const preview = document.querySelector('.__youtube-timestamps__preview')
            if (preview?.style.display !== 'none') {
                const measured = getTooltipBgWidth()
                applyPreviewWidth(preview, measured)
                positionPreview(preview, measured)
            }
        })
        tooltipBgResizeObserver._observed = tooltipBg
        tooltipBgResizeObserver.observe(tooltipBg)
    }
}

function handleResize() {
    const preview = document.querySelector('.__youtube-timestamps__preview')
    if (preview?.style.display !== 'none') {
        const measured = getTooltipBgWidth()
        applyPreviewWidth(preview, measured)
    }
    ensureTooltipBgObserver()
}

window.addEventListener('resize', handleResize)
document.addEventListener('fullscreenchange', handleResize)
ensureTooltipBgObserver()

function getOrCreatePreview() {
    const tooltip = getTooltip()
    if (!tooltip) return document.createElement('div')

    let preview = tooltip.querySelector('.__youtube-timestamps__preview')
    if (!preview) {
        preview = createPreviewElement()

        const previewWrapper = document.createElement('div')
        previewWrapper.classList.add('__youtube-timestamps__preview-wrapper')
        previewWrapper.appendChild(preview)
        tooltip.insertAdjacentElement('afterbegin', previewWrapper)
    }
    return preview
}

function createPreviewElement() {
    const preview = document.createElement('div')
    preview.classList.add('__youtube-timestamps__preview')

    const authorElement = document.createElement('div')
    authorElement.classList.add('__youtube-timestamps__preview__author')
    preview.appendChild(authorElement)

    const avatarElement = document.createElement('img')
    avatarElement.classList.add('__youtube-timestamps__preview__avatar')
    authorElement.appendChild(avatarElement)

    const nameElement = document.createElement('span')
    nameElement.classList.add('__youtube-timestamps__preview__name')
    authorElement.appendChild(nameElement)

    const textElement = document.createElement('div')
    textElement.classList.add('__youtube-timestamps__preview__text')
    preview.appendChild(textElement)

    const navElement = document.createElement('div')
    navElement.classList.add('__youtube-timestamps__preview__nav')
    navElement.style.display = 'none'
    preview.appendChild(navElement)

    textElement.addEventListener('wheel', (ev) => {
        if (textElement.scrollHeight > textElement.clientHeight) {
            if (ev.cancelable) ev.preventDefault()
            textElement.scrollBy({ top: ev.deltaY, left: 0, behavior: 'auto' })
        }
    }, { passive: false })

    return preview
}

function highlightTextFragment(text, fragment) {
    const result = document.createDocumentFragment()
    const safeText = String(text)
    const safeFragment = String(fragment)

    if (!safeFragment || safeText.indexOf(safeFragment) === -1) {
        result.appendChild(document.createTextNode(safeText))
        return result
    }

    const parts = safeText.split(safeFragment)
    for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
            result.appendChild(document.createTextNode(parts[i]))
        }
        if (i < parts.length - 1) {
            const fragmentNode = document.createElement('span')
            fragmentNode.classList.add('__youtube-timestamps__preview__text-stamp')
            fragmentNode.textContent = safeFragment
            result.appendChild(fragmentNode)
        }
    }
    return result
}

function hidePreview() {
    const preview = document.querySelector('.__youtube-timestamps__preview')
    if (preview) {
        preview.style.display = 'none'
    }
}

function parseParams(href) {
    const paramString = href.split('#')[0].split('?')[1]
    const params = {}

    if (paramString) {
        for (const kv of paramString.split('&')) {
            const [key, value] = kv.split('=')
            params[key] = value
        }
    }
    return params
}

function withWheelThrottle(callback) {
    let deltaYAcc = 0
    let afRequested = false

    return (e) => {
        if (e.cancelable) e.preventDefault()
        deltaYAcc += e.deltaY

        if (afRequested) return
        afRequested = true

        window.requestAnimationFrame(() => {
            callback(deltaYAcc)
            deltaYAcc = 0
            afRequested = false
        })
    }
}

function onLocationHrefChange(callback) {
    let currentHref = document.location.href
    const observer = new MutationObserver(() => {
        if (currentHref !== document.location.href) {
            currentHref = document.location.href
            callback()
        }
    })
    observer.observe(document.querySelector("body"), {childList: true, subtree: true})
}