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

import { resizeIframe, toggleIframe, removeIframe } from "./iframe";
import { loadStartButton } from "./load";
import "./parent-style.css";

(window as any).isIframeLoaded = false;
(window as any).__chatterbox = () => (document.querySelector(".chatterbox-iframe") as HTMLIFrameElement)?.contentWindow;

function setUnreadCount({ userId, count }: { userId: string, count: number }) {
    const notification = document.getElementById(`notification-badge-${userId}`) as HTMLSpanElement;

    if (!notification) return;

    if (count === 0) {
        notification.classList.add("hidden");
    }
    else {
        notification.innerText = `${count}`;
        notification.classList.remove("hidden");
    }
}

window.addEventListener("message", event => {
    const { action } = event.data;
    switch (action) {
        case "init-chatterbox":
            loadStartButton(event.data.payload);
            break;
        case "resize-iframe":
            if (event.data.view === "timeline") {
                // Chatterbox has made it to the timeline!
                // Store this is info in localStorage so that we know to load chatterbox in background
                // in subsequent visits.
                window.localStorage.setItem("chatterbox-should-load-in-background", "true");
            }
            resizeIframe(event.data);
            break;
        case "minimize":
            toggleIframe(false);
            break;
        case "unread-message":
            setUnreadCount(event.data.payload);
            break;
        case "error":
            removeIframe();
            break;
    }
});