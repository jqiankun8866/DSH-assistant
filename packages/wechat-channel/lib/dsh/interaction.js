import { ChatProgress } from './chat-progress.mjs';
import { logger } from '../wechat/util/logger.js';
function collectMessageText(message) {
    let out = '';
    for (const block of message.content ?? []){
        if (block.type === 'text' && block.text !== undefined) out += block.text;
    }
    return out;
}
const APPROVE_WORDS = new Set([
    '1',
    '批准',
    '同意',
    '允许',
    '是',
    '确认',
    'yes',
    'y',
    'ok',
    'okay',
    'approve',
    'allow'
]);
function parseApprovalReply(text) {
    return APPROVE_WORDS.has(text.trim().toLowerCase()) ? 'allowed-once' : 'rejected';
}
function parseQuestionReply(text, pending) {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const answers = pending.questions.map((question, index)=>{
        if (index !== 0) return {
            id: question.id,
            selected: []
        };
        if (/^\d+$/.test(trimmed)) {
            const optionIndex = Number(trimmed) - 1;
            if (optionIndex >= 0 && optionIndex < question.options.length) {
                return {
                    id: question.id,
                    selected: [
                        question.options[optionIndex]
                    ]
                };
            }
        }
        const matched = question.options.find((option)=>option.toLowerCase() === lower);
        if (matched !== undefined) {
            return {
                id: question.id,
                selected: [
                    matched
                ]
            };
        }
        return {
            id: question.id,
            selected: [],
            ...trimmed !== '' ? {
                custom: trimmed
            } : {}
        };
    });
    return {
        answers
    };
}
function formatQuestions(questions) {
    const lines = [
        '🤔 需要你确认：'
    ];
    questions.forEach((question, index)=>{
        if (questions.length > 1) lines.push(`[${index + 1}] ${question.question}`);
        else lines.push(question.question);
        for (const [optionIndex, option] of (question.options ?? []).entries()){
            lines.push(`  ${optionIndex + 1}. ${option.label}`);
        }
    });
    lines.push('回复编号（如 1）或直接回复文字');
    return lines.join('\n');
}
export class WechatInteraction {
    fileSenders = new Map();
    setFileSender(sessionId, sender) {
        this.fileSenders.set(sessionId, sender);
    }
    async sendFile(sessionId, path) {
        const sender = this.fileSenders.get(sessionId);
        if (!sender) throw new Error('当前微信会话没有可用的文件发送通道');
        return sender(path);
    }
    senders = new Map();
    pending = new Map();
    progress = new ChatProgress({
        send: (peer, text)=>this.senders.get(peer)?.(text),
        onError: ()=>logger.warn('weixin: progress notification delivery failed')
    });
    setSender(sessionId, sender) {
        this.senders.set(sessionId, sender);
    }
    hasPending(sessionId) {
        return this.pending.has(sessionId);
    }
    routeInbound(sessionId, text) {
        const entry = this.pending.get(sessionId);
        if (entry === undefined) return false;
        this.pending.delete(sessionId);
        if (entry.kind === 'approval') {
            entry.resolve(parseApprovalReply(text));
        } else {
            entry.resolve(parseQuestionReply(text, entry));
        }
        return true;
    }
    onSessionEvent(sessionId, event) {
        this.progress.event(sessionId, event);
    }
    forwardToWechat(sessionId, message) {
        const sender = this.senders.get(sessionId);
        if (sender === undefined) return;
        const text = collectMessageText(message);
        if (text === '') return;
        void sender(text).catch((error)=>{
            logger.warn(`weixin: forward to wechat failed for ${sessionId}: ${String(error)}`);
        });
    }
    async askApproval(request) {
        const sessionId = String(request.agent.id);
        this.progress.cancel(sessionId);
        const sender = this.senders.get(sessionId);
        if (sender === undefined) return 'unavailable';
        const reason = request.reason !== undefined ? `\n原因：${request.reason}` : '';
        try {
            await sender(`⚠️ 需要授权执行「${request.toolName}」${reason}\n回复「批准」或「1」同意，「拒绝」或「2」拒绝`);
        } catch (error) {
            logger.warn(`weixin: approval prompt send failed for ${sessionId}: ${String(error)}`);
            return 'unavailable';
        }
        return new Promise((resolve)=>{
            this.pending.set(sessionId, {
                kind: 'approval',
                resolve
            });
        });
    }
    async askQuestion(request) {
        const agent = request.agent;
        if (agent === undefined) {
            throw new Error('wechat user-questions provider requires the calling agent');
        }
        const sessionId = String(agent.id);
        this.progress.cancel(sessionId);
        const sender = this.senders.get(sessionId);
        if (sender === undefined) {
            throw new Error(`no wechat sender registered for session ${sessionId}`);
        }
        const questions = request.questions.map((question)=>({
                id: question.id,
                options: (question.options ?? []).map((option)=>option.label)
            }));
        try {
            await sender(formatQuestions(request.questions));
        } catch (error) {
            logger.warn(`weixin: question prompt send failed for ${sessionId}: ${String(error)}`);
            throw error;
        }
        return new Promise((resolve)=>{
            this.pending.set(sessionId, {
                kind: 'question',
                resolve,
                questions
            });
        });
    }
    dispose() {
        for (const entry of this.pending.values()){
            if (entry.kind === 'approval') entry.resolve('cancelled');
            else entry.resolve({
                answers: entry.questions.map((question)=>({
                        id: question.id,
                        selected: []
                    }))
            });
        }
        this.pending.clear();
        this.progress.dispose();
        this.senders.clear();
        this.fileSenders.clear();
    }
}


//# sourceURL=dsh-wechat/src/dsh/interaction.ts