const axios = require('axios');

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

async function code2session(code) {
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const { data } = await axios.get(url, {
    params: {
      appid: WECHAT_APPID,
      secret: WECHAT_SECRET,
      js_code: code,
      grant_type: 'authorization_code'
    }
  });

  if (data.errcode) {
    throw new Error(`WeChat auth failed: ${data.errmsg} (code: ${data.errcode})`);
  }

  return { openid: data.openid, session_key: data.session_key };
}

module.exports = { code2session };
