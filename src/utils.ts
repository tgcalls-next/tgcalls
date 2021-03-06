import { Api, TelegramClient } from 'telegram';
import {
    EditParams,
    JoinParams,
    JoinVoiceCallParams,
    JoinVoiceCallResponse,
    Sdp,
} from './types';

export function parseSdp(sdp: string): Sdp {
    const lines = sdp.split('\r\n');

    const lookup = (prefix: string) => {
        for (let line of lines) {
            if (line.startsWith(prefix)) {
                return line.substring(prefix.length);
            }
        }
        return null;
    };

    const rawAudioSource = lookup('a=ssrc:');
    const rawVideoSource = lookup('a=ssrc-group:FID ');

    return {
        fingerprint: lookup('a=fingerprint:')?.split(' ')[1] ?? null,
        hash: lookup('a=fingerprint:')?.split(' ')[0] ?? null,
        setup: lookup('a=setup:'),
        pwd: lookup('a=ice-pwd:'),
        ufrag: lookup('a=ice-ufrag:'),
        source: rawAudioSource ? Number(rawAudioSource.split(' ')[0]) : null,
        sourceGroup: rawVideoSource
            ? rawVideoSource.split(' ').map(Number)
            : null,
    };
}

//#region gram-tgcalls

export async function getFullChat(
    client: TelegramClient,
    chat: Api.TypeEntityLike,
) {
    const inputEntity = await client.getInputEntity(chat);

    if (inputEntity instanceof Api.InputPeerChannel) {
        return (
            await client.invoke(
                new Api.channels.GetFullChannel({ channel: chat }),
            )
        ).fullChat;
    } else if (inputEntity instanceof Api.InputPeerChat) {
        return (
            await client.invoke(
                new Api.messages.GetFullChat({ chatId: inputEntity.chatId }),
            )
        ).fullChat;
    }

    throw new Error(`Can't get full chat with ${chat}`);
}

export async function joinCall(
    client: TelegramClient,
    call: Api.InputGroupCall,
    payload: JoinVoiceCallParams<any>,
    params: JoinParams,
): Promise<JoinVoiceCallResponse> {
    // @ts-ignore
    const { updates } = await client.invoke(
        new Api.phone.JoinGroupCall({
            call,
            params: new Api.DataJSON({
                data: JSON.stringify({
                    ufrag: payload.ufrag,
                    pwd: payload.pwd,
                    fingerprints: [
                        {
                            hash: payload.hash,
                            setup: payload.setup,
                            fingerprint: payload.fingerprint,
                        },
                    ],
                    ssrc: payload.source,
                    'ssrc-groups': [
                        { semantics: 'FID', sources: payload.sourceGroup },
                    ],
                }),
            }),
            joinAs: params.joinAs,
            muted: params.muted,
            videoStopped: params.videoStopped,
            inviteHash: params.inviteHash,
        }),
    );

    for (const update of updates) {
        if (update instanceof Api.UpdateGroupCallConnection) {
            return JSON.parse(update.params.data);
        }
    }

    throw new Error('Could not get transport');
}

export function leaveCall(
    client: TelegramClient,
    call: Api.TypeInputGroupCall,
) {
    return client.invoke(new Api.phone.LeaveGroupCall({ call }));
}

export function editParticipant(
    client: TelegramClient,
    call: Api.InputGroupCall,
    participant: Api.TypeEntityLike,
    params: EditParams,
) {
    return client.invoke(
        new Api.phone.EditGroupCallParticipant({
            call,
            participant,
            ...params,
        }),
    );
}

//#endregion
