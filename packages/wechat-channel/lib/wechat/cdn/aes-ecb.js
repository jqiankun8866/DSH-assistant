import { createCipheriv, createDecipheriv } from "node:crypto";
export function encryptAesEcb(plaintext, key) {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    return Buffer.concat([
        cipher.update(plaintext),
        cipher.final()
    ]);
}
export function decryptAesEcb(ciphertext, key) {
    const decipher = createDecipheriv("aes-128-ecb", key, null);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);
}
export function aesEcbPaddedSize(plaintextSize) {
    return Math.ceil((plaintextSize + 1) / 16) * 16;
}


//# sourceURL=dsh-wechat/src/wechat/cdn/aes-ecb.ts