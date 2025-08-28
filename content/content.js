// CONFIGURATION //
const PREVIEW_BORDER_SIZE = 2
const PREVIEW_MARGIN = 8
const PREVIEW_MAX_HEIGHT = 200
const PREVIEW_MIN_HEIGHT = 80

main()
onLocationHrefChange(() => {
    removeBar()
    main()
})

document.addEventListener('click', e => {
    const stamp = e.target.closest('.__youtube-timestamps__stamp')
    if (!stamp) {
        hidePreview()
    }
}, true)
document.addEventListener('contextmenu', e => {
    const stamp = e.target.closest('.__youtube-timestamps__stamp')
    if (!stamp) {
        hidePreview()
    }
}, true)

function main() {
    const videoId = getVideoId()
    if (!videoId) {
        return
    }
    fetchTimeComments(videoId)
        .then(timeComments => {
            if (videoId !== getVideoId()) {
                return
            }
            addTimeComments(timeComments)
        })
}

function getVideoId() {
    if (window.location.pathname === '/watch') {
        return parseParams(window.location.href)['v']
    } else if (window.location.pathname.startsWith('/embed/')) {
        return window.location.pathname.substring('/embed/'.length)
    } else {
        return null
    }
}

function getVideo() {
    return document.querySelector('#movie_player video')
}

function fetchTimeComments(videoId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({type: 'fetchTimeComments', videoId}, resolve)
    })
}

function addTimeComments(timeComments) {
    const bar = getOrCreateBar()
    const videoDuration = getVideo().duration
    const groupedComments = new Map()

    for (const tc of timeComments) {
        if (typeof tc.time !== 'number' || tc.time > videoDuration) {
            continue
        }

        const timeKey = tc.time.toString()
        if (!groupedComments.has(timeKey)) {
            groupedComments.set(timeKey, [])
        }
        groupedComments.get(timeKey).push(tc)
    }

    for (const [timeKey, commentsAtTime] of groupedComments) {
        const time = parseFloat(timeKey)
        const stamp = document.createElement('div')
        stamp.classList.add('__youtube-timestamps__stamp')

        if (commentsAtTime.length > 1) {
            stamp.classList.add('__youtube-timestamps__stamp--multiple')
        }

        const offset = time / videoDuration * 100
        stamp.style.left = `calc(${offset}% - 2px)`
        bar.appendChild(stamp)

        let currentCommentIndex = 0

        stamp.addEventListener('mouseenter', () => {
            showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
        })

        stamp.addEventListener('mouseleave', () => {
            hidePreview()
        })

        const SWITCH_THRESHOLD = 100
        stamp.addEventListener('wheel', withWheelThrottle((deltaY, lastEvent) => {
            const preview = getOrCreatePreview()
            const textElement = preview.querySelector('.__youtube-timestamps__preview__text')

            if (!(preview && preview.style.display !== 'none')) {
                showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
            }

            const switchTo = (newIndex) => {
                currentCommentIndex = newIndex
                showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
                const newText = document.querySelector('.__youtube-timestamps__preview__text')
                if (newText) newText.scrollTop = 0
            }

            if (textElement && textElement.scrollHeight > textElement.clientHeight) {
                const atTop = textElement.scrollTop <= 1
                const atBottom = (textElement.scrollTop + textElement.clientHeight) >= (textElement.scrollHeight - 1)

                if (deltaY > 0) {
                    // user scrolling down
                    if (!atBottom) {
                        // scroll inside preview
                        textElement.scrollBy({ top: deltaY, left: 0, behavior: 'auto' })
                        return
                    } else {
                        // at bottom -> allow switching to next comment if big enough wheel
                        if (commentsAtTime.length > 1 && Math.abs(deltaY) >= SWITCH_THRESHOLD) {
                            switchTo((currentCommentIndex + 1) % commentsAtTime.length)
                            return
                        }
                        return
                    }
                } else if (deltaY < 0) {
                    // user scrolling up
                    if (!atTop) {
                        // scroll inside preview
                        textElement.scrollBy({ top: deltaY, left: 0, behavior: 'auto' })
                        return
                    } else {
                        // at top -> allow switching to previous comment if big enough wheel
                        if (commentsAtTime.length > 1 && Math.abs(deltaY) >= SWITCH_THRESHOLD) {
                            switchTo((currentCommentIndex - 1 + commentsAtTime.length) % commentsAtTime.length)
                            return
                        }
                        return
                    }
                } else {
                    return
                }
            }

            // if text is not scrollable and there are multiple comments then switch between them as before
            if (commentsAtTime.length > 1 && Math.abs(deltaY) >= SWITCH_THRESHOLD) {
                if (deltaY > 0) {
                    currentCommentIndex = (currentCommentIndex + 1) % commentsAtTime.length
                } else {
                    currentCommentIndex = (currentCommentIndex - 1 + commentsAtTime.length) % commentsAtTime.length
                }
                showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
            }
        }), { passive: false })

        // Left-click cycles comments like before
        stamp.addEventListener('click', e => {
            if (commentsAtTime.length > 1) {
                e.preventDefault()
                currentCommentIndex = (currentCommentIndex + 1) % commentsAtTime.length
                showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
            }
        })

        // Middle-click (mouse-wheel click) opens the comment in a new tab
        // Use 'auxclick' for middle click; also add 'mousedown' fallback for browsers that don't fire auxclick
        const openCommentInNewTab = (() => {
    let lastOpenedAt = 0
    const DEBOUNCE_MS = 400
    return (comment) => {
        try {
            const now = Date.now()
            if (now - lastOpenedAt < DEBOUNCE_MS) return
            lastOpenedAt = now

            const videoId = getVideoId()
            const commentId = comment && comment.commentId
            if (videoId && commentId) {
                window.open(`https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`, '_blank')
            }
        } catch (err) {
            console.error('Failed to open comment in new tab', err)
        }
    }
})()

const supportsAuxclick = ('onauxclick' in window)

// attach only one of these, not both
if (supportsAuxclick) {
    stamp.addEventListener('auxclick', e => {
        if (e.button === 1) { // middle button
            e.preventDefault()
            e.stopPropagation()
            openCommentInNewTab(commentsAtTime[currentCommentIndex])
        }
    })
} else {
    // fallback for older browsers that don't fire auxclick
    stamp.addEventListener('mousedown', e => {
        if (e.button === 1) {
            e.preventDefault()
            e.stopPropagation()
            openCommentInNewTab(commentsAtTime[currentCommentIndex])
        }
    })
}

        stamp.addEventListener('auxclick', e => {
            if (e.button === 1) { // middle button
                e.preventDefault()
                e.stopPropagation()
                openCommentInNewTab(commentsAtTime[currentCommentIndex])
            }
        })

        // Fallback: handle middle-button mousedown in case auxclick isn't supported
        stamp.addEventListener('mousedown', e => {
            if (e.button === 1) {
                e.preventDefault()
                e.stopPropagation()
                openCommentInNewTab(commentsAtTime[currentCommentIndex])
            }
        })
    }
}

function getOrCreateBar() {
    let bar = document.querySelector('.__youtube-timestamps__bar')
    if (!bar) {
        let container = document.querySelector('#movie_player .ytp-timed-markers-container')
        if (!container) {
            container = document.querySelector('#movie_player .ytp-progress-list')
        }
        bar = document.createElement('div')
        bar.classList.add('__youtube-timestamps__bar')
        container.appendChild(bar)
    }
    return bar
}

function removeBar() {
    const bar = document.querySelector('.__youtube-timestamps__bar')
    if (bar) {
        bar.remove()
    }
}

function getTooltip() {
    return document.querySelector('#movie_player .ytp-tooltip')
}

function showPreview(timeComment, totalComments = 1, currentIndex = 0) {
    const tooltip = getTooltip()
    if (!tooltip) return
    const preview = getOrCreatePreview()
    preview.style.display = ''

    // --- Lift the preview a bit above the bottom of the tooltip so it doesn't overlap controls ---
    preview.style.bottom = (PREVIEW_MARGIN + 12) + 'px'   // move preview up by 12px + configured margin
    // Clear transform so animation ends with the preview in the final elevated position
    preview.style.transform = 'translateY(0) scale(1)'

    // Update content (guard for missing data)
    preview.querySelector('.__youtube-timestamps__preview__avatar').src = timeComment.authorAvatar || ''
    preview.querySelector('.__youtube-timestamps__preview__name').textContent = timeComment.authorName || 'Unknown'

    const textNode = preview.querySelector('.__youtube-timestamps__preview__text')
    textNode.innerHTML = ''

    // Use text safely — ensure we don't pass undefined into split()
    let safeText = (typeof timeComment.text === 'string') ? timeComment.text : ''
    const safeFragment = (typeof timeComment.timestamp === 'string') ? timeComment.timestamp : ''

    // If the comment has no visible text, show a clear placeholder rather than leaving it blank.
    if (!safeText || !safeText.trim()) {
        safeText = '(no comment text)'
        // make placeholder slightly dimmer but still readable
        textNode.style.opacity = '0.88'
    } else {
        textNode.style.opacity = '1'
    }

    textNode.appendChild(highlightTextFragment(safeText, safeFragment))

    // Add navigation indicator for multiple comments
    let navIndicator = preview.querySelector('.__youtube-timestamps__preview__nav')
    if (totalComments > 1) {
        if (!navIndicator) {
            navIndicator = document.createElement('div')
            navIndicator.classList.add('__youtube-timestamps__preview__nav')
            preview.insertBefore(navIndicator, preview.querySelector('.__youtube-timestamps__preview__text'))
        }
        navIndicator.textContent = `${currentIndex + 1} of ${totalComments} comments`
        navIndicator.style.display = 'block'
    } else if (navIndicator) {
        navIndicator.style.display = 'none'
    }

    // Match tooltip width for consistency with YouTube's native UI
    const tooltipBg = tooltip.querySelector('.ytp-tooltip-bg')
    let tooltipWidth = 200 // increased default fallback
    if (tooltipBg && tooltipBg.style.width) {
        const tooltipBgWidth = tooltipBg.style.width
        if (tooltipBgWidth.endsWith('px')) {
            tooltipWidth = Math.max(200, parseFloat(tooltipBgWidth))
        }
    }

    // Dynamic height based on content
    preview.style.width = tooltipWidth + 'px'

    // Measure content height and adjust preview height
    preview.style.height = 'auto'
    const contentHeight = preview.scrollHeight
    const idealHeight = Math.max(PREVIEW_MIN_HEIGHT, Math.min(PREVIEW_MAX_HEIGHT, contentHeight))
    preview.style.height = idealHeight + 'px'

    // Position horizontally (unchanged)
    const halfPreviewWidth = tooltipWidth / 2
    const playerRect = document.querySelector('#movie_player .ytp-progress-bar').getBoundingClientRect()
    const pivot = preview.parentElement.getBoundingClientRect().left
    const minPivot = playerRect.left + halfPreviewWidth
    const maxPivot = playerRect.right - halfPreviewWidth
    let previewLeft
    if (pivot < minPivot) {
        previewLeft = playerRect.left - pivot
    } else if (pivot > maxPivot) {
        previewLeft = -tooltipWidth + (playerRect.right - pivot)
    } else {
        previewLeft = -halfPreviewWidth
    }
    preview.style.left = (previewLeft - PREVIEW_BORDER_SIZE) + 'px'

    // --- Calculate header/nav/padding heights to avoid clipping the text label ---
    const headerEl = preview.querySelector('.__youtube-timestamps__preview__author')
    const headerH = headerEl ? headerEl.offsetHeight : 0
    const navH = navIndicator ? navIndicator.offsetHeight : 0
    // CSS padding is 16px top + 16px bottom (32 total), account for that
    const paddingTotal = 32
    const textMax = Math.max(24, idealHeight - headerH - navH - paddingTotal)
    textNode.style.maxHeight = textMax + 'px'
}

function getOrCreatePreview() {
    const tooltip = getTooltip()
    if (!tooltip) return document.createElement('div') // fail-safe
    let preview = tooltip.querySelector('.__youtube-timestamps__preview')
    if (!preview) {
        preview = document.createElement('div')
        preview.classList.add('__youtube-timestamps__preview')

        const previewWrapper = document.createElement('div')
        previewWrapper.classList.add('__youtube-timestamps__preview-wrapper')
        previewWrapper.appendChild(preview)
        tooltip.insertAdjacentElement('afterbegin', previewWrapper)

        const authorElement = document.createElement('div')
        authorElement.classList.add('__youtube-timestamps__preview__author')
        preview.appendChild(authorElement)

        const avatarElement = document.createElement('img')
        avatarElement.classList.add('__youtube-timestamps__preview__avatar')
        authorElement.appendChild(avatarElement)

        const nameElement = document.createElement('span')
        nameElement.classList.add('__youtube-timestamps__preview__name')
        authorElement.appendChild(nameElement)

        const navElement = document.createElement('div')
        navElement.classList.add('__youtube-timestamps__preview__nav')
        navElement.style.display = 'none'
        preview.appendChild(navElement)

        const textElement = document.createElement('div')
        textElement.classList.add('__youtube-timestamps__preview__text')
        preview.appendChild(textElement)

        // Attach wheel listener on the preview text itself to enable natural scrolling there.
        // Use passive:false so we can prevent default on touchpads if necessary.
        textElement.addEventListener('wheel', (ev) => {
            if (textElement.scrollHeight > textElement.clientHeight) {
                if (ev.cancelable) ev.preventDefault() // stop page scrolling
                textElement.scrollBy({ top: ev.deltaY, left: 0, behavior: 'auto' })
            }
        }, { passive: false })
    }
    return preview
}

// Safely highlight a fragment inside text. If fragment is empty/invalid, simply return plain text node.
function highlightTextFragment(text, fragment) {
    const result = document.createDocumentFragment()

    if (!fragment) {
        // No fragment to highlight — return text as-is
        result.appendChild(document.createTextNode(text))
        return result
    }

    // Ensure both are strings
    const safeText = String(text)
    const safeFragment = String(fragment)

    // If fragment not present, fall back to plain text
    if (safeFragment === '' || safeText.indexOf(safeFragment) === -1) {
        result.appendChild(document.createTextNode(safeText))
        return result
    }

    const parts = safeText.split(safeFragment)
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (part) {
            result.appendChild(document.createTextNode(part))
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
    const noHash = href.split('#')[0]
    const paramString = noHash.split('?')[1]
    const params = {}
    if (paramString) {
        const paramsArray = paramString.split('&')
        for (const kv of paramsArray) {
            const tmparr = kv.split('=')
            params[tmparr[0]] = tmparr[1]
        }
    }
    return params
}

// Improved wheel-throttle: accumulates deltaY and passes the last event too.
// NOTE: the returned wrapper will be attached with { passive: false } so e.preventDefault() can be used.
// The wrapper *itself* will call preventDefault() on the original event before accumulating,
// ensuring the page does not scroll.
function withWheelThrottle(callback) {
    let deltaYAcc = 0
    let afRequested = false
    let lastEvent = null
    return (e) => {
        // Prevent the browser's default page scroll when wheel happens on a stamp.
        // Only call preventDefault if the event is cancelable (some browsers may not allow it otherwise).
        if (e.cancelable) e.preventDefault()

        lastEvent = e
        deltaYAcc += e.deltaY

        if (afRequested) {
            return
        }
        afRequested = true

        window.requestAnimationFrame(() => {
            try {
                callback(deltaYAcc, lastEvent)
            } finally {
                // reset accumulators
                deltaYAcc = 0
                afRequested = false
                lastEvent = null
            }
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