const PREVIEW_BORDER_SIZE = 2
const PREVIEW_MARGIN = 8
const PREVIEW_MAX_HEIGHT = 200 // Increased from 120px
const PREVIEW_MIN_HEIGHT = 80

main()

onLocationHrefChange(() => {
    removeBar()
    removeContextMenu()
    main()
})

document.addEventListener('click', e => {
    const stamp = e.target.closest('.__youtube-timestamps__stamp')
    if (!stamp) {
        hideContextMenu()
    }
}, true)
document.addEventListener('contextmenu', e => {
    const stamp = e.target.closest('.__youtube-timestamps__stamp')
    if (!stamp) {
        hideContextMenu()
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
    let contextMenuTimeComment = null

    // Group comments by timestamp to handle duplicates
    const groupedComments = new Map()

    for (const tc of timeComments) {
        if (tc.time > videoDuration) {
            continue
        }

        const timeKey = tc.time.toString()
        if (!groupedComments.has(timeKey)) {
            groupedComments.set(timeKey, [])
        }
        groupedComments.get(timeKey).push(tc)
    }

    // Create stamps for each unique timestamp
    for (const [timeKey, commentsAtTime] of groupedComments) {
        const time = parseFloat(timeKey)
        const stamp = document.createElement('div')
        stamp.classList.add('__youtube-timestamps__stamp')

        // Add visual indicator for multiple comments
        if (commentsAtTime.length > 1) {
            stamp.classList.add('__youtube-timestamps__stamp--multiple')
            stamp.setAttribute('data-comment-count', commentsAtTime.length)
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

        stamp.addEventListener('wheel', withWheelThrottle((deltaY) => {
            const preview = getOrCreatePreview()
            const textElement = preview.querySelector('.__youtube-timestamps__preview__text')

            // Check if we should scroll through comments or scroll within comment text
            if (commentsAtTime.length > 1 && Math.abs(deltaY) > 50) {
                // Scroll through multiple comments
                e.preventDefault()
                if (deltaY > 0) {
                    currentCommentIndex = (currentCommentIndex + 1) % commentsAtTime.length
                } else {
                    currentCommentIndex = (currentCommentIndex - 1 + commentsAtTime.length) % commentsAtTime.length
                }
                showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
            } else {
                // Scroll within comment text
                if (textElement && textElement.scrollHeight > textElement.clientHeight) {
                    textElement.scrollBy(0, deltaY)
                }
            }
        }))

        stamp.addEventListener('contextmenu', e => {
            e.preventDefault()
            e.stopPropagation()
            const currentComment = commentsAtTime[currentCommentIndex]
            if (currentComment === contextMenuTimeComment && isContextMenuVisible()) {
                hideContextMenu()
            } else {
                showContextMenu(currentComment, commentsAtTime, e.pageX, e.pageY)
                contextMenuTimeComment = currentComment
            }
        })

        // Click to cycle through comments when multiple exist
        stamp.addEventListener('click', e => {
            if (commentsAtTime.length > 1) {
                e.preventDefault()
                currentCommentIndex = (currentCommentIndex + 1) % commentsAtTime.length
                showPreview(commentsAtTime[currentCommentIndex], commentsAtTime.length, currentCommentIndex)
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
    const preview = getOrCreatePreview()
    preview.style.display = ''

    // Update content
    preview.querySelector('.__youtube-timestamps__preview__avatar').src = timeComment.authorAvatar
    preview.querySelector('.__youtube-timestamps__preview__name').textContent = timeComment.authorName

    const textNode = preview.querySelector('.__youtube-timestamps__preview__text')
    textNode.innerHTML = ''
    textNode.appendChild(highlightTextFragment(timeComment.text, timeComment.timestamp))

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
    const tempHeight = preview.style.height
    preview.style.height = 'auto'
    const contentHeight = preview.scrollHeight
    const idealHeight = Math.max(PREVIEW_MIN_HEIGHT, Math.min(PREVIEW_MAX_HEIGHT, contentHeight))
    preview.style.height = idealHeight + 'px'

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

    // Ensure text element has proper scrolling
    textNode.style.maxHeight = (idealHeight - 80) + 'px' // Account for header and navigation
}

function getOrCreatePreview() {
    const tooltip = getTooltip()
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
    }
    return preview
}

function highlightTextFragment(text, fragment) {
    const result = document.createDocumentFragment()
    const parts = text.split(fragment)
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (part) {
            result.appendChild(document.createTextNode(part))
        }
        if (i < parts.length - 1) {
            const fragmentNode = document.createElement('span')
            fragmentNode.classList.add('__youtube-timestamps__preview__text-stamp')
            fragmentNode.textContent = fragment
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

function withWheelThrottle(callback) {
    let deltaYAcc = 0
    let afRequested = false
    return (e) => {
        deltaYAcc += e.deltaY

        if (afRequested) {
            return
        }
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

function showContextMenu(timeComment, allCommentsAtTime, x, y) {
    const contextMenu = getOrCreateContextMenu()
    contextMenu.style.display = ''
    adjustContextMenuSizeAndPosition(contextMenu, x, y)
    fillContextMenuData(contextMenu, timeComment, allCommentsAtTime)
}

function fillContextMenuData(contextMenu, timeComment, allCommentsAtTime = []) {
    contextMenu.dataset.commentId = timeComment.commentId
    contextMenu.dataset.allCommentIds = JSON.stringify(allCommentsAtTime.map(c => c.commentId))
}

function adjustContextMenuSizeAndPosition(contextMenu, x, y) {
    const menuHeight = contextMenu.querySelector('.ytp-panel-menu').clientHeight
    contextMenu.style.height = menuHeight + 'px'
    contextMenu.style.top = (y - menuHeight) + 'px'
    contextMenu.style.left = x + 'px'
}

function getOrCreateContextMenu() {
    let contextMenu = getContextMenu()
    if (!contextMenu) {
        contextMenu = document.createElement('div')
        contextMenu.id = '__youtube-timestamps__context-menu'
        contextMenu.classList.add('ytp-popup')
        document.body.appendChild(contextMenu)

        const panelElement = document.createElement('div')
        panelElement.classList.add('ytp-panel')
        contextMenu.appendChild(panelElement)

        const menuElement = document.createElement('div')
        menuElement.classList.add('ytp-panel-menu')
        panelElement.appendChild(menuElement)

        menuElement.appendChild(menuItemElement("Open in New Tab", () => {
            const videoId = getVideoId()
            const commentId = contextMenu.dataset.commentId
            window.open(`https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`, '_blank')
        }))

        // Add menu item for opening all comments when multiple exist
        menuElement.appendChild(menuItemElement("Open All Comments", () => {
            const videoId = getVideoId()
            try {
                const allCommentIds = JSON.parse(contextMenu.dataset.allCommentIds || '[]')
                allCommentIds.forEach(commentId => {
                    window.open(`https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`, '_blank')
                })
            } catch (e) {
                console.error('Failed to parse comment IDs:', e)
            }
        }))
    }
    return contextMenu
}

function menuItemElement(label, callback) {
    const itemElement = document.createElement('div')
    itemElement.classList.add('ytp-menuitem')
    itemElement.addEventListener('click', callback)

    const iconElement = document.createElement('div')
    iconElement.classList.add('ytp-menuitem-icon')
    itemElement.appendChild(iconElement)

    const labelElement = document.createElement('div')
    labelElement.classList.add('ytp-menuitem-label')
    labelElement.textContent = label
    itemElement.appendChild(labelElement)

    return itemElement
}

function getContextMenu() {
    return document.querySelector('#__youtube-timestamps__context-menu')
}

function isContextMenuVisible() {
    const contextMenu = getContextMenu()
    return contextMenu && !contextMenu.style.display
}

function hideContextMenu() {
    const contextMenu = getContextMenu()
    if (contextMenu) {
        contextMenu.style.display = 'none'
    }
}

function removeContextMenu() {
    const contextMenu = getContextMenu()
    if (contextMenu) {
        contextMenu.remove()
    }
}