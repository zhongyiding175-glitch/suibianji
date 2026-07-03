function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res.code) {
          wx.getUserProfile({
            desc: '用于展示您的头像和昵称',
            success(profileRes) {
              resolve({
                code: res.code,
                nickname: profileRes.userInfo.nickName,
                avatar: profileRes.userInfo.avatarUrl
              });
            },
            fail() {
              resolve({ code: res.code, nickname: '', avatar: '' });
            }
          });
        } else {
          reject(new Error('wx.login failed'));
        }
      },
      fail: reject
    });
  });
}

module.exports = { login };
