let DEFAULT_LANGUAGE = 'en';
let DEFAULT_TRIGGER_KEY = 'none';
let LANGUAGE;
let TRIGGER_KEY;

let POPUP_ID = 0;
const POPUP_LINKS = new Map();

/**
 * Register a popup element in the tree of popups.
 *
 * @param el {HTMLElement} The popup div to register.
 * @param parentId {string} The id of the parent popup, else '' for root popup.
 * @returns {string} The id assigned to this popup.
 */
function registerPopup(el, parentId = '') {
    const id = String(++POPUP_ID);
    el.dataset.id = id;
    el.dataset.parent = parentId;
    POPUP_LINKS.set(id, {el, parentId, children: new Set()});
    if (parentId) {
        POPUP_LINKS.get(parentId)?.children.add(id);
    }
    return id;
}

/**
 * Unlink a popup from its parent in the tree of popups.
 *
 * @param id {string} The id of the popup to unlink.
 */
function unlinkFromParent(id) {
    const node = POPUP_LINKS.get(id);
    if (!node) {
        return;
    }
    if (node.parentId) {
        POPUP_LINKS.get(node.parentId)?.children.delete(id);
    }
}

/**
 * Prune a subtree of popups, optionally including the root of the subtree.
 *
 * @param id {string} The id of the root of the subtree to prune.
 * @param includeSelf {boolean} Whether to include the root of the subtree.
 */
function pruneSubtree(id, includeSelf = false) {
    const node = POPUP_LINKS.get(id);
    if (!node) {
        return;
    }

    for (const childId of Array.from(node.children)) {
        pruneSubtree(childId, true);
    }

    if (includeSelf) {
        unlinkFromParent(id);
        node.el.remove();
        POPUP_LINKS.delete(id);
    } else {
        node.children.clear();
    }
}

/**
 * Check if an event originated from within a popup.
 *
 * @param e {Event} The event to check.
 * @returns {*|null} The popup element if found, else null.
 */
function eventFromPopup(e) {
    const path = e.composedPath ? e.composedPath() : [];
    return path.find(n => n instanceof HTMLElement && n.classList?.contains('dictionaryDiv')) || null;
}

/**
 * Remove all popups from the document.
 */
function removeAllPopups() {
    for (const id of Array.from(POPUP_LINKS.keys())) {
        pruneSubtree(id, true);
    }
}

document.addEventListener('click', (e) => {
    if (!eventFromPopup(e)) {
        removeAllPopups();
    }
});

/**
 * Retrieve the meaning of a word by sending a message to the background script.
 *
 * @param info {Object} The selection info containing the word and its position.
 * @returns {Promise<any>} A promise that resolves with the meaning data.
 */
function retrieveMeaning(info) {
    return browser.runtime.sendMessage({word: info.word, lang: LANGUAGE, time: Date.now()});
}

/**
 * Handle the case where no meaning is found for the selected word.
 *
 * @param popupDiv {Object} The popup to update.
 */
function noMeaningFound(popupDiv) {
    popupDiv.heading.textContent = "Sorry";
    popupDiv.meaning.textContent = "No definition was found.";
}

/**
 * Open a modal popup with the definition of the selected word.
 *
 * @param event {Event} The event that triggered the popup.
 */
function openModal(event) {
    const info = getSelectionInfo(event);
    if (!info) {
        return;
    }

    const fromPopup = eventFromPopup(event);
    if (fromPopup) {
        pruneSubtree(fromPopup.dataset.id);
    }

    let createdDiv;
    retrieveMeaning(info).then((response) => {
        if (!response.content) {
            return noMeaningFound(createdDiv);
        }
        appendToDiv(createdDiv, response.content);
    });
    createdDiv = createDiv(info, fromPopup ? fromPopup.dataset.id : '');
}

document.addEventListener('dblclick', (e) => {
    if (TRIGGER_KEY === 'none' ||
        (typeof e[`${TRIGGER_KEY}Key`] === 'boolean' && e[`${TRIGGER_KEY}Key`])) {
        openModal(e);
    }
});

/**
 * Get information about the current text selection.
 *
 * @param event {Event} The event that triggered the selection.
 * @returns The selection info or null if no valid selection.
 */
function getSelectionInfo(event) {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) {
        return null;
    }

    const word = selection.toString();
    if (word.length <= 1) {
        return null;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    let top = (rect?.top ?? 0) + window.scrollY;
    let bottom = (rect?.bottom ?? 0) + window.scrollY;
    let left = (rect?.left ?? 0) + window.scrollX;
    const height = rect?.height ?? 0;

    if (!height && event) {
        top = bottom = event.pageY;
        left = event.pageX;
    }

    return {
        top,
        bottom,
        left,
        word,
        clientY: event?.clientY ?? 0,
        height
    };
}

function createDiv(info, parentId) {
    const hostDiv = document.createElement('div');
    hostDiv.className = 'dictionaryDiv';
    hostDiv.style.left = info.left - 10 + 'px';
    hostDiv.style.position = 'absolute';
    hostDiv.style.zIndex = '1000000';
    hostDiv.attachShadow({mode: 'open'});

    const thisId = registerPopup(hostDiv, parentId);

    const shadow = hostDiv.shadowRoot;
    const style = document.createElement("style");
    style.textContent = `
.mwe-popups {
  background: #f8f9fa;
  position: absolute;
  z-index: 110;
  -webkit-box-shadow: 0 30px 90px -20px rgba(0,0,0,0.3), 0 0 1px #a2a9b1;
  box-shadow: 0 30px 90px -20px rgba(0,0,0,0.3), 0 0 1px #a2a9b1;
  padding: 0;
  font-size: 14px;
  min-width: 300px;
  border-radius: 2px;
}

@media (prefers-color-scheme: dark) {
  .mwe-popups {
    background: #101418;
  }
}

.mwe-popups.mwe-popups-is-not-tall {
  width: 320px;
}

.mwe-popups .mwe-popups-container {
  color: #101418;
  margin-top: -9px;
  padding-top: 9px;
  text-decoration: none;
}

.mwe-popups.mwe-popups-is-not-tall .mwe-popups-extract {
  min-height: 40px;
  max-height: 140px;
  overflow: hidden;
  margin-bottom: 47px;
  padding-bottom: 0;
}

.mwe-popups .mwe-popups-extract {
  margin: 16px;
  display: block;
  color: #222;
  text-decoration: none;
  position: relative;
}

@media (prefers-color-scheme: dark) {
  .mwe-popups .mwe-popups-extract {
    color: #f8f9fa;
  }
}

.mwe-popups.flipped_y:before {
  content: '';
  position: absolute;
  border: 8px solid transparent;
  border-bottom: 0;
  border-top: 8px solid #a2a9b1;
  bottom: -8px;
  left: 10px;
}

.mwe-popups.flipped_y:after {
  content: '';
  position: absolute;
  border: 11px solid transparent;
  border-bottom: 0;
  border-top: 11px solid #fff;
  bottom: -7px;
  left: 7px;
}

.mwe-popups.mwe-popups-no-image-tri:before {
  content: '';
  position: absolute;
  border: 8px solid transparent;
  border-top: 0;
  border-bottom: 8px solid #a2a9b1;
  top: -8px;
  left: 10px;
}

.mwe-popups.mwe-popups-no-image-tri:after {
  content: '';
  position: absolute;
  border: 11px solid transparent;
  border-top: 0;
  border-bottom: 11px solid #fff;
  top: -7px;
  left: 7px;
}

.audio {
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAcUlEQVQ4y2P4//8/AyUYQhAH3gNxA7IAIQPmo/H3g/QA8XkgFiBkwHyoYnRQABVfj88AmGZcTuuHyjlgMwBZM7IE3NlQGhQe65EN+I8Dw8MLGgYoFpFqADK/YUAMwOsFigORatFIlYRElaRMWmaiBAMAp0n+3U0kqkAAAAAASUVORK5CYII=);
  background-position: center;
  background-repeat: no-repeat;
  color: #e9ecef;
  cursor: pointer;
  margin-left: 8px;
  opacity: 0.5;
  width: 16px;
  display: inline-block;
}

.audio:hover {
  opacity: 1;
}
`;
    shadow.appendChild(style);

    const popupDiv = document.createElement("div");
    popupDiv.style = "font-family: arial,sans-serif; border-radius: 12px; border: 1px solid #a2a9b1; box-shadow: 0 0 17px rgba(0,0,0,0.5)";
    shadow.appendChild(popupDiv);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style = "all: initial; float:right; cursor:pointer; padding:4px 8px; font-size:1.5rem; line-height:1; margin:4px 8px 0 0; color:#888; border:none; background:transparent;";
    closeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pruneSubtree(thisId, true);
    });
    popupDiv.appendChild(closeBtn);

    const contentContainer = document.createElement("div");
    contentContainer.className = "mwe-popups-container";
    popupDiv.appendChild(contentContainer);

    const content = document.createElement("div");
    content.className = "mwe-popups-extract";
    content.style = "line-height:1.4; margin-top:0; margin-bottom:11px; max-height:none";
    contentContainer.appendChild(content);

    const heading = document.createElement("h3");
    heading.style = "margin-block-end:0; display:inline-block;";
    heading.textContent = "Searching";

    const meaning = document.createElement("p");
    meaning.style = "margin-top:10px";
    meaning.textContent = "Please wait...";

    const audio = document.createElement("div");
    audio.className = "audio";
    audio.innerHTML = "&nbsp;";
    audio.style.display = "none";

    const moreInfo = document.createElement("a");
    const ddgLang = LANGUAGE === 'en' ? 'us-en' : LANGUAGE;
    moreInfo.href = `https://noai.duckduckgo.com/search?kl=${ddgLang}&q=define+${info.word}`;
    moreInfo.style = "float:right; text-decoration:none;";
    moreInfo.target = "_blank";

    content.appendChild(heading);
    content.appendChild(audio);
    content.appendChild(meaning);
    content.appendChild(moreInfo);

    document.body.appendChild(hostDiv);

    const place = () => {
        if (info.clientY < window.innerHeight / 2) {
            popupDiv.className = "mwe-popups mwe-popups-no-image-tri mwe-popups-is-not-tall";
            hostDiv.style.top = (info.bottom + 10 + (info.height === 0 ? 8 : 0)) + "px";
        } else {
            popupDiv.className = "mwe-popups flipped_y mwe-popups-is-not-tall";
            hostDiv.style.top = (info.top - 10 - popupDiv.clientHeight - (info.height === 0 ? 8 : 0)) + "px";
        }
    };
    place();

    return {heading, meaning, moreInfo, audio};
}

function appendToDiv(createdDiv, content) {
    const hostDiv = createdDiv.heading.getRootNode().host;
    const popupDiv = createdDiv.heading.getRootNode().querySelectorAll("div")[1];

    const heightBefore = popupDiv.clientHeight;
    createdDiv.heading.textContent = content.word;
    createdDiv.meaning.textContent = content.meaning;
    createdDiv.moreInfo.textContent = "Learn more »";

    const heightAfter = popupDiv.clientHeight;
    const difference = heightAfter - heightBefore;


    if (popupDiv.classList.contains("flipped_y")) {
        hostDiv.style.top = parseInt(hostDiv.style.top) - difference + 1 + "px";
    }

    if (content.audioSrc) {
        const sound = document.createElement("audio");
        sound.src = content.audioSrc;
        createdDiv.audio.style.display = "inline-block";
        createdDiv.audio.addEventListener("click", function () {
            sound.play();
        });
    }
}

(async () => {
    const results = await browser.storage.local.get();

    const {
        language = DEFAULT_LANGUAGE,
        interaction = {dblClick: {key: DEFAULT_TRIGGER_KEY}},
    } = results;

    LANGUAGE = language;
    TRIGGER_KEY = interaction.dblClick.key;
})();
