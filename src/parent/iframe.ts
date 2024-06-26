/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { isMobile } from "./common";

const sizeCollection = {
    "desktop": {
        "account-setup": { height: "334px", width: "375px" },
        "timeline": { height: "60vh", width: "375px" }
    },
    "mobile": {
        "account-setup": { height: "100vh", width: "100vw" },
        "timeline": { height: "100vh", width: "100vw" }
    }
}

export function toggleIframe(isDifferentUser: boolean) {
    const iframeElement = document.querySelector(".chatterbox-iframe") as HTMLIFrameElement;
    const startButtonDiv = document.querySelector(".start") as HTMLDivElement;

    if (isDifferentUser && iframeElement.style.display === "block") {
        iframeElement.contentWindow.postMessage({ action: "minimize" }, "*");
        iframeElement.contentWindow.postMessage({ action: "maximize" }, "*");
        return;
    }
    if (iframeElement.style.display && iframeElement.style.display !== "none") {
        iframeElement.style.display = "none";
        iframeElement.contentWindow.postMessage({ action: "minimize" }, "*");
        if (isMobile()) {
            startButtonDiv.style.display = "block";
        }
    }
    else {
        iframeElement.contentWindow.postMessage({ action: "maximize" }, "*");
        iframeElement.style.display = "block";
        if (isMobile()) {
            startButtonDiv.style.display = "none";
        }
    }
}

export function resizeIframe(data) {
    const { view } = data;
    const type = isMobile() ? "mobile" : "desktop";
    const size = sizeCollection[type][view];
    if (!size) { return; }
    const { height, width } = size;
    const iframeElement = document.querySelector(".chatterbox-iframe") as HTMLIFrameElement;
    if (height) { iframeElement.style.height = height; }
    if (width) { iframeElement.style.width = width; }
}

export function removeIframe() {
    const iframeElement = document.querySelector(".chatterbox-iframe") as HTMLIFrameElement;
    iframeElement?.remove();
    const startButton = document.querySelector(".start") as HTMLDivElement;
    startButton.remove();
}
