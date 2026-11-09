export const UploadMediaType = {
    IMAGE: 1,
    VIDEO: 2,
    FILE: 3,
    VOICE: 4
};
export const MessageType = {
    NONE: 0,
    USER: 1,
    BOT: 2
};
export const MessageItemType = {
    NONE: 0,
    TEXT: 1,
    IMAGE: 2,
    VOICE: 3,
    FILE: 4,
    VIDEO: 5,
    TOOL_CALL_START: 11,
    TOOL_CALL_RESULT: 12
};
export const MessageState = {
    NEW: 0,
    GENERATING: 1,
    FINISH: 2
};
export const TypingStatus = {
    TYPING: 1,
    CANCEL: 2
};


//# sourceURL=dsh-wechat/src/wechat/api/types.ts