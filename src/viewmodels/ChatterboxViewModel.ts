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

import { RoomViewModel, ViewModel, RoomStatus } from "hydrogen-view-sdk";
import { createCustomTileClassForEntry } from "./tiles";
import { v4 as UUIDV4 } from "uuid";

export class ChatterboxViewModel extends ViewModel {
    private _roomViewModel?: typeof RoomViewModel;
    private _loginPromise: Promise<void>;

    constructor(options) {
        super(options);
        this._client = options.client;
        this._loginPromise = options.loginPromise;
        this.emitOnRoomViewModelChange = this.emitOnRoomViewModelChange.bind(this);
    }

    async load() {
        // wait until login is completed
        await this._loginPromise;

        const rooms = [];
        const invitedUserRooms = [];
        if (this._options.config["invite_users"]) {
            for (const user of this._options.config["invite_users"]) {
                const room = await this.createRoomWithUserSpecifiedInConfig(user);
                rooms.push(room);
                invitedUserRooms.push({ userId: user, roomId: room._roomId });
            }
        } else if (this._options.config["invite_user"]) {
            const room = await this.createRoomWithUserSpecifiedInConfig(this._options.config["invite_user"]);
            rooms.push(room);
        } else if (this._options.config["auto_join_room"]) {
            const room = await this.joinRoomSpecifiedInConfig();
            rooms.push(room);
        } else {
            throw new Error("ConfigError: You must either specify 'invite_user' or 'auto_join_room'");
        }

        this.platform.settingsStorage.setString("invited_user_rooms", JSON.stringify(invitedUserRooms));

        const parentRoomId = (window.parent as any).CURRENT_USERNAME;
        const roomId = await this.platform.settingsStorage.getString(`created-room-id-${parentRoomId}`);
        const openingRoom = rooms.find(room => room._roomId === roomId);

        this._roomViewModel = this.track(new RoomViewModel(this.childOptions({
            room: openingRoom || rooms[0],
            ownUserId: this._session.userId,
            platform: this.platform,
            urlCreator: this.urlCreator,
            navigation: this.navigation,
            tileClassForEntry: createCustomTileClassForEntry(this._session.userId),
        })));
        await this._roomViewModel.load();
        this._roomViewModel.on("change", this.emitOnRoomViewModelChange);
        this.emitChange("roomViewModel");

        window.addEventListener('message', function (event) {
            console.log('----------------- parent message received: ' + JSON.stringify(event.data));
            let message = { data: event.data, origin: event.origin }
            if (message.data.response && message.data.api == "toWidget"
                || !message.data.response && message.data.api == "fromWidget") {
                let json = JSON.stringify(event.data);
                console.log('----------message sent: ' + json);

                this.window.postMessage(json);
            } else {
                console.log('!!!!parent message received (ignored): ' + JSON.stringify(event.data));
            }
        });
    }

    private emitOnRoomViewModelChange() {
        this.emitChange("roomViewModel");
    }

    private async createRoomWithUserSpecifiedInConfig(userId: string) {
        const ownUserId = this._session.userId;
        let room = await this.findPreviouslyCreatedRoom(userId);
        if (room) {
            // we already have a room with this user
            return room;
        }
        const powerLevelContent = this._options.config["disable_composer_until_operator_join"] ? {
            users: {
                [userId]: 100,
                [ownUserId]: 60
            },
            events: {
                "m.room.message": 80,
            },
            redact: 90
        } : null;
        const roomBeingCreated = this._session.createRoom({
            type: 1, //todo: use enum from hydrogen-sdk here
            name: undefined,
            topic: undefined,
            isEncrypted: this._options.config["encrypt_room"] ?? false,
            isFederationDisabled: false,
            alias: undefined,
            avatar: undefined,
            invites: [userId],
            powerLevelContentOverride: powerLevelContent,
        });
        const roomStatusObservable = await this._session.observeRoomStatus(roomBeingCreated.id);
        await roomStatusObservable.waitFor(status => status === (RoomStatus.BeingCreated | RoomStatus.Replaced)).promise;
        const roomId = roomBeingCreated.roomId;
        await this.platform.settingsStorage.setString(`created-room-id-${userId}`, roomId);
        await this.platform.settingsStorage.setString("invite-user", userId);
        room = this._session.rooms.get(roomId);
        return room;
    }

    private async joinRoomSpecifiedInConfig() {
        const roomId = this._options.config["auto_join_room"];
        let room = this._session.rooms.get(roomId);
        if (!room) {
            // user is not in specified room, so join it
            await this._session.joinRoom(roomId);
            // even though we've joined the room, we need to wait till the next sync to get the room
            await this._waitForRoomFromSync(roomId);
            room = this._session.rooms.get(roomId);
        }
        return room;
    }

    private _waitForRoomFromSync(roomId: string): Promise<void> {
        let resolve: () => void;
        const promise: Promise<void> = new Promise(r => { resolve = r; })
        const subscription = {
            onAdd: (_: string, value: { id: string }) => {
                if (value.id === roomId) {
                    this._session.rooms.unsubscribe(subscription);
                    resolve();
                }
            },
            onUpdate: () => undefined,
            onRemove: () => undefined,
        };
        this._session.rooms.subscribe(subscription);
        return promise;
    }

    private async findPreviouslyCreatedRoom(userId: string): Promise<any | null> {
        const createdRoomId = await this.platform.settingsStorage.getString(`created-room-id-${userId}`);
        // const lastKnownInviteUserId = await this.platform.settingsStorage.getString("invite-user");
        // const currentInviteUserId = this._options.config["invite_user"];
        if (createdRoomId) {
            return this._session.rooms.get(createdRoomId);
        }
        return null;
    }

    dispose() {
        super.dispose();
        this._roomViewModel.off("change", this.emitOnRoomViewModelChange);
    }

    minimize() {
        (window as any).sendMinimizeToParent();
        this.navigation.push("minimize");
    }

    startCall() {
        const iframeContainer = document.getElementById("chatterbox-video-call");
        const iframe = document.createElement("iframe");
        iframe.setAttribute("id", "chatterbox-video-call-iframe");

        const widgetId = UUIDV4();
        const clientId = UUIDV4();
        var url = new URL("https://call.element.io/room#");

        const roomId = this._roomViewModel._room._roomId;
        const deviceId = this._session.deviceId;
        const userId = this._session.userId;

        if (!deviceId) return;

        const params = {
            userId,
            roomId,
            widgetId,
            "displayName": "agil.operator",
            "lang": "en-US",
            "theme": "light",
            clientId,
            deviceId,
            "baseUrl": "https://matrix-client.matrix.org/",
            // "parentUrl": "https://call.element.io",
            parentUrl: window.location.origin,
            "skipLobby": "true",
            "confineToRoom": "true",
            "appPrompt": "false",
            "hideHeader": "true",
            "preload": "false",
            "perParticipantE2EE": "true"
        };

        const urlSearchParams = new URLSearchParams(params).toString();
        url.search = urlSearchParams;

        console.log('--------Full URL', url.toString());

        iframe.setAttribute("src", url.toString());



        iframeContainer.appendChild(iframe);
        iframeContainer.style.display = "block";

        // iframe.contentWindow.addEventListener('message', function (event) {
        //     console.log('-----------------message received: ' + JSON.stringify(event.data));
        //     let message = { data: event.data, origin: event.origin }
        //     if (message.data.response && message.data.api == "toWidget"
        //         || !message.data.response && message.data.api == "fromWidget") {
        //         let json = JSON.stringify(event.data);
        //         console.log('----------message sent: ' + json);

        //         this.window.postMessage(json, "*");
        //         // iframe.contentWindow.postMessage(json, "*");
        //     } else {
        //         console.log('message received (ignored): ' + JSON.stringify(event.data));
        //     }
        // });

        // iframe.contentWindow.postMessage("hello", "*");


        // iframe.contentWindow.postMessage = function (data) {
        //     console.log('-----------------iframe.contentWindow.postMessage: ' + JSON.stringify(data));
        //     // let json = JSON.stringify(message);
        //     // console.log('----------message sent: ' + json);
        // }

    }

    get timelineViewModel() {
        return this._roomViewModel?.timelineViewModel;
    }

    get messageComposerViewModel() {
        return this._roomViewModel?.composerViewModel;
    }

    get roomViewModel() {
        return this._roomViewModel;
    }

    get roomName() {
        return this.roomViewModel?._room?._heroes?._roomName || this._options.config["header"]?.["title"] || "";
    }

    get customAvatarURL() {
        // has user specified specific avatar to use in config?
        return this._options.config["header"]?.["avatar"];
    }

    private get _session() {
        return this._client.session;
    }

    get footerViewModel() {
        return this.options.footerVM;
    }
}
