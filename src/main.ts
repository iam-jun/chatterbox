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

import type { IChatterboxConfig } from "./types/IChatterboxConfig";
import { Platform, createRouter, Navigation } from "hydrogen-view-sdk";
import { RootViewModel } from "./viewmodels/RootViewModel";
import { RootView } from "./ui/views/RootView";
import downloadSandboxPath from "hydrogen-view-sdk/download-sandbox.html?url";
import workerPath from "hydrogen-view-sdk/main.js?url";
import olmWasmPath from "@matrix-org/olm/olm.wasm?url";
import olmJsPath from "@matrix-org/olm/olm.js?url";
import olmLegacyJsPath from "@matrix-org/olm/olm_legacy.js?url";
import * as Sentry from "@sentry/browser";
import { BrowserTracing } from "@sentry/tracing";

const assetPaths = {
    downloadSandbox: downloadSandboxPath,
    worker: workerPath,
    olm: {
        wasm: olmWasmPath,
        legacyBundle: olmLegacyJsPath,
        wasmBundle: olmJsPath,
    },
};

const rootDivId = "#chatterbox";

function shouldStartMinimized(): boolean {
    return !!new URLSearchParams(window.location.search).get("minimized");
}

async function main() {
    hideOnError();
    const root = document.querySelector(rootDivId) as HTMLDivElement;
    if (!root) {
        throw new Error("No element with id as 'chatterbox' found!");
    }
    root.className = "hydrogen";
    const config: IChatterboxConfig = (window.parent as any).CHATTERBOX_CONFIG;

    if (config.sentry) {
        Sentry.init({
            dsn: config.sentry.dsn,
            environment: config.sentry.environment,
            integrations: [new BrowserTracing()],
        });
        Sentry.setTag("homeserver", config.homeserver);
        Sentry.setTag("encrypt_room", config.encrypt_room);

        if (config.invite_users) {
            Sentry.setTag("mode", "invite_users");
        } else if (config.auto_join_room) {
            Sentry.setTag("mode", "auto_join_room");
        } else {
            Sentry.setTag("mode", "unknown");
        }
    }

    const platform = new Platform({
        container: root,
        assetPaths,
        config: { themeManifests: [] },
        options: { development: import.meta.env.DEV },
    });
    attachLogExportToWindow(platform);
    const navigation = new Navigation(allowsChild);
    platform.setNavigation(navigation);
    const urlRouter = createRouter({ navigation, history: platform.history });
    const startMinimized = shouldStartMinimized();
    const rootViewModel = new RootViewModel(config, { platform, navigation, urlCreator: urlRouter, startMinimized });
    rootViewModel.start();
    const rootView = new RootView(rootViewModel);
    root.appendChild(rootView.mount());
}

function allowsChild(parent, child) {
    const { type } = child;
    switch (parent?.type) {
        case undefined:
            return type === "start" || type === "account-setup" || type === "timeline" || type === "minimize";
        default:
            return false;
    }
}

function attachLogExportToWindow(platform): void {
    (window as any).downloadLogs = async () => {
        const logs = await platform.logger.export();
        if (!logs && import.meta.env.DEV) {
            console.error(
                "Dev mode is not currently configured to collect persistent logs! Change the 'development' flag passed to Platform constructor to false or run Chatterbox from a true build."
            );
            return;
        }
        const accepted = confirm(
            "Debug logs contain application usage data including your username, " +
            "the IDs or aliases of the rooms or groups you have visited, " +
            "the usernames of other users and the names of files you send. " +
            "They do not contain messages. For more information, review our " +
            "privacy policy at https://element.io/privacy." +
            "\n\n" +
            "Continue to export logs?"
        );
        if (accepted) {
            platform.saveFileAs(logs.asBlob(), "chatterbox-logs.json");
        }
    }
}

function hideOnError() {
    // When an error occurs, log it and then hide everything!
    const handler = e => {
        Sentry.captureException(e, {
            tags: {
                "fatalError": true
            }
        });
        if (e.message === "ResizeObserver loop completed with undelivered notifications." ||
            e.message === "ResizeObserver loop limit exceeded" ||
            // hydrogen renders an <img> with src = undefined while the image is being decrypted
            // todo: resolve this
            e.target.tagName === "IMG") {
            // see https://stackoverflow.com/a/64257593
            e.stopImmediatePropagation();
            return false;
        }
        console.error(e.error ?? e.reason);
        (window as any).sendError();
        return false;
    };
    window.addEventListener("error", handler, true);
    window.addEventListener("unhandledrejection", handler, true);
}


(window as any).sendViewChangeToParent = function (view: "timeline" | "account-setup") {
    window.parent?.postMessage({
        action: "resize-iframe",
        view
    }, "*");
};

(window as any).sendMinimizeToParent = function () {
    window.parent?.postMessage({ action: "minimize" }, "*");
};

(window as any).sendNotificationCount = function (userId: string, count: number) {
    window.parent?.postMessage({ action: "unread-message", payload: { userId, count } }, "*");
};

(window as any).sendError = function () {
    window.parent?.postMessage({ action: "error" }, "*");
};

main();
