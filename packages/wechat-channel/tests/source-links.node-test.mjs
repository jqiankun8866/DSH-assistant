import test from 'node:test';
import assert from 'node:assert/strict';
import {compactXhsLinks} from '../src/wechat/messaging/source-links.mjs';
test('XHS source links are compact, idempotent and preserve signed query bytes',()=>{
 const u='https://www.xiaohongshu.com/explore/abc?xsec_token=A_b-C%3D&xsec_source=pc_feed';
 const result=compactXhsLinks('推荐：'+u+'。');
 assert.equal(result,'推荐：[原帖]('+u+')。');assert.equal(compactXhsLinks(result),result);
 assert.equal(compactXhsLinks('[原帖2]('+u+')'),'[原帖2]('+u+')');
 assert.equal(compactXhsLinks('https://xhslink.com/a/abc'),'[原帖](https://xhslink.com/a/abc)');
 for(const text of ['`'+u+'`','```\n'+u+'\n```','https://www.xiaohongshu.com.evil.test/explore/abc','https://example.com/page','![图片]('+u+')'])assert.equal(compactXhsLinks(text),text);
});
